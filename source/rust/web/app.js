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
const tabs = [];
let activeTab = null;

function saveTabState() {
  if (activeTab) {
    activeTab.position = $("reader").scrollTop;
    activeTab.source = sourceMode;
    activeTab.query = $("find-input").value;
    activeTab.findOpen = !$("find-bar").hidden;
  }
}
function drawTabs() {
  $("tab-bar").replaceChildren();
  $("tab-bar").hidden = !tabs.length;
  for (const tab of tabs) {
    const container = document.createElement("div");
    container.className = `document-tab${tab === activeTab ? " active" : ""}`;
    const title = document.createElement("button");
    title.setAttribute("role", "tab");
    title.setAttribute("aria-selected", String(tab === activeTab));
    title.tabIndex = tab === activeTab ? 0 : -1;
    title.textContent = tab.data.path;
    title.title = tab.data.path;
    title.onclick = () => enqueue(() => activateTab(tab));
    const close = document.createElement("button");
    close.className = "close-tab";
    close.textContent = "×";
    close.setAttribute("aria-label", `Close ${tab.data.path}`);
    close.onclick = () => enqueue(() => closeTab(tab));
    container.append(title, close);
    $("tab-bar").append(container);
    if (tab === activeTab) container.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}
function displayTab(tab) {
  activeTab = tab;
  $("find-input").value = tab.query;
  $("find-bar").hidden = !tab.findOpen;
  sourceMode = tab.source;
  renderDocument(tab.data, true, tab.position);
  drawTabs();
}
async function activateTab(tab) {
  if (!tabs.includes(tab) || tab === activeTab) return;
  saveTabState();
  // Reload on switching so inactive tabs pick up external changes.
  // If the file has disappeared, keep its last readable content.
  try { tab.data = await invoke("open_document", { path: tab.data.path }); }
  catch (error) { displayTab(tab); status(String(error)); return; }
  displayTab(tab);
}
function openTab(data) {
  saveTabState();
  let tab = tabs.find((candidate) => candidate.data.path === data.path);
  if (!tab) {
    tab = { data, position: 0, source: false, query: "", findOpen: false };
    tabs.push(tab);
  } else { tab.data = data; }
  displayTab(tab);
}
async function closeTab(tab = activeTab) {
  if (!tab) return;
  const index = tabs.indexOf(tab);
  if (index < 0) return;
  tabs.splice(index, 1);
  if (tab !== activeTab) { drawTabs(); return; }
  activeTab = null;
  if (tabs.length) { await activateTab(tabs[Math.min(index, tabs.length - 1)]); return; }
  documentData = null;
  observer?.disconnect();
  removeMarks();
  $("preview").replaceChildren();
  $("source").textContent = "";
  $("preview").hidden = $("source").hidden = $("document-heading").hidden = true;
  $("welcome").hidden = false;
  $("find-bar").hidden = true;
  $("toc").replaceChildren();
  $("heading-count").textContent = "";
  showSource(false);
  drawTabs();
  status("Ready");
}
async function cycleTab(direction) {
  if (tabs.length < 2) return;
  const index = (tabs.indexOf(activeTab) + direction + tabs.length) % tabs.length;
  await activateTab(tabs[index]);
}

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
function renderDocument(data, preservePosition = false, restoredPosition = null) {
  const position = restoredPosition ?? (preservePosition ? $("reader").scrollTop : 0);
  documentData = data;
  if (activeTab) activeTab.data = data;
  $("welcome").hidden = true;
  $("document-heading").hidden = false;
  $("filename").textContent = data.name;
  document.title = `${data.name} — MarkUp Viewer`;
  // HTML is generated and sanitized by Rust. Raw Markdown is never executable.
  $("preview").innerHTML = data.html;
  $("source").textContent = data.source;
  buildToc(data.headings);
  showSource(preservePosition ? sourceMode : false);
  $("reader").scrollTo({ top: position, behavior: "instant" });
  status(data.path);
}
async function chooseFile() {
  const data = await invoke("choose_document");
  if (data) openTab(data);
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
  enqueue(async () => { const data = await invoke("follow_link", { href, documentPath: documentData.path }); if (data) openTab(data); });
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") { closeFind(); return; }
  if (!event.ctrlKey && !event.metaKey) return;
  if (event.key === "Tab") { event.preventDefault(); enqueue(() => cycleTab(event.shiftKey ? -1 : 1)); return; }
  const key = event.key.toLowerCase();
  const shortcuts = {
    o: () => enqueue(chooseFile), u: () => showSource(!sourceMode), f: openFind,
    w: () => enqueue(() => closeTab()),
    d: () => $("theme").click(), r: () => enqueue(async () => { if (!documentData) return; const data = await invoke("refresh_document", { path: documentData.path, force: true }); if (data) renderDocument(data, true); }),
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
    for (const data of info.documents) openTab(data);
    if (info.errors.length) status(info.errors.join("; "));
  }));
  await window.__TAURI__.webviewWindow.getCurrentWebviewWindow().onDragDropEvent((event) => {
    const payload = event.payload;
    $("drop-overlay").hidden = payload.type !== "over" && payload.type !== "enter";
    if (payload.type === "drop" && payload.paths?.length) enqueue(async () => {
      const errors = [];
      for (const path of payload.paths) {
        try { openTab(await invoke("open_document", { path })); } catch (error) { errors.push(String(error)); }
      }
      if (errors.length) status(errors.join("; "));
    });
  });
  const info = await invoke("startup");
  selfTest = info.self_test;
  for (const data of info.documents) openTab(data);
  if (info.errors.length) status(info.errors.join("; "));
  await invoke("ready");
  if (selfTest) {
    const rendered = !$("preview").hidden && $("preview").querySelector("h1")?.textContent === "Welcome to Markdown Viewer";
    const first = tabs[0];
    const outline = $("toc").querySelectorAll("a").length === first.data.headings.length && first.data.headings.length > 1;
    showSource(true);
    const source = !$("source").hidden && $("source").textContent.startsWith("# Welcome");
    const last = first.data.headings.at(-1);
    navigate(last.id);
    const navigation = !sourceMode && !!document.getElementById(last.id) && $("toc").querySelector("a.active")?.dataset.section === last.id;
    showSource(true);
    const secondPath = first.data.path.replace(/[\\/][^\\/]+$/, "/sample-tabs.md");
    openTab(await invoke("open_document", { path: secondPath }));
    const second = activeTab;
    const tabTitles = tabs.length === 2 && [...document.querySelectorAll("#tab-bar [role=tab]")].every((title, index) => title.textContent === tabs[index].data.path);
    $("reader").scrollTo({ top: 200, behavior: "instant" });
    const secondPosition = $("reader").scrollTop;
    await activateTab(first);
    const tabState = sourceMode && $("source").textContent === first.data.source && $("toc").querySelector("a")?.textContent === first.data.headings[0].text;
    openTab(await invoke("open_document", { path: secondPath }));
    const duplicates = tabs.length === 2 && activeTab === second;
    const restoredScroll = secondPosition > 0 && Math.abs($("reader").scrollTop - secondPosition) < 2;
    await closeTab(first);
    const inactiveClose = tabs.length === 1 && activeTab === second;
    await closeTab(second);
    const closing = inactiveClose && tabs.length === 0 && !$("welcome").hidden && $("tab-bar").hidden;
    await invoke("complete_self_test", { checks: { rendered, outline, source, navigation, tabs: tabTitles && tabState && restoredScroll && duplicates && closing } });
  } else {
    let refreshing = false;
    setInterval(() => {
      if (!documentData || refreshing || document.hidden) return;
      refreshing = true;
      enqueue(async () => {
        try { if (!documentData) return; const data = await invoke("refresh_document", { path: documentData.path, force: false }); if (data) renderDocument(data, true); }
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
