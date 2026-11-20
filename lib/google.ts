import { getAccessTokenFromTokenVault } from "@auth0/ai-vercel";
import { TokenVaultError } from "@auth0/ai/interrupts";
import { z } from "zod";

export const calendarInput = z.object({
  timeMin: z.iso.datetime({ offset: true }).optional(),
  timeMax: z.iso.datetime({ offset: true }).optional(),
});
export const draftInput = z.object({
  to: z.email(),
  subject: z.string().min(1).max(998).regex(/^[^\r\n]+$/),
  body: z.string().min(1).max(100000),
});

async function google(url: string, init?: RequestInit) {
  const token = getAccessTokenFromTokenVault();
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) {
    throw new TokenVaultError("Google authorization required. Check granted scopes and API enablement.");
  }
  if (!response.ok) throw new Error(`Google API request failed (${response.status})`);
  return response.json();
}

export async function listCalendarEvents(input: z.infer<typeof calendarInput>) {
  const { timeMin, timeMax } = calendarInput.parse(input);
  const start = new Date(timeMin ?? Date.now());
  const end = new Date(timeMax ?? start.getTime() + 7 * 86400000);
  if (end <= start) throw new Error("End time must be after start time");
  const query = new URLSearchParams({
    timeMin: start.toISOString(), timeMax: end.toISOString(),
    singleEvents: "true", orderBy: "startTime", maxResults: "100",
  });
  const data = await google(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${query}`);
  return {
    events: (data.items ?? []).map((event: { id: string; summary?: string; start: unknown; end: unknown; htmlLink?: string }) => ({
      id: event.id, summary: event.summary ?? "(Untitled)", start: event.start, end: event.end, url: event.htmlLink,
    })),
    hasMore: Boolean(data.nextPageToken),
  };
}

export async function createGmailDraft(input: z.infer<typeof draftInput>) {
  const { to, subject, body } = draftInput.parse(input);
  const mime = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    "MIME-Version: 1.0", 'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64", "",
    Buffer.from(body).toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "",
  ].join("\r\n");
  const data = await google("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST", body: JSON.stringify({ message: { raw: Buffer.from(mime).toString("base64url") } }),
  });
  return { draftId: data.id, status: "draft_created_not_sent" };
}
