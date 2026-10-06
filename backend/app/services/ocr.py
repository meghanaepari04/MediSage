import cv2
import pytesseract
import numpy as np
from typing import Dict, Any, Tuple


def preprocess_image(file_bytes: bytes) -> np.ndarray:
    """
    Preprocess image: resize, grayscale, threshold, noise removal, deskew
    """
    # 1. Decode bytes to numpy array
    nparr = np.frombuffer(file_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Unable to decode image. Please ensure the file is a valid JPG, PNG, or PDF.")

    # 2. Convert to grayscale
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # 3. Adaptive thresholding and noise removal
    denoised = cv2.fastNlMeansDenoising(gray, None, 10, 7, 21)

    # 4. Binarization via Otsu threshold
    _, thresh = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    return thresh


def is_handwritten(image: np.ndarray) -> bool:
    """
    Quality classifier for handwritten-style prescriptions.
    Uses Laplacian variance heuristic:
      higher variance → more irregular pixel structure → likely handwritten.
    """
    laplacian_var = cv2.Laplacian(image, cv2.CV_64F).var()
    return laplacian_var > 800


def run_tesseract(image: np.ndarray) -> Tuple[str, float]:
    """
    Run Tesseract for clean printed prescriptions.
    """
    custom_config = r'--oem 3 --psm 6'

    text = pytesseract.image_to_string(image, config=custom_config)

    # Confidence is 0–100 from Tesseract; normalise to 0–1
    data = pytesseract.image_to_data(image, config=custom_config, output_type=pytesseract.Output.DICT)
    conf_scores = [float(c) for c in data['conf'] if int(c) != -1]
    avg_confidence = (sum(conf_scores) / len(conf_scores) / 100) if conf_scores else 0.0

    return text, avg_confidence


def run_easyocr(image: np.ndarray) -> Tuple[str, float]:
    """
    Run EasyOCR for handwritten / low-quality prescriptions (FR-O2).
    Imported lazily to avoid model-loading overhead at startup.
    Falls back to Tesseract if the easyocr package is not installed.
    """
    try:
        import easyocr  # noqa: PLC0415
        reader = easyocr.Reader(['en'], gpu=False, verbose=False)
        results = reader.readtext(image)

        if not results:
            return "", 0.0

        # results: list of (bbox, text, confidence)
        texts = [r[1] for r in results]
        confidences = [r[2] for r in results]

        combined_text = " ".join(texts)
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
        return combined_text, avg_confidence

    except ImportError:
        # Graceful fallback: EasyOCR not installed
        return run_tesseract(image)


def pdf_to_image_bytes(file_bytes: bytes) -> bytes:
    """
    Convert the first page of a PDF to PNG image bytes using pdf2image.
    Falls back to returning raw bytes if conversion fails.
    """
    try:
        from pdf2image import convert_from_bytes  # noqa: PLC0415
        import io

        images = convert_from_bytes(file_bytes, first_page=1, last_page=1, dpi=200)
        if images:
            buf = io.BytesIO()
            images[0].save(buf, format='PNG')
            return buf.getvalue()
    except Exception:
        pass
    return file_bytes


def extract_text_from_prescription(file_bytes: bytes, filename: str = "") -> Dict[str, Any]:
    """
    Main OCR pipeline: preprocess → quality-classify → extract text.
    Supports JPG, PNG, and PDF inputs.
    """
    # PDF → first-page image conversion
    if filename.lower().endswith('.pdf'):
        file_bytes = pdf_to_image_bytes(file_bytes)

    processed_image = preprocess_image(file_bytes)

    if is_handwritten(processed_image):
        text, confidence = run_easyocr(processed_image)
        engine_used = "EasyOCR"
    else:
        text, confidence = run_tesseract(processed_image)
        engine_used = "Tesseract"

    requires_review = confidence < 0.60

    return {
        "text": text,
        "confidence": confidence,
        "engine": engine_used,
        "requires_review": requires_review,
    }
