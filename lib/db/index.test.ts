import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { createChat, listChats, loadMessages, requireChat, saveMessages } from "./index";

const mocks = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({ neon: vi.fn() }));
vi.mock("drizzle-orm/neon-http", () => ({ drizzle: () => mocks }));
const dialect = new PgDialect();
const owner = "auth0|alice";
const chatId = "72db3af1-e099-4b45-bd02-f61323bd0b38";
function selection(rows: unknown[]) {
  const where = vi.fn((condition: SQL | undefined) => {
    void condition;
    return Object.assign(Promise.resolve(rows), { orderBy: vi.fn().mockResolvedValue(rows) });
  });
  mocks.select.mockReturnValueOnce({ from: () => ({ where }) });
  return where;
}
function assertScoped(where: ReturnType<typeof vi.fn>) {
  const query = dialect.sqlToQuery(where.mock.calls[0][0]);
  expect(query.sql).toContain('"chats"."user_id" =');
  expect(query.params).toContain(owner);
}
beforeEach(() => { vi.resetAllMocks(); process.env.DATABASE_URL = "postgresql://example"; });
describe("user-scoped history", () => {
  it("lists only the caller's chats, including an empty list", async () => {
    const where = selection([]);
    expect(await listChats(owner)).toEqual([]);
    assertScoped(where);
  });
  it("checks both ownership and chat ID", async () => {
    const where = selection([{ id: chatId, userId: owner }]);
    await requireChat(owner, chatId);
    assertScoped(where);
    const query = dialect.sqlToQuery(where.mock.calls[0][0]!);
    expect(query.sql).toContain('"chats"."id" =');
    expect(query.params).toContain(chatId);
  });
  it("loads messages only after ownership has been checked", async () => {
    const where = selection([{ id: chatId }]);
    selection([{ content: { id: "m", role: "user", parts: [] } }]);
    expect(await loadMessages(owner, chatId)).toHaveLength(1);
    assertScoped(where);
  });
  it("blocks reading or writing another user's or nonexistent chat", async () => {
    selection([]); await expect(loadMessages(owner, chatId)).rejects.toThrow("Chat not found");
    expect(mocks.select).toHaveBeenCalledTimes(1);
    selection([]); await expect(saveMessages(owner, chatId, [])).rejects.toThrow("Chat not found");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("saves messages after ownership verification", async () => {
    const where = selection([{ id: chatId }]);
    const update = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn(() => ({ onConflictDoUpdate: update }));
    mocks.insert.mockReturnValue({ values });
    await saveMessages(owner, chatId, [{ id: "m", role: "user", parts: [] }]);
    assertScoped(where);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ id: chatId + ":m", chatId }));
  });
  it("assigns ownership on create and rejects conflicting foreign IDs", async () => {
    const values = vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue(undefined) }));
    mocks.insert.mockReturnValue({ values });
    selection([]);
    await expect(createChat(owner, chatId, "Title")).rejects.toThrow("Chat not found");
    expect(values).toHaveBeenCalledWith({ id: chatId, userId: owner, title: "Title" });
  });
  it("surfaces database errors", async () => {
    mocks.select.mockImplementation(() => { throw new Error("database unavailable"); });
    await expect(listChats(owner)).rejects.toThrow("database unavailable");
  });
});
