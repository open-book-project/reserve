/* Pustakālaya: web edition. Presentation mode: the ways in.
 *
 * Every chapter of every book can be shown as slides (assets/slides-deck.js makes them from the chapter's page).
 * This small file, loaded by every page, only adds the entry points and loads the deck when it is first used:
 *
 *   - a "Present" button in the header of a chapter page, in the reader's toolbar, and the key P;
 *   - "Present" on a book's page: from the chapter the reader has reached, or from the first chapter;
 *   - an address with ?slides=1 (?slides=12 starts at slide 12), #slides or #slides-12 opens the slides at once,
 *     so that a link to a presentation can be shared;
 *   - #slides-speaker-<id> is the speaker view, a second window opened from a presentation (key S).
 *
 * The deck script is precached with the other assets (sw.js), so presenting works offline for a kept book.
 */
(function () {
  "use strict";
  if (window.__bjpSlides) return;
  window.__bjpSlides = true;

  var SCRIPT = (document.currentScript && document.currentScript.src) || "";
  if (!SCRIPT) { var se = document.querySelector('script[src*="assets/slides.js"]'); SCRIPT = se ? se.src : ""; }
  var DECK_URL = SCRIPT ? SCRIPT.replace(/slides\.js(\?.*)?$/, "slides-deck.js") : "assets/slides-deck.js";
  var ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 4.5h19M4 4.5v10.2c0 .6.4 1 1 1h14c.6 0 1-.4 1-1V4.5M12 15.7v3.1M8.2 20.5l3.8-1.7 3.8 1.7"/><path d="M8 12.2l2.6-3 2.2 1.9 3.2-3.9"/></svg>';

  function sget(kind, k) { try { return window[kind].getItem(k); } catch (e) { return null; } }
  function sset(kind, k, v) { try { window[kind].setItem(k, v); } catch (e) { /* storage unavailable */ } }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; }
  function norm(s) { return String(s || "").replace(/[\s¶]+/g, " ").trim(); }

  /* the books' folders (the JSON list in the page head, as in reader.js) */
  var BOOKS = (function () {
    try { var e = document.getElementById("bjp-books"); return e ? JSON.parse(e.textContent) : []; } catch (x) { return []; }
  })();
  var ROOT = (function () { try { return new URL("../", SCRIPT || location.href).pathname; } catch (x) { return "/"; } })();
  function bookOf(path) {
    if (!path || path.indexOf(ROOT) !== 0) return null;
    var rel = path.slice(ROOT.length), best = null;
    for (var i = 0; i < BOOKS.length; i++) {
      var pre = BOOKS[i].path + "/";
      if (rel.indexOf(pre) === 0 && (!best || pre.length > best.path.length + 1)) best = BOOKS[i];
    }
    if (!best) return null;
    var rest = rel.slice(best.path.length + 1);
    if (rest === "" || rest === "index.html") return { book: best, page: "index" };
    return /^[^\/]+\.html$/.test(rest) ? { book: best, page: rest.replace(/\.html$/, "") } : null;
  }
  /* "chapter" (any page of a book but its first), "book" (the book's own page) or null */
  function pageKind() {
    var v = bookOf(location.pathname);
    if (!v || !document.querySelector("article.md-content__inner")) return null;
    return v.page === "index" ? "book" : "chapter";
  }

  /* ---------------------------------------------------------------- loading the deck */
  var loading = null;
  function load() {
    if (window.bjpSlidesDeck) return Promise.resolve(window.bjpSlidesDeck);
    if (loading) return loading;
    loading = new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = DECK_URL;
      s.async = true;
      s.onload = function () { if (window.bjpSlidesDeck) res(window.bjpSlidesDeck); else { loading = null; rej(new Error("deck")); } };
      s.onerror = function () { loading = null; rej(new Error("deck")); };
      document.head.appendChild(s);
    });
    return loading;
  }
  function present(opts) {
    opts = opts || {};
    if (window.bjpSlidesDeck && window.bjpSlidesDeck.isOpen()) return Promise.resolve();
    return load().then(function (D) { D.open(opts); }, function () {
      var t = el("div", "sl-toast", navigator.onLine === false ? "The slides are not available offline yet." : "The slides could not be opened.");
      t.setAttribute("role", "status");
      document.body.appendChild(t);
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2600);
    });
  }

  /* where the reader is: the first block of the chapter that is on the page shown, and the heading above it */
  function blockRef(kids, i) {
    var id = "";
    for (var k = i; k >= 0 && !id; k--) {
      var h = kids[k];
      if (/^H[1-6]$/.test(h.tagName) && h.id) id = h.id;
    }
    return { i: i, tag: kids[i].tagName, text: norm(kids[i].textContent).slice(0, 60), id: id };
  }
  function fromReader() {
    var R = window.bjpReader, S = R && R.state;
    if (!S || !S.open || !S.rec) return null;
    var flow = S.root && S.root.querySelector(".rd-flow"), at = null;
    if (flow && S.stride && S.page > 0) {
      var fr = flow.getBoundingClientRect(), start = S.page * S.stride, kids = flow.children;
      for (var i = 0; i < kids.length; i++) {
        var r = kids[i].getClientRects();
        if (!r.length) continue;
        if (r[r.length - 1].right - fr.left > start + 4) { at = blockRef(kids, i); break; }
      }
    }
    return { url: S.rec.url, html: S.rec.html, next: S.rec.next || "", prev: S.rec.prev || "", from: "reader", at: at, gesture: true };
  }
  function fromPage() {
    var art = document.querySelector("article.md-content__inner"), at = null;
    if (art && (window.scrollY || document.documentElement.scrollTop) > 60) {
      var kids = art.children;
      for (var i = 0; i < kids.length; i++) {
        var r = kids[i].getBoundingClientRect();
        if (r.height && r.bottom > 96) { at = blockRef(kids, i); break; }
      }
    }
    return { url: location.href.split("#")[0].split("?")[0], from: "page", at: at, gesture: true };
  }
  function presentHere() {
    var r = fromReader();
    present(r || fromPage());
  }

  /* ---------------------------------------------------------------- buttons */
  function startHref() {
    var v = bookOf(location.pathname), u = null, rec = null;
    try { rec = JSON.parse(sget("localStorage", "bjp.books") || "{}"); } catch (e) { rec = {}; }
    var read = document.querySelector(".pk-book-actions .pk-read, .pk-read");
    if (read && v && rec && rec[v.book.id]) u = new URL(read.getAttribute("href"), location.href);
    if (!u) {
      // the first numbered chapter ("Chapter 1: ..."), else the first page of the contents
      var links = document.querySelectorAll(".vol-contents a"), first = null;
      for (var i = 0; i < links.length; i++) {
        var h = links[i].getAttribute("href") || "";
        if (!h || /^index\.html/.test(h) || h.charAt(0) === "#" || h.indexOf("#") > 0) continue;
        if (!first) first = h;
        if (/^\S+\s+\d+\s*[:.]/.test(norm(links[i].textContent))) { first = h; break; }
      }
      if (first) u = new URL(first, location.href);
      else if (read) u = new URL(read.getAttribute("href"), location.href);
    }
    if (!u) return "";
    u.hash = "";
    u.search = "?slides=1";
    return u.href;
  }
  function bookButton() {
    var acts = document.querySelector(".pk-book-actions");
    if (!acts || acts.querySelector(".sl-bookbtn")) return;
    var a = el("a", "pk-btn pk-btn-quiet sl-bookbtn", ICON + "<span>Present</span>");
    a.setAttribute("href", startHref() || "#");
    a.setAttribute("aria-label", "Present: show this book as slides");
    a.title = "Show the book as slides, from the chapter you have reached or from the first chapter";
    a.addEventListener("click", function () { var h = startHref(); if (h) a.setAttribute("href", h); });
    var read = acts.querySelector(".pk-read");
    if (read) read.insertAdjacentElement("afterend", a); else acts.appendChild(a);
  }
  function headerButton(kind) {
    if (document.querySelector(".sl-hbtn")) return;
    var b = el("button", "rd-hbtn sl-hbtn", ICON + "<span>Present</span>");
    b.type = "button";
    b.setAttribute("aria-label", kind === "book" ? "Present: show this book as slides" : "Present: show this chapter as slides (P)");
    b.title = kind === "book" ? "Present the book as slides" : "Present this chapter as slides (P)";
    b.addEventListener("click", function () {
      if (pageKind() === "book") { var h = startHref(); if (h) location.href = h; }
      else presentHere();
    });
    var hdr = document.querySelector(".md-header__inner");
    var after = hdr && (hdr.querySelector(".rd-hbtn:not(.sl-hbtn)") || hdr.querySelector(".bjp-libbtn") || hdr.querySelector(".md-header__title"));
    if (after) after.insertAdjacentElement("afterend", b);
    else if (hdr) hdr.appendChild(b);
  }
  function readerButton() {
    var top = document.querySelector(".bjp-reader .rd-top");
    if (!top) return false;
    if (top.querySelector(".sl-rdbtn")) return true;
    var b = el("button", "rd-btn sl-rdbtn", ICON);
    b.type = "button";
    b.setAttribute("aria-label", "Present this chapter as slides (P)");
    b.title = "Present (P)";
    b.addEventListener("click", function () { present(fromReader()); });
    top.insertBefore(b, top.querySelector(".rd-setbtn"));
    return true;
  }
  function watchReader() {
    if (readerButton() || !window.MutationObserver) return;
    var mo = new MutationObserver(function () { if (readerButton()) mo.disconnect(); });
    mo.observe(document.body, { childList: true });
  }

  /* ---------------------------------------------------------------- addresses that open the slides */
  function flags() {
    var h = /^#slides(?:-(\d+)|-speaker-([\w-]+))?$/.exec(location.hash || "");
    if (h && h[2]) return { speaker: h[2] };
    var q = null;
    try { q = new URLSearchParams(location.search).get("slides"); } catch (e) { q = null; }
    if (q !== null) return { slide: parseInt(q, 10) || 1 };
    if (h) return { slide: parseInt(h[1], 10) || 1 };
    return null;
  }
  var FLAGS = flags();
  // the reader must not open over the slides on such a page (it would, after a tap on a cover or with "always read")
  if (FLAGS && pageKind() === "chapter") sset("sessionStorage", "bjp.reader.suppress", "1");

  var started = false;
  function init() {
    var kind = pageKind();
    if (kind) headerButton(kind);
    if (kind === "book") bookButton();
    watchReader();
    if (!started && FLAGS && kind === "chapter") {
      started = true;
      var url = location.href.split("#")[0].split("?")[0];
      if (FLAGS.speaker) present({ url: url, speaker: FLAGS.speaker });
      else present({ url: url, from: "link", slide: FLAGS.slide });
    }
  }

  /* P presents the chapter (on its page or in the reader). Caught first, on the window in the capture phase: the
     theme's own keyboard handling takes P to mean "previous page" */
  window.addEventListener("keydown", function (e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || (e.key !== "p" && e.key !== "P")) return;
    if (window.bjpSlidesDeck && window.bjpSlidesDeck.isOpen()) return;
    var a = document.activeElement, t = a && a.tagName;
    if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || (a && a.isContentEditable)) return;
    var R = window.bjpReader;
    if (R && R.state && R.state.open) {
      if (R.state.panel || document.querySelector(".viz-overlay")) return;
      e.preventDefault(); e.stopImmediatePropagation(); present(fromReader());
    } else if (pageKind() === "chapter" && !document.querySelector(".viz-overlay")) {
      e.preventDefault(); e.stopImmediatePropagation(); presentHere();
    }
  }, true);
  // the back button of a phone closes the slides first (registered before the reader's own listener)
  window.addEventListener("popstate", function (e) {
    if (window.bjpSlidesDeck && window.bjpSlidesDeck.onPop(e)) e.stopImmediatePropagation();
  }, true);

  window.bjpSlides = { open: present, here: presentHere, load: load, bookOf: bookOf, root: ROOT, books: BOOKS, icon: ICON };
  if (window.document$ && window.document$.subscribe) window.document$.subscribe(init);
  else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
