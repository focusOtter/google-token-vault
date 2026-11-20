import { ImageResponse } from "next/og";
export const alt = "Orbit — Less juggling. More living.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(<div style={{ background: "#f7f6f2", color: "#263e36", width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: 80, justifyContent: "space-between" }}><div style={{ fontSize: 34 }}>orbit.</div><div style={{ fontSize: 88, letterSpacing: -4, lineHeight: 1, display: "flex", flexDirection: "column" }}><span>Less juggling.</span><span>More living.</span></div><div style={{ fontSize: 25 }}>Your calendar & email drafting companion · Auth0 Token Vault</div></div>, size);
}
