import { describe, expect, it, vi } from "vitest";
import { createUIMessageStream, readUIMessageStream, tool, type UIMessage } from "ai";
import { z } from "zod";
import { withResumedToolResults } from "./interruptions";
import { errorSerializer } from "@auth0/ai-vercel/interrupts";
import { TokenVaultInterrupt } from "@auth0/ai/interrupts";

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

  it.each([{ messages: [] }, { messages: [{ id: "user", role: "user", parts: [{ type: "text", text: "Hello" }] }] }])("leaves non-resumption requests alone", async ({ messages }) => {
    const writer = { write: vi.fn(), merge: vi.fn(), onError: undefined };
    const execute = vi.fn();
    await withResumedToolResults(execute, { messages: messages as UIMessage[], tools: {} })({ writer });
    expect(writer.write).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledOnce();
  });

  it("does not publish a successful result or run the model if the resumed tool fails", async () => {
    const writer = { write: vi.fn(), merge: vi.fn(), onError: undefined };
    const execute = vi.fn();
    await expect(withResumedToolResults(execute, {
      messages: [pending()], tools: { calendar: tool({ inputSchema: z.object({}), execute: async (): Promise<unknown> => { throw new Error("Google unavailable"); } }) },
    })({ writer })).rejects.toMatchObject({ cause: { message: "Google unavailable" }, toolCallId: "call-1", toolName: "calendar", toolArgs: {} });
    expect(writer.write).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("resumes the first parallel failure even when another failed tool and text follow it", async () => {
    const message = pending();
    message.parts.push({ type: "tool-calendar", toolCallId: "call-2", input: {}, state: "output-error", errorText: "Needs consent" }, { type: "text", text: "" });
    const executeTool = vi.fn().mockResolvedValue({ events: [] });
    const writer = { write: vi.fn(), merge: vi.fn(), onError: undefined };
    await withResumedToolResults(vi.fn(), {
      messages: [message], tools: { calendar: tool({ inputSchema: z.object({}), execute: executeTool }) },
    })({ writer });
    expect(executeTool).toHaveBeenCalledOnce();
    expect(executeTool.mock.calls[0][1].toolCallId).toBe("call-1");
    expect(writer.write).toHaveBeenCalledWith(expect.objectContaining({ toolCallId: "call-1", output: expect.objectContaining({ result: { events: [] } }) }));
    expect(message.parts[1]).toMatchObject({ state: "output-error" });
  });

  it("executes each marked call once, leaving already successful parallel calls alone", async () => {
    const message = pending();
    message.parts.push({ ...pending().parts[0], toolCallId: "call-2" } as typeof message.parts[number], { type: "tool-calendar", toolCallId: "done", input: {}, state: "output-available", output: { events: [] } });
    const executeTool = vi.fn().mockResolvedValue({ events: [] });
    const writer = { write: vi.fn(), merge: vi.fn(), onError: undefined };
    await withResumedToolResults(vi.fn(), {
      messages: [message], tools: { calendar: tool({ inputSchema: z.object({}), execute: executeTool }) },
    })({ writer });
    expect(executeTool.mock.calls.map((call) => call[1].toolCallId)).toEqual(["call-1", "call-2"]);
    expect(writer.write).toHaveBeenCalledTimes(2);
  });

  it.each(["google-token-vault", "another-connection", "ordinary", "malformed"])("only groups serialized interruptions on the consented connection: %s", async connection => {
    const message = pending();
    const serialize = errorSerializer(() => "Service unavailable");
    const errorText = connection === "ordinary" ? "Needs consent" : connection === "malformed" ? "AUTH0_AI_INTERRUPTION:{" : serialize({
      cause: new TokenVaultInterrupt("Connect", { connection, scopes: [], requiredScopes: [] }),
      toolCallId: "call-2", toolName: "calendar", toolArgs: {},
    });
    message.parts.push({ type: "tool-calendar", toolCallId: "call-2", input: {}, state: "output-error", errorText }, {
      type: "tool-calendar", toolCallId: "done", input: {}, state: "output-available", output: { events: [] },
    });
    const executeTool = vi.fn().mockResolvedValue({ events: [] });
    const writer = { write: vi.fn(), merge: vi.fn(), onError: undefined };
    await withResumedToolResults(vi.fn(), {
      messages: [message], tools: { calendar: tool({ inputSchema: z.object({}), execute: executeTool }) }, connection: "google-token-vault",
    })({ writer });
    expect(executeTool.mock.calls.map(call => call[1].toolCallId)).toEqual(connection === "google-token-vault" ? ["call-1", "call-2"] : ["call-1"]);
    expect(message.parts[2]).toMatchObject({ toolCallId: "done", output: { events: [] } });
  });
});
