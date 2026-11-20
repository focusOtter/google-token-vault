import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, asc, desc, notInArray } from "drizzle-orm";
import type { UIMessage } from "ai";
import { chats, messages } from "./schema";

function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  return drizzle(neon(process.env.DATABASE_URL));
}
export async function listChats(userId: string) {
  return db().select().from(chats).where(eq(chats.userId, userId)).orderBy(desc(chats.createdAt));
}
export async function requireChat(userId: string, id: string) {
  const [chat] = await db().select().from(chats).where(and(eq(chats.id, id), eq(chats.userId, userId)));
  if (!chat) throw new Error("Chat not found");
  return chat;
}
export async function createChat(userId: string, id: string, title: string) {
  await db().insert(chats).values({ id, userId, title: title.slice(0, 80) }).onConflictDoNothing();
  return requireChat(userId, id);
}
export async function loadMessages(userId: string, chatId: string) {
  await requireChat(userId, chatId);
  const rows = await db().select().from(messages).where(eq(messages.chatId, chatId)).orderBy(asc(messages.createdAt));
  return rows.map((r) => r.content);
}
export async function saveMessages(userId: string, chatId: string, items: UIMessage[]) {
  await requireChat(userId, chatId);
  for (const content of items) {
    const id = `${chatId}:${content.id}`;
    await db().insert(messages).values({ id, chatId, content }).onConflictDoUpdate({
      target: messages.id, set: { content },
    });
  }
  await db().delete(messages).where(and(
    eq(messages.chatId, chatId),
    items.length ? notInArray(messages.id, items.map((item) => `${chatId}:${item.id}`)) : undefined,
  ));
}
