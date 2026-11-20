import { describe, expect, it, vi } from "vitest";
import { createUIMessageStream, createUIMessageStreamResponse, stepCountIs, streamText, tool, simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { errorSerializer } from "@auth0/ai-vercel/interrupts";
import { TokenVaultInterrupt } from "@auth0/ai/interrupts";
import { z } from "zod";
import { createToolInterruptionHandler } from "./interruptions";

function calendarStream(execute: () => Promise<unknown>) {
  const model = new MockLanguageModelV3({
    doStream: () => Promise.resolve({ stream: simulateReadableStream({
      chunks: [
        { type: "tool-call", toolCallId: "calendar-1", toolName: "listCalendarEvents", input: "{}" },
        { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 1, text: 1, reasoning: undefined },
        } },
      ], initialDelayInMs: null, chunkDelayInMs: null,
    }) }),
  });
  const tools = { listCalendarEvents: tool({ inputSchema: z.object({}), execute }) };
  const interruptions = createToolInterruptionHandler<typeof tools>();
  const serialize = errorSerializer(() => "Service unavailable");
  const finished = vi.fn();
  const response = createUIMessageStreamResponse({ stream: createUIMessageStream({
    execute: ({ writer }) => {
      const result = streamText({
        model, messages: [{ role: "user", content: "What's on my calendar this week?" }],
        tools,
        experimental_transform: interruptions.transform,
        stopWhen: [stepCountIs(2), interruptions.stopWhen], onError: () => {},
      });
      writer.merge(result.toUIMessageStream({ onError: serialize }));
    }, onError: serialize, onFinish: finished,
  }) });
  return { response, model, finished };
}

describe("Token Vault tool interruption transport", () => {
  it("publishes matching tool and stream errors with consent metadata and stops model continuation", async () => {
    const interrupt = new TokenVaultInterrupt("Connect Google", {
      connection: "google-token-vault", scopes: ["calendar"], requiredScopes: ["calendar"],
      authorizationParams: { access_type: "offline", prompt: "consent" },
    });
    const { response, model, finished } = calendarStream(async () => { throw interrupt; });
    const chunks = (await response.text()).split("\n").filter(line => line.startsWith("data: {")).map(line => JSON.parse(line.slice(6)));
    const output = chunks.find(chunk => chunk.type === "tool-output-error");
    const error = chunks.find(chunk => chunk.type === "error");
    expect(output.errorText).toBe(error.errorText);
    expect(error.errorText).toMatch(/^AUTH0_AI_INTERRUPTION:/);
    const payload = JSON.parse(error.errorText.replace("AUTH0_AI_INTERRUPTION:", ""));
    expect(TokenVaultInterrupt.isInterrupt(payload)).toBe(true);
    expect(payload).toMatchObject({ connection: "google-token-vault", toolCall: { id: "calendar-1", name: "listCalendarEvents", args: {} } });
    expect(model.doStreamCalls).toHaveLength(1);
    expect(JSON.stringify(finished.mock.calls[0][0].messages)).toContain("AUTH0_AI_INTERRUPTION:");
  });

  it.each([{ events: [{ id: "event" }] }, { events: [] }])("does not interrupt successful tools: %j", async result => {
    const { response } = calendarStream(async () => result);
    const body = await response.text();
    expect(body).toContain('"type":"tool-output-available"');
    expect(body).not.toContain("AUTH0_AI_INTERRUPTION:");
    expect(body).not.toContain('"type":"error"');
  });

  it("does not turn ordinary service errors into consent or expose their details", async () => {
    const { response } = calendarStream(async () => { throw new Error("Private upstream failure"); });
    const body = await response.text();
    expect(body).toContain("Service unavailable");
    expect(body).not.toContain("Private upstream failure");
    expect(body).not.toContain("AUTH0_AI_INTERRUPTION:");
    expect(body).not.toContain('"type":"error"');
  });
});
