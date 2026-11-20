import { describe, expect, it, vi } from "vitest";
import { createUIMessageStream, readUIMessageStream, tool, type UIMessage } from "ai";
import { z } from "zod";
import { withResumedToolResults } from "./interruptions";

function pending(): UIMessage {
  return { id: "assistant", role: "assistant", parts: [{
    type: "tool-calendar", toolCallId: "call-1", state: "output-available", input: {},
    output: { continueInterruption: true, toolName: "calendar" },
  }] };
}

describe("consent resumption streaming", () => {
  it("streams the asynchronously resumed result and persists it instead of the placeholder", async () => {
    const message = pending();
    const output = { events: [{ id: "event-1" }] };
    const executeTool = vi.fn(async () => { await Promise.resolve(); return output; });
    const finished = vi.fn();
    const executeModel = vi.fn(async () => {
      expect(JSON.stringify(message)).toContain("event-1");
      expect(JSON.stringify(message)).not.toContain("continueInterruption");
    });
    const stream = createUIMessageStream({
      originalMessages: [message],
      execute: withResumedToolResults(executeModel, {
        messages: [message], tools: { calendar: tool({ inputSchema: z.object({}), execute: executeTool }) },
      }),
      onFinish: finished,
    });
    let browserMessage;
    for await (const update of readUIMessageStream({ stream, message: structuredClone(message) })) browserMessage = update;
    expect(executeTool).toHaveBeenCalledOnce();
    expect(executeModel).toHaveBeenCalledOnce();
    expect(JSON.stringify(browserMessage)).toContain("event-1");
    expect(JSON.stringify(browserMessage)).not.toContain("continueInterruption");
    expect(JSON.stringify(finished.mock.calls[0][0].messages)).toContain("event-1");
    expect(JSON.stringify(finished.mock.calls[0][0].messages)).not.toContain("continueInterruption");
  });

  it.each([[], [{ id: "user", role: "user", parts: [{ type: "text", text: "Hello" }] }]])("leaves non-resumption requests alone", async (messages) => {
    const writer = { write: vi.fn(), merge: vi.fn() };
    const execute = vi.fn();
    await withResumedToolResults(execute, { messages: messages as UIMessage[], tools: {} })({ writer });
    expect(writer.write).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledOnce();
  });

  it("does not publish a successful result or run the model if the resumed tool fails", async () => {
    const writer = { write: vi.fn(), merge: vi.fn() };
    const execute = vi.fn();
    await expect(withResumedToolResults(execute, {
      messages: [pending()], tools: { calendar: tool({ inputSchema: z.object({}), execute: async () => { throw new Error("Google unavailable"); } }) },
    })({ writer })).rejects.toThrow("Google unavailable");
    expect(writer.write).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
});
