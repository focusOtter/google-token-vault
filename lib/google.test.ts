import { beforeEach, describe, expect, it, vi } from "vitest";
import { TokenVaultError } from "@auth0/ai/interrupts";
import { getAccessTokenFromTokenVault } from "@auth0/ai-vercel";
import { createGmailDraft, listCalendarEvents } from "./google";

vi.mock("@auth0/ai-vercel", () => ({ getAccessTokenFromTokenVault: vi.fn(() => "vault-token") }));
const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.useRealTimers();
});
describe("listCalendarEvents", () => {
  it("gets the next seven days with the vault token", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    fetchMock.mockResolvedValue(Response.json({ items: [{ id: "event", start: {}, end: {} }], nextPageToken: "more" }));
    const result = await listCalendarEvents({});
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("timeMin")).toBe("2026-01-01T00:00:00.000Z");
    expect(url.searchParams.get("timeMax")).toBe("2026-01-08T00:00:00.000Z");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer vault-token");
    expect(getAccessTokenFromTokenVault).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ events: [{ id: "event", summary: "(Untitled)" }], hasMore: true });
  });
  it("uses an explicit range and handles an empty calendar", async () => {
    fetchMock.mockResolvedValue(Response.json({}));
    expect(await listCalendarEvents({ timeMin: "2026-02-01T00:00:00Z", timeMax: "2026-02-02T00:00:00Z" })).toEqual({ events: [], hasMore: false });
  });
  it("rejects invalid ranges without calling Google", async () => {
    await expect(listCalendarEvents({ timeMin: "2026-02-02T00:00:00Z", timeMax: "2026-02-01T00:00:00Z" })).rejects.toThrow("End time");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([401, 403])("raises a vault error on %s", async (status) => {
    fetchMock.mockResolvedValue(new Response(null, { status }));
    await expect(listCalendarEvents({})).rejects.toBeInstanceOf(TokenVaultError);
  });
  it("does not leak Google error response bodies", async () => {
    fetchMock.mockResolvedValue(new Response("private upstream details", { status: 500 }));
    await expect(listCalendarEvents({})).rejects.toThrow("Google API request failed (500)");
  });
});
describe("createGmailDraft", () => {
  const input = { to: "friend@example.com", subject: "Hello ☀", body: "A draft, not a sent email.\nこんにちは" };
  it("creates only a draft, encoding MIME and Unicode correctly", async () => {
    fetchMock.mockResolvedValue(Response.json({ id: "draft-1" }));
    expect(await createGmailDraft(input)).toEqual({ draftId: "draft-1", status: "draft_created_not_sent" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/drafts");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer vault-token");
    const mime = Buffer.from(JSON.parse(init.body).message.raw, "base64url").toString();
    expect(mime).toContain("To: friend@example.com\r\n");
    expect(mime).toContain(Buffer.from(input.subject).toString("base64"));
    expect(Buffer.from(mime.split("\r\n\r\n")[1], "base64").toString()).toBe(input.body);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each([{ ...input, to: "bad" }, { ...input, subject: "" }, { ...input, body: "" }, { ...input, subject: "Hi\r\nBcc: stranger@example.com" }])("rejects missing or unsafe input", async (invalid) => {
    await expect(createGmailDraft(invalid)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("propagates token getter failures without calling Google", async () => {
    vi.mocked(getAccessTokenFromTokenVault).mockImplementationOnce(() => { throw new Error("no token"); });
    await expect(createGmailDraft(input)).rejects.toThrow("no token");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("handles network failures", async () => {
    fetchMock.mockRejectedValue(new Error("network unavailable"));
    await expect(createGmailDraft(input)).rejects.toThrow("network unavailable");
  });
  it("handles Google draft API errors", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 429 }));
    await expect(createGmailDraft(input)).rejects.toThrow("Google API request failed (429)");
  });
});
