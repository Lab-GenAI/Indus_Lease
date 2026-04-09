import { useState, useEffect, useCallback, useRef } from "react";

export interface ProgressData {
  taskId: string;
  type: "upload" | "extraction";
  status: "in_progress" | "completed" | "failed" | "error";
  phase?: "reading" | "extracting" | "saving" | "done" | "error";
  current: number;
  total: number;
  message: string;
  detail?: string;
}

export function useProgress(onComplete?: () => void) {
  const [activeProgress, setActiveProgress] = useState<Map<string, ProgressData>>(new Map());
  const eventSourcesRef = useRef<Map<string, EventSource>>(new Map());
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const trackTask = useCallback((taskId: string) => {
    if (eventSourcesRef.current.has(taskId)) return;

    const es = new EventSource(`/api/progress/${taskId}`);
    eventSourcesRef.current.set(taskId, es);

    const staleFallback = setTimeout(() => {
      if (eventSourcesRef.current.has(taskId)) {
        es.close();
        eventSourcesRef.current.delete(taskId);
        setActiveProgress((prev) => {
          const next = new Map(prev);
          next.delete(taskId);
          return next;
        });
      }
    }, 5 * 60 * 1000);

    es.onmessage = (event) => {
      try {
        const data: ProgressData = JSON.parse(event.data);
        setActiveProgress((prev) => {
          const next = new Map(prev);
          next.set(taskId, data);
          return next;
        });

        if (data.status === "completed" || data.status === "failed" || data.status === "error") {
          clearTimeout(staleFallback);
          if (onCompleteRef.current) {
            onCompleteRef.current();
          }
          setTimeout(() => {
            es.close();
            eventSourcesRef.current.delete(taskId);
            setActiveProgress((prev) => {
              const next = new Map(prev);
              next.delete(taskId);
              return next;
            });
          }, 3000);
        }
      } catch {}
    };

    es.onerror = () => {
      clearTimeout(staleFallback);
      es.close();
      eventSourcesRef.current.delete(taskId);
      setTimeout(() => {
        setActiveProgress((prev) => {
          const next = new Map(prev);
          next.delete(taskId);
          return next;
        });
      }, 2000);
    };
  }, []);

  useEffect(() => {
    return () => {
      for (const es of eventSourcesRef.current.values()) {
        es.close();
      }
      eventSourcesRef.current.clear();
    };
  }, []);

  return { activeProgress, trackTask };
}
