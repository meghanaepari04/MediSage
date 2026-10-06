from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from app.api import deps
from app.models.prescription import Prescription, JobStatus, AnalysisResult
from app.models.user import User
from app.worker.tasks import process_prescription, execute_prescription_pipeline
import uuid
import os

router = APIRouter()

# Temporary local storage folder for uploads before S3
UPLOAD_DIR = "/tmp/medisage_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# 10 MB file-size limit (FR-U3)
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
ALLOWED_EXTENSIONS = ('.png', '.jpg', '.jpeg', '.pdf')


@router.post("/upload")
def upload_prescription(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Upload file, validate, save to db, and enqueue process_prescription job.
    Uses Celery if available, falling back gracefully to FastAPI BackgroundTasks.
    Returns a job_id for the client to poll.
    """
    # 1. Validate file extension (FR-U3)
    if not file.filename.lower().endswith(ALLOWED_EXTENSIONS):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed formats: JPG, PNG, PDF"
        )

    # 2. Read file bytes and validate size (FR-U3)
    file_bytes = file.file.read()
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum allowed size is 10 MB."
        )

    # 3. Save file temporarily
    safe_filename = f"{uuid.uuid4()}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)
    with open(file_path, "wb") as buffer:
        buffer.write(file_bytes)

    # 4. Create Job ID and Database Record (status=PENDING)
    job_id = str(uuid.uuid4())
    db_prescription = Prescription(
        job_id=job_id,
        user_id=current_user.id,
        file_name=file.filename,
        file_uri=file_path,
        status=JobStatus.PENDING,
    )
    db.add(db_prescription)
    db.commit()
    db.refresh(db_prescription)

    # 5. Fire Async OCR + NLP job: try Celery first, fallback to FastAPI background tasks
    enqueued = False
    try:
        process_prescription.delay(db_prescription.id, file_path, file.filename)
        enqueued = True
    except Exception as exc:
        print(f"[Upload] Celery broker unavailable ({exc}), running via FastAPI BackgroundTasks")

    if not enqueued:
        background_tasks.add_task(execute_prescription_pipeline, db_prescription.id, file_path, file.filename)

    return {"job_id": job_id, "message": "File uploaded and processing started"}


@router.get("/history")
def get_prescription_history(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """List user's past prescription analyses (most recent first)."""
    prescriptions = (
        db.query(Prescription)
        .filter(Prescription.user_id == current_user.id)
        .order_by(Prescription.created_at.desc())
        .all()
    )
    history = []

    for p in prescriptions:
        savings = 0.0
        medicines_list = []
        if p.analysis_result:
            savings = p.analysis_result.total_estimated_savings
            medicines_list = p.analysis_result.medicines_data or []

        history.append({
            "id": p.id,
            "job_id": p.job_id,
            "file_name": p.file_name,
            "date": p.created_at.isoformat() if p.created_at else None,
            "status": p.status.value,
            "total_savings": savings,
            # Included so the frontend hover popup can display medicine detail (FR-P2)
            "medicines": medicines_list,
        })

    return {"history": history}


@router.get("/status/{job_id}")
def get_job_status(job_id: str, db: Session = Depends(deps.get_db)):
    """Poll job status (pending / processing / complete / failed)."""
    prescription = db.query(Prescription).filter(Prescription.job_id == job_id).first()
    if not prescription:
        raise HTTPException(status_code=404, detail="Job not found")

    return {
        "job_id": job_id,
        "id": prescription.id,
        "status": prescription.status.value,
        "file_name": prescription.file_name,
        "error_message": prescription.error_message,
    }


@router.get("/{id}/results")
def get_prescription_results(
    id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Fetch full analysis results for a prescription."""
    prescription = (
        db.query(Prescription)
        .filter(Prescription.id == id, Prescription.user_id == current_user.id)
        .first()
    )
    if not prescription:
        raise HTTPException(status_code=404, detail="Prescription not found")

    if not prescription.analysis_result:
        raise HTTPException(status_code=400, detail="Results are not ready yet")

    res = prescription.analysis_result
    return {
        "id": prescription.id,
        "status": prescription.status.value,
        "results": {
            "medicines": res.medicines_data,
            "total_savings": res.total_estimated_savings,
            "ocr_confidence": res.ocr_confidence_score,
            "requires_review": res.requires_review,
            "ai_insights": res.ai_insights,
        },
    }
