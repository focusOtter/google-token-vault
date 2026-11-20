import { afterEach, describe, expect, it, vi } from "vitest";
import { auth0Fetch } from "./auth0-fetch";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("connected-account error diagnostics", () => {
  it("logs the upstream rejection without credentials and preserves the response body", async () => {
    const body = { title: "Invalid request", detail: "Unsupported scopes", validation_errors: [{ field: "scopes", detail: "Invalid scope" }], access_token: "private" };
    const response = Response.json(body, { status: 400 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await auth0Fetch("https://tenant.auth0.com/me/v1/connected-accounts/connect", { method: "POST", headers: { Authorization: "Bearer private" } });
    expect(await result.json()).toEqual(body);
    expect(warn).toHaveBeenCalledWith("Auth0 connected-account initiation rejected", { status: 400, title: "Invalid request", detail: "Unsupported scopes", validationErrors: [{ field: "scopes", detail: "Invalid scope" }] });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("private");
  });

  it.each(["{}", "not json"])('handles empty or malformed error bodies: %s', async body => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 400 })));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await auth0Fetch(new Request("https://tenant.auth0.com/me/v1/connected-accounts/connect"));
    expect(await result.text()).toBe(body);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("redacts opaque values in the allowlisted error description", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ detail: "Invalid state abcdefghijklmnopqrstuvwxyz0123456789" }, { status: 400 })));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await auth0Fetch("https://tenant.auth0.com/me/v1/connected-accounts/connect");
    expect(warn.mock.calls[0][1].detail).toBe("Invalid state [redacted]");
  });

  it.each([200, 400])("does not inspect other endpoints or successful responses: %i", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status })));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await auth0Fetch(`https://tenant.auth0.com/${status === 200 ? "me/v1/connected-accounts/connect" : "oauth/token"}`);
    expect(warn).not.toHaveBeenCalled();
  });
});
