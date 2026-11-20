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
const boxes = [[176,12,"Browser","Chat + consent"],[176,128,"Next.js server","Auth0 + tools"],[20,260,"AI Gateway","Model stream"],[332,260,"Auth0 Token Vault","Google tokens"],[20,400,"Google APIs","Calendar read","Gmail drafts"],[332,400,"Neon Postgres","Chat history"]];
for (const [x,y] of boxes) elements.push(base("rectangle", x,y,268,y < 260 ? 84 : 100));
for (const [type,x,y,width,height,startArrowhead,endArrowhead] of [["arrow",310,99,0,25,null,"arrow"],["line",310,216,0,234,null,null],...[310,450].flatMap(y => [["arrow",292,y,18,0,"arrow",null],["arrow",310,y,18,0,null,"arrow"]])]) elements.push({ ...base(type,x,y,width,height), backgroundColor:"transparent", points:[[0,0],[width,height]], lastCommittedPoint:null, startBinding:null, endBinding:null, startArrowhead, endArrowhead, elbowed:false });
const padding = 16;
const svg = await exportToSvg({ elements, appState:{ viewBackgroundColor:"#fafbf7", exportBackground:true }, files:{}, exportPadding:padding });
svg.setAttribute("role", "img");
svg.setAttribute("aria-labelledby", "architecture-title architecture-description");
for (const [tag,id,text] of [["title","architecture-title","Orbit architecture"],["desc","architecture-description","The browser connects to the Next.js server. The server calls AI Gateway for the model, Auth0 Token Vault for Google tokens, Google APIs to read Calendar and create Gmail drafts, and Neon Postgres for private chat history."]]) {
  const node = document.createElementNS("http://www.w3.org/2000/svg",tag);
  node.id = id; node.textContent = text; svg.appendChild(node);
}
const labels = document.createElementNS("http://www.w3.org/2000/svg","g");
labels.setAttribute("transform", `translate(${padding - 20} ${padding - 12})`);
svg.appendChild(labels);
for (const [x,y,title,subtitle,detail] of boxes) for (const [text,dy,fontSize,weight] of [[title,detail || y < 260 ? 32 : 40,28,600],[subtitle,detail || y < 260 ? 64 : 76,26,400],...(detail ? [[detail,92,26,400]] : [])]) {
  const node = document.createElementNS("http://www.w3.org/2000/svg","text");
  for (const [key,value] of Object.entries({x:x+134,y:y+dy,"text-anchor":"middle","font-family":"Arial, sans-serif","font-size":fontSize,"font-weight":weight,fill:"#253e32"})) node.setAttribute(key,String(value));
  node.textContent=text; labels.appendChild(node);
}
await writeFile(new URL("../docs/architecture.svg",import.meta.url),svg.outerHTML);
console.log("Wrote docs/architecture.svg using Excalidraw exportToSvg");
dom.window.close();
