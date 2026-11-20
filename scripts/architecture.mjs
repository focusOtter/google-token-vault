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
const boxes = [[20,40,"Browser","useChat + consent popup"],[360,40,"Next.js server","Auth0 session / AI tools"],[700,40,"AI Gateway","Model + streaming"],[20,280,"Auth0 Token Vault","Google tokens + consent"],[360,280,"Google APIs","Calendar read / Gmail draft"],[700,280,"Neon Postgres","User-scoped chat history"]];
for (const [x,y] of boxes) elements.push(base("rectangle", x,y,270,110));
for (const [x,y,width,height] of [[292,95,65,0],[632,95,65,0],[480,152,0,125],[400,152,-220,125],[570,152,240,125]]) elements.push({ ...base("arrow",x,y,width,height), backgroundColor:"transparent", points:[[0,0],[width,height]], lastCommittedPoint:null, startBinding:null, endBinding:null, startArrowhead:null, endArrowhead:"arrow", elbowed:false });
const svg = await exportToSvg({ elements, appState:{ viewBackgroundColor:"#fafbf7", exportBackground:true }, files:{}, exportPadding:30 });
for (const [x,y,title,subtitle] of boxes) for (const [text,dy,fontSize,fill] of [[title,44,21,"#253e32"],[subtitle,73,13,"#73816b"]]) {
  const node = document.createElementNS("http://www.w3.org/2000/svg","text");
  for (const [key,value] of Object.entries({x:x+145,y:y+dy-10,"text-anchor":"middle","font-family":"Arial, sans-serif","font-size":fontSize,fill})) node.setAttribute(key,String(value));
  node.textContent=text; svg.appendChild(node);
}
await writeFile(new URL("../docs/architecture.svg",import.meta.url),svg.outerHTML);
console.log("Wrote docs/architecture.svg using Excalidraw exportToSvg");
dom.window.close();
