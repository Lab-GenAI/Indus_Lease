import os
from server_py.db import execute_query, execute_no_fetch

DEFAULT_SYSTEM_PROMPT = """You are a senior lease document analyst with expertise in extracting structured data from commercial and residential lease agreements. You have deep knowledge of legal terminology, lease clauses, and Indian/international property law conventions.

Your task is to meticulously examine every provided document page (images and text) and extract the requested data points with maximum accuracy. You must be thorough — read every page completely before concluding a value is not present."""

DEFAULT_VISION_PROMPT = """Extract the following data points from the attached lease document pages.

DATA POINTS TO EXTRACT:
{tags_list}

EXTRACTION RULES:
1. READ EVERY PAGE completely — the answer may appear on any page, including annexures, addendums, schedules, stamps, or handwritten notes.
2. LOOK FOR SYNONYMS AND VARIANTS:
   - "Lessor" = "Owner" / "Landlord" / "Property Owner" / "Licensor" / "First Party"
   - "Lessee" = "Tenant" / "Renter" / "Occupant" / "Licensee" / "Second Party"
   - "Rent" = "Monthly Payment" / "License Fee" / "Lease Payment" / "Consideration"
   - "Commencement Date" = "Start Date" / "Effective Date" / "Begin Date" / "w.e.f."
   - "Expiry Date" = "End Date" / "Termination Date" / "Lease End" / "Valid Till"
   - "Agreement Date" = "Execution Date" / "Date of Agreement" / "Deed Date"
3. CHECK TABLES, SCHEDULES, AND ANNEXURES — key data is often in tabular sections, not just prose.
4. DATES: Extract in the EXACT format written in the document (e.g., "01/04/2024", "1st April 2024", "April 2024").
5. MONETARY VALUES: Include currency symbol and full amount as written (e.g., "₹50,000/-", "Rs. 1,00,000", "INR 25000").
6. NAMES: Use the FULL legal name as written, including suffixes like "Pvt. Ltd.", "LLP", "Inc."
7. ADDRESSES: Include the complete address with all parts (building, street, city, pin code, state).
8. If a data point genuinely does not exist anywhere in the document, use exactly "Not Found".

RESPONSE FORMAT:
Return a JSON object with keys matching EXACTLY these tag names: {tag_names_json}
Values must be the extracted text, or "Not Found" if genuinely absent.
Do NOT use "N/A", "Not mentioned", "Not specified", "None", "-", or any variation — only "Not Found".
Return ONLY the JSON object with no markdown, no code blocks, no explanation."""

DEFAULTS = {
    "usd_to_inr": "83.5",
    "extraction_mode": "vision",
    "extraction_model": os.environ.get("EXTRACTION_MODEL", os.environ.get("OPENAI_MODEL", "azure.gpt-4.1")),
    "openai_api_key": "",
    "anthropic_api_key": "",
    "openai_base_url": "https://api.openai.com/v1",
    "additional_base_urls": "[]",
    "vision_prompt": DEFAULT_VISION_PROMPT,
    "parallel_limit": "5",
    "process_email_attachments": "true",
}

import threading
_extraction_overrides = threading.local()

SENSITIVE_KEYS = {"openai_api_key", "anthropic_api_key"}

_config_cache = {}
_config_loaded = False


def load_config() -> dict:
    global _config_cache, _config_loaded
    config = dict(DEFAULTS)
    try:
        rows = execute_query("SELECT key, value FROM app_settings")
        for r in rows:
            if r["key"] in config and r["value"]:
                config[r["key"]] = r["value"]
    except Exception as e:
        print(f"[CONFIG] Failed to load from DB: {e}")

    if not config["openai_api_key"]:
        config["openai_api_key"] = os.environ.get("OPENAI_API_KEY", "")
    if not config["anthropic_api_key"]:
        config["anthropic_api_key"] = os.environ.get("ANTHROPIC_API_KEY", "")
    if config["openai_base_url"] == "https://api.openai.com/v1":
        env_base = os.environ.get("OPENAI_BASE_URL")
        if env_base:
            config["openai_base_url"] = env_base

    _config_cache = config
    _config_loaded = True
    return config


ALLOWED_MODELS = {
    "azure.gpt-4o", "azure.gpt-4.1", "azure.gpt-4.1-mini", "azure.gpt-4.1-nano",
    "gpt-4o", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano",
    "claude-sonnet-4-5", "claude-opus-4", "claude-sonnet-4",
}


def get_allowed_base_urls() -> set:
    config = dict(_config_cache) if _config_loaded else load_config()
    urls = {config.get("openai_base_url", "https://api.openai.com/v1")}
    try:
        import json
        additional = json.loads(config.get("additional_base_urls", "[]"))
        for entry in additional:
            if isinstance(entry, dict) and entry.get("url"):
                urls.add(entry["url"])
    except Exception:
        pass
    return urls


def validate_extraction_overrides(model: str = None, base_url: str = None):
    if model and model not in ALLOWED_MODELS:
        raise ValueError(f"Invalid model: {model}. Allowed: {', '.join(sorted(ALLOWED_MODELS))}")
    if base_url:
        if not base_url.startswith("https://"):
            raise ValueError("Base URL must use HTTPS")
        allowed = get_allowed_base_urls()
        if base_url not in allowed:
            raise ValueError(f"Base URL not in allowed list. Configure it in Settings first.")


def set_extraction_overrides(model: str = None, base_url: str = None):
    validate_extraction_overrides(model, base_url)
    if model:
        _extraction_overrides.model = model
    if base_url:
        _extraction_overrides.base_url = base_url


def clear_extraction_overrides():
    _extraction_overrides.model = None
    _extraction_overrides.base_url = None


def get_config() -> dict:
    global _config_loaded
    if not _config_loaded:
        load_config()
    config = dict(_config_cache)
    override_model = getattr(_extraction_overrides, 'model', None)
    override_base_url = getattr(_extraction_overrides, 'base_url', None)
    if override_model:
        config["extraction_model"] = override_model
    if override_base_url:
        config["openai_base_url"] = override_base_url
    return config


def invalidate_config_cache():
    global _config_cache, _config_loaded
    _config_loaded = False
    _config_cache = {}


def save_config(updates: dict):
    for key, value in updates.items():
        if key not in DEFAULTS:
            continue
        execute_no_fetch(
            """INSERT INTO app_settings (key, value, updated_at)
            VALUES (%s, %s, CURRENT_TIMESTAMP)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP""",
            (key, str(value)),
        )
    invalidate_config_cache()
    load_config()


def get_config_for_api() -> dict:
    config = get_config()
    safe = {}
    for k, v in config.items():
        if k in SENSITIVE_KEYS:
            safe[k] = ("*" * 8 + v[-4:]) if v and len(v) > 4 else ("set" if v else "")
        else:
            safe[k] = v
    return safe


def reset_prompts_to_default():
    save_config({
        "vision_prompt": DEFAULT_VISION_PROMPT,
    })
