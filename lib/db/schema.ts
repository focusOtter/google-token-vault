import { pgTable, text, timestamp, jsonb, uuid, index } from "drizzle-orm/pg-core";
import type { UIMessage } from "ai";

export const chats = pgTable("chats", {
  id: uuid().primaryKey(),
  userId: text("user_id").notNull(),
  title: text().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("chats_user_idx").on(t.userId)]);
export const messages = pgTable("messages", {
  id: text().primaryKey(),
  chatId: uuid("chat_id").notNull().references(() => chats.id, { onDelete: "cascade" }),
  content: jsonb().$type<UIMessage>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("messages_chat_idx").on(t.chatId)]);
