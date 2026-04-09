import asyncio
import time
import math
import random
from typing import Dict, Set, Optional, Callable, Any

listeners: Dict[str, Set[Callable]] = {}
latest_progress: Dict[str, dict] = {}


def emit_progress(update: dict):
    task_id = update["taskId"]
    latest_progress[task_id] = update

    total = update.get("total", 0)
    current = update.get("current", 0)
    msg = update.get("message", "")
    detail = update.get("detail", "")
    up_type = update.get("type", "").upper()

    if total > 0:
        pct = round((current / total) * 100)
        filled = math.floor(pct / 5)
        bar = "█" * filled + "░" * (20 - filled)
        detail_str = f" - {detail}" if detail else ""
        print(f"[{up_type}] {task_id} |{bar}| {pct}% ({current}/{total}) {msg}{detail_str}")
    else:
        print(f"[{up_type}] {task_id} {msg}")

    callbacks = listeners.get(task_id, set())
    for cb in list(callbacks):
        try:
            cb(update)
        except Exception:
            pass

    if update.get("status") in ("completed", "failed"):
        def deferred_cleanup():
            time.sleep(30)
            latest_progress.pop(task_id, None)
            listeners.pop(task_id, None)

        import threading
        cleanup_thread = threading.Thread(target=deferred_cleanup, daemon=True)
        cleanup_thread.start()


def subscribe(task_id: str, cb: Callable):
    if task_id not in listeners:
        listeners[task_id] = set()
    listeners[task_id].add(cb)
    latest = latest_progress.get(task_id)
    if latest:
        try:
            cb(latest)
        except Exception:
            pass


def unsubscribe(task_id: str, cb: Callable):
    callbacks = listeners.get(task_id)
    if callbacks:
        callbacks.discard(cb)


def get_progress(task_id: str) -> Optional[dict]:
    return latest_progress.get(task_id)


def generate_task_id() -> str:
    rand_part = hex(random.randint(0, 0xFFFFFFFF))[2:]
    return f"task_{int(time.time() * 1000)}_{rand_part[:6]}"
