import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useSSE } from "./useSSE";

function Viewer({ limit }: { limit: number }) {
  const { events } = useSSE(limit);
  const taskId = events.find((e) => e.type === "task_completed")?.payload?.taskId ?? "";
  return <div data-testid="taskId">{taskId}</div>;
}

class MockEventSource {
  // Hook assigns these.
  public onopen: null | (() => void) = null;
  public onerror: null | (() => void) = null;
  public url: string;

  constructor(url: string) {
    this.url = url;
  }

  addEventListener() {
    // no-op: we only validate the initial fallback fetch
  }

  close() {
    // no-op
  }
}

describe("useSSE fallback payload mapping", () => {
  it("hydrates payload from `/api/bot_events` metadata", async () => {
    vi.stubGlobal("EventSource", MockEventSource as any);
    vi.stubGlobal(
      "localStorage",
      {
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      } as any,
    );

    const rows = [
      {
        id: 1,
        type: "task_completed",
        message: "Task completed: …",
        // This matches what the server persists: JSON-stringified metadata payload.
        metadata: JSON.stringify({ taskId: "task-123" }),
        created_at: new Date().toISOString(),
      },
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => rows,
      }) as any,
    );

    render(<Viewer limit={20} />);

    await waitFor(() => {
      expect(screen.getByTestId("taskId")).toHaveTextContent("task-123");
    });
  });
});

