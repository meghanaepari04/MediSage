import os
from typing import List, Dict, Any
from openai import OpenAI
from app.core.config import settings

# Initialize OpenAI Client (this also supports Anthropic SDK if chosen)
client = OpenAI(api_key=settings.OPENAI_API_KEY) if settings.OPENAI_API_KEY else None

DISCLAIMER = "\n\nDisclaimer: For informational purposes only. Consult a licensed pharmacist or physician."

LOCAL_KNOWLEDGE = {
    "paracetamol": "used to reduce fever and relieve mild-to-moderate pain",
    "ibuprofen": "a non-steroidal anti-inflammatory (NSAID) used to relieve pain and swelling",
    "amoxicillin": "a broad-spectrum antibiotic used to treat bacterial infections",
    "azithromycin": "a macrolide antibiotic used to treat respiratory and soft tissue bacterial infections",
    "cefixime": "a cephalosporin antibiotic used to treat bacterial infections",
    "pantoprazole": "a proton pump inhibitor that lowers stomach acid production to treat reflux and gastritis",
    "omeprazole": "used to treat acid reflux, heartburn, and protect the gastric lining",
    "atorvastatin": "a statin medication used to reduce cholesterol and cardiovascular risk",
    "telmisartan": "an antihypertensive used to manage blood pressure and cardiovascular health",
    "amlodipine": "a calcium channel blocker that relaxes blood vessels to reduce high blood pressure",
    "fexofenadine": "a non-drowsy antihistamine that relieves allergy and rhinitis symptoms",
    "cetirizine": "an antihistamine used for allergic symptoms such as sneezing and itching",
    "metformin": "used to regulate blood sugar levels and insulin sensitivity in type 2 diabetes",
    "salbutamol": "a bronchodilator used to open airways and relieve breathing difficulty in respiratory conditions",
}


def _generate_fallback_insight(medicine_names: List[str]) -> str:
    """Generate high-quality clinical usage summary without requiring external LLM API."""
    insights = []
    for name in medicine_names:
        matched_fact = None
        for key, fact in LOCAL_KNOWLEDGE.items():
            if key in name.lower():
                matched_fact = fact
                break
        if matched_fact:
            insights.append(f"{name} is {matched_fact}")
        else:
            insights.append(f"{name} is an active pharmaceutical compound for therapeutic management")

    summary = ". ".join(insights) + "."
    summary += " Generic equivalents contain the same active ingredients and safety profile at a fraction of the cost."
    return summary


def generate_medicine_insights(medicines: List[Dict[str, Any]]) -> str:
    """
    Generate a 2-3 sentence usage summary for the identified medicines.
    Enforces strict guardrails prohibiting dosage recommendations (FR-I3).
    """
    if not medicines:
        return f"No verified medicines found to generate insights.{DISCLAIMER}"

    # We only send medicine *names*, avoiding sending full PHI prescription data.
    medicine_names = [med["generic"] for med in medicines if "error" not in med]

    if not medicine_names:
        return f"No verifiable medicines mapped.{DISCLAIMER}"

    if not client:
        return _generate_fallback_insight(medicine_names) + DISCLAIMER

    prompt = f"""
    The patient was prescribed the following medicine(s): {', '.join(medicine_names)}.
    Please provide a very brief, plain language explanation (2-3 sentences max) of what these medicines are typically used for.
    STRICT RULE: Do NOT formulate any dosage recommendations, schedules, or medical advice. Limit to general usage facts.
    """

    try:
        response = client.chat.completions.create(
            model="gpt-4o",  # Using GPT-4o from PRD Stack
            messages=[
                {"role": "system", "content": "You are a helpful pharmaceutical reference assistant."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,
            max_tokens=150
        )
        insight = response.choices[0].message.content.strip()
        
        # Guardrail Validation
        blocklist = ["take", "dosage", "should take", "schedule", "mg", "pill"]
        if any(bad_word in insight.lower() for bad_word in blocklist):
             # If model hallucinates advice anyway, return a static safe generic summary
             insight = "The prescribed medicines are generally used to treat the diagnosed condition."

        return insight + DISCLAIMER

    except Exception as e:
        print(f"LLM API Error: {e}")
        return f"Could not generate insights at this time.{DISCLAIMER}"
