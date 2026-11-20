// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Chat } from "./chat";
import { TokenVaultInterrupt } from "@auth0/ai/interrupts";

const mocks = vi.hoisted(() => ({ chat: vi.fn() }));
vi.mock("@auth0/ai-vercel/react", () => ({ useInterruptions: () => mocks.chat() }));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Element.prototype.scrollIntoView = vi.fn();
  mocks.chat.mockReturnValue({ messages: [], status: "ready", sendMessage: vi.fn(), regenerate: vi.fn() });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("Google consent scopes", () => {
  it.each<{ requiredScopes: string[]; authorizationParams?: Record<string, string> }>([
    { requiredScopes: ["https://www.googleapis.com/auth/calendar.events.readonly", "https://www.googleapis.com/auth/gmail.compose", "openid"], authorizationParams: { access_type: "offline", prompt: "consent" } },
    { requiredScopes: [], authorizationParams: {} },
    { requiredScopes: [], authorizationParams: undefined },
  ])("includes identity scopes without forwarding provider-only access_type: %j", async ({ requiredScopes, authorizationParams }) => {
    const toolInterrupt = Object.assign(new TokenVaultInterrupt("Connect Google", {
      connection: "google-token-vault", scopes: requiredScopes, requiredScopes,
      authorizationParams,
    }), { resume: vi.fn() });
    mocks.chat.mockReturnValue({ messages: [], status: "ready", toolInterrupt });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    await act(async () => root.render(<Chat id="chat-1" name="Alice" initialMessages={[]} history={[]}/>));
    await act(async () => container.querySelector<HTMLButtonElement>(".consent button")!.click());
    const url = new URL(String(open.mock.calls[0][0]));
    expect(url.searchParams.getAll("scopes")).toEqual([...new Set(["openid", "profile", "email", ...requiredScopes])]);
    expect(url.searchParams.get("connection")).toBe("google-token-vault");
    expect(url.searchParams.has("access_type")).toBe(false);
    expect(url.searchParams.get("prompt")).toBe(authorizationParams?.prompt ?? null);
    expect(url.searchParams.get("returnTo")).toBe("/close");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Please allow popups and try again.");
  });
});

describe("mobile workspace menu", () => {
  it("opens and closes the existing conversation and sign-out controls", async () => {
    await act(async () => root.render(<Chat id="chat-1" name="Alice" initialMessages={[]} history={[{ id: "chat-1", title: "My week" }]}/>));
    const button = container.querySelector<HTMLButtonElement>(".mobile-menu-toggle")!;
    const panel = document.getElementById(button.getAttribute("aria-controls")!)!;
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(panel.classList.contains("is-open")).toBe(false);
    await act(async () => button.click());
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(panel.classList.contains("is-open")).toBe(true);
    expect(panel.querySelector('nav a')?.getAttribute("href")).toBe("/chat?id=chat-1");
    expect(panel.querySelector('a[title="Sign out"]')?.getAttribute("href")).toBe("/auth/logout");
    await act(async () => button.click());
    expect(panel.classList.contains("is-open")).toBe(false);
  });

  it.each([undefined, new Error("Chat unavailable")])("keeps sign-out reachable with empty history and a possible chat error", async (error) => {
    mocks.chat.mockReturnValue({ messages: [], status: error ? "error" : "ready", error, sendMessage: vi.fn(), regenerate: vi.fn() });
    await act(async () => root.render(<Chat id="chat-1" name="Alice" initialMessages={[]} history={[]}/>));
    await act(async () => container.querySelector<HTMLButtonElement>(".mobile-menu-toggle")!.click());
    expect(container.querySelector(".sidebar-content.is-open")?.textContent).toContain("Your conversations will live here.");
    expect(container.querySelector('.sidebar-content.is-open a[title="Sign out"]')).not.toBeNull();
  });
});
