FROM python:3.11-slim

# Only the minimal system libs needed — skip heavy GUI/display libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    poppler-utils \
    libglib2.0-0 \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

ENV PIP_DEFAULT_TIMEOUT=600 \
    PIP_RETRIES=5 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install Python dependencies (cached layer)
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --default-timeout=600 --retries 5 --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Download spaCy model at startup (keeps image build fast & light)
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["/entrypoint.sh"]
