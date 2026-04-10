import os
from openai import OpenAI
from server_py.config import get_config

def _get_clients():
    config = get_config()
    model = config.get("extraction_model", "azure.gpt-4.1")
    api_key = config.get("openai_api_key") or os.environ.get("OPENAI_API_KEY", "")
    base_url = config.get("openai_base_url", "https://api.openai.com/v1")

    oc = OpenAI(api_key=api_key, base_url=base_url)

    ac = None
    if model.startswith("claude-"):
        anth_key = config.get("anthropic_api_key") or os.environ.get("ANTHROPIC_API_KEY", "")
        if anth_key:
            try:
                import anthropic
                ac = anthropic.Anthropic(api_key=anth_key)
            except ImportError:
                print("[EXTRACT] anthropic package not installed")

    return oc, ac, model


def chat_completion(messages, max_tokens=512):
    oc, ac, model = _get_clients()

    if model.startswith("claude-") and not ac:
        raise RuntimeError(
            f"Claude model '{model}' is configured but Anthropic client is not available. "
            "Ensure the 'anthropic' package is installed and ANTHROPIC_API_KEY is set."
        )
    if model.startswith("claude-") and ac:
        user_content = "\n".join(m["content"] for m in messages if m["role"] == "user")
        system_content = "\n".join(m["content"] for m in messages if m["role"] == "system")
        kwargs = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": user_content}],
        }
        if system_content:
            kwargs["system"] = system_content
        response = ac.messages.create(**kwargs)
        input_tokens = response.usage.input_tokens
        output_tokens = response.usage.output_tokens
        text = response.content[0].text if response.content else ""
        return text, input_tokens, output_tokens, model
    else:
        response = oc.chat.completions.create(
            model=model,
            messages=messages,
            max_completion_tokens=max_tokens,
        )
        usage = response.usage
        input_tokens = usage.prompt_tokens if usage else 0
        output_tokens = usage.completion_tokens if usage else 0
        text = response.choices[0].message.content or ""
        return text, input_tokens, output_tokens, model

def extract_tags_for_lease(lease_id: int, task_id: str = None, site_id: int = None) -> dict:
    from server_py.vision_extractor import extract_tags_vision
    print(f"[EXTRACT] Using VISION extraction for lease {lease_id}")
    return extract_tags_vision(lease_id, task_id, site_id)
