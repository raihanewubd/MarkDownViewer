"use strict";
const $ = (id) => document.getElementById(id);
const invoke = window.__TAURI__?.core.invoke;
let documentData = null;
let sourceMode = false;
let zoom = Math.max(60, Math.min(200, Number(localStorage.getItem("zoom")) || 100));
let queue = Promise.resolve();
let observer;
let matches = [];
let matchIndex = -1;
let selfTest = false;

function status(message) { $("status").textContent = message; }
function enqueue(operation) {
  const next = queue.then(operation);
  queue = next.catch((error) => status(String(error)));
  return queue;
}
function applyTheme(dark) {
  document.documentElement.classList.toggle("dark", dark);
  $("theme").textContent = dark ? "Light" : "Dark";
  localStorage.setItem("dark", String(dark));
}
function applyZoom() {
  document.documentElement.style.setProperty("--reading-size", `${17 * zoom / 100}px`);
  $("zoom-label").textContent = `${zoom}%`;
  localStorage.setItem("zoom", String(zoom));
}
function changeZoom(delta) { zoom = Math.max(60, Math.min(200, zoom + delta)); applyZoom(); }
function showSource(enabled) {
  sourceMode = enabled;
  $("source-button").setAttribute("aria-pressed", String(enabled));
  $("preview").hidden = !documentData || enabled;
  $("source").hidden = !documentData || !enabled;
  $("mode").textContent = enabled ? "Markdown source · read only" : "Rendered view";
  if (!$("find-bar").hidden) findMatches();
}
function navigate(id) {
  showSource(false);
  document.getElementById(id)?.scrollIntoView({ block: "start", behavior: selfTest ? "instant" : "smooth" });
  document.querySelectorAll("#toc a").forEach((link) => link.classList.toggle("active", link.dataset.section === id));
}
function buildToc(headings) {
  observer?.disconnect();
  $("toc").replaceChildren();
  $("heading-count").textContent = headings.length || "";
  if (!headings.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No headings in this document.";
    $("toc").append(empty);
    return;
  }
  const minimumLevel = Math.min(...headings.map((heading) => heading.level));
  for (const heading of headings) {
    const link = document.createElement("a");
    link.href = `#${heading.id}`;
    link.dataset.section = heading.id;
    link.textContent = heading.text;
    link.title = heading.text;
    link.style.paddingLeft = `${10 + (heading.level - minimumLevel) * 14}px`;
    link.addEventListener("click", (event) => { event.preventDefault(); navigate(heading.id); });
    $("toc").append(link);
  }
  observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible.length) {
      const id = visible[0].target.id;
      document.querySelectorAll("#toc a").forEach((link) => link.classList.toggle("active", link.dataset.section === id));
    }
  }, { root: $("reader"), rootMargin: "0px 0px -65% 0px" });
  headings.forEach((heading) => { const node = document.getElementById(heading.id); if (node) observer.observe(node); });
}
function renderDocument(data, preservePosition = false) {
  const position = preservePosition ? $("reader").scrollTop : 0;
  documentData = data;
  $("welcome").hidden = true;
  $("document-heading").hidden = false;
  $("filename").textContent = data.name;
  document.title = `${data.name} — MarkUp Viewer`;
  // HTML is generated and sanitized by Rust. Raw Markdown is never executable.
  $("preview").innerHTML = data.html;
  $("source").textContent = data.source;
  buildToc(data.headings);
  showSource(preservePosition ? sourceMode : false);
  $("reader").scrollTop = position;
  status(data.path);
}
async function chooseFile() {
  const data = await invoke("choose_document");
  if (data) renderDocument(data);
}
function removeMarks() {
  document.querySelectorAll("#reader mark").forEach((mark) => mark.replaceWith(document.createTextNode(mark.textContent)));
  $("preview").normalize();
  $("source").normalize();
  matches = [];
  matchIndex = -1;
}
function findMatches() {
  removeMarks();
  const term = $("find-input").value.toLocaleLowerCase();
  if (!term || !documentData) { $("find-count").textContent = ""; return; }
  const target = sourceMode ? $("source") : $("preview");
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const text = node.textContent;
    const lower = text.toLocaleLowerCase();
    let start = 0;
    let position = lower.indexOf(term);
    if (position < 0) continue;
    const fragment = document.createDocumentFragment();
    while (position >= 0 && matches.length < 5000) {
      fragment.append(document.createTextNode(text.slice(start, position)));
      const mark = document.createElement("mark");
      mark.textContent = text.slice(position, position + term.length);
      matches.push(mark);
      fragment.append(mark);
      start = position + term.length;
      position = lower.indexOf(term, start);
    }
    fragment.append(document.createTextNode(text.slice(start)));
    node.replaceWith(fragment);
  }
  stepMatch(1);
}
function stepMatch(direction) {
  if (!matches.length) { $("find-count").textContent = "No matches"; return; }
  matches[matchIndex]?.classList.remove("current");
  matchIndex = (matchIndex + direction + matches.length) % matches.length;
  matches[matchIndex].classList.add("current");
  matches[matchIndex].scrollIntoView({ block: "center", behavior: "instant" });
  $("find-count").textContent = `${matchIndex + 1} of ${matches.length}`;
}
function openFind() { $("find-bar").hidden = false; $("find-input").focus(); $("find-input").select(); }
function closeFind() { $("find-bar").hidden = true; removeMarks(); }

$("open").onclick = $("welcome-open").onclick = () => enqueue(chooseFile);
$("source-button").onclick = () => showSource(!sourceMode);
$("contents").onclick = () => {
  $("sidebar").hidden = !$("sidebar").hidden;
  $("contents").setAttribute("aria-pressed", String(!$("sidebar").hidden));
};
$("theme").onclick = () => applyTheme(!document.documentElement.classList.contains("dark"));
$("zoom-in").onclick = () => changeZoom(10);
$("zoom-out").onclick = () => changeZoom(-10);
$("find-button").onclick = openFind;
$("find-close").onclick = closeFind;
$("find-prev").onclick = () => stepMatch(-1);
$("find-next").onclick = () => stepMatch(1);
$("find-input").oninput = findMatches;
$("find-input").onkeydown = (event) => { if (event.key === "Enter") { event.preventDefault(); stepMatch(event.shiftKey ? -1 : 1); } };
$("preview").addEventListener("click", (event) => {
  const link = event.target.closest("a");
  if (!link) return;
  event.preventDefault();
  const href = link.getAttribute("href");
  if (!href) return;
  if (href.startsWith("#")) { navigate(decodeURIComponent(href.slice(1))); return; }
  enqueue(async () => { const data = await invoke("follow_link", { href }); if (data) renderDocument(data); });
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") { closeFind(); return; }
  if (!event.ctrlKey && !event.metaKey) return;
  const key = event.key.toLowerCase();
  const shortcuts = {
    o: () => enqueue(chooseFile), u: () => showSource(!sourceMode), f: openFind,
    d: () => $("theme").click(), r: () => enqueue(async () => { const data = await invoke("refresh_document", { force: true }); if (data) renderDocument(data, true); }),
    "+": () => changeZoom(10), "=": () => changeZoom(10), "-": () => changeZoom(-10),
    "0": () => { zoom = 100; applyZoom(); },
  };
  if (shortcuts[key]) { event.preventDefault(); shortcuts[key](); }
});
applyTheme(localStorage.getItem("dark") === "true" || (localStorage.getItem("dark") === null && matchMedia("(prefers-color-scheme: dark)").matches));
applyZoom();

async function start() {
  if (!invoke) { status("Desktop bridge unavailable. Launch the installed application."); return; }
  await window.__TAURI__.event.listen("open-file", () => enqueue(async () => {
    const info = await invoke("startup");
    if (info.document) renderDocument(info.document);
  }));
  await window.__TAURI__.webviewWindow.getCurrentWebviewWindow().onDragDropEvent((event) => {
    const payload = event.payload;
    $("drop-overlay").hidden = payload.type !== "over" && payload.type !== "enter";
    if (payload.type === "drop" && payload.paths?.length) enqueue(async () => {
      const data = await invoke("open_document", { path: payload.paths[0] });
      renderDocument(data);
    });
  });
  const info = await invoke("startup");
  selfTest = info.self_test;
  if (info.document) renderDocument(info.document);
  await invoke("ready");
  if (selfTest) {
    const rendered = !$("preview").hidden && $("preview").querySelector("h1")?.textContent === "Welcome to Markdown Viewer";
    const outline = $("toc").querySelectorAll("a").length === info.document.headings.length && info.document.headings.length > 1;
    showSource(true);
    const source = !$("source").hidden && $("source").textContent.startsWith("# Welcome");
    const last = info.document.headings.at(-1);
    navigate(last.id);
    const navigation = !sourceMode && !!document.getElementById(last.id) && $("toc").querySelector("a.active")?.dataset.section === last.id;
    await invoke("complete_self_test", { checks: { rendered, outline, source, navigation } });
  } else {
    let refreshing = false;
    setInterval(() => {
      if (!documentData || refreshing || document.hidden) return;
      refreshing = true;
      enqueue(async () => {
        try { const data = await invoke("refresh_document", { force: false }); if (data) renderDocument(data, true); }
        finally { refreshing = false; }
      });
    }, 1000);
  }
}
start().catch(async (error) => {
  status(String(error));
  // A missing or unreadable launch file must not leave an invisible app running.
  if (invoke) { try { await invoke("self_test_failed", { message: String(error) }); await invoke("ready"); } catch (_) {} }
});
