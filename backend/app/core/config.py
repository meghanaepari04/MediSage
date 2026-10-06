import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Union
from pydantic import AnyHttpUrl, field_validator
import json

class Settings(BaseSettings):
    PROJECT_NAME: str = "MediSage API"
    API_V1_STR: str = "/api/v1"

    # CORS – accepts JSON list string OR actual list
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
    ]

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return [i.strip() for i in v.split(",")]
        return v

    # Authentication
    SECRET_KEY: str = "change-me-in-production-use-a-long-random-string"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # Database
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_DB: str = "medisage"
    DATABASE_URL: str = ""

    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        if os.getenv("DATABASE_URL"):
            return os.getenv("DATABASE_URL")
        return (
            f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_SERVER}/{self.POSTGRES_DB}"
        )

    # Redis/Celery Queue
    REDIS_URL: str = "redis://localhost:6379/0"

    # AI Models
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""

    # File Storage
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_BUCKET_NAME: str = "medisage-prescriptions"

    model_config = SettingsConfigDict(
        case_sensitive=True,
        env_file=".env",
        extra="ignore",
    )

settings = Settings()
