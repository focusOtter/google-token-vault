import { withInterruptions } from "@auth0/ai-vercel/interrupts";
import { AISDKError, getToolName, isToolUIPart } from "ai";

type Execute = Parameters<typeof withInterruptions>[0];
type Config = Parameters<typeof withInterruptions>[1];

export function withResumedToolResults(execute: Execute, config: Config): Execute {
  const message = config.messages.at(-1);
  const pending = message?.role === "assistant" ? message.parts.filter((part) =>
    isToolUIPart(part) && part.state === "output-available" &&
    (part.output as { continueInterruption?: boolean } | undefined)?.continueInterruption,
  ) : [];
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
