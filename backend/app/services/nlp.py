from rapidfuzz import process, fuzz
import re
from typing import List, Dict, Any

# Lightweight fallback: rely on rules and RapidFuzz only, avoiding the
# heavyweight spaCy model download path during startup and container builds.

MEDICINE_DB = [
    # Analgesics / Antipyretics
    {"branded": "Crocin Advance", "generic": "Paracetamol", "branded_price": 25.0, "generic_price": 5.0, "manufacturer": "GSK"},
    {"branded": "Dolo 650", "generic": "Paracetamol", "branded_price": 30.0, "generic_price": 8.0, "manufacturer": "Micro Labs"},
    {"branded": "Calpol 500", "generic": "Paracetamol", "branded_price": 15.0, "generic_price": 4.0, "manufacturer": "GSK"},
    {"branded": "Combiflam", "generic": "Ibuprofen + Paracetamol", "branded_price": 42.0, "generic_price": 12.0, "manufacturer": "Sanofi"},
    {"branded": "Zerodol-SP", "generic": "Aceclofenac + Serratiopeptidase + Paracetamol", "branded_price": 110.0, "generic_price": 45.0, "manufacturer": "Ipca"},
    
    # Antibiotics
    {"branded": "Augmentin 625", "generic": "Amoxicillin + Clavulanic Acid", "branded_price": 180.0, "generic_price": 60.0, "manufacturer": "GSK"},
    {"branded": "Moxikind-CV 625", "generic": "Amoxicillin + Clavulanic Acid", "branded_price": 160.0, "generic_price": 55.0, "manufacturer": "Mankind"},
    {"branded": "Azithral 500", "generic": "Azithromycin", "branded_price": 120.0, "generic_price": 40.0, "manufacturer": "Alembic"},
    {"branded": "Taxim-O 200", "generic": "Cefixime", "branded_price": 140.0, "generic_price": 50.0, "manufacturer": "Alkem"},
    {"branded": "Monocef-O 200", "generic": "Cefpodoxime", "branded_price": 150.0, "generic_price": 50.0, "manufacturer": "Aristo"},
    {"branded": "Oflox 200", "generic": "Ofloxacin", "branded_price": 85.0, "generic_price": 25.0, "manufacturer": "Cipla"},

    # Antacids / Gastroenterology
    {"branded": "Pan 40", "generic": "Pantoprazole", "branded_price": 130.0, "generic_price": 25.0, "manufacturer": "Alkem"},
    {"branded": "Pantocid DSR", "generic": "Pantoprazole + Domperidone", "branded_price": 190.0, "generic_price": 45.0, "manufacturer": "Sun Pharma"},
    {"branded": "Omez 20", "generic": "Omeprazole", "branded_price": 55.0, "generic_price": 15.0, "manufacturer": "Dr. Reddy's"},
    {"branded": "Gelusil MPS", "generic": "Aluminium Hydroxide + Magnesium + Simethicone", "branded_price": 115.0, "generic_price": 40.0, "manufacturer": "Pfizer"},
    {"branded": "Pudin Hara", "generic": "Peppermint Oil Extract", "branded_price": 45.0, "generic_price": 15.0, "manufacturer": "Dabur"},

    # Cardiovascular / Statins / Hypertension
    {"branded": "Lipitor 10mg", "generic": "Atorvastatin", "branded_price": 200.0, "generic_price": 40.0, "manufacturer": "Pfizer"},
    {"branded": "Atorva 20", "generic": "Atorvastatin", "branded_price": 140.0, "generic_price": 35.0, "manufacturer": "Zydus"},
    {"branded": "Telmikind 40", "generic": "Telmisartan", "branded_price": 75.0, "generic_price": 20.0, "manufacturer": "Mankind"},
    {"branded": "Amlokind 5", "generic": "Amlodipine", "branded_price": 35.0, "generic_price": 10.0, "manufacturer": "Mankind"},
    {"branded": "Concor 5", "generic": "Bisoprolol", "branded_price": 110.0, "generic_price": 30.0, "manufacturer": "Merck"},

    # Antihistamines / Allergies
    {"branded": "Allegra 120", "generic": "Fexofenadine", "branded_price": 180.0, "generic_price": 45.0, "manufacturer": "Sanofi"},
    {"branded": "Okacet", "generic": "Cetirizine", "branded_price": 20.0, "generic_price": 5.0, "manufacturer": "Cipla"},
    {"branded": "Levocet", "generic": "Levocetirizine", "branded_price": 45.0, "generic_price": 10.0, "manufacturer": "Hetero"},

    # Diabetes / Hypoglycemic
    {"branded": "Glycomet 500", "generic": "Metformin", "branded_price": 45.0, "generic_price": 12.0, "manufacturer": "USV"},
    {"branded": "Amaryl 1mg", "generic": "Glimepiride", "branded_price": 120.0, "generic_price": 30.0, "manufacturer": "Sanofi"},
    {"branded": "Galvus Met", "generic": "Vildagliptin + Metformin", "branded_price": 280.0, "generic_price": 90.0, "manufacturer": "Novartis"},

    # Respiratory
    {"branded": "Asthalin", "generic": "Salbutamol (Inhaler)", "branded_price": 160.0, "generic_price": 80.0, "manufacturer": "Cipla"},
    {"branded": "Seroflo", "generic": "Salmeterol + Fluticasone", "branded_price": 450.0, "generic_price": 180.0, "manufacturer": "Cipla"},
    {"branded": "Montair LC", "generic": "Montelukast + Levocetirizine", "branded_price": 190.0, "generic_price": 55.0, "manufacturer": "Cipla"}
]

# List of branded names for RapidFuzz lookup
BRANDED_NAMES = [item["branded"].lower() for item in MEDICINE_DB]

def clean_ocr_text(text: str) -> str:
    """Handle common OCR noise (extra spaces, punctuation, case variations)."""
    text = text.lower()
    text = re.sub(r'[^a-zA-Z0-9\s]', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def extract_medicine_entities(ocr_text: str) -> List[str]:
    """Extract candidate medicine phrases using 1-gram, 2-gram, and 3-gram windows."""
    clean_text = clean_ocr_text(ocr_text)
    candidates = set()
    words = clean_text.split()
    
    for i in range(len(words)):
        for length in [1, 2, 3]:
            if i + length <= len(words):
                phrase = " ".join(words[i:i + length])
                if len(phrase) >= 3:
                    candidates.add(phrase)
            
    return list(candidates)

def map_to_generic(candidate: str) -> Dict[str, Any]:
    """Verify candidate against internal dataset using RapidFuzz."""
    cand_lower = candidate.lower()
    cand_words = set(cand_lower.split())
    
    best_match = None
    best_score = 0

    for med in MEDICINE_DB:
        brand_lower = med["branded"].lower()
        brand_words = set(brand_lower.split())
        
        # Calculate token set ratio
        score = fuzz.token_set_ratio(cand_lower, brand_lower)
        # Ensure high match and meaningful word intersection
        if score >= 80 and (brand_words & cand_words):
            if score > best_score:
                best_score = score
                best_match = med

    if best_match:
        return best_match
                
    return {
        "branded": candidate.title(),
        "error": "Could not identify",
        "generic": "No generic on record",
        "branded_price": 0.0,
        "generic_price": 0.0
    }

def process_prescription_nlp(ocr_text: str) -> Dict[str, Any]:
    """Main NLP pipeline to convert raw OCR text to verified generics."""
    candidates = extract_medicine_entities(ocr_text)
    
    mapped_medicines = []
    total_savings = 0.0
    seen_branded = set()
    
    for candidate in candidates:
        match_data = map_to_generic(candidate)
        
        if "error" not in match_data:
            brand_id = match_data["branded"]
            if brand_id not in seen_branded:
                mapped_medicines.append(match_data)
                total_savings += round(match_data["branded_price"] - match_data["generic_price"], 2)
                seen_branded.add(brand_id)
            
    return {
        "medicines": mapped_medicines,
        "total_estimated_savings": round(total_savings, 2)
    }
