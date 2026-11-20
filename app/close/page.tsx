"use client";
import { useEffect } from "react";
export default function ClosePopup() {
  useEffect(() => { window.close(); }, []);
  return <main className="landing"><h1>Google connected.</h1><p>You can close this window and return to your conversation.</p></main>;
}
