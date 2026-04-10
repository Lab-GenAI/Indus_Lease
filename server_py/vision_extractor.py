import os
import re
import json
import base64
import time
import subprocess
import tempfile
import uuid
import shutil
from openai import OpenAI
from server_py import storage
from server_py.cost_tracker import log_cost
from server_py.progress import emit_progress
from server_py.config import get_config
from server_py.document_parser import parse_document, extract_email_attachments

NOT_FOUND_PATTERNS = {
    "not found", "not mentioned", "not specified", "not available",
    "not provided", "not applicable", "not stated", "not disclosed",
    "not indicated", "not given", "not defined", "not present",
    "n/a", "na", "nil", "none", "-", "--", "---", "unknown",
}

NOT_FOUND_PREFIXES = (
    "not found", "not mentioned", "not specified", "not available",
    "not provided", "not applicable", "not stated", "not disclosed",
    "not indicated", "not given", "not defined", "not present",
)


def _normalize_not_found(value: str) -> str:
    if not value:
        return "Not Found"
    stripped = value.strip().rstrip(".").strip()
    lower = stripped.lower()
    if lower in NOT_FOUND_PATTERNS:
        return "Not Found"
    if len(stripped) <= 1 and not stripped.isalnum():
        return "Not Found"
    for prefix in NOT_FOUND_PREFIXES:
        if lower.startswith(prefix) and (len(lower) == len(prefix) or lower[len(prefix)] in " .,;:(-"):
            return "Not Found"
    return value


def _get_vision_clients():
    config = get_config()
    model = config.get("extraction_model", "azure.gpt-4.1")
    api_key = config.get("openai_api_key", "")
    base_url = config.get("openai_base_url", "https://api.openai.com/v1")
    oc = OpenAI(api_key=api_key, base_url=base_url)

    ac = None
    if model.startswith("claude-"):
        anth_key = config.get("anthropic_api_key", "")
        if anth_key:
            try:
                import anthropic
                ac = anthropic.Anthropic(api_key=anth_key)
            except ImportError:
                print("[VISION] anthropic package not installed")

    return oc, ac, model


def _convert_pdf_to_images(pdf_path: str) -> list:
    temp_dir = os.path.join(tempfile.gettempdir(), f"vision-{uuid.uuid4().hex}")
    os.makedirs(temp_dir, exist_ok=True)

    poppler_path = os.environ.get("POPPLER_PATH")
    pdftoppm_bin = "pdftoppm"
    if poppler_path:
        candidate = os.path.join(poppler_path, "pdftoppm")
        if os.path.exists(candidate):
            pdftoppm_bin = candidate
        candidate_exe = os.path.join(poppler_path, "pdftoppm.exe")
        if os.path.exists(candidate_exe):
            pdftoppm_bin = candidate_exe

    page_prefix = os.path.join(temp_dir, "page")
    cmd = [pdftoppm_bin, "-png", "-r", "200", pdf_path, page_prefix]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if result.returncode != 0:
        print(f"[VISION] pdftoppm failed: {result.stderr}")
        shutil.rmtree(temp_dir, ignore_errors=True)
        return []

    image_files = sorted([
        os.path.join(temp_dir, f) for f in os.listdir(temp_dir) if f.endswith(".png")
    ])

    return image_files


def _encode_image(image_path: str) -> str:
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def _get_text_content_for_file(file_record: dict) -> str:
    file_type = file_record.get("file_type", "")
    file_path = file_record.get("file_path", "")
    if file_type in ("docx", "eml", "msg", "txt","xlsx","xls"):
        return parse_document(file_path, file_type)
    return ""

MAX_IMAGES_PER_CALL = 40
MAX_REQUEST_IMAGE_PAYLOAD_MB = 38  # conservative for Azure + JSON overhead
DATA_URL_PREFIX = "data:image/png;base64,"

def _estimate_payload_size_bytes(img_b64: str) -> int:
    # size of the actual string sent in JSON, plus a little per-image overhead
    return len(DATA_URL_PREFIX) + len(img_b64) + 256

def _chunk_images(image_data_list: list) -> list:
    chunks = []
    current_chunk = []
    current_size_bytes = 0
    size_limit_bytes = MAX_REQUEST_IMAGE_PAYLOAD_MB * 1024 * 1024

    for img_b64 in image_data_list:
        payload_size = _estimate_payload_size_bytes(img_b64)

        if current_chunk and (
            len(current_chunk) >= MAX_IMAGES_PER_CALL
            or current_size_bytes + payload_size > size_limit_bytes
        ):
            chunks.append(current_chunk)
            current_chunk = []
            current_size_bytes = 0

        current_chunk.append(img_b64)
        current_size_bytes += payload_size

    if current_chunk:
        chunks.append(current_chunk)

    return chunks

def _payload_mb(images: list) -> float:
    return sum(_estimate_payload_size_bytes(img) for img in images) / (1024 * 1024)

def _extract_via_vision(image_data_list: list, tags: list, text_context: str,
                        lease_id: int = None, site_id: int = None) -> dict:
    total_images = len(image_data_list)
    total_size_mb = _payload_mb(image_data_list)

    needs_chunking = total_images > MAX_IMAGES_PER_CALL or total_size_mb > MAX_REQUEST_IMAGE_PAYLOAD_MB
    if needs_chunking:
        reason = []
        if total_images > MAX_IMAGES_PER_CALL:
            reason.append(f"{total_images} images > {MAX_IMAGES_PER_CALL} limit")
        if total_size_mb > MAX_REQUEST_IMAGE_PAYLOAD_MB:
            reason.append(f"{total_size_mb:.1f}MB > {MAX_REQUEST_IMAGE_PAYLOAD_MB}MB limit")

        print(f"[VISION] Chunking needed: {', '.join(reason)}")
        image_chunks = _chunk_images(image_data_list)
        print(f"[VISION] Split into {len(image_chunks)} chunks: {[len(c) for c in image_chunks]} images each")

        merged = {tag["name"]: "Not Found" for tag in tags}
        for ci, chunk in enumerate(image_chunks):
            chunk_size_mb = _payload_mb(chunk)
            print(f"[VISION] Processing chunk {ci + 1}/{len(image_chunks)} ({len(chunk)} images, {chunk_size_mb:.1f}MB payload)")
            chunk_results = _extract_single_vision_call(
                chunk, tags, text_context, lease_id=lease_id, site_id=site_id
            )
            for tag_name, value in chunk_results.items():
                if value and value != "Not Found" and value.strip() != "":
                    if merged.get(tag_name) in ("Not Found", ""):
                        merged[tag_name] = value
        return merged

    return _extract_single_vision_call(image_data_list, tags, text_context,
                                       lease_id=lease_id, site_id=site_id)
                                           
def _extract_single_vision_call(image_data_list: list, tags: list, text_context: str,
                         lease_id: int = None, site_id: int = None) -> dict:
    config = get_config()
    vision_prompt_template = config.get("vision_prompt", "")

    oc, ac, model = _get_vision_clients()

    tags_description = "\n".join(
        f'{i+1}. "{tag["name"]}"' + (f' — {tag["description"]}' if tag.get("description") else "")
        for i, tag in enumerate(tags)
    )
    tag_names_json = json.dumps([tag["name"] for tag in tags])

    prompt_text = vision_prompt_template.replace("{tags_list}", tags_description).replace("{tag_names_json}", tag_names_json)

    if text_context:
        print(f"[VISION] Including {len(text_context):,} chars of text content from non-image files")
        prompt_text += f"\n\nAdditional text content from non-image files:\n{text_context}"

    if model.startswith("claude-") and not ac:
        raise RuntimeError(
            f"Claude model '{model}' is configured but Anthropic client is not available. "
            "Ensure the 'anthropic' package is installed and ANTHROPIC_API_KEY is set."
        )

    use_claude = model.startswith("claude-")

    MAX_RETRIES = 3

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            if use_claude:
                content_parts = [{"type": "text", "text": prompt_text}]
                for img_b64 in image_data_list:
                    content_parts.append({
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": img_b64,
                        },
                    })

                response = ac.messages.create(
                    model=model,
                    max_tokens=16384,
                    messages=[{"role": "user", "content": content_parts}],
                )

                input_tokens = response.usage.input_tokens
                output_tokens = response.usage.output_tokens
                log_cost(
                    type_="extraction",
                    model=model,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    lease_id=lease_id,
                    site_id=site_id,
                )
                raw = (response.content[0].text if response.content else "").strip()
            else:
                content_parts = [{"type": "text", "text": prompt_text}]
                for img_b64 in image_data_list:
                    content_parts.append({
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{img_b64}",
                            "detail": "high",
                        },
                    })

                response = oc.chat.completions.create(
                    model=model,
                    messages=[{"role": "user", "content": content_parts}],
                    max_completion_tokens=16384,
                    timeout=300,
                )

                usage = response.usage
                if usage:
                    log_cost(
                        type_="extraction",
                        model=model,
                        input_tokens=usage.prompt_tokens,
                        output_tokens=usage.completion_tokens,
                        lease_id=lease_id,
                        site_id=site_id,
                    )
                raw = (response.choices[0].message.content or "").strip()

            cleaned = raw
            if cleaned.startswith("```"):
                cleaned = re.sub(r'^```[a-zA-Z]*\n?', '', cleaned)
                cleaned = re.sub(r'\n?```$', '', cleaned)
                cleaned = cleaned.strip()

            parsed = json.loads(cleaned)
            results = {}
            for tag in tags:
                value = parsed.get(tag["name"], "Not Found")
                if not isinstance(value, str):
                    value = str(value) if value is not None else "Not Found"
                value = value.strip() if value else "Not Found"
                results[tag["name"]] = _normalize_not_found(value)

            return results

        except json.JSONDecodeError:
            print(f"[VISION] Failed to parse JSON (attempt {attempt}): {raw[:200] if 'raw' in dir() else 'no response'}")
            if attempt == MAX_RETRIES:
                return {tag["name"]: "Extraction Error" for tag in tags}
        except Exception as e:
            msg = str(e)

            non_retryable = (
                "BadRequestError" in msg
                or "invalid_request_error" in msg
                or "exceeds the allowed limit" in msg
                or "Total image size is" in msg
            )

            if non_retryable:
                print(f"[VISION] Non-retryable API error: {e}")
                return {tag["name"]: "Extraction Error" for tag in tags}

            if attempt < MAX_RETRIES:
                wait_time = 2 ** attempt
                print(f"[VISION] API error (attempt {attempt}/{MAX_RETRIES}): {e} — retrying in {wait_time}s...")
                time.sleep(wait_time)
            else:
                print(f"[VISION] API error (attempt {attempt}/{MAX_RETRIES}): {e} — giving up")
                return {tag["name"]: "Extraction Error" for tag in tags}

    return {tag["name"]: "Extraction Error" for tag in tags}


def extract_tags_vision(lease_id: int, task_id: str = None, site_id: int = None) -> dict:
    config = get_config()

    tags = storage.get_tags()
    if not tags:
        return {}

    lease = storage.get_lease(lease_id)
    if not lease:
        return {}

    if site_id is None:
        site_id = lease.get("site_id")

    tags_list = list(tags)
    total_tags = len(tags_list)

    files = storage.get_files_by_lease(lease_id)
    if not files:
        error_msg = f"No files found for lease {lease_id}"
        print(f"[VISION] {error_msg}")
        if task_id:
            emit_progress({
                "taskId": task_id, "type": "extraction", "status": "error",
                "current": 0, "total": 0, "message": error_msg,
                "phase": "error",
            })
        raise Exception(error_msg)

    total_files = len(files)

    if task_id:
        emit_progress({
            "taskId": task_id, "type": "extraction", "status": "in_progress",
            "phase": "reading",
            "current": 0, "total": total_files,
            "message": f"Step 1/3 — Reading {total_files} file(s)...",
            "detail": "Preparing documents for extraction",
        })

    all_images = []
    text_parts = []
    temp_dirs = []
    attachment_count = 0

    def _process_single_file(f_type, f_path, f_name, source_label=None):
        nonlocal attachment_count
        label = f"{source_label} → {f_name}" if source_label else f_name

        if f_type == "pdf":
            print(f"[VISION] Converting PDF: {label} (all pages)")
            image_files = _convert_pdf_to_images(f_path)
            if image_files:
                temp_dirs.append(os.path.dirname(image_files[0]))
                for img_path in image_files:
                    all_images.append(_encode_image(img_path))
                print(f"[VISION] {label}: {len(image_files)} page images")
            else:
                print(f"[VISION] WARNING: {label}: PDF-to-image conversion failed, falling back to text extraction")
                text = parse_document(f_path, f_type)
                if text and not text.startswith("["):
                    text_parts.append(f"=== FILE: {label} ===\n{text}")
                    print(f"[VISION] {label}: fallback text {len(text)} chars")
                else:
                    print(f"[VISION] ERROR: {label}: Both image conversion and text extraction failed — this file's content will be MISSING from extraction")
        elif f_type in ("docx", "eml", "msg", "txt","xlsx","xls"):
            text = parse_document(f_path, f_type)
            if text and not text.startswith("["):
                text_parts.append(f"=== FILE: {label} ===\n{text}")
                print(f"[VISION] {label}: {len(text)} chars text content")
            else:
                print(f"[VISION] WARNING: {label}: No text content could be extracted from this file")

            if f_type in ("eml", "msg") and config.get("process_email_attachments", "true") == "true":
                attachments = extract_email_attachments(f_path, f_type)
                if attachments:
                    print(f"[VISION] {label}: Found {len(attachments)} attachment(s) — processing them")
                    for att in attachments:
                        attachment_count += 1
                        _process_single_file(
                            att["file_type"], att["file_path"], att["file_name"],
                            source_label=f_name,
                        )
                    att_temp_dir = os.path.dirname(attachments[0]["file_path"])
                    temp_dirs.append(att_temp_dir)
        else:
            text = parse_document(f_path, f_type)
            if text and not text.startswith("["):
                text_parts.append(f"=== FILE: {label} ===\n{text}")
                print(f"[VISION] {label}: {len(text)} chars text content")

    for fi, file_rec in enumerate(files):
        file_type = file_rec.get("file_type", "")
        file_path = file_rec.get("file_path", "")
        file_name = file_rec.get("file_name", "unknown")

        _process_single_file(file_type, file_path, file_name)

        if task_id:
            pct = round(((fi + 1) / total_files) * 100)
            emit_progress({
                "taskId": task_id, "type": "extraction", "status": "in_progress",
                "phase": "reading",
                "current": fi + 1, "total": total_files,
                "message": f"Step 1/3 — Reading files: {fi + 1} of {total_files} ({pct}%)",
                "detail": file_name,
            })

    if attachment_count > 0:
        print(f"[VISION] Processed {attachment_count} email attachment(s) across all files")

    text_context = "\n\n".join(text_parts)

    if not all_images and not text_context:
        for td in temp_dirs:
            shutil.rmtree(td, ignore_errors=True)
        error_msg = f"No usable content found for lease {lease_id}"
        if task_id:
            emit_progress({
                "taskId": task_id, "type": "extraction", "status": "error",
                "current": 0, "total": 0, "message": error_msg,
                "phase": "error",
            })
        raise Exception(error_msg)

    att_info = f" (including {attachment_count} email attachment(s))" if attachment_count > 0 else ""
    print(f"[VISION] Total: {len(all_images)} page images + {len(text_parts)} text files{att_info} for {total_tags} tags")

    TAGS_PER_BATCH = 15
    tag_batches = [tags_list[i:i + TAGS_PER_BATCH] for i in range(0, total_tags, TAGS_PER_BATCH)]
    total_batches = len(tag_batches)

    results = {}
    completed_tags = 0

    for tb_idx, tag_batch in enumerate(tag_batches):
        if task_id:
            pct = round((tb_idx / total_batches) * 100)
            emit_progress({
                "taskId": task_id, "type": "extraction", "status": "in_progress",
                "phase": "extracting",
                "current": tb_idx, "total": total_batches,
                "message": f"Step 2/3 — Extracting tags: batch {tb_idx + 1} of {total_batches} ({pct}%)",
                "detail": f"Sending {len(all_images)} pages + {len(text_parts)} text files to AI — extracting {len(tag_batch)} tags",
            })

        batch_results = _extract_via_vision(all_images, tag_batch, text_context,
                                             lease_id=lease_id, site_id=site_id)
        results.update(batch_results)
        completed_tags += len(tag_batch)

        if task_id:
            pct = round(((tb_idx + 1) / total_batches) * 100)
            emit_progress({
                "taskId": task_id, "type": "extraction", "status": "in_progress",
                "phase": "extracting",
                "current": tb_idx + 1, "total": total_batches,
                "message": f"Step 2/3 — Extracting tags: batch {tb_idx + 1} of {total_batches} ({pct}%)",
                "detail": f"{completed_tags} of {total_tags} tags extracted so far",
            })

    for td in temp_dirs:
        shutil.rmtree(td, ignore_errors=True)

    found_count = sum(1 for v in results.values() if v not in ("Not Found", "Extraction Error"))
    not_found_tags = [k for k, v in results.items() if v == "Not Found"]
    print(f"[VISION SUMMARY] Lease {lease_id}: {found_count}/{total_tags} tags extracted")
    if not_found_tags:
        print(f"[VISION SUMMARY] Not found: {', '.join(not_found_tags)}")

    if task_id:
        emit_progress({
            "taskId": task_id, "type": "extraction", "status": "in_progress",
            "phase": "saving",
            "current": 0, "total": total_tags,
            "message": f"Step 3/3 — Saving {total_tags} results...",
            "detail": f"{found_count} tags found, {len(not_found_tags)} not found",
        })

    try:
        storage.save_extraction_results_batch(lease_id, results)
    except Exception as e:
        print(f"[VISION] Failed to save extraction results: {e}")

    if task_id:
        not_found_summary = ""
        if not_found_tags:
            not_found_summary = f" | Not found: {', '.join(not_found_tags[:5])}"
            if len(not_found_tags) > 5:
                not_found_summary += f" +{len(not_found_tags) - 5} more"
        emit_progress({
            "taskId": task_id, "type": "extraction", "status": "completed",
            "phase": "done",
            "current": total_tags, "total": total_tags,
            "message": f"Extraction complete — {found_count} of {total_tags} tags found from {total_files} file(s)",
            "detail": f"{len(all_images)} pages + {len(text_parts)} text files processed{not_found_summary}",
        })

    return results
