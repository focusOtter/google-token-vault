// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, simulateReadableStream, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { errorSerializer } from "@auth0/ai-vercel/interrupts";
import { TokenVaultInterrupt } from "@auth0/ai/interrupts";
import { z } from "zod";
import { Chat } from "./chat";
import { createToolInterruptionHandler, withResumedToolResults } from "../lib/interruptions";

type ModelChunk = Awaited<ReturnType<MockLanguageModelV3["doStream"]>>["stream"] extends ReadableStream<infer Part> ? Part : never;

describe("parallel Google consent", () => {
  it("resumes both interrupted calls after one popup without resending the user's message", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Element.prototype.scrollIntoView = vi.fn();
    let connected = false;
    const calendar = vi.fn(async () => ({ count: 11, events: Array.from({ length: 11 }, (_, i) => ({ id: `event-${i}`, summary: "Team standup" })), hasMore: false }));
    const draft = vi.fn(async () => ({ draftId: "draft-only" }));
    const scopes = ["calendar", "gmail"];
    const withConsent = (execute: () => Promise<unknown>) => async () => {
      if (!connected) throw new TokenVaultInterrupt("Connect Google", {
        connection: "google-token-vault", scopes, requiredScopes: scopes,
      });
      return execute();
    };
    const tools = {
      listCalendarEvents: tool({ inputSchema: z.object({}), execute: withConsent(calendar) }),
      createGmailDraft: tool({ inputSchema: z.object({}), execute: withConsent(draft) }),
    };
    const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } };
    const model = new MockLanguageModelV3({ doStream: async () => ({ stream: simulateReadableStream<ModelChunk>({
      chunks: connected ? [
        { type: "text-start", id: "answer" },
        { type: "text-delta", id: "answer", delta: "Team standup; draft created, not sent." },
        { type: "text-end", id: "answer" },
        { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
      ] : [
        { type: "tool-call", toolCallId: "calendar-1", toolName: "listCalendarEvents", input: "{}" },
        { type: "tool-call", toolCallId: "gmail-1", toolName: "createGmailDraft", input: "{}" },
        { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage },
      ], initialDelayInMs: null, chunkDelayInMs: null,
    }) }) });
    const finished = vi.fn();
    const modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>[] = [];
    const serialize = errorSerializer(() => "Service unavailable");
    const fetch = vi.fn(async (_url: unknown, options?: RequestInit) => {
      const { messages } = JSON.parse(String(options?.body)) as { messages: UIMessage[] };
      return createUIMessageStreamResponse({ stream: createUIMessageStream({
        originalMessages: messages,
        execute: withResumedToolResults(async ({ writer }) => {
          const interruptions = createToolInterruptionHandler<typeof tools>();
          const converted = await convertToModelMessages(messages);
          modelMessages.push(converted);
          writer.merge(streamText({
            model, messages: converted, tools,
            experimental_transform: interruptions.transform,
            stopWhen: [stepCountIs(2), interruptions.stopWhen], onError: () => {},
          }).toUIMessageStream({ onError: serialize }));
        }, { messages, tools, connection: "google-token-vault" }),
        onError: serialize, onFinish: finished,
      }) });
    });
    vi.stubGlobal("fetch", fetch);
    const popup = { closed: false };
    const open = vi.spyOn(window, "open").mockReturnValue(popup as Window);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<Chat id="parallel" name="QA" initialMessages={[]} history={[]}/>));
      await act(async () => container.querySelector<HTMLButtonElement>(".suggestions button")!.click());
      await vi.waitFor(async () => { await act(async () => {}); expect(container.querySelector(".consent button")).not.toBeNull(); });
      expect(calendar).not.toHaveBeenCalled();
      expect(draft).not.toHaveBeenCalled();
      await act(async () => container.querySelector<HTMLButtonElement>(".consent button")!.click());
      await act(async () => {
        connected = true;
        popup.closed = true;
        await new Promise(resolve => setTimeout(resolve, 800));
      });
      await vi.waitFor(async () => {
        await act(async () => {});
        expect(calendar).toHaveBeenCalledOnce();
        expect(draft).toHaveBeenCalledOnce();
        expect(container.textContent).toContain("draft created, not sent.");
      }, { timeout: 3000 });
      expect(open).toHaveBeenCalledOnce();
      expect(fetch).toHaveBeenCalledTimes(2);
      const resumed = JSON.parse(String(fetch.mock.calls[1][1]?.body));
      expect(resumed.messages.filter((m: UIMessage) => m.role === "user")).toHaveLength(1);
      expect(JSON.stringify(finished.mock.calls.at(-1)?.[0].messages)).toContain("draft-only");
      expect(JSON.stringify(finished.mock.calls.at(-1)?.[0].messages)).toContain("Team standup");
      expect(JSON.stringify(finished.mock.calls.at(-1)?.[0].messages)).not.toContain("continueInterruption");
      const results = modelMessages.at(-1)!.flatMap(m => m.role === "tool" ? m.content : []);
      expect(results).toHaveLength(2);
      expect(results.filter(p => p.type === "tool-result" && p.toolCallId === "calendar-1")).toHaveLength(1);
      expect(results.filter(p => p.type === "tool-result" && p.toolCallId === "gmail-1")).toHaveLength(1);
      expect(results[0]).toMatchObject({ output: { type: "json", value: { result: { count: 11, events: expect.any(Array), hasMore: false } } } });
      expect(JSON.stringify(results)).not.toContain("AUTH0_AI_INTERRUPTION:");
      expect(JSON.stringify(results)).not.toContain("continueInterruption");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });
});
