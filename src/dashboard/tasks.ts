export type TaskStatus = "queued" | "running" | "done" | "error" | "cancelled";

export interface TaskInfo {
  id: string;
  status: TaskStatus;
  started_at?: string;
  finished_at?: string;
  lastMessage?: string;
  progress?: number; // 0 to 100
  error?: string;
}

const tasks = new Map<string, TaskInfo>();

function nowIso(): string {
  return new Date().toISOString();
}

export function createTask(initialMessage?: string): TaskInfo {
  const id = `t_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const t: TaskInfo = { id, status: "queued", lastMessage: initialMessage };
  tasks.set(id, t);
  return t;
}

export function getTask(id: string): TaskInfo | null {
  return tasks.get(id) ?? null;
}

export function listTasks(): TaskInfo[] {
  const now = Date.now();
  const recent: TaskInfo[] = [];
  for (const t of tasks.values()) {
    const isActive = t.status === "queued" || t.status === "running";
    const finishedRecently = t.finished_at && (now - new Date(t.finished_at).getTime()) < 120_000;
    if (isActive || finishedRecently) recent.push(t);
  }
  return recent.sort((a, b) => {
    const sa = a.started_at ?? a.id;
    const sb = b.started_at ?? b.id;
    return sb.localeCompare(sa);
  });
}

export function cancelTask(id: string): boolean {
  const t = tasks.get(id);
  if (!t) return false;
  if (t.status === "done" || t.status === "error") return false;
  t.status = "cancelled";
  t.finished_at = nowIso();
  t.lastMessage = "Cancelled";
  return true;
}

export async function runTask(id: string, fn: (helpers: { isCancelled: () => boolean; setMessage: (m: string) => void; setProgress: (p: number) => void }) => Promise<void>): Promise<void> {
  const t = tasks.get(id);
  if (!t) return;
  if (t.status === "cancelled") return;
  t.status = "running";
  t.started_at = nowIso();

  const helpers = {
    isCancelled: () => (tasks.get(id)?.status === "cancelled"),
    setMessage: (m: string) => {
      const cur = tasks.get(id);
      if (cur) cur.lastMessage = m;
    },
    setProgress: (p: number) => {
      const cur = tasks.get(id);
      if (cur) cur.progress = p;
    },
  };

  try {
    await fn(helpers);
    const cur = tasks.get(id);
    if (!cur) return;
    if (cur.status === "cancelled") return;
    cur.status = "done";
    cur.finished_at = nowIso();
  } catch (err) {
    const cur = tasks.get(id);
    if (!cur) return;
    if (cur.status === "cancelled") return;
    cur.status = "error";
    cur.finished_at = nowIso();
    cur.error = err instanceof Error ? err.message : String(err);
  }
}

// Periodic cleanup: remove finished tasks older than 1 hour
const TASK_TTL_MS = 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, t] of tasks) {
    if (t.finished_at && (now - new Date(t.finished_at).getTime()) > TASK_TTL_MS) {
      tasks.delete(id);
    }
  }
}, 5 * 60 * 1000);
