# Import all models to ensure Alembic discovers them automatically
from app.db.base_class import Base
from app.models.user import User
from app.models.prescription import Prescription, AnalysisResult
