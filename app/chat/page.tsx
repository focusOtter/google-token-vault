import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { listChats, loadMessages } from "@/lib/db";
import { Chat } from "@/components/chat";
import { z } from "zod";

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const session = await auth0.getSession();
  if (!session) redirect("/auth/login?returnTo=/chat");
  const { id } = await searchParams;
  const chatId = id ? z.uuid().parse(id) : crypto.randomUUID();
  const history = await listChats(session.user.sub);
  const initialMessages = id ? await loadMessages(session.user.sub, chatId) : [];
  return <Chat key={chatId} id={chatId} history={history.map(({ id, title }) => ({ id, title }))} initialMessages={initialMessages} name={session.user.name || session.user.email || "You"} />;
}
