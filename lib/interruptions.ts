import { withInterruptions } from "@auth0/ai-vercel/interrupts";
import { isToolUIPart } from "ai";

type Execute = Parameters<typeof withInterruptions>[0];
type Config = Parameters<typeof withInterruptions>[1];

export function withResumedToolResults(execute: Execute, config: Config): Execute {
  const part = config.messages.at(-1)?.parts.at(-1);
  const resuming = part && isToolUIPart(part) && part.state === "output-available" &&
    (part.output as { continueInterruption?: boolean } | undefined)?.continueInterruption;
  return withInterruptions(async ({ writer }) => {
    if (resuming && part && isToolUIPart(part) && part.state === "output-available") {
      writer.write({ type: "tool-output-available", toolCallId: part.toolCallId, output: part.output });
    }
    await execute({ writer });
  }, config);
}
