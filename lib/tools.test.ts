import { afterEach, describe, expect, it, vi } from "vitest";
import { createTools, googleScopes } from "./tools";

const mocks = vi.hoisted(() => ({ withTokenVault: vi.fn(() => (value: unknown) => value) }));
vi.mock("@auth0/ai-vercel", () => ({ Auth0AI: class { withTokenVault = mocks.withTokenVault; } }));
vi.mock("./auth0", () => ({ auth0: { getSession: vi.fn() } }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("Google connection configuration", () => {
  it.each([undefined, ""])('defaults to google-oauth2 when the override is %s', (value) => {
    vi.stubEnv("AUTH0_GOOGLE_CONNECTION", value);
    createTools();
    expect(mocks.withTokenVault).toHaveBeenCalledWith(expect.objectContaining({ connection: "google-oauth2", scopes: googleScopes }));
  });
  it("uses the dedicated connection for both tools", () => {
    vi.stubEnv("AUTH0_GOOGLE_CONNECTION", "google-token-vault");
    expect(Object.keys(createTools())).toEqual(["listCalendarEvents", "createGmailDraft"]);
    expect(mocks.withTokenVault).toHaveBeenCalledWith(expect.objectContaining({ connection: "google-token-vault", scopes: googleScopes }));
  });
  it("propagates invalid connection configuration errors", () => {
    vi.stubEnv("AUTH0_GOOGLE_CONNECTION", "missing-connection");
    mocks.withTokenVault.mockImplementationOnce(() => { throw new Error("Invalid connection"); });
    expect(createTools).toThrow("Invalid connection");
  });
});
