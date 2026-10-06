from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.base_class import Base

class User(Base):
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=True)  # Nullable for OAuth logins
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    oauth_provider = Column(String, nullable=True)   # E.g., 'google'
    oauth_id = Column(String, nullable=True, unique=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    prescriptions = relationship("Prescription", back_populates="owner", cascade="all, delete-orphan")
