import { InterruptionPrefix, withInterruptions } from "@auth0/ai-vercel/interrupts";
import { TokenVaultInterrupt } from "@auth0/ai/interrupts";
import { AISDKError, getToolName, isToolUIPart, type StreamTextTransform, type ToolSet } from "ai";

type Execute = Parameters<typeof withInterruptions>[0];
type Config = Parameters<typeof withInterruptions>[1];

export function createToolInterruptionHandler<TOOLS extends ToolSet>() {
  let interrupted = false;
  let interruption: { cause: unknown; toolCallId: string; toolName: string; toolArgs: unknown } | undefined;
  const transform: StreamTextTransform<TOOLS> = () => new TransformStream({
    transform(part, controller) {
      if (part.type !== "tool-error" || !TokenVaultInterrupt.isInterrupt(part.error)) {
        controller.enqueue(part);
        return;
      }
      interrupted = true;
      const error = {
        cause: part.error, toolCallId: part.toolCallId,
        toolName: part.toolName, toolArgs: part.input,
      };
      controller.enqueue({ ...part, error });
      interruption ??= error;
    },
    flush(controller) {
      if (interruption) controller.enqueue({ type: "error", error: interruption });
    },
  });
  return { transform, stopWhen: () => interrupted };
}

export function withResumedToolResults(execute: Execute, config: Config & { connection?: string }): Execute {
  const message = config.messages.at(-1);
  const pending = message?.role === "assistant" ? message.parts.filter((part) =>
    isToolUIPart(part) && part.state === "output-available" &&
    (part.output as { continueInterruption?: boolean } | undefined)?.continueInterruption,
  ) : [];
  if (pending.length && config.connection && message?.role === "assistant") {
    for (const part of message.parts) {
      if (!isToolUIPart(part) || part.state !== "output-error" || !part.errorText.startsWith(InterruptionPrefix)) continue;
      try {
        const interrupt = JSON.parse(part.errorText.slice(InterruptionPrefix.length));
        if (!TokenVaultInterrupt.isInterrupt(interrupt) || interrupt.connection !== config.connection) continue;
        const resumed = { ...part, state: "output-available" as const, errorText: undefined, output: { continueInterruption: true, toolName: getToolName(part) } };
        Object.assign(part, resumed);
        pending.push(part);
      } catch {}
    }
  }
  return async ({ writer }) => {
    for (const part of pending) {
      if (!isToolUIPart(part) || !message) continue;
      try {
        await withInterruptions(() => {}, {
          ...config, messages: [{ ...message, parts: [part] }],
        })({ writer });
      } catch (error) {
        throw {
          cause: AISDKError.isInstance(error) ? error.cause : error,
          toolCallId: part.toolCallId, toolName: getToolName(part), toolArgs: part.input,
        };
      }
      if (part.state === "output-available") {
        writer.write({ type: "tool-output-available", toolCallId: part.toolCallId, output: part.output });
      }
    }
    await execute({ writer });
  };
}
