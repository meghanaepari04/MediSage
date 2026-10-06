# MediSage Backend Setup

This directory contains the Python FastAPI backend for **MediSage**, built according to the specifications in `MediSage_PRD_v1.0.txt`.

## Architecture & Technology Stack
- **Framework:** FastAPI (Python 3.11+)
- **Database:** PostgreSQL (with SQLAlchemy and Alembic)
- **Task Queue:** Celery with Redis broker (for async processing)
- **OCR Engine:** EasyOCR & Tesseract
- **NLP Module:** spaCy & RapidFuzz
- **Authentication:** PyJWT + bcrypt
- **LLM/AI Insights:** OpenAI & Anthropic Integrations

## Project Structure
```text
backend/
├── app/
│   ├── api/
│   │   ├── endpoints/
│   │   │   ├── auth.py          # /auth/register, /auth/login
│   │   │   ├── health.py        # /health
│   │   │   ├── prescriptions.py # /prescriptions/upload, /prescriptions/status, etc.
│   │   │   └── users.py         # /users/me
│   │   └── router.py            # APIRouter grouping
│   ├── core/
│   │   └── config.py            # Pydantic Settings for .env
│   ├── models/                  # SQLAlchemy DB models 
│   ├── schemas/                 # Pydantic schemas (requests/responses)
│   ├── services/                # Business logic, OCR pipelines, NLP extraction
│   ├── worker/                  
│   │   ├── celery_app.py        # Celery Configuration
│   │   └── tasks.py             # Async job queue processing tasks
│   └── main.py                  # FastAPI Entrypoint
└── requirements.txt         # Project Dependencies
```

## How to Run

1. **Install Dependencies:**
   ```bash
   pip install -r requirements.txt
   ```
2. **Start Redis Server:** Make sure you have Redis running at `redis://localhost:6379/0`.
3. **Start the FastAPI App:**
   ```bash
   uvicorn app.main:app --reload
   ```
4. **Start the Celery Worker:**
   ```bash
   celery -A app.worker.celery_app worker --loglevel=info
   ```

## API Documentation
Once the server is running, interactive OpenAPI documentation will be automatically generated at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
