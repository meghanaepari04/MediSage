from typing import Generator, Optional
from sqlalchemy.orm import Session
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.db.session import SessionLocal
from app.models.user import User
from app.core.security import decode_access_token

_bearer = HTTPBearer(auto_error=False)


def get_db() -> Generator:
    try:
        db = SessionLocal()
        yield db
    finally:
        db.close()


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    """
    Extract and validate the JWT from the Authorization: Bearer <token> header.
    Falls back to a mock user (id=1) when no token is provided so that local
    development without auth still works.
    """
    if credentials and credentials.credentials:
        user_id = decode_access_token(credentials.credentials)
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        user = db.query(User).filter(User.id == int(user_id)).first()
        if not user or not user.is_active:
            raise HTTPException(status_code=404, detail="User not found")
        return user

    # ── Dev fallback: no token → auto-create mock user id=1 ──────────────────
    user = db.query(User).filter(User.id == 1).first()
    if not user:
        user = User(id=1, email="test@medisage.com", is_active=True)
        db.add(user)
        db.commit()
        db.refresh(user)
    return user
