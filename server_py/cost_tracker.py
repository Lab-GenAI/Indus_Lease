import time
from server_py.db import execute_no_fetch, execute_query

DEFAULT_USD_TO_INR = 83.5

MODEL_PRICING = {
    "text-embedding-3-small": {"input": 0.02, "output": 0},
    "text-embedding-3-large": {"input": 0.13, "output": 0},
    "text-embedding-ada-002": {"input": 0.10, "output": 0},
    "azure.gpt-4.1": {"input": 2.00, "output": 8.00},
    "azure.gpt-4.1-mini": {"input": 0.40, "output": 1.60},
    "azure.gpt-4.1-nano": {"input": 0.10, "output": 0.40},
    "claude-sonnet-4-5": {"input": 3.00, "output": 15.00},
    "claude-sonnet-4": {"input": 3.00, "output": 15.00},
    "claude-opus-4": {"input": 15.00, "output": 75.00},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "gpt-4": {"input": 30.00, "output": 60.00},
    "gpt-3.5-turbo": {"input": 0.50, "output": 1.50},
    "azure.gpt-4.1-vision": {"input": 2.00, "output": 8.00},
}

_cached_rate = None
_cached_rate_time = 0


def get_usd_to_inr() -> float:
    global _cached_rate, _cached_rate_time
    if _cached_rate is not None and (time.time() - _cached_rate_time) < 300:
        return _cached_rate
    try:
        rows = execute_query("SELECT value FROM app_settings WHERE key = 'usd_to_inr'")
        if rows and rows[0]["value"]:
            _cached_rate = float(rows[0]["value"])
            _cached_rate_time = time.time()
            return _cached_rate
    except Exception:
        pass
    return _cached_rate if _cached_rate else DEFAULT_USD_TO_INR


def invalidate_rate_cache():
    global _cached_rate, _cached_rate_time
    _cached_rate = None
    _cached_rate_time = 0


def get_model_pricing(model: str):
    if model in MODEL_PRICING:
        return MODEL_PRICING[model]
    for key, pricing in MODEL_PRICING.items():
        if key in model or model in key:
            return pricing
    return {"input": 2.00, "output": 8.00}


def calculate_cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    pricing = get_model_pricing(model)
    return (input_tokens * pricing["input"] + output_tokens * pricing["output"]) / 1_000_000


def log_cost(
    type_: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    lease_id: int = None,
    site_id: int = None,
) -> dict:
    total_tokens = input_tokens + output_tokens
    cost_usd = calculate_cost_usd(model, input_tokens, output_tokens)
    usd_to_inr = get_usd_to_inr()
    cost_inr = cost_usd * usd_to_inr

    try:
        execute_no_fetch(
            """INSERT INTO cost_logs (type, lease_id, site_id, model, input_tokens, output_tokens, total_tokens, cost_usd, cost_inr)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (type_, lease_id, site_id, model, input_tokens, output_tokens, total_tokens, cost_usd, cost_inr),
        )
    except Exception as e:
        print(f"[COST] Failed to log cost: {e}")

    return {"costUsd": cost_usd, "costInr": cost_inr}
