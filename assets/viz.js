/* Pustakalaya: web edition. Animations and visualizations.
 *
 * Works on the chapter pages and inside the paginated reader (assets/reader.js puts the chapter into .rd-flow).
 * The build (tools/mdbook.py) writes the figures; this file brings them to life:
 *
 *   figure.fig-viz     an interactive visualization (a book's viz/<name>/index.html). On a page it is a sandboxed
 *                      frame, loaded when it comes near the screen. In the reader it is a card with a Play button
 *                      that opens the visualization full screen (Escape, the Close button or the back button of a
 *                      phone close it). The frame has sandbox="allow-scripts" and no same-origin right: the file
 *                      cannot touch the library's storage or the page. Its HTML is fetched by this script (so
 *                      that it comes from the offline copy of the book), its script, style and image files are
 *                      put into it, and it is given to the frame as srcdoc. The theme and the type size are sent
 *                      with postMessage (see viz-kit.js for the protocol).
 *   figure.fig-steps   a step-through figure: frames with previous, next and play controls and a counter.
 *   figure.fig-video   a video or animation (<video>), played when `#autoplay` was written and it is on screen.
 *   figure.fig-mermaid a diagram written as text, drawn by a mermaid library that is loaded only on such a page.
 */
(function () {
  "use strict";
  if (window.__bjpViz) return;
  window.__bjpViz = true;

  var SCRIPT = (document.currentScript && document.currentScript.src) || "";
  var KIT_URL = SCRIPT ? SCRIPT.replace(/viz\.js(\?.*)?$/, "viz-kit.js") : "assets/viz-kit.js";
  var MERMAID_URL = SCRIPT ? SCRIPT.replace(/viz\.js(\?.*)?$/, "vendor/mermaid.min.js") : "assets/vendor/mermaid.min.js";
  var live = [];            // {frame, fig, full}: frames that receive theme messages
  var overlay = null;       // the full-screen view, if open
  var ignorePop = false;
  var kitText = null;

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function reduced() { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
  function inReader(n) { return !!(n.closest && n.closest(".rd-flow")); }
  function gen(n) { n.setAttribute("data-viz-gen", ""); return n; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  var ICON = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>',
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    full: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    reload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 11-2.6-5.9M20 4v5h-5"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };

  /* ---------------------------------------------------------------- colours and the theme message */
  var probe = null;
  function rgbOf(value, fallback) {
    if (!probe) { probe = el("span"); probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none"; probe.setAttribute("aria-hidden", "true"); document.body.appendChild(probe); }
    probe.style.color = "";
    probe.style.color = value || fallback;
    var m = /rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(getComputedStyle(probe).color);
    if (!m && fallback && value !== fallback) return rgbOf(fallback);
    return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
  }
  function mix(a, b, t) { return "rgb(" + [0, 1, 2].map(function (i) { return Math.round(a[i] * t + b[i] * (1 - t)); }).join(",") + ")"; }
  function hex(a) { return "#" + a.map(function (v) { return ("0" + v.toString(16)).slice(-2); }).join(""); }
  function lum(c) {
    var v = c.map(function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  /* the colours of the place where the figure is (the page, or the reader with its white, sepia or dark page) */
  function themeFor(fig, full) {
    var cs = getComputedStyle(fig);
    var bg = rgbOf(cs.getPropertyValue("--md-default-bg-color").trim(), "#ffffff");
    var fg = rgbOf(cs.getPropertyValue("--md-default-fg-color").trim(), "#1a1a1a");
    var link = rgbOf(cs.getPropertyValue("--md-typeset-a-color").trim(), "#1f4a85");
    var mar = rgbOf(cs.getPropertyValue("--bjp-maroon").trim(), "#7a2222");
    var dark = lum(bg) < 0.35;
    var fs = parseFloat(cs.fontSize) || 16;
    function css(a) { return "rgb(" + a.join(",") + ")"; }
    return {
      bjpViz: 1, type: "theme", theme: dark ? "dark" : "light",
      bg: css(bg), fg: css(fg), muted: mix(fg, bg, 0.62), line: mix(fg, bg, 0.2), surface: mix(fg, bg, 0.05),
      accent: css(link), accent2: css(mar), fontSize: Math.round(fs * 10) / 10, full: !!full, reader: inReader(fig)
    };
  }
  function hexTheme(t) {            // the kit wants plain strings: any CSS colour is fine
    return t;
  }
  function sendTheme(rec) {
    try { rec.frame.contentWindow.postMessage(hexTheme(themeFor(rec.fig, rec.full)), "*"); } catch (e) { /* frame gone */ }
  }
  function broadcast() {
    live = live.filter(function (r) { return r.frame.isConnected; });
    live.forEach(sendTheme);
    if (overlay) applyOverlayTheme(overlay.fig);
  }

  /* ---------------------------------------------------------------- the visualization document */
  function fetchText(url) {
    return fetch(url, { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) throw new Error("http " + r.status);
      return r.text();
    });
  }
  function getKit() { return kitText || (kitText = fetchText(KIT_URL).catch(function (e) { kitText = null; throw e; })); }
  function isLocal(u) { return u && !/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(u); }
  function blobData(url) {
    return fetch(url, { credentials: "same-origin" }).then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.blob(); }).then(function (b) {
      return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = rej; fr.readAsDataURL(b); });
    });
  }
  /* a script put into the page must not contain a closing script tag */
  function safeScript(t) { return t.replace(/<\/(script)/gi, "<\\/$1"); }
  /* The HTML of the visualization with its script, style and image files put into it, and the first theme. */
  function buildDoc(url, theme) {
    return fetchText(url).then(function (txt) {
      var doc = new DOMParser().parseFromString(txt, "text/html");
      var base = new URL(url, location.href);
      var jobs = [];
      doc.querySelectorAll("script[src]").forEach(function (s) {
        var src = s.getAttribute("src");
        if (/(^|\/)viz-kit\.js(\?|#|$)/.test(src)) {
          jobs.push(getKit().then(function (t) { s.removeAttribute("src"); s.textContent = safeScript(t); }));
        } else if (isLocal(src)) {
          jobs.push(fetchText(new URL(src, base).href).then(function (t) { s.removeAttribute("src"); s.textContent = safeScript(t); }, function () { /* left as it is */ }));
        }
        if (s.hasAttribute("defer") && s.getAttribute("type") !== "module") { s.removeAttribute("defer"); if (doc.body) doc.body.appendChild(s); }
      });
      doc.querySelectorAll('link[rel~="stylesheet"][href]').forEach(function (l) {
        var href = l.getAttribute("href");
        if (!isLocal(href)) return;
        jobs.push(fetchText(new URL(href, base).href).then(function (t) {
          var st = doc.createElement("style");
          st.textContent = t;
          l.parentNode.replaceChild(st, l);
        }, function () { /* left as it is */ }));
      });
      doc.querySelectorAll("img[src]").forEach(function (im) {
        var src = im.getAttribute("src");
        if (!isLocal(src) || /^data:/.test(src)) return;
        jobs.push(blobData(new URL(src, base).href).then(function (d) { im.setAttribute("src", d); }, function () { /* left as it is */ }));
      });
      return Promise.all(jobs).then(function () {
        var h = doc.documentElement;
        h.setAttribute("data-viz-init", JSON.stringify(theme));
        h.setAttribute("data-theme", theme.theme);
        var st = h.getAttribute("style") || "";
        h.setAttribute("style", st + (st && st.slice(-1) !== ";" ? ";" : "") + "color-scheme:" + theme.theme + ";--viz-bg:" + theme.bg + ";--viz-fg:" + theme.fg +
          ";--viz-muted:" + theme.muted + ";--viz-line:" + theme.line + ";--viz-surface:" + theme.surface + ";--viz-accent:" + theme.accent + ";--viz-accent2:" + theme.accent2);
        var bgStyle = doc.createElement("style");
        bgStyle.textContent = "html{background:" + theme.bg + "}";
        (doc.head || h).insertBefore(bgStyle, (doc.head || h).firstChild);
        return "<!doctype html>\n" + h.outerHTML;
      });
    });
  }
  function makeFrame(title) {
    var f = document.createElement("iframe");
    f.className = "viz-frame";
    f.setAttribute("sandbox", "allow-scripts");            // no allow-same-origin: an opaque origin, no access to the library's storage
    f.setAttribute("referrerpolicy", "no-referrer");
    f.setAttribute("title", title + " (interactive figure)");
    return gen(f);
  }

  /* ---------------------------------------------------------------- an interactive figure on a page */
  function vizUrl(fig) {
    var a = fig.querySelector("a.viz-src");
    return a ? a.href : "";
  }
  function setupViz(fig) {
    var box = fig.querySelector(".viz-box");
    var card = fig.querySelector(".viz-card");
    var title = fig.getAttribute("data-viz-title") || "Interactive figure";
    if (!box || !card) return;
    var reader = inReader(fig);
    var st = fig._viz = { box: box, card: card, title: title, reader: reader, mounted: false };
    var play = card.querySelector(".viz-play");
    if (play) play.addEventListener("click", function () { openOverlay(fig); });
    if (reader) {
      box.classList.add("viz-in-reader");
      return;
    }
    var tools = gen(el("div", "viz-tools"));
    tools.innerHTML =
      '<button type="button" class="viz-tool viz-full">' + ICON.full + "<span>Full screen</span></button>" +
      '<button type="button" class="viz-tool viz-reload">' + ICON.reload + "<span>Restart</span></button>";
    box.parentNode.insertBefore(tools, box.nextSibling);
    tools.querySelector(".viz-full").addEventListener("click", function () { openOverlay(fig); });
    tools.querySelector(".viz-reload").addEventListener("click", function () { unmount(fig); mount(fig); });
    if (!window.IntersectionObserver) { mount(fig); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting && !st.mounted) { mount(fig); io.disconnect(); } });
    }, { rootMargin: "500px 0px" });
    io.observe(box);
  }
  function unmount(fig) {
    var st = fig._viz;
    if (!st) return;
    var f = st.box.querySelector("iframe.viz-frame");
    if (f) f.parentNode.removeChild(f);
    live = live.filter(function (r) { return r.frame !== f; });
    st.mounted = false;
    st.box.classList.remove("is-live", "is-error");
    st.card.hidden = false;
  }
  function mount(fig) {
    var st = fig._viz;
    if (!st || st.mounted) return;
    st.mounted = true;
    st.box.classList.add("is-loading");
    var f = makeFrame(st.title);
    buildDoc(vizUrl(fig), themeFor(fig, false)).then(function (html) {
      if (!st.mounted) return;
      f.srcdoc = html;
      f.addEventListener("load", function () { sendTheme(rec); });
      st.box.appendChild(f);
      st.card.hidden = true;
      st.box.classList.remove("is-loading");
      st.box.classList.add("is-live");
    }, function () {
      st.mounted = false;
      st.box.classList.remove("is-loading");
      st.box.classList.add("is-error");
      st.card.hidden = false;
      var note = st.card.querySelector(".viz-note");
      if (note) note.textContent = navigator.onLine === false ? "This figure was not kept for offline reading. Connect and try again." : "The figure could not be loaded.";
    });
    var rec = { frame: f, fig: fig, full: false };
    live.push(rec);
  }

  /* ---------------------------------------------------------------- the full-screen view */
  var inerted = [];
  function setInert(on) {
    var i, c;
    if (on) {
      inerted = [];
      for (i = 0; i < document.body.children.length; i++) {
        c = document.body.children[i];
        if (c === (overlay && overlay.root) || c.tagName === "SCRIPT" || c.inert) continue;
        c.inert = true; inerted.push(c);
      }
    } else {
      inerted.forEach(function (x) { x.inert = false; });
      inerted = [];
    }
  }
  function applyOverlayTheme(fig) {
    if (!overlay) return;
    var t = themeFor(fig, true), r = overlay.root.style;
    r.setProperty("--ov-bg", t.bg); r.setProperty("--ov-fg", t.fg); r.setProperty("--ov-line", t.line);
    r.setProperty("--ov-surface", t.surface); r.setProperty("--ov-accent", t.accent);
    overlay.root.setAttribute("data-theme", t.theme);
  }
  function openOverlay(fig) {
    if (overlay) return;
    var st = fig._viz;
    if (!st) return;
    var root = el("div", "viz-overlay");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", st.title);
    root.innerHTML =
      '<div class="viz-ovbar"><span class="viz-ovtitle"></span>' +
      '<button type="button" class="viz-ovclose" aria-label="Close">' + ICON.close + "<span>Close</span></button></div>" +
      '<div class="viz-ovbody"><p class="viz-ovload">Loading…</p></div>';
    root.querySelector(".viz-ovtitle").textContent = st.title;
    overlay = { root: root, fig: fig, opener: document.activeElement, pushed: false, frame: null };
    applyOverlayTheme(fig);
    document.body.appendChild(root);
    setInert(true);
    document.documentElement.classList.add("viz-open");
    try { history.pushState({ bjpViz: 1 }, "", location.href); overlay.pushed = true; } catch (e) { overlay.pushed = false; }
    root.querySelector(".viz-ovclose").addEventListener("click", function () { closeOverlay(false); });
    root.querySelector(".viz-ovclose").focus();
    var f = makeFrame(st.title);
    var rec = { frame: f, fig: fig, full: true };
    buildDoc(vizUrl(fig), themeFor(fig, true)).then(function (html) {
      if (!overlay || overlay.root !== root) return;
      f.srcdoc = html;
      f.addEventListener("load", function () { sendTheme(rec); });
      var body = root.querySelector(".viz-ovbody");
      body.innerHTML = "";
      body.appendChild(f);
      overlay.frame = f;
      live.push(rec);
      try { f.focus(); } catch (e) { /* ignore */ }
    }, function () {
      var p = root.querySelector(".viz-ovload");
      if (p) p.textContent = navigator.onLine === false ? "This figure was not kept for offline reading. Connect and try again." : "The figure could not be loaded.";
    });
  }
  function closeOverlay(fromPop) {
    if (!overlay) return;
    var o = overlay;
    overlay = null;
    live = live.filter(function (r) { return r.frame !== o.frame; });
    if (o.root.parentNode) o.root.parentNode.removeChild(o.root);
    setInert(false);
    document.documentElement.classList.remove("viz-open");
    if (o.pushed && !fromPop) { ignorePop = true; try { history.back(); } catch (e) { ignorePop = false; } }
    var back = o.opener && o.opener.isConnected ? o.opener : (o.fig.querySelector(".viz-play, .viz-full"));
    try { if (back) back.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }

  /* these run before the reader's own handlers (this script is loaded first, and the listeners are in the capture phase) */
  window.addEventListener("popstate", function (e) {
    if (ignorePop) { ignorePop = false; e.stopImmediatePropagation(); return; }
    if (overlay) { e.stopImmediatePropagation(); closeOverlay(true); }
  }, true);
  window.addEventListener("keydown", function (e) {
    if (overlay) {
      if (e.key === "Escape" || e.key === "Esc") { e.preventDefault(); e.stopImmediatePropagation(); closeOverlay(false); return; }
      if (e.key === "Tab") {
        var items = [overlay.root.querySelector(".viz-ovclose"), overlay.frame].filter(Boolean);
        if (items.length === 2) {
          var a = document.activeElement;
          if (e.shiftKey && a === items[0]) { e.preventDefault(); items[1].focus(); }
          else if (!e.shiftKey && a === items[1]) { e.preventDefault(); items[0].focus(); }
        }
      }
      e.stopPropagation();       // the reader must not turn pages behind the figure
      return;
    }
    // arrow keys inside a step-through figure step through it (and do not turn the reader's page)
    var t = e.target;
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && t && t.closest && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var fig = t.closest("figure.fig-steps");
      if (fig && fig._steps && !(t.tagName === "INPUT" && t.type === "range")) {
        e.preventDefault(); e.stopPropagation();
        fig._steps.pause();
        fig._steps.go(fig._steps.i + (e.key === "ArrowRight" ? 1 : -1));
      }
    }
  }, true);

  window.addEventListener("message", function (e) {
    var m = e.data;
    if (!m || m.bjpViz !== 1) return;
    var rec = null;
    for (var i = 0; i < live.length; i++) { if (live[i].frame.contentWindow === e.source) { rec = live[i]; break; } }
    if (!rec) return;
    if (m.type === "ready") sendTheme(rec);
    else if (m.type === "close") { if (overlay && overlay.frame === rec.frame) closeOverlay(false); }
    else if (m.type === "height" && !rec.full && typeof m.value === "number" && rec.fig._viz) {
      var h = Math.max(160, Math.min(1600, Math.round(m.value)));
      var cur = parseFloat(rec.fig._viz.box.style.getPropertyValue("--viz-h")) || 0;
      if (Math.abs(h - cur) > 2) rec.fig._viz.box.style.setProperty("--viz-h", h + "px");
    }
  });

  /* ---------------------------------------------------------------- step-through figures */
  function setupSteps(fig) {
    var frames = [].slice.call(fig.querySelectorAll(".steps-frame"));
    var stage = fig.querySelector(".steps-stage");
    if (!frames.length || !stage) return;
    var n = frames.length, i = 0, timer = null, ms = parseInt(fig.getAttribute("data-interval"), 10) || 1800;
    var loop = fig.hasAttribute("data-loop");
    fig.classList.add("steps-js");
    stage.setAttribute("tabindex", "0");
    stage.setAttribute("role", "group");
    stage.setAttribute("aria-roledescription", "step-through figure");
    stage.setAttribute("aria-label", (fig.getAttribute("data-steps-title") || "Figure") + ": " + n + " steps. Use the left and right arrow keys.");
    var bar = gen(el("div", "steps-bar"));
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "Step controls");
    bar.innerHTML =
      '<button type="button" class="steps-prev" aria-label="Previous step" title="Previous step">' + ICON.prev + "</button>" +
      '<button type="button" class="steps-play" aria-label="Play" title="Play">' + ICON.play + "</button>" +
      '<button type="button" class="steps-next" aria-label="Next step" title="Next step">' + ICON.next + "</button>" +
      '<span class="steps-count" aria-live="polite"></span>' +
      '<input type="range" class="steps-range" min="1" max="' + n + '" value="1" aria-label="Step">';
    stage.parentNode.insertBefore(bar, stage.nextSibling);
    var bPrev = bar.querySelector(".steps-prev"), bPlay = bar.querySelector(".steps-play"), bNext = bar.querySelector(".steps-next");
    var count = bar.querySelector(".steps-count"), range = bar.querySelector(".steps-range");
    function show() {
      frames.forEach(function (f, k) {
        var on = k === i;
        f.classList.toggle("is-on", on);
        if (on) f.removeAttribute("aria-hidden"); else f.setAttribute("aria-hidden", "true");
      });
      count.textContent = (i + 1) + " / " + n;
      range.value = String(i + 1);
      bPrev.disabled = i === 0;
      bNext.disabled = i === n - 1 && !loop;
    }
    function pause() {
      if (timer) { clearInterval(timer); timer = null; }
      bPlay.innerHTML = ICON.play; bPlay.setAttribute("aria-label", "Play"); bPlay.title = "Play";
    }
    function go(k) { i = Math.max(0, Math.min(n - 1, k)); show(); }
    function tick() {
      if (i >= n - 1) { if (loop) go(0); else pause(); return; }
      go(i + 1);
      if (i >= n - 1 && !loop) pause();
    }
    function play() {
      if (timer) return;
      if (i >= n - 1) go(0);
      timer = setInterval(tick, ms);
      bPlay.innerHTML = ICON.pause; bPlay.setAttribute("aria-label", "Pause"); bPlay.title = "Pause";
    }
    bPrev.addEventListener("click", function () { pause(); go(i - 1); });
    bNext.addEventListener("click", function () { pause(); go(loop && i === n - 1 ? 0 : i + 1); });
    bPlay.addEventListener("click", function () { if (timer) pause(); else play(); });
    range.addEventListener("input", function () { pause(); go((+range.value) - 1); });
    fig._steps = { go: go, pause: pause, get i() { return i; } };
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) { es.forEach(function (e) { if (!e.isIntersecting) pause(); }); }).observe(fig);
    }
    show();
  }

  /* ---------------------------------------------------------------- video */
  function setupVideo(fig) {
    var v = fig.querySelector("video");
    if (!v) return;
    v.muted = true;
    v.setAttribute("playsinline", "");
    if (fig.hasAttribute("data-autoplay") && !reduced() && window.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting && e.intersectionRatio > 0.5) { var p = v.play(); if (p && p.catch) p.catch(function () { /* the browser may refuse */ }); }
          else v.pause();
        });
      }, { threshold: [0, 0.5, 1] }).observe(v);
    }
  }

  /* ---------------------------------------------------------------- mermaid (loaded only when a page has a diagram) */
  var mermaidP = null;
  function loadMermaid() {
    if (window.mermaid) return Promise.resolve(window.mermaid);
    if (mermaidP) return mermaidP;
    mermaidP = new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = MERMAID_URL;
      s.onload = function () { window.mermaid ? res(window.mermaid) : rej(new Error("mermaid")); };
      s.onerror = function () { mermaidP = null; rej(new Error("mermaid")); };
      document.head.appendChild(s);
    });
    return mermaidP;
  }
  function setupMermaid(fig) {
    var pre = fig.querySelector("pre.mermaid");
    if (!pre) return;
    if (!pre.hasAttribute("data-src")) pre.setAttribute("data-src", pre.textContent);
    var src = pre.getAttribute("data-src");
    var dark = themeFor(fig, false).theme === "dark";
    loadMermaid().then(function (m) {
      m.initialize({ startOnLoad: false, securityLevel: "strict", theme: dark ? "dark" : "neutral", fontFamily: "inherit" });
      return m.render("mmd" + Math.random().toString(36).slice(2, 9), src);
    }).then(function (r) {
      pre.innerHTML = r.svg;
      pre.classList.add("is-drawn");
      var svg = pre.querySelector("svg");
      if (svg) { svg.removeAttribute("height"); svg.style.maxWidth = "100%"; }
    }, function () {
      pre.classList.add("is-error");
      var note = el("p", "viz-note");
      note.textContent = "The diagram could not be drawn (its code is shown instead).";
      gen(note);
      fig.insertBefore(note, pre);
    });
  }

  /* ---------------------------------------------------------------- finding the figures */
  var SEL = "figure.fig-viz, figure.fig-steps, figure.fig-video, figure.fig-mermaid";
  function cleanClone(fig) {
    // a figure copied from a page that was already brought to life (the reader copies the page): start again
    [].forEach.call(fig.querySelectorAll("[data-viz-gen]"), function (n) { n.parentNode.removeChild(n); });
    [].forEach.call(fig.querySelectorAll(".is-live,.is-loading,.is-error,.is-on,.is-drawn,.steps-js"), function (n) {
      n.classList.remove("is-live", "is-loading", "is-error", "is-on", "is-drawn", "steps-js");
    });
    var card = fig.querySelector(".viz-card");
    if (card) card.hidden = false;
  }
  function scan(root) {
    root = root || document;
    var list = root.querySelectorAll ? root.querySelectorAll(SEL) : [];
    for (var k = 0; k < list.length; k++) {
      var fig = list[k];
      if (fig._vizDone) continue;
      fig._vizDone = true;
      cleanClone(fig);
      try {
        if (fig.classList.contains("fig-viz")) setupViz(fig);
        else if (fig.classList.contains("fig-steps")) setupSteps(fig);
        else if (fig.classList.contains("fig-video")) setupVideo(fig);
        else if (fig.classList.contains("fig-mermaid")) setupMermaid(fig);
      } catch (e) { /* one faulty figure must not stop the others */ }
    }
  }

  /* ---------------------------------------------------------------- start */
  var flowObserver = null, watched = null;
  function watchFlow() {
    var flow = document.querySelector(".rd-flow");
    if (!flow || flow === watched) return;
    watched = flow;
    if (flowObserver) flowObserver.disconnect();
    flowObserver = new MutationObserver(function () { scan(flow); });
    flowObserver.observe(flow, { childList: true });
    scan(flow);
  }
  function start() {
    scan(document);
    watchFlow();
  }
  var themeWatch = null;
  function watchTheme() {
    if (themeWatch || !window.MutationObserver) return;
    var timer = null;
    themeWatch = new MutationObserver(function () { clearTimeout(timer); timer = setTimeout(broadcast, 60); });
    var opts = { attributes: true, attributeFilter: ["class", "style", "data-theme", "data-md-color-scheme"] };
    themeWatch.observe(document.documentElement, opts);
    if (document.body) themeWatch.observe(document.body, opts);
    // the reader's root (white, sepia or dark page; type size) is added to the body when the reader is first opened
    new MutationObserver(function () {
      var r = document.querySelector(".bjp-reader");
      if (r && !r._vizWatched) { r._vizWatched = true; themeWatch.observe(r, opts); r.addEventListener("transitionend", function () { clearTimeout(timer); timer = setTimeout(broadcast, 60); }); }
      watchFlow();
    }).observe(document.body, { childList: true });
    var r0 = document.querySelector(".bjp-reader");
    if (r0) { r0._vizWatched = true; themeWatch.observe(r0, opts); }
  }
  function init() {
    if (overlay) closeOverlay(true);
    start();
    watchTheme();
  }
  window.bjpViz = { scan: scan, open: openOverlay, close: function () { closeOverlay(false); } };
  if (window.document$ && window.document$.subscribe) window.document$.subscribe(init);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
