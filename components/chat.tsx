"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from "ai";
import { useInterruptions, type Auth0InterruptionUI } from "@auth0/ai-vercel/react";
import { TokenVaultInterrupt } from "@auth0/ai/interrupts";
import { ArrowUp, Plus, CalendarDays, Mail, ShieldCheck, ArrowUpRight, Orbit, MessageSquare } from "lucide-react";

function ConnectGoogle({ interrupt }: { interrupt: Auth0InterruptionUI }) {
  const [popup, setPopup] = useState<Window | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!popup) return;
    const timer = setInterval(() => {
      if (popup.closed) {
        setPopup(null);
        interrupt.resume();
      }
    }, 700);
    return () => clearInterval(timer);
  }, [popup, interrupt]);
  function connect() {
    const url = new URL("/auth/connect", window.location.origin);
    url.searchParams.set("connection", interrupt.connection);
    url.searchParams.set("returnTo", "/close");
    for (const scope of interrupt.requiredScopes) url.searchParams.append("scopes", scope);
    for (const [key, value] of Object.entries(interrupt.authorizationParams ?? {})) url.searchParams.set(key, String(value));
    const opened = window.open(url, "_blank", "width=650,height=750");
    if (!opened) setError("Please allow popups and try again.");
    else { setError(""); setPopup(opened); }
  }
  return <div className="consent"><ShieldCheck size={24}/><h3>Your Google, with your permission.</h3><p>Connect your account to read calendar events and create email drafts. Nothing is sent.</p><button onClick={connect} disabled={!!popup}>{popup ? "Waiting for Google…" : "Connect Google"} <ArrowUpRight size={15}/></button>{error && <p role="alert">{error}</p>}<small>After consent, the interrupted tool continues automatically. Cancelled consent may ask again.</small></div>;
}

export function Chat({ id, history, initialMessages, name }: { id: string; history: { id: string; title: string }[]; initialMessages: UIMessage[]; name: string }) {
  const [input, setInput] = useState("");
  const [localHistory, setLocalHistory] = useState(history);
  const bottom = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, toolInterrupt, status, error, regenerate } = useInterruptions(function useChatWithInterruptions(handler) {
    return (
    useChat({
      id, messages: initialMessages,
      transport: new DefaultChatTransport({ api: "/api/chat" }),
      onError: handler(() => {}),
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    })
    );
  });
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, toolInterrupt]);
  const busy = status === "submitted" || status === "streaming";
  function send(text: string) {
    if (!text.trim() || busy) return;
    if (!localHistory.some((chat) => chat.id === id)) setLocalHistory([{ id, title: text.slice(0, 80) }, ...localHistory]);
    window.history.replaceState(null, "", `/chat?id=${id}`);
    void sendMessage({ text }); setInput("");
  }
  return <div className="workspace">
    <aside className="sidebar">
      <Link className="brand" href="/"><Orbit size={28}/><span>orbit<span className="brand-dot">.</span></span></Link>
      <a className="new-chat" href="/chat"><Plus size={17}/> New conversation</a>
      <div className="eyebrow side-label">YOUR SPACE</div>
      <nav aria-label="Past conversations">{localHistory.length ? localHistory.map((chat) => <a className={id === chat.id ? "active chat-link" : "chat-link"} key={chat.id} href={`/chat?id=${chat.id}`}><MessageSquare size={15}/><span>{chat.title}</span></a>) : <p className="muted small">Your conversations will live here.</p>}</nav>
      <div className="sidebar-bottom"><div className="vault-note"><ShieldCheck size={17}/><span>Powered by Auth0<br/><strong>Token Vault</strong></span></div><div className="profile"><span className="avatar">{name[0].toUpperCase()}</span><span className="profile-name">{name}</span><a href="/auth/logout" title="Sign out">↗</a></div></div>
    </aside>
    <main className="chat-main">
      <header className="topbar"><span>Personal workspace <span className="slash">/</span> Assistant</span><span className="private-badge"><span/> Private by design</span></header>
      <div className="conversation">
        {!messages.length && <div className="welcome"><div className="eyebrow"><span className="tiny-star">✦</span> A LITTLE LESS BUSYWORK</div><h1>Make room for<br/><span>what matters.</span></h1><p>Your calendar and your next email, one conversation away.<br/>A thoughtful assistant. Always on your terms.</p><div className="suggestions"><button onClick={() => send("What's on my calendar over the next seven days?")}><CalendarDays size={21}/><strong>Find your focus</strong><span>What does my week look like?</span><ArrowUpRight size={17}/></button><button onClick={() => send("Help me draft an email. Ask me for the recipient and what I'd like to say.")}><Mail size={21}/><strong>Start with a draft</strong><span>Turn a thought into an email.</span><ArrowUpRight size={17}/></button></div><div className="safe-note"><ShieldCheck size={14}/> Drafts only. You always hit send.</div></div>}
        <div className="message-list" aria-live="polite">{messages.map((message) => <article key={message.id} className={`message ${message.role}`}><div className="message-author">{message.role === "user" ? "YOU" : "✦ ORBIT"}</div>{message.parts.map((part, i) => part.type === "text" ? <div className="message-text" key={i}>{part.text}</div> : part.type.startsWith("tool-") ? <details className="tool-result" key={i}><summary>{part.type === "tool-createGmailDraft" ? "Gmail · draft only" : "Google Calendar"} · {"state" in part ? String(part.state).replaceAll("-", " ") : "working"}</summary><pre>{JSON.stringify("output" in part ? part.output : "input" in part ? part.input : {}, null, 2)}</pre></details> : null)}</article>)}</div>
        {busy && <div className="working" role="status">✦ Orbit is working…</div>}
        {TokenVaultInterrupt.isInterrupt(toolInterrupt) && toolInterrupt && <ConnectGoogle interrupt={toolInterrupt}/>}
        {error && !toolInterrupt && <div className="error" role="alert">{error.message}<button onClick={() => regenerate()}>Retry</button></div>}
        <div ref={bottom}/>
      </div>
      <footer className="composer-wrap"><form className="composer" onSubmit={(event) => { event.preventDefault(); send(input); }}><textarea aria-label="Message Orbit" placeholder="Ask about your week, or draft something good…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} rows={2}/><div className="composer-bottom"><span><span className="tiny-star">✦</span> Orbit assistant</span><button aria-label="Send message" disabled={busy || !input.trim()}><ArrowUp size={18}/></button></div></form><p>Secure connections. Scoped permissions. <strong>Your data stays yours.</strong></p></footer>
    </main>
  </div>;
}
