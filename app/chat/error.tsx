"use client";
export default function ChatError({ reset }: { reset: () => void }) {
  return <main className="landing"><h1>Unable to open this conversation.</h1><p>It may not belong to your account, or the database needs configuration.</p><button onClick={reset}>Try again</button><a href="/chat">Start a new chat</a></main>;
}
