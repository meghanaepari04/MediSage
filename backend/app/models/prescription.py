from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum, Float, Boolean, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime
import enum
from app.db.base_class import Base

class JobStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETE = "complete"
    FAILED = "failed"

class Prescription(Base):
    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(String, unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False)
    file_name = Column(String, nullable=False)
    file_uri = Column(String, nullable=False)  # S3 or object storage location
    status = Column(Enum(JobStatus), default=JobStatus.PENDING, nullable=False)
    error_message = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner = relationship("User", back_populates="prescriptions")
    analysis_result = relationship("AnalysisResult", back_populates="prescription", uselist=False, cascade="all, delete-orphan")

class AnalysisResult(Base):
    id = Column(Integer, primary_key=True, index=True)
    prescription_id = Column(Integer, ForeignKey("prescription.id", ondelete="CASCADE"), unique=True)
    
    ocr_confidence_score = Column(Float, nullable=True)
    requires_review = Column(Boolean, default=False)
    
    # Store dynamic schema for extracted medicines, generic mappings, and prices
    # Example: [{"branded": "Crocin", "generic": "Paracetamol", "branded_price": 20, "generic_price": 5}]
    medicines_data = Column(JSON().with_variant(JSONB, "postgresql"), default=list) 
    
    total_estimated_savings = Column(Float, default=0.0)
    
    ai_insights = Column(String, nullable=True)
    disclaimer_added = Column(Boolean, default=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    
    prescription = relationship("Prescription", back_populates="analysis_result")
