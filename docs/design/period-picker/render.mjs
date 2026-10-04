// Expand a design-canvas .dc.html board into static, self-contained HTML:
// evaluate its Component.renderVals(), then expand {{ holes }}, <sc-for> and <sc-if>.
// Same expander as docs/design/investments-redesign/render.mjs; the boards differ, and a
// disabled="false" left by a boolean hole is dropped so enabled buttons stay enabled.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function render(srcPath, outPath, props, title) {
  const src = fs.readFileSync(srcPath, "utf8");
  const script = src.match(/<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/)[1];
  const helmet = src.match(/<helmet>([\s\S]*?)<\/helmet>/)[1];
  const body = src.match(/<x-dc>([\s\S]*?)<\/x-dc>/)[1].replace(/<helmet>[\s\S]*?<\/helmet>/, "");

  class DCLogic { constructor(p) { this.props = p || {}; this.state = {}; } setState() {} forceUpdate() {} }
  const Component = new Function("DCLogic", script + "\nreturn Component;")(DCLogic);
  const instance = new Component(props);
  const vals = instance.renderVals();

  const dom = new JSDOM(`<!doctype html><html><head></head><body>${body}</body></html>`);
  const { document, Node } = dom.window;

  const lookup = (path, scope) => path.trim().split(".").reduce((o, k) => (o == null ? undefined : o[k]), scope);
  const interpolate = (text, scope) =>
    text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, p) => {
      const v = lookup(p, scope);
      return v == null ? "" : String(v);
    });

  function expand(node, scope) {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (child.nodeValue.includes("{{")) child.nodeValue = interpolate(child.nodeValue, scope);
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = child.tagName.toLowerCase();
      if (tag === "sc-for") {
        const list = lookup(child.getAttribute("list").replace(/[{}]/g, ""), scope) || [];
        const as = child.getAttribute("as");
        const frag = document.createDocumentFragment();
        list.forEach((item, index) => {
          const holder = document.createElement("div");
          holder.innerHTML = child.innerHTML;
          expand(holder, { ...scope, [as]: item, $index: index });
          while (holder.firstChild) frag.appendChild(holder.firstChild);
        });
        child.replaceWith(frag);
        continue;
      }
      if (tag === "sc-if") {
        const value = lookup(child.getAttribute("value").replace(/[{}]/g, ""), scope);
        if (value) {
          expand(child, scope);
          const frag = document.createDocumentFragment();
          while (child.firstChild) frag.appendChild(child.firstChild);
          child.replaceWith(frag);
        } else {
          child.remove();
        }
        continue;
      }
      for (const attr of [...child.attributes]) {
        if (!attr.value.includes("{{")) continue;
        if (/^on[A-Z]/.test(attr.name) || /^on[a-z]+$/i.test(attr.name)) { child.removeAttribute(attr.name); continue; }
        const value = interpolate(attr.value, scope);
        if (attr.name === "disabled" && value !== "true") child.removeAttribute(attr.name);
        else child.setAttribute(attr.name, value);
      }
      // Drop event-handler attributes that were whole-value holes (camelCase onClick parsed lowercase).
      for (const attr of [...child.attributes]) if (/^on/.test(attr.name)) child.removeAttribute(attr.name);
      expand(child, scope);
    }
  }
  expand(document.body, vals);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<!-- Static render of the approved design canvas board; see README.md. -->
${helmet.trim()}
</head>
<body>
${document.body.innerHTML.trim()}
</body>
</html>
`;
  fs.writeFileSync(outPath, html);
  console.log("wrote", outPath, html.length, "bytes; leftover holes:", (html.match(/\{\{/g) || []).length);
}

const dir = path.join(__dirname, "boards");
const out = __dirname;
render(`${dir}/Dashboard.dc.html`, `${out}/desktop.html`, {}, "Period picker · Dashboard");
render(`${dir}/Analytics.dc.html`, `${out}/analytics.html`, {}, "Period picker · Analytics, picker open on a custom range");
render(`${dir}/Phone.dc.html`, `${out}/phone.html`, {}, "Period picker · phone, picker as a sheet");
