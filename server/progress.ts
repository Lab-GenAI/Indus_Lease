type ProgressCallback = (data: ProgressUpdate) => void;

export interface ProgressUpdate {
  taskId: string;
  type: "upload" | "extraction";
  status: "in_progress" | "completed" | "failed";
  current: number;
  total: number;
  message: string;
  detail?: string;
}

const listeners = new Map<string, Set<ProgressCallback>>();
const latestProgress = new Map<string, ProgressUpdate>();

export function emitProgress(update: ProgressUpdate) {
  latestProgress.set(update.taskId, update);

  if (update.total > 0) {
    const pct = Math.round((update.current / update.total) * 100);
    const bar = "█".repeat(Math.floor(pct / 5)) + "░".repeat(20 - Math.floor(pct / 5));
    console.log(`[${update.type.toUpperCase()}] ${update.taskId} |${bar}| ${pct}% (${update.current}/${update.total}) ${update.message}${update.detail ? ` - ${update.detail}` : ""}`);
  } else {
    console.log(`[${update.type.toUpperCase()}] ${update.taskId} ${update.message}`);
  }

  const callbacks = listeners.get(update.taskId);
  if (callbacks) {
    for (const cb of callbacks) {
      cb(update);
    }
  }
  if (update.status === "completed" || update.status === "failed") {
    setTimeout(() => {
      latestProgress.delete(update.taskId);
      listeners.delete(update.taskId);
    }, 30000);
  }
}

export function subscribe(taskId: string, cb: ProgressCallback) {
  if (!listeners.has(taskId)) {
    listeners.set(taskId, new Set());
  }
  listeners.get(taskId)!.add(cb);
  const latest = latestProgress.get(taskId);
  if (latest) {
    cb(latest);
  }
}

export function unsubscribe(taskId: string, cb: ProgressCallback) {
  const callbacks = listeners.get(taskId);
  if (callbacks) {
    callbacks.delete(cb);
  }
}

export function getProgress(taskId: string): ProgressUpdate | undefined {
  return latestProgress.get(taskId);
}

export function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
