from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api import deps
from app.models.user import User

router = APIRouter()


@router.delete("/me", status_code=200)
def delete_user_account(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Permanently delete the authenticated user's account and all associated data.
    Cascade deletes on Prescription → AnalysisResult are handled at the DB level.
    (FR compliant with India's DPDP Act 2023 right-to-erasure requirement.)
    """
    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    db.delete(user)
    db.commit()

    return {"message": "Account and all associated data have been permanently deleted."}
