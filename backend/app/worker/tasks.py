from app.worker.celery_app import celery_app
from app.db.session import SessionLocal
from app.models.prescription import Prescription, JobStatus, AnalysisResult
from app.services.ocr import extract_text_from_prescription
from app.services.nlp import process_prescription_nlp
from app.services.llm import generate_medicine_insights
import traceback


def execute_prescription_pipeline(prescription_id: int, file_path: str, filename: str = ""):
    """
    Core pipeline logic for prescription analysis:
    1. Preprocess image & OCR extraction
    2. NLP medicine recognition + generic mapping
    3. LLM/clinical AI insights
    4. Persist AnalysisResult to database
    """
    db = SessionLocal()
    try:
        prescription = db.query(Prescription).filter(Prescription.id == prescription_id).first()
        if not prescription:
            return

        prescription.status = JobStatus.PROCESSING
        db.commit()

        # 1. OCR extraction – handles images and PDFs
        with open(file_path, "rb") as f:
            file_bytes = f.read()

        ocr_result = extract_text_from_prescription(file_bytes, filename=filename)

        # 2. NLP medicine identification and generic mapping
        nlp_data = process_prescription_nlp(ocr_result["text"])

        # 3. LLM AI insights (medicine names only — data minimisation, FR-I3)
        ai_insights = generate_medicine_insights(nlp_data["medicines"])

        # 4. Persist AnalysisResult
        analysis = AnalysisResult(
            prescription_id=prescription_id,
            ocr_confidence_score=ocr_result["confidence"],
            requires_review=ocr_result["requires_review"],
            medicines_data=nlp_data["medicines"],
            total_estimated_savings=nlp_data["total_estimated_savings"],
            ai_insights=ai_insights,
        )
        db.add(analysis)
        prescription.status = JobStatus.COMPLETE
        prescription.error_message = None
        db.commit()

    except Exception as exc:
        db.rollback()
        try:
            prescription = db.query(Prescription).filter(Prescription.id == prescription_id).first()
            if prescription:
                prescription.status = JobStatus.FAILED
                prescription.error_message = str(exc)[:500]
                db.commit()
        except Exception:
            pass
        print(f"[Pipeline Error] Prescription {prescription_id}: {exc}")
        print(traceback.format_exc())
        raise exc
    finally:
        db.close()


@celery_app.task(bind=True, max_retries=3, default_retry_delay=2)
def process_prescription(self, prescription_id: int, file_path: str, filename: str = ""):
    """
    Celery task wrapper with exponential backoff retry logic (NFR 6.4).
    """
    try:
        execute_prescription_pipeline(prescription_id, file_path, filename)
    except Exception as exc:
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)
