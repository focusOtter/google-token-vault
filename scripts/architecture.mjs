import { JSDOM } from "jsdom";
import { writeFile } from "node:fs/promises";
import { build } from "esbuild";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLCanvasElement", "Element", "DOMParser", "XMLSerializer", "Image"]) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
globalThis.devicePixelRatio = 1;
HTMLCanvasElement.prototype.getContext = () => ({ filter: "none", measureText: (text) => ({ width: text.length * 8 }), setTransform() {}, clearRect() {}, fillRect() {} });
const bundle = await build({ stdin: { contents: 'export { exportToSvg } from "@excalidraw/excalidraw";', resolveDir: process.cwd() }, bundle: true, write: false, format: "esm", platform: "browser", define: { "process.env.NODE_ENV": '"production"' } });
const { exportToSvg } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const elements = [];
let sequence = 0;
function base(type, x, y, width, height) {
  return { id: String(++sequence), type, x, y, width, height, angle: 0, strokeColor: "#355445", backgroundColor: "#eef2e7", fillStyle: "solid", strokeWidth: 1.5, strokeStyle: "solid", roughness: 0.6, opacity: 100, groupIds: [], frameId: null, roundness: { type: 3 }, seed: sequence, version: 1, versionNonce: sequence, isDeleted: false, boundElements: null, updated: 1, link: null, locked: false };
}
const boxes = [[70,20,"Browser","Chat + Google consent"],[70,150,"Next.js server","Auth0 session + tools"],[70,300,"AI Gateway","Model + streaming"],[70,430,"Auth0 Token Vault","Scoped Google tokens"],[70,560,"Google APIs","Calendar read","Gmail drafts only"],[70,690,"Neon Postgres","Private chat history"]];
for (const [x,y] of boxes) elements.push(base("rectangle", x,y,300,100));
for (const [type,x,y,width,height] of [["arrow",220,123,0,24],["line",35,200,32,0],["line",35,200,0,540],...[350,480,610,740].map(y => ["arrow",35,y,32,0])]) elements.push({ ...base(type,x,y,width,height), backgroundColor:"transparent", points:[[0,0],[width,height]], lastCommittedPoint:null, startBinding:null, endBinding:null, startArrowhead:null, endArrowhead:type === "arrow" ? "arrow" : null, elbowed:false });
const padding = 24;
const svg = await exportToSvg({ elements, appState:{ viewBackgroundColor:"#fafbf7", exportBackground:true }, files:{}, exportPadding:padding });
svg.setAttribute("role", "img");
svg.setAttribute("aria-labelledby", "architecture-title architecture-description");
for (const [tag,id,text] of [["title","architecture-title","Orbit architecture"],["desc","architecture-description","The browser connects to the Next.js server. The server calls AI Gateway for the model, Auth0 Token Vault for Google tokens, Google APIs to read Calendar and create Gmail drafts, and Neon Postgres for private chat history."]]) {
  const node = document.createElementNS("http://www.w3.org/2000/svg",tag);
  node.id = id; node.textContent = text; svg.appendChild(node);
}
const labels = document.createElementNS("http://www.w3.org/2000/svg","g");
labels.setAttribute("transform", `translate(${padding - 35} ${padding - 20})`);
svg.appendChild(labels);
for (const [x,y,title,subtitle,detail] of boxes) for (const [text,dy,fontSize,weight] of [[title,detail ? 32 : 40,24,600],[subtitle,detail ? 60 : 72,20,400],...(detail ? [[detail,84,20,400]] : [])]) {
  const node = document.createElementNS("http://www.w3.org/2000/svg","text");
  for (const [key,value] of Object.entries({x:x+150,y:y+dy,"text-anchor":"middle","font-family":"Arial, sans-serif","font-size":fontSize,"font-weight":weight,fill:"#253e32"})) node.setAttribute(key,String(value));
  node.textContent=text; labels.appendChild(node);
}
await writeFile(new URL("../docs/architecture.svg",import.meta.url),svg.outerHTML);
console.log("Wrote docs/architecture.svg using Excalidraw exportToSvg");
dom.window.close();
