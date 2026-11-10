/* Pustakalaya: web edition. viz-kit.js, the helper for interactive visualizations.
 *
 * A visualization is a self-contained HTML file in a book's viz/<name>/ folder. The library shows it in a sandboxed
 * frame (no access to the page, to its storage or to the network of the reader). Include this file in the
 * visualization with
 *
 *     <script src="viz-kit.js"><\/script>
 *
 * and the library puts its own copy there when the figure is shown (copy tools/assets/viz-kit.js next to your file to
 * try the page in a plain browser; the copy in the book is never used). The kit gives you:
 *
 *   VizKit.palette         the colours of the page that holds the figure: bg, fg, muted, line, surface, accent,
 *                          accent2, ok, bad, warn, plus VizKit.theme ("light" | "dark") and VizKit.series(i), a
 *                          set of distinguishable colours that suits the theme. The same colours are CSS
 *                          variables: --viz-bg, --viz-fg, --viz-muted, --viz-line, --viz-surface, --viz-accent,
 *                          --viz-accent2, --viz-ok, --viz-bad, --viz-warn.
 *   VizKit.onTheme(fn)     fn(palette) now and whenever the reader changes the theme or the type size (redraw
 *                          canvases here; SVG and HTML that use the variables need nothing).
 *   VizKit.full            true when shown full screen (more room), VizKit.reader true inside the paginated reader.
 *   VizKit.autoHeight()    tells the page the height of the content, so the frame is as tall as the figure needs.
 *   VizKit.stepper(el, o)  a row of controls (restart, previous, play/pause, next, counter, optional speed) for
 *                          anything that runs in steps. o: {count, interval, loop, labels, onStep(i), start}.
 *   VizKit.el(tag, attrs, children) a small DOM helper.
 *
 * Base styles are added for body, buttons, inputs, tables and the helper classes .vk-row, .vk-card, .vk-muted,
 * .vk-btn, .vk-seg. The text size follows the reader's type size (rem units scale with it).
 *
 * The protocol between the page and the frame (messages sent with postMessage; every message is an object with
 * bjpViz: 1 and a type):
 *   page -> frame   {type: "theme", theme, bg, fg, muted, line, surface, accent, accent2, fontSize, full, reader}
 *   frame -> page   {type: "ready"}            the kit is loaded; the page answers with "theme"
 *                   {type: "height", value}    wanted height in pixels (autoHeight)
 *                   {type: "close"}            Escape was pressed (closes the full-screen view)
 */
(function (w) {
  "use strict";
  if (w.VizKit) return;
  var K = w.VizKit = { version: 1, theme: "light", palette: {}, full: false, reader: false, fontSize: 16 };
  var listeners = [];

  var SERIES = {
    light: ["#1f5fa8", "#c4521a", "#2a8a4a", "#8a3fa0", "#b08a00", "#1a8a96", "#b02a5a", "#5a6270"],
    dark: ["#7fb2ee", "#f09a62", "#79cf92", "#c795da", "#e0c04a", "#6fd0d8", "#f08aae", "#aeb6c4"]
  };
  K.series = function (i) { var s = SERIES[K.theme] || SERIES.light; return s[((i % s.length) + s.length) % s.length]; };

  function post(msg) {
    msg.bjpViz = 1;
    try { w.parent.postMessage(msg, "*"); } catch (e) { /* standalone page */ }
  }

  var CSS =
    ":root{color-scheme:light dark}" +
    "html{font-size:16px;-webkit-text-size-adjust:100%}" +
    "*,*:before,*:after{box-sizing:border-box}" +
    "body{margin:0;padding:.7rem;background:var(--viz-bg);color:var(--viz-fg);font:1rem/1.45 system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif}" +
    "h1,h2,h3{margin:.2em 0 .4em;line-height:1.25}h1{font-size:1.25rem}h2{font-size:1.1rem}h3{font-size:1rem}p{margin:.35em 0}" +
    "button,select,input,textarea{font:inherit;color:inherit;max-width:100%}select{text-overflow:ellipsis}" +
    "button,.vk-btn{cursor:pointer;min-height:2.2rem;padding:.3rem .8rem;border:1px solid var(--viz-line);border-radius:.45rem;background:var(--viz-surface);color:var(--viz-fg);touch-action:manipulation}" +
    "button:hover:not(:disabled){border-color:var(--viz-accent)}button:disabled{opacity:.45;cursor:default}" +
    "button.on,button[aria-pressed=true],.vk-btn.on{background:var(--viz-accent);border-color:var(--viz-accent);color:var(--viz-bg)}" +
    "button:focus-visible,input:focus-visible,select:focus-visible,[tabindex]:focus-visible,svg [tabindex]:focus-visible{outline:2px solid var(--viz-accent);outline-offset:2px}" +
    "input[type=text],input[type=number],textarea,select{min-height:2.2rem;padding:.25rem .5rem;border:1px solid var(--viz-line);border-radius:.45rem;background:var(--viz-bg)}" +
    "textarea{width:100%;font-family:ui-monospace,Consolas,Menlo,monospace}" +
    "input[type=range]{accent-color:var(--viz-accent);width:100%;min-height:1.6rem}" +
    "table{border-collapse:collapse}th,td{padding:.25rem .55rem;border:1px solid var(--viz-line);text-align:center}th{background:var(--viz-surface)}" +
    "code,.mono{font-family:ui-monospace,Consolas,Menlo,monospace}" +
    ".vk-row{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin:.4rem 0}" +
    ".vk-card{padding:.6rem .75rem;border:1px solid var(--viz-line);border-radius:.6rem;background:var(--viz-surface)}" +
    ".vk-muted{color:var(--viz-muted)}.vk-ok{color:var(--viz-ok)}.vk-bad{color:var(--viz-bad)}.vk-warn{color:var(--viz-warn)}" +
    ".vk-seg{display:inline-flex}.vk-seg>button{border-radius:0;margin-left:-1px}.vk-seg>button:first-child{border-radius:.45rem 0 0 .45rem;margin-left:0}.vk-seg>button:last-child{border-radius:0 .45rem .45rem 0}" +
    ".vk-stepper{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center}.vk-stepper .vk-count{min-width:4.5rem;text-align:center;font-variant-numeric:tabular-nums}" +
    ".vk-stepper button{min-width:2.4rem;padding:.3rem .55rem}.vk-stepper svg{width:1.1rem;height:1.1rem;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vertical-align:middle}" +
    ".vk-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}" +
    "@media (prefers-reduced-motion:reduce){*{animation-duration:.001s!important;transition-duration:.001s!important}}";

  function addStyle() {
    var s = document.createElement("style");
    s.setAttribute("data-viz-kit", "");
    s.textContent = CSS;
    (document.head || document.documentElement).insertBefore(s, (document.head || document.documentElement).firstChild);
  }

  function defaults() {
    var dark = w.matchMedia && w.matchMedia("(prefers-color-scheme: dark)").matches;
    return dark
      ? { theme: "dark", bg: "#131313", fg: "#d6d3cd", muted: "#9a9a9a", line: "#3a3a3a", surface: "#1c1c1c", accent: "#8fb4e0", accent2: "#e9a5a0", fontSize: 16 }
      : { theme: "light", bg: "#ffffff", fg: "#1a1a1a", muted: "#5c5c5c", line: "#d9d9d9", surface: "#f5f5f5", accent: "#1f4a85", accent2: "#7a2222", fontSize: 16 };
  }

  function apply(m) {
    var dark = m.theme === "dark";
    var p = K.palette = {
      bg: m.bg, fg: m.fg, muted: m.muted, line: m.line, surface: m.surface, accent: m.accent, accent2: m.accent2,
      ok: dark ? "#79cf92" : "#23723a", bad: dark ? "#f2928b" : "#b3261e", warn: dark ? "#f0b25c" : "#9a5600"
    };
    K.theme = dark ? "dark" : "light";
    K.full = !!m.full;
    K.reader = !!m.reader;
    K.fontSize = m.fontSize || 16;
    var h = document.documentElement, st = h.style;
    h.setAttribute("data-theme", K.theme);
    st.setProperty("color-scheme", K.theme);
    for (var k in p) st.setProperty("--viz-" + k, p[k]);
    st.fontSize = Math.max(14, Math.min(21, K.fontSize)) + "px";
    for (var i = 0; i < listeners.length; i++) { try { listeners[i](p); } catch (e) { /* a faulty listener must not stop the others */ } }
  }

  K.onTheme = function (fn) { listeners.push(fn); try { fn(K.palette); } catch (e) { /* ignore */ } };

  K.el = function (tag, attrs, kids) {
    var e = document.createElement(tag), k;
    for (k in (attrs || {})) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];
      else if (k.slice(0, 2) === "on" && typeof attrs[k] === "function") e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
    }
    (kids || []).forEach(function (c) { e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  };

  var heightOn = false, lastH = 0;
  K.autoHeight = function () {
    if (heightOn) return;
    heightOn = true;
    function send() {
      var h = Math.ceil(document.documentElement.getBoundingClientRect().height);   // the content, not the frame (scrollHeight is never smaller than the frame)
      if (Math.abs(h - lastH) > 1) { lastH = h; post({ type: "height", value: h }); }
    }
    if (w.ResizeObserver) new ResizeObserver(send).observe(document.documentElement);
    w.addEventListener("load", send);
    w.addEventListener("resize", send);
    send();
  };

  var ICON = {
    first: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5v14M18 5l-9 7 9 7z"/></svg>',
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>'
  };

  K.stepper = function (host, o) {
    o = o || {};
    var n = Math.max(1, o.count | 0), i = o.start | 0, timer = null, ms = o.interval || 1200;
    var bar = K.el("div", { "class": "vk-stepper", role: "group", "aria-label": o.label || "Step controls" });
    function btn(cls, label, icon) { return K.el("button", { type: "button", "class": cls, "aria-label": label, title: label, html: icon }); }
    var bFirst = btn("vk-first", "Back to the start", ICON.first), bPrev = btn("vk-prev", "Previous step", ICON.prev),
        bPlay = btn("vk-play", "Play", ICON.play), bNext = btn("vk-next", "Next step", ICON.next);
    var count = K.el("span", { "class": "vk-count", "aria-live": "polite" });
    bar.appendChild(bFirst); bar.appendChild(bPrev); bar.appendChild(bPlay); bar.appendChild(bNext); bar.appendChild(count);
    var speed = null;
    if (o.speed !== false) {
      speed = K.el("input", { type: "range", min: "300", max: "2500", step: "100", value: String(2800 - ms), "aria-label": "Speed", title: "Speed", style: "width:6rem" });
      bar.appendChild(speed);
    }
    host.appendChild(bar);
    var api = { get index() { return i; }, count: n };
    function show() {
      count.textContent = (i + 1) + " / " + n + (o.labels && o.labels[i] ? "" : "");
      bPrev.disabled = i === 0; bFirst.disabled = i === 0;
      bNext.disabled = i === n - 1 && !o.loop;
      if (o.onStep) o.onStep(i, o.labels ? o.labels[i] : undefined);
    }
    function go(k) { i = Math.max(0, Math.min(n - 1, k)); show(); return api; }
    function pause() { if (timer) { clearInterval(timer); timer = null; } bPlay.innerHTML = ICON.play; bPlay.setAttribute("aria-label", "Play"); bPlay.title = "Play"; return api; }
    function tick() {
      if (i >= n - 1) { if (o.loop) go(0); else pause(); return; }
      go(i + 1);
      if (i >= n - 1 && !o.loop) pause();
    }
    function play() {
      if (timer) return api;
      if (i >= n - 1 && !o.loop) go(0);
      timer = setInterval(tick, ms);
      bPlay.innerHTML = ICON.pause; bPlay.setAttribute("aria-label", "Pause"); bPlay.title = "Pause";
      return api;
    }
    bFirst.addEventListener("click", function () { pause(); go(0); });
    bPrev.addEventListener("click", function () { pause(); go(i - 1); });
    bNext.addEventListener("click", function () { pause(); go(o.loop && i === n - 1 ? 0 : i + 1); });
    bPlay.addEventListener("click", function () { if (timer) pause(); else play(); });
    if (speed) speed.addEventListener("input", function () { ms = 2800 - (+speed.value); if (timer) { clearInterval(timer); timer = setInterval(tick, ms); } });
    api.go = go; api.next = function () { return go(i + 1); }; api.prev = function () { return go(i - 1); };
    api.play = play; api.pause = pause;
    api.playing = function () { return !!timer; };
    show();
    return api;
  };

  w.addEventListener("message", function (e) {
    if (e.source !== w.parent) return;
    var m = e.data;
    if (m && m.bjpViz === 1 && m.type === "theme") apply(m);
  });
  w.addEventListener("keydown", function (e) {
    if (e.key === "Escape" || e.key === "Esc") post({ type: "close" });
  });

  addStyle();
  var init = null;
  try { init = JSON.parse(document.documentElement.getAttribute("data-viz-init") || "null"); } catch (e) { init = null; }
  apply(init && init.theme ? init : defaults());
  function ready() { post({ type: "ready" }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready); else ready();
})(window);
