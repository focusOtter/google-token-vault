import { Auth0AI } from "@auth0/ai-vercel";
import { tool } from "ai";
import { auth0 } from "./auth0";
import { calendarInput, draftInput, listCalendarEvents, createGmailDraft } from "./google";

export const googleScopes = [
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
];
export function createTools() {
  const ai = new Auth0AI();
  const withGoogle = ai.withTokenVault({
  connection: process.env.AUTH0_GOOGLE_CONNECTION || "google-oauth2",
  scopes: googleScopes,
  refreshToken: async () => {
    const session = await auth0.getSession();
    if (!session?.tokenSet.refreshToken) throw new Error("Please sign out and log in again to obtain offline access.");
    return session.tokenSet.refreshToken;
  },
  authorizationParams: { access_type: "offline", prompt: "consent" },
});
  return {
  listCalendarEvents: withGoogle(tool({
    description: "Read primary Google Calendar events for a time range, defaulting to the next seven days. Returns at most 100 events; hasMore indicates truncation.",
    inputSchema: calendarInput, execute: listCalendarEvents,
  })),
  createGmailDraft: withGoogle(tool({
    description: "Create a Gmail draft only. Never sends mail. Ask for missing recipient, subject, or body before drafting.",
    inputSchema: draftInput, execute: createGmailDraft,
  })),
};
}
