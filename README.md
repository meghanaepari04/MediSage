# 🌿 MediSage – Smart Prescription Analyzer & Generic Alternative Finder

[![Python Version](https://img.shields.io/badge/python-3.11%20%7C%203.12%20%7C%203.13-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.109+-009688.svg?logo=fastapi)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18.2+-61DAFB.svg?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5.2+-646CFF.svg?logo=vite)](https://vitejs.dev/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg?logo=docker)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**MediSage** is an AI-powered prescription analysis platform designed to bridge the gap between expensive branded medications and government-certified, bioequivalent generic alternatives. 

By combining modern Computer Vision (Dual-Engine OCR), Natural Language Processing (RapidFuzz phrase extraction), and Large Language Models with strict clinical safety guardrails, MediSage extracts medicines from physical or digital prescriptions, maps them to low-cost generic equivalents, calculates cost savings, and provides plain-language health insights while fully complying with the **Digital Personal Data Protection (DPDP) Act**.

---

## 📋 Table of Contents
1. [Core Features](#-core-features)
2. [System Architecture](#-system-architecture)
3. [Technology Stack](#-technology-stack)
4. [Project Structure](#-project-structure)
5. [Prerequisites](#-prerequisites)
6. [Getting Started & Running Locally](#-getting-started--running-locally)
   - [Method 1: Native Local Run (Zero External Setup)](#method-1-native-local-run-recommended-for-quick-testing)
   - [Method 2: Docker Compose (Full Stack)](#method-2-docker-compose-production--containerized)
7. [API Documentation & Endpoints](#-api-documentation--endpoints)
8. [Configuration & Environment Variables](#-configuration--environment-variables)
9. [Testing & Verification](#-testing--verification)
10. [Regulatory Compliance & Privacy (DPDP Act)](#-regulatory-compliance--privacy-dpdp-act)
11. [Medical Disclaimer](#-medical-disclaimer)

---

## ✨ Core Features

### 1. Multi-Format Prescription Ingestion (FR-U1 to FR-U3)
- Supports **JPG**, **PNG**, and **PDF** formats.
- Automatic first-page PDF rendering via `pdf2image`.
- Client-side and server-side **10 MB file size limit** with clear validation feedback.

### 2. Dual-Engine OCR & Quality Classification (FR-O1 to FR-O3)
- **Image Preprocessing**: Grayscale conversion, non-local means denoising, and Otsu binarization via OpenCV.
- **Handwriting Detection**: Uses Laplacian variance analysis ($> 800$) to automatically differentiate printed text from cursive or handwritten notes.
- **Dual OCR Engines**:
  - **Tesseract OCR** (`--oem 3 --psm 6`) for clean printed scripts.
  - **EasyOCR** (PyTorch deep learning model) for handwritten or low-contrast text.
- **Confidence Scoring**: Flags prescriptions with average OCR confidence $< 60\%$ with a visible **"Review Needed"** warning badge.

### 3. Intelligent NLP Entity Extraction & Generic Mapping (FR-M1 to FR-M4)
- **N-Gram Candidate Extraction**: Scans 1-gram, 2-gram, and 3-gram candidate phrase windows to accurately identify single- and multi-word drug names (e.g., *Crocin Advance*, *Pan 40*, *Dolo 650*, *Augmentin 625*).
- **Fuzzy Brand Matching**: Utilizes `RapidFuzz` (`token_set_ratio` $\ge 80$) to match noisy OCR text against certified generic database records.
- **Unmatched Drug Handling**: Flags unrecognizable medications with a *"Could not identify"* status rather than hallucinating wrong medications.

### 4. Transparent Price Differential & Savings (FR-P1 to FR-P3)
- Real-time side-by-side comparison of branded price vs. certified generic price.
- Automatic computation of line-item and aggregate prescription savings.
- Interactive hover popover in the prescription history list displaying identified medications.

### 5. LLM Clinical Insights with Safety Guardrails (FR-I1 to FR-I4)
- Plain-language 2–3 sentence usage summaries generated via **GPT-4o** (or Claude).
- **Data Minimization (FR-I3)**: Transmits **only** verified generic medicine names to LLMs — patient names, doctor names, hospital details, and PHI never leave the secure environment.
- **Strict Guardrail Filter**: Enforces a strict blocklist against dosage instructions, schedule frequencies, and medical advice (`take`, `dosage`, `schedule`, `mg`, `pill`).
- **Offline Clinical Fallback**: Built-in pharmaceutical indications database ensures full functionality and rich explanations even without an OpenAI API key.
- **Collapsible UI (FR-I4)**: Accordion drawer collapsed by default to prioritize the financial savings table.

### 6. User Management & DPDP Compliance (FR-A1, FR-A2, FR-D1)
- JWT Bearer Token authentication (`HS256`) with salted `bcrypt` password hashing.
- Complete history of past prescriptions stored securely per user.
- **Right to Erasure (DPDP Act Section 12)**: One-click permanent account and prescription data deletion (`DELETE /users/me`) with database cascading deletion.

---

## 🏛️ System Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        MediSage Frontend (React + Vite)                │
│             Port: 5173 (Dev) / Port: 3000 (Docker Nginx)               │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / REST (JWT Bearer)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     MediSage Backend API (FastAPI)                     │
│                              Port: 8000                                │
├───────────────────────────────────┬────────────────────────────────────┤
│  Endpoints:                       │  Services:                         │
│  - /auth (login, register)        │  - OCR (OpenCV + Tesseract/EasyOCR)│
│  - /prescriptions (upload, status)│  - NLP (RapidFuzz N-gram Matcher)  │
│  - /users/me (DPDP delete)        │  - LLM (GPT-4o Guardrailed + Local)│
└───────────────┬───────────────────┴──────────────────┬─────────────────┘
                │                                      │
   (Async Queue Fallback)               (Database Fallback Engine)
                │                                      │
        ┌───────┴───────┐                      ┌───────┴───────┐
        ▼               ▼                      ▼               ▼
   Celery Worker   FastAPI Tasks          PostgreSQL        SQLite
  (Redis Broker)     (In-Memory)           (Docker)      (medisage.db)
```

---

## 💻 Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, Vite 5, Tailwind CSS, Framer Motion, Lucide Icons |
| **Backend Framework** | FastAPI, Starlette, Pydantic v2, Python 3.11+ |
| **Database & ORM** | SQLAlchemy 2.0, PostgreSQL 16 / SQLite fallback, Alembic |
| **Task Queue** | Celery 5.6, Redis 7 / FastAPI `BackgroundTasks` fallback |
| **Computer Vision / OCR** | OpenCV (headless), Tesseract OCR, EasyOCR, PyTorch, pdf2image |
| **NLP & Matching** | RapidFuzz, Regex Tokenizer, spaCy |
| **AI / LLM** | OpenAI API (`gpt-4o`) / Anthropic SDK + Local Clinical Knowledge |
| **Security & Auth** | PyJWT, bcrypt, CORS Middleware |
| **DevOps & Containers** | Docker, Docker Compose, Nginx Alpine |

---

## 📂 Project Structure

```text
medisage/
├── README.md                      # Complete project documentation
├── docker-compose.yml             # Full microservices compose specification
├── .env                           # Environment configuration
├── .env.example                   # Example environment template
├── MediSage_PRD_v1.0.txt          # Product Requirements Document
│
├── backend/                       # FastAPI Backend Service
│   ├── Dockerfile                 # Backend container image with Tesseract & Poppler
│   ├── entrypoint.sh              # Container startup script
│   ├── requirements.txt           # Python dependencies
│   ├── README.md                  # Backend-specific documentation
│   └── app/
│       ├── main.py                # FastAPI app creation & lifecycle hooks
│       ├── api/
│       │   ├── deps.py            # Authentication dependencies & DB sessions
│       │   ├── router.py          # Master API router grouping
│       │   └── endpoints/
│       │       ├── auth.py        # /auth/register, /auth/login
│       │       ├── health.py      # /health check
│       │       ├── prescriptions.py# /upload, /status/{id}, /{id}/results, /history
│       │       └── users.py       # /users/me (DPDP account deletion)
│       ├── core/
│       │   ├── config.py          # Pydantic Settings & DB URL resolution
│       │   └── security.py        # bcrypt password hashing & JWT encoding/decoding
│       ├── db/
│       │   ├── base.py            # Model registry for Alembic/SQLAlchemy
│       │   ├── base_class.py      # Declarative Base
│       │   └── session.py         # Engine pool with PostgreSQL/SQLite auto-fallback
│       ├── models/
│       │   ├── prescription.py    # Prescription & AnalysisResult SQLAlchemy models
│       │   └── user.py            # User model
│       ├── schemas/               # Request and response Pydantic schemas
│       ├── services/
│       │   ├── ocr.py             # Image preprocessing, Laplacian variance, OCR engines
│       │   ├── nlp.py             # N-gram candidate extraction, RapidFuzz generic database
│       │   └── llm.py             # GPT-4o usage summary with safety guardrail filter
│       └── worker/
│           ├── celery_app.py      # Celery instance configuration
│           └── tasks.py           # Prescription processing pipeline task
│
└── frontend/                      # React + Vite Single Page Application
    ├── Dockerfile                 # Multi-stage Node builder + Nginx production image
    ├── nginx.conf                 # Production Nginx reverse-proxy configuration
    ├── package.json               # Node dependencies & build scripts
    ├── vite.config.js             # Vite configuration (port 5173, host enabled)
    ├── tailwind.config.js         # Tailwind styling config
    ├── index.html                 # Main HTML entrypoint
    └── src/
        ├── App.jsx                # Full interactive UI: Upload, Results, History, Settings
        ├── main.jsx               # React DOM entrypoint
        └── index.css              # Global styles & Tailwind directives
```

---

## ⚙️ Prerequisites

- **Python**: Version 3.11, 3.12, or 3.13
- **Node.js**: Version 18+ (Node 20+ recommended)
- **Tesseract OCR**:
  - macOS: `brew install tesseract poppler`
  - Ubuntu/Debian: `sudo apt-get install tesseract-ocr poppler-utils`
- *(Optional)* **Docker & Docker Compose**: For containerized execution.

---

## 🚀 Getting Started & Running Locally

### Method 1: Native Local Run (Recommended for quick testing)

The application includes an **automatic fallback engine**:
- If PostgreSQL is offline, it automatically creates and uses `medisage.db` (SQLite).
- If Redis is offline, it automatically executes prescription analysis using FastAPI's background thread pool.

#### 1. Setup Backend
```bash
# Navigate to backend directory
cd backend

# Create virtual environment (if not already created)
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start backend server
PYTHONPATH=. uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
*Backend will be live at: [http://localhost:8000](http://localhost:8000)*  
*Interactive Swagger docs: [http://localhost:8000/docs](http://localhost:8000/docs)*

#### 2. Setup Frontend
```bash
# In a new terminal, navigate to frontend directory
cd frontend

# Install npm packages
npm install

# Start Vite development server
npm run dev
```
*Frontend will be live at: [http://localhost:5173](http://localhost:5173)*

---

### Method 2: Docker Compose (Production / Containerized)

To spin up the entire microservice ecosystem (**PostgreSQL**, **Redis**, **FastAPI Backend**, **Celery Worker**, and **Nginx React Frontend**):

```bash
# From the project root
docker-compose up --build
```

#### Running Services:
| Service | URL | Container Port | Host Port |
|---|---|---|---|
| **React Frontend** | [http://localhost:3000](http://localhost:3000) | `80` | `3000` |
| **FastAPI Backend** | [http://localhost:8000](http://localhost:8000) | `8000` | `8000` |
| **PostgreSQL DB** | `localhost:5432` | `5432` | `5432` |
| **Redis Broker** | `localhost:6379` | `6379` | `6379` |
| **Celery Worker** | Internal task runner | - | - |

To stop the containers:
```bash
docker-compose down
```

---

## 📡 API Documentation & Endpoints

Interactive Swagger documentation is automatically available at `/docs`.

| Method | Endpoint | Description | Auth Required |
|---|---|---|:---:|
| `GET` | `/health` | Health check endpoint | No |
| `POST` | `/auth/register` | Register new user with email & password | No |
| `POST` | `/auth/login` | Authenticate user and receive JWT bearer token | No |
| `POST` | `/prescriptions/upload` | Upload JPG/PNG/PDF (max 10MB) for analysis | Yes* |
| `GET` | `/prescriptions/status/{job_id}` | Poll analysis progress (`pending`, `processing`, `complete`, `failed`) | No |
| `GET` | `/prescriptions/{id}/results` | Retrieve detailed OCR, NLP medicines, savings, and AI insights | Yes* |
| `GET` | `/prescriptions/history` | List all historical prescriptions and medicines for authenticated user | Yes* |
| `DELETE` | `/users/me` | DPDP Act Right to Erasure: Permanently delete account and all prescriptions | Yes |

*\*Note: In local development, requests without an Authorization token automatically fall back to a local default user profile so you can test without logging in.*

---

## 🔒 Configuration & Environment Variables

Create or edit your `.env` file in the root directory:

```ini
# Application Secrets
SECRET_KEY=change-me-in-production-use-a-long-random-string

# AI / LLM Integration (Optional - intelligent local fallback provided if blank)
OPENAI_API_KEY=your_openai_api_key_here

# Database Configuration (Defaults to Docker service name)
POSTGRES_SERVER=localhost
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=medisage

# Optional Direct Database Override (e.g. SQLite for lightweight testing)
# DATABASE_URL=sqlite:///./medisage.db

# Redis / Celery Queue Configuration
REDIS_URL=redis://localhost:6379/0

# Storage (Optional S3 upload destination)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_BUCKET_NAME=medisage-prescriptions
```

---

## 🧪 Testing & Verification

### 1. Run Backend End-to-End Test Suite
Tests authentication, user deletion, synthetic prescription image generation, OCR, NLP, and savings calculation:

```bash
cd backend
PYTHONPATH=. .venv/bin/python -c "
import cv2, numpy as np, io
from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)

# 1. Auth Test
r_reg = client.post('/auth/register', json={'email': 'test@medisage.com', 'password': 'password123'})
token = r_reg.json()['access_token']
headers = {'Authorization': f'Bearer {token}'}

# 2. Synthetic Prescription Image
img = np.full((300, 800, 3), 255, dtype=np.uint8)
cv2.putText(img, 'Dr. Sharma Rx: Tab Crocin Advance 500mg, Cap Pan 40', (40, 150), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)
_, buf = cv2.imencode('.png', img)

# 3. Upload & Process
res = client.post('/prescriptions/upload', headers=headers, files={'file': ('rx.png', io.BytesIO(buf.tobytes()), 'image/png')})
print('Upload:', res.status_code, res.json())
job_id = res.json()['job_id']

# 4. Status Check
stat = client.get(f'/prescriptions/status/{job_id}', headers=headers)
print('Status:', stat.status_code, stat.json())
"
```

### 2. Frontend Production Build Check
```bash
cd frontend
npm run build
```

---

## 🛡️ Regulatory Compliance & Privacy (DPDP Act)

MediSage is architected to adhere strictly to India's **Digital Personal Data Protection (DPDP) Act**:

1. **Data Minimization (Section 6)**: When invoking external LLMs for educational summaries, only generic medicine chemical names (e.g., *Pantoprazole*, *Paracetamol*) are sent. Patient names, doctor signatures, hospital addresses, and age/gender data are never transmitted to third-party APIs.
2. **Right to Erasure (Section 12)**: The `DELETE /users/me` endpoint permanently purges user credentials and triggers an immediate SQL cascade delete across all associated prescriptions and analysis records.
3. **No Secondary Processing**: Uploaded prescription images are processed solely for medication identification and generic price mapping.

---

## ⚠️ Medical Disclaimer

> **IMPORTANT MEDICAL NOTICE**:  
> MediSage is an informational and financial transparency tool designed to help users identify cost-saving generic medication equivalents. It does **NOT** provide medical advice, diagnosis, treatment plans, or dosage recommendations.  
> 
> Generic substitutions should always be verified by a licensed medical practitioner or registered pharmacist prior to purchase or consumption.

---

## 📄 License
This project is open-source and distributed under the [MIT License](LICENSE).
