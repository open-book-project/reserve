/* Pustakālaya: web edition. Reading mode ("Read").
 *
 * A full-screen, paginated reader for the chapter pages. The text of the page is cut into pages with CSS
 * multi-column layout (one column = one page, the flow is moved sideways with a transform). Page turning is
 * by tap/click on the screen thirds, swipe, wheel and keys. At the end of a chapter the next turn loads the
 * next chapter into the same reader. Settings and the reading position are kept in localStorage.
 *
 * For the library on the home page (assets/app.js) it also records, for each book, the page last read and how
 * far through the whole book that is ("bjp.books": path, title, how far through the page, percent of the book,
 * time; from the reader or from scrolling a chapter page), the last page read of all ("bjp.reader.last") and
 * the pages of each volume that have been opened ("bjp.lib.seen"). The percentage is an estimate: the share of
 * the text of the chapters before the place, from the lengths in <book>/contents.json. A tap on a cover opens
 * the reader on its own (app.js sets "bjp.reader.open" and the cover's colours, "bjp.reader.cover", for the
 * quiet opening). Everything works without localStorage.
 *
 * Also: bookmarks ("bjp.marks") and highlights with notes ("bjp.hl"), per book; a search of the book's text (its
 * own search index, <book>/search.json, fetched when the search is first opened); a slider over the whole book
 * with a mark for each chapter; a full-screen view of figures (with zoom), tables and code; pop-ups for footnotes,
 * cross-references and citations; four page colours and four typefaces; keyboard shortcuts ("?" lists them).
 */
(function () {
  "use strict";
  if (window.__bjpReader) return;
  window.__bjpReader = true;

  /* ---------------------------------------------------------------- constants and helpers */
  var KEY_SET = "bjp.reader.settings", KEY_POS = "bjp.reader.pos", KEY_AUTO = "bjp.reader.auto",
      KEY_OPEN = "bjp.reader.open", KEY_SUP = "bjp.reader.suppress", KEY_LAST = "bjp.reader.last",
      KEY_GOTO = "bjp.reader.goto", KEY_SEEN = "bjp.lib.seen", KEY_TAB = "bjp.reader.toctab",
      KEY_BOOKS = "bjp.books", KEY_COVER = "bjp.reader.cover", KEY_MARKS = "bjp.marks", KEY_HL = "bjp.hl",
      KEY_SPEED = "bjp.reader.speed", KEY_HINT = "bjp.reader.hinted", KEY_PC = "bjp.reader.pc";
  var THEME_BG = { white: "#ffffff", sepia: "#f4ecd8", dark: "#161514", black: "#000000" };
  var THEMES = ["white", "sepia", "dark", "black"];
  /* "auto" (the default): white, or dark when the device is in dark mode */
  var THEME_CHOICES = ["auto"].concat(THEMES);
  var TURNS = ["slide", "fade", "none"];
  var SIZES = [14.5, 16, 17.5, 19, 20.5, 22.5, 25, 28];
  /* the typefaces: the site's serif (with Devanagari), a book face and a sans-serif face from Google Fonts (fetched
     when chosen, kept by the service worker for offline use), and the device's own interface face */
  var FONTS = {
    serif: { name: "Serif", css: "var(--bjp-serif)" },
    book: { name: "Book", css: '"Literata", var(--bjp-serif)', href: "https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,600;0,7..72,700;1,7..72,400&display=swap" },
    sans: { name: "Sans", css: '"Noto Sans", "Noto Sans Devanagari", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', href: "https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,400;0,600;0,700;1,400&family=Noto+Sans+Devanagari:wght@400;600&display=swap" },
    system: { name: "System", css: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Nirmala UI", sans-serif' }
  };
  var HL_COLORS = ["yellow", "green", "blue", "pink"];
  var HL_SEL = "p,li,dd,dt,td,th,figcaption,blockquote,h1,h2,h3,h4,h5,.admonition-title,.srcline,.translation";
  var LEADS = [1.45, 1.65, 1.9];
  var MARGINS = [0.025, 0.07, 0.13];
  var ANCH_SEL = "p,li,h1,h2,h3,h4,h5,h6,figure,.tbl,.tbl-caption,dt,dd,.admonition-title,pre,blockquote,tr,hr";
  var ICON = {
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    toc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>',
    fs: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    fsExit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
    book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7c-1.6-1.3-3.9-2-8-2v13c4.1 0 6.4.7 8 2 1.6-1.3 3.9-2 8-2V5c-4.1 0-6.4.7-8 2zM12 7v13"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7L4 12l5 5M4 12h11a5 5 0 015 5v1"/></svg>',
    lib: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V5h4v15M8 20V9h4v11M14 20L12.6 6l3.8-.8 3 14.2M3 20h18"/></svg>',
    chev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.2"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20"/></svg>',
    mark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.8h10v16.4l-5-3.6-5 3.6z"/></svg>',
    note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5M8.5 9h7M8.5 12.5h4"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4.8h4V7M7 7l1 13h8l1-13"/></svg>',
    expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
    go: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    kbd: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/></svg>',
    sp0: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 10.5h14M5 14h14M5 17.5h14"/></svg>',
    sp1: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14M5 10.5h14M5 15h14M5 19.5h14"/></svg>',
    sp2: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h14M5 10h14M5 15.5h14M5 21h14"/></svg>',
    mg0: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M5.5 8.5h13M5.5 12h13M5.5 15.5h13"/></svg>',
    mg1: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7.5 8.5h9M7.5 12h9M7.5 15.5h9"/></svg>',
    mg2: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9.5 8.5h5M9.5 12h5M9.5 15.5h5"/></svg>',
    jus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>',
    lft: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 10h11M4 14h16M4 18h9"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/></svg>',
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>',
    sunlow: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5"/><path d="M12 5.5v.5M12 18v.5M5.5 12h.5M18 12h.5"/></svg>',
    warm: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c2.5 3.2 5 6 5 9.5A5 5 0 017 12.5C7 9 9.5 6.2 12 3z"/></svg>',
    cool: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/></svg>',
    speak: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.5v13M15.5 5.5v13"/></svg>',
    stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/></svg>',
    look: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 015.5 4H18v13H5.5A1.5 1.5 0 004 18.5z"/><path d="M4 18.5A1.5 1.5 0 005.5 20H18v-3M8 8.5h6M8 11.5h4"/></svg>',
    ext: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/></svg>',
    moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 14.5A7.5 7.5 0 019.5 5a7.5 7.5 0 109.5 9.5z"/></svg>'
  };

  function store(kind) { try { return window[kind]; } catch (e) { return null; } }
  function sget(kind, k) { try { var s = store(kind); return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function sset(kind, k, v) { try { var s = store(kind); if (s) s.setItem(k, v); } catch (e) { /* storage unavailable */ } }
  function sdel(kind, k) { try { var s = store(kind); if (s) s.removeItem(k); } catch (e) { /* ignore */ } }
  function jget(k, d) { try { var v = sget("localStorage", k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function jset(k, v) { try { sset("localStorage", k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function debounce(fn, ms) { var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); }; }
  function raceTimeout(p, ms) {
    return new Promise(function (res) { var t = setTimeout(res, ms); Promise.resolve(p).then(function () { clearTimeout(t); res(); }, function () { clearTimeout(t); res(); }); });
  }
  function byId(root, id) { return root.querySelector('[id="' + String(id).replace(/(["\\])/g, "\\$1") + '"]'); }
  function reducedMotion() { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
  /* for searching titles: lower case, without the accents of Latin letters (Darśana = darsana) */
  function normq(s) { return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }
  /* the site name, from the page title ("Chapter - Site"), so the reader can set titles of its own */
  var SITE_NAME = (function () {
    var m = document.querySelector('meta[name="application-name"]'), t = document.title || "", i = t.lastIndexOf(" - ");
    return i >= 0 ? t.slice(i + 3) : (t || (m && m.content) || "");
  })();
  function stripSite(t) {
    t = t || "";
    return SITE_NAME && t.slice(-(SITE_NAME.length + 3)) === " - " + SITE_NAME ? t.slice(0, -(SITE_NAME.length + 3)) : t;
  }
  function isVolPath(p) { return !!volOf(p); }
  function isVolPage() { return isVolPath(location.pathname) && !!document.querySelector("article.md-content__inner"); }
  function pagePath(u) { var x = new URL(u, location.href); return x.pathname; }
  function pageUrl(u) { var x = new URL(u, location.href); return x.origin + x.pathname + x.search; }
  /* The books' folders come from library.yml, through a JSON list in the page head (id, path relative to the
     site root). "/…/vol16_vastu/chapter03_x.html" -> ["vol16_vastu", "chapter03_x"]; null outside the books. */
  var BOOKS = (function () {
    try { var e = document.getElementById("bjp-books"); return e ? JSON.parse(e.textContent) : null; } catch (x) { return null; }
  })();
  var BOOK_ROOT = (function () {
    var s = document.currentScript && document.currentScript.src;
    if (!s) { var e = document.querySelector('script[src*="assets/reader.js"]'); s = e && e.src; }
    try { return new URL("../", s || location.href).pathname; } catch (x) { return "/"; }
  })();
  function volOf(path) {
    path = path || "";
    if (BOOKS && BOOKS.length) {
      if (path.indexOf(BOOK_ROOT) !== 0) return null;
      var rel = path.slice(BOOK_ROOT.length), best = null;
      for (var i = 0; i < BOOKS.length; i++) {
        var pre = BOOKS[i].path + "/";
        if (rel.indexOf(pre) === 0 && (!best || pre.length > best.path.length + 1)) best = BOOKS[i];
      }
      if (!best) return null;
      var rest = rel.slice(best.path.length + 1);
      if (rest === "") return [best.id, "index"];
      return /^[^\/]+\.html$/.test(rest) ? [best.id, rest.replace(/\.html$/, "")] : null;
    }
    var m = /\/(vol\d\d_[^\/]+)\/([^\/]*?)(?:\.html)?$/.exec(path);
    return m ? [m[1], m[2] || "index"] : null;
  }

  /* ---------------------------------------------------------------- library records (home page) */
  function markSeen(path) {
    var v = volOf(path);
    if (!v || v[1] === "index") return;
    var all = jget(KEY_SEEN, {}) || {};
    var rec = all[v[0]] && typeof all[v[0]] === "object" ? all[v[0]] : { p: [] };
    if (!Array.isArray(rec.p)) rec.p = [];
    if (rec.p.indexOf(v[1]) < 0) rec.p.push(v[1]);
    rec.t = Date.now();
    all[v[0]] = rec;
    jset(KEY_SEEN, all);
  }
  function saveLast(path, title, f, mode) {
    var v = volOf(path);
    if (!v || !title) return;
    jset(KEY_LAST, { path: path, title: title, vol: v[0], f: Math.round(clamp(f, 0, 1) * 1000) / 1000, mode: mode, t: Date.now() });
  }
  /* the record of a book: where the reader stopped, and how far through the whole book that is */
  function saveBook(path, title, f, mode, pct) {
    var v = volOf(path);
    if (!v || !title) return;
    var all = jget(KEY_BOOKS, {}) || {};
    var rec = all[v[0]] && typeof all[v[0]] === "object" ? all[v[0]] : {};
    rec.path = path;
    rec.title = title;
    rec.f = Math.round(clamp(f, 0, 1) * 1000) / 1000;
    rec.mode = mode;
    if (typeof pct === "number") rec.pct = Math.round(clamp(pct, 0, 100) * 10) / 10;
    rec.t = Date.now();
    all[v[0]] = rec;
    jset(KEY_BOOKS, all);
  }
  /* Percent of the book at a place: each page of the book weighs what its text weighs (contents.json "w") */
  function bookModel(c) {
    if (c.__m) return c.__m;
    var units = {}, order = [], acc = 0;
    (c.groups || []).forEach(function (g) {
      g.items.forEach(function (it) {
        if (!units[it.f]) { units[it.f] = { w: Math.max(1, +it.w || 1), before: 0 }; order.push(it.f); }
      });
    });
    order.forEach(function (f) { units[f].before = acc; acc += units[f].w; });
    c.__m = { units: units, total: acc, last: order[order.length - 1], order: order };
    return c.__m;
  }
  function fileOfPath(path) {
    var f = (path || "").slice((path || "").lastIndexOf("/") + 1);
    return f === "" ? "index.html" : f;
  }
  function pctAt(m, path, frac) {
    var u = m && m.units[fileOfPath(path)];
    if (!u || !m.total) return null;
    return clamp((u.before + clamp(frac, 0, 1) * u.w) / m.total * 100, 0, 100);
  }
  function articleTitle() {
    var h = document.querySelector("article.md-content__inner h1");
    return h ? h.textContent.replace(/¶/g, "").trim() : stripSite(document.title);
  }
  /* reading a chapter page without the reader: the place is the scrolled fraction of the page, recorded
     only after the reader has scrolled it (not when a page merely opens or the browser restores a position) */
  var userInputAt = 0;
  function onUserInput() { userInputAt = Date.now(); }
  var onScrollSave = debounce(function () {
    if (S.open || Date.now() - userInputAt > 2500 || !isVolPage()) return;
    var v = volOf(location.pathname);
    if (!v || v[1] === "index") return;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    if (max <= 0 || window.scrollY < 300) return;
    var f = window.scrollY / max, title = articleTitle(), path = location.pathname;
    saveLast(path, title, f, "scroll");
    saveBook(path, title, f, "scroll");
    bookContents().then(function (c) {
      var pct = pctAt(bookModel(c), path, f);
      if (pct !== null) saveBook(path, title, f, "scroll", pct);
    }, function () { /* the contents are not available: the percentage stays as it was */ });
  }, 700);
  function watchScroll() {
    if (watchScroll.done) return;
    watchScroll.done = true;
    ["wheel", "touchmove", "keydown", "pointerdown"].forEach(function (t) { window.addEventListener(t, onUserInput, { passive: true, capture: true }); });
    window.addEventListener("scroll", onScrollSave, { passive: true });
  }

  /* ---------------------------------------------------------------- state */
  var S = {
    open: false, built: false, root: null, loading: false,
    url: "", path: "", origUrl: "", rec: null,
    n: 0, page: 0, pw: 0, ph: 0, gap: 32, stride: 0, spread: false, anchors: [],
    backStack: [], pushed: false, expectPop: false, afterPop: null,
    hideT: 0, overBar: false, p: null, lastDims: "", wheelAt: 0, hinted: false, prevFocus: null, inerted: [],
    model: null, modelBook: "", lang: "en", curtain: false
  };
  var cache = {};
  var settings = loadSettings();
  var $ = {}; // element handles

  function loadSettings() {
    var s = jget(KEY_SET, {}) || {};
    return {
      size: typeof s.size === "number" ? clamp(Math.round(s.size), 0, SIZES.length - 1) : null,
      spacing: typeof s.spacing === "number" ? clamp(Math.round(s.spacing), 0, 2) : 1,
      margin: typeof s.margin === "number" ? clamp(Math.round(s.margin), 0, 2) : 1,
      // Justified text by default, except on narrow phone screens where it leaves wide word gaps.
      justify: typeof s.justify === "boolean" ? s.justify : Math.min(window.innerWidth, window.screen ? window.screen.width : 9999) >= 600,
      theme: THEME_CHOICES.indexOf(s.theme) >= 0 ? s.theme : "auto",
      font: FONTS[s.font] ? s.font : "serif",
      night: s.night === true,                                                     // dark from 8 pm to 6 am
      bright: typeof s.bright === "number" ? clamp(s.bright, 0.35, 1) : 1,         // an overlay over the page, not the screen
      warm: typeof s.warm === "number" ? clamp(s.warm, 0, 1) : 0,
      turn: TURNS.indexOf(s.turn) >= 0 ? s.turn : "slide",
      info: /^(pages|ch|book)$/.test(s.info || "") ? s.info : "ch"                 // the footer: pages or minutes left
    };
  }
  /* the page colour on screen: the one chosen, or (auto) white or dark as the device is; "night" makes a light page dark
     between 8 pm and 6 am */
  function osDark() { return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches); }
  function isNight() { var h = new Date().getHours(); return h >= 20 || h < 6; }
  function effTheme() {
    var t = settings.theme === "auto" ? (osDark() ? "dark" : "white") : settings.theme;
    if (settings.night && isNight() && (t === "white" || t === "sepia")) t = "dark";
    return t;
  }
  /* a typeface from Google Fonts is fetched the first time it is chosen */
  function loadFont(key) {
    var f = FONTS[key];
    if (!f || !f.href || document.querySelector('link[data-rd-font="' + key + '"]')) return;
    var l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = f.href;
    l.setAttribute("data-rd-font", key);
    document.head.appendChild(l);
  }
  function saveSettings() { jset(KEY_SET, settings); }
  /* phones: 19 px (about 36 characters a line on a phone 390 px wide); 17.5 px on the smallest phones */
  function sizeIndex() {
    if (settings.size !== null) return settings.size;
    var m = Math.min(window.innerWidth, window.innerHeight);
    return m < 360 ? 2 : 3;
  }

  /* ---------------------------------------------------------------- entry points */
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html) e.innerHTML = html;
    return e;
  }

  function ensureEntry() {
    var on = isVolPage();
    document.documentElement.classList.toggle("rd-has-reader", on);
    if (!on) return;
    if (!document.querySelector(".rd-hbtn")) {
      var b = el("button", "rd-hbtn", ICON.book + "<span>Read</span>");
      b.type = "button";
      b.setAttribute("aria-label", "Read: open the reading mode");
      b.title = "Read (reading mode)";
      b.addEventListener("click", function () { open(); });
      var hdr = document.querySelector(".md-header__inner");
      var title = hdr && (hdr.querySelector(".bjp-libbtn") || hdr.querySelector(".md-header__title"));
      if (title) title.insertAdjacentElement("afterend", b);
      else if (hdr) hdr.appendChild(b);
    }
    if (!document.querySelector(".rd-fab")) {
      var f = el("button", "rd-fab", ICON.book + "<span>Read</span>");
      f.type = "button";
      f.setAttribute("aria-label", "Read: open the reading mode");
      f.addEventListener("click", function () { open(); });
      document.body.appendChild(f);
    }
  }

  function wireHome() {
    var cb = document.getElementById("rd-auto-toggle");
    if (!cb || cb.__bjp) return;
    cb.__bjp = true;
    cb.checked = sget("localStorage", KEY_AUTO) === "1";
    cb.addEventListener("change", function () {
      if (cb.checked) sset("localStorage", KEY_AUTO, "1"); else sdel("localStorage", KEY_AUTO);
    });
  }

  function init() {
    wireHome();
    ensureEntry();
    watchScroll();
    if (!S.open && isVolPage()) markSeen(location.pathname);
    if (!(sget("sessionStorage", KEY_OPEN) === "1" && isVolPage())) endBoot();
    if (S.open || !isVolPage()) return;
    if (sget("sessionStorage", KEY_SUP) === "1") { sdel("sessionStorage", KEY_SUP); return; }
    if (sget("sessionStorage", KEY_OPEN) === "1" || sget("localStorage", KEY_AUTO) === "1") open({ auto: true });
  }

  /* A book opened from its cover: the page is kept blank in the cover's colour until the reader is up (the class is
     set by a script in the page head; this lifts it). */
  function endBoot() {
    document.documentElement.classList.remove("bjp-booting");
    document.documentElement.style.background = "";
  }

  /* ---------------------------------------------------------------- building the reader */
  function build() {
    if (S.built) return;
    S.built = true;
    var root = el("div", "bjp-reader");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Reading mode");
    root.setAttribute("lang", "en");
    root.hidden = true;
    root.innerHTML =
      '<div class="rd-stage"><div class="rd-view"><div class="rd-flow md-typeset" lang="en" tabindex="-1" aria-label="Chapter text"></div></div>' +
        '<span class="rd-ribbon" aria-hidden="true" hidden></span></div>' +
      '<div class="rd-top rd-bar">' +
        '<button type="button" class="rd-btn rd-close" aria-label="Close the reader (Esc)" title="Close (Esc)">' + ICON.close + '</button>' +
        '<a class="rd-btn rd-libbtn" href="' + libraryUrl() + '" aria-label="Library: leave the reader and show all books" title="Library">' + ICON.lib + '<span>Library</span></a>' +
        '<div class="rd-title"></div>' +
        '<button type="button" class="rd-btn rd-findbtn" aria-label="Search this book (/)" aria-haspopup="dialog" aria-expanded="false" title="Search (/)">' + ICON.search + '</button>' +
        '<button type="button" class="rd-btn rd-markbtn" aria-label="Bookmark this page (B)" aria-pressed="false" title="Bookmark (B)">' + ICON.mark + '</button>' +
        '<button type="button" class="rd-btn rd-tocbtn" aria-label="Contents, bookmarks and notes (C)" aria-haspopup="dialog" aria-expanded="false" title="Contents (C)">' + ICON.toc + '</button>' +
        '<button type="button" class="rd-btn rd-setbtn" aria-label="Reading settings (A)" aria-haspopup="dialog" aria-expanded="false" title="Settings (A)"><span class="rd-aa" aria-hidden="true">A<small>a</small></span></button>' +
        '<button type="button" class="rd-btn rd-morebtn" aria-label="More: search, read aloud, present, bookmarks, full screen" aria-haspopup="dialog" aria-expanded="false" title="More">' + ICON.more + '</button>' +
      '</div>' +
      '<div class="rd-bot rd-bar">' +
        '<div class="rd-scrub"><div class="rd-ticks" aria-hidden="true"></div>' +
          '<input type="range" class="rd-range" min="0" max="1000" step="1" value="0" aria-label="Position in the book">' +
          '<output class="rd-tip" aria-hidden="true" hidden><b class="rd-tip-t"></b><span class="rd-tip-x"></span><span class="rd-tip-p"></span></output></div>' +
        '<div class="rd-botline"><span class="rd-botch"></span><span class="rd-botpct"></span></div>' +
      '</div>' +
      '<div class="rd-foot rd-bar"><div class="rd-fline"><span class="rd-ftitle"></span>' +
        '<span class="rd-pageno" role="status" aria-live="polite"></span><button type="button" class="rd-fpct" title="Pages or minutes left"></button></div>' +
        '<div class="rd-progress" role="progressbar" aria-label="Progress in the book" aria-valuemin="0" aria-valuemax="100"><i></i></div></div>' +
      '<button type="button" class="rd-back" hidden>' + ICON.back + '<span>Back</span></button>' +
      '<div class="rd-panel rd-settings" role="dialog" aria-label="Reading settings" hidden>' +
        '<div class="rd-sheet-grip" aria-hidden="true"></div>' +
        '<div class="rd-themes" role="radiogroup" aria-label="Page colour">' + THEME_CHOICES.map(function (t) {
          return '<button type="button" role="radio" aria-checked="false" data-k="theme" data-v="' + t + '" class="rd-th rd-th-' + t + '"' +
            (t === "auto" ? ' title="White, or dark when the device is in dark mode"' : "") + '><span class="rd-th-dot">Aa</span><span class="rd-th-lab">' +
            t.charAt(0).toUpperCase() + t.slice(1) + "</span></button>";
        }).join("") + '</div>' +
        '<div class="rd-fonts" role="radiogroup" aria-label="Typeface">' + Object.keys(FONTS).map(function (k) {
          return '<button type="button" role="radio" aria-checked="false" data-k="font" data-v="' + k + '" class="rd-fo"><span class="rd-fo-aa" style="font-family:' + FONTS[k].css.replace(/"/g, "&quot;") + '">Aa</span><span class="rd-fo-lab">' + FONTS[k].name + "</span></button>";
        }).join("") + '</div>' +
        '<div class="rd-row"><span class="rd-lab" id="rd-l-size">Size</span><div class="rd-size" role="group" aria-labelledby="rd-l-size">' +
          '<button type="button" data-act="smaller" aria-label="Smaller text (-)"><span style="font-size:13px">A</span></button>' +
          '<div class="rd-dots" aria-hidden="true"></div>' +
          '<button type="button" data-act="larger" aria-label="Larger text (+)"><span style="font-size:20px">A</span></button></div></div>' +
        '<div class="rd-row rd-slide"><label class="rd-lab" for="rd-bright">Light</label><span class="rd-sl">' + ICON.sunlow +
          '<input type="range" id="rd-bright" class="rd-bright" min="35" max="100" step="1">' + ICON.sun + '</span></div>' +
        '<div class="rd-row rd-slide"><label class="rd-lab" for="rd-warm">Warmth</label><span class="rd-sl">' + ICON.cool +
          '<input type="range" id="rd-warm" class="rd-warmr" min="0" max="100" step="1">' + ICON.warm + '</span></div>' +
        seg("night", "Night", [["0", "Off", "Night colours off"], ["1", ICON.moon + "<span>8 pm\u20136 am</span>", "A dark page from 8 pm to 6 am"]]) +
        seg("spacing", "Lines", [["0", ICON.sp0, "Compact"], ["1", ICON.sp1, "Normal"], ["2", ICON.sp2, "Relaxed"]]) +
        seg("margin", "Margins", [["0", ICON.mg0, "Narrow"], ["1", ICON.mg1, "Medium"], ["2", ICON.mg2, "Wide"]]) +
        seg("justify", "Align", [["1", ICON.jus, "Justified"], ["0", ICON.lft, "Left"]]) +
        seg("turn", "Turn", [["slide", "Slide", "Pages slide"], ["fade", "Fade", "Pages fade"], ["none", "None", "No animation"]]) +
        '<p class="rd-set-foot"><button type="button" class="rd-keys">' + ICON.kbd + '<span>Keyboard shortcuts</span></button></p>' +
      '</div>' +
      '<div class="rd-panel rd-toc" role="dialog" aria-label="Contents, bookmarks and notes" hidden>' +
        '<div class="rd-sheet-grip" aria-hidden="true"></div>' +
        '<div class="rd-tabs" role="tablist" aria-label="Contents, bookmarks and notes">' +
          '<button type="button" role="tab" id="rd-tab-bk" class="rd-tab" data-tab="bk" aria-controls="rd-tp-bk" aria-selected="true">Contents</button>' +
          '<button type="button" role="tab" id="rd-tab-mk" class="rd-tab" data-tab="mk" aria-controls="rd-tp-mk" aria-selected="false" tabindex="-1">Bookmarks</button>' +
          '<button type="button" role="tab" id="rd-tab-hl" class="rd-tab" data-tab="hl" aria-controls="rd-tp-hl" aria-selected="false" tabindex="-1">Notes</button>' +
        '</div>' +
        '<div class="rd-goto"><label class="rd-sr" for="rd-goto-in">Go to a chapter or section</label>' +
          '<input id="rd-goto-in" class="rd-goto-in" type="search" placeholder="Go to a chapter or section" autocomplete="off" spellcheck="false" enterkeyhint="go" aria-controls="rd-goto-res"></div>' +
        '<div class="rd-tabpanels">' +
          '<div role="tabpanel" id="rd-tp-bk" class="rd-tp" aria-labelledby="rd-tab-bk"><div class="rd-book-list" aria-live="polite"></div><ul class="rd-toc-list" hidden></ul></div>' +
          '<div role="tabpanel" id="rd-tp-mk" class="rd-tp" aria-labelledby="rd-tab-mk" hidden><div class="rd-mk-list"></div></div>' +
          '<div role="tabpanel" id="rd-tp-hl" class="rd-tp" aria-labelledby="rd-tab-hl" hidden><div class="rd-hl-list"></div></div>' +
        '</div>' +
        '<div id="rd-goto-res" class="rd-goto-res" role="region" aria-label="Chapters and sections that match" aria-live="polite" hidden></div>' +
        '<div class="rd-panel-foot"><p class="rd-gen"></p><a class="rd-about" href="#" aria-label="About this book: its page with the full contents and offline reading">' + ICON.info + '<span>About this book</span></a></div>' +
      '</div>' +
      '<div class="rd-panel rd-find" role="dialog" aria-label="Search this book" hidden>' +
        '<div class="rd-sheet-grip" aria-hidden="true"></div>' +
        '<div class="rd-find-head"><label class="rd-sr" for="rd-find-in">Search the text of this book</label>' +
          '<input id="rd-find-in" class="rd-goto-in rd-find-in" type="search" placeholder="Search this book" autocomplete="off" spellcheck="false" enterkeyhint="search"></div>' +
        '<div class="rd-find-res" aria-live="polite"></div>' +
      '</div>' +
      '<div class="rd-panel rd-more" role="dialog" aria-label="More" hidden>' +
        '<div class="rd-sheet-grip" aria-hidden="true"></div>' +
        '<div class="rd-mgrid">' +
          '<button type="button" class="rd-mi rd-mi-find" data-mi="find">' + ICON.search + '<span>Search</span></button>' +
          '<button type="button" class="rd-mi rd-mi-speak" data-mi="speak">' + ICON.speak + '<span>Read aloud</span></button>' +
          '<button type="button" class="rd-mi" data-mi="marks">' + ICON.mark + '<span>Bookmarks</span></button>' +
          '<button type="button" class="rd-mi" data-mi="notes">' + ICON.note + '<span>Notes</span></button>' +
          '<button type="button" class="rd-mi rd-fsbtn" data-mi="fs" hidden>' + ICON.fs + '<span>Full screen</span></button>' +
          '<a class="rd-mi rd-mi-lib" href="' + libraryUrl() + '">' + ICON.lib + '<span>Library</span></a>' +
          '<a class="rd-mi rd-mi-about" href="#">' + ICON.info + '<span>About this book</span></a>' +
          '<button type="button" class="rd-mi rd-mi-keys" data-mi="keys">' + ICON.kbd + '<span>Shortcuts</span></button>' +
        '</div>' +
      '</div>' +
      '<div class="rd-panel rd-look" role="dialog" aria-label="Look up" hidden>' +
        '<div class="rd-sheet-grip" aria-hidden="true"></div><div class="rd-look-body" aria-live="polite"></div>' +
      '</div>' +
      '<div class="rd-panel rd-help" role="dialog" aria-label="Keyboard shortcuts" hidden>' +
        '<h2>Keyboard shortcuts</h2><dl class="rd-keylist">' +
          [["\u2192  Space  PgDn", "Next page"], ["\u2190  Shift+Space  PgUp", "Previous page"], ["Home  End", "Start or end of the chapter"],
           ["]  [", "Next or previous chapter"], ["C", "Contents, bookmarks and notes"], ["A", "Reading settings"], ["/", "Search this book"],
           ["B", "Bookmark this page"], ["+  \u2212", "Larger or smaller text"], ["T", "Next page colour"], ["F", "Full screen"], ["Esc", "Close a panel, or the reader"]].map(function (r) {
            return "<dt>" + r[0].split("  ").map(function (k) { return "<kbd>" + k + "</kbd>"; }).join(" ") + "</dt><dd>" + r[1] + "</dd>";
          }).join("") + '</dl>' +
      '</div>' +
      '<div class="rd-selbar" role="toolbar" aria-label="Highlight the selected text" hidden>' +
        '<button type="button" class="rd-selbtn rd-sel-look" data-act="look" aria-label="Look up this word" title="Look up">' + ICON.look + '<span>Look up</span></button>' +
        HL_COLORS.map(function (c) { return '<button type="button" class="rd-hlc rd-hlc-' + c + '" data-hl="' + c + '" aria-label="Highlight in ' + c + '" title="Highlight"></button>'; }).join("") +
        '<span class="rd-selsep" aria-hidden="true"></span>' +
        '<button type="button" class="rd-selbtn" data-act="note" aria-label="Add a note" title="Note">' + ICON.note + '</button>' +
        '<button type="button" class="rd-selbtn" data-act="copy" aria-label="Copy" title="Copy">' + ICON.copy + '</button>' +
      '</div>' +
      '<div class="rd-pop md-typeset" role="dialog" aria-label="Note" hidden></div>' +
      '<div class="rd-zoom" role="dialog" aria-modal="true" aria-label="Full-screen view" hidden>' +
        '<div class="rd-zoom-stage"></div><div class="rd-zoom-cap"></div>' +
        '<div class="rd-zoom-bar"><button type="button" class="rd-btn" data-z="out" aria-label="Zoom out">' + ICON.minus + '</button>' +
          '<button type="button" class="rd-btn" data-z="in" aria-label="Zoom in">' + ICON.plus + '</button>' +
          '<button type="button" class="rd-btn" data-z="close" aria-label="Close the full-screen view (Esc)">' + ICON.close + '</button></div>' +
      '</div>' +
      '<div class="rd-shade" aria-hidden="true"><i class="rd-dim"></i><i class="rd-warm"></i></div>' +
      '<div class="rd-tts" role="toolbar" aria-label="Read aloud" hidden>' +
        '<button type="button" class="rd-btn" data-tts="toggle" aria-label="Pause">' + ICON.pause + '</button>' +
        '<span class="rd-tts-lab" aria-live="polite">Reading aloud</span>' +
        '<button type="button" class="rd-btn rd-tts-rate" data-tts="rate" aria-label="Reading speed">1\u00d7</button>' +
        '<button type="button" class="rd-btn" data-tts="stop" aria-label="Stop reading aloud">' + ICON.stop + '</button>' +
      '</div>' +
      '<div class="rd-hint" aria-hidden="true" hidden><div class="rd-hint-z"><span><b>\u2039 Back</b></span><span><b>Menus</b></span><span><b>Next \u203a</b></span></div>' +
        '<p>Tap the middle for menus, swipe to turn pages</p></div>' +
      '<div class="rd-loading" role="status"><div class="rd-skel" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>' +
        '<span class="rd-sr">Loading</span><b class="rd-lbar" aria-hidden="true"></b></div>' +
      '<div class="rd-curtain" aria-hidden="true" hidden><span></span></div>';
    document.body.appendChild(root);
    S.root = root;
    $.stage = root.querySelector(".rd-stage");
    $.view = root.querySelector(".rd-view");
    $.flow = root.querySelector(".rd-flow");
    $.top = root.querySelector(".rd-top");
    $.title = root.querySelector(".rd-title");
    $.pageno = root.querySelector(".rd-pageno");
    $.prog = root.querySelector(".rd-progress i");
    $.back = root.querySelector(".rd-back");
    $.set = root.querySelector(".rd-settings");
    $.toc = root.querySelector(".rd-toc");
    $.tocList = root.querySelector(".rd-toc-list");
    $.bookList = root.querySelector(".rd-book-list");
    $.lib = root.querySelector(".rd-libbtn");
    $.ftitle = root.querySelector(".rd-ftitle");
    $.fpct = root.querySelector(".rd-fpct");
    $.progBar = root.querySelector(".rd-progress");
    $.about = root.querySelector(".rd-about");
    $.goIn = root.querySelector(".rd-goto-in");
    $.goRes = root.querySelector(".rd-goto-res");
    $.curtain = root.querySelector(".rd-curtain");
    $.pop = root.querySelector(".rd-pop");
    $.loading = root.querySelector(".rd-loading");
    $.fs = root.querySelector(".rd-fsbtn");
    $.dots = root.querySelector(".rd-dots");
    $.find = root.querySelector(".rd-find");
    $.findIn = root.querySelector(".rd-find-in");
    $.findRes = root.querySelector(".rd-find-res");
    $.help = root.querySelector(".rd-help");
    $.mark = root.querySelector(".rd-markbtn");
    $.ribbon = root.querySelector(".rd-ribbon");
    $.mkList = root.querySelector(".rd-mk-list");
    $.hlList = root.querySelector(".rd-hl-list");
    $.selbar = root.querySelector(".rd-selbar");
    $.range = root.querySelector(".rd-range");
    $.ticks = root.querySelector(".rd-ticks");
    $.tip = root.querySelector(".rd-tip");
    $.botch = root.querySelector(".rd-botch");
    $.botpct = root.querySelector(".rd-botpct");
    $.bot = root.querySelector(".rd-bot");
    $.zoom = root.querySelector(".rd-zoom");
    $.more = root.querySelector(".rd-more");
    $.look = root.querySelector(".rd-look");
    $.lookBody = root.querySelector(".rd-look-body");
    $.tts = root.querySelector(".rd-tts");
    $.hint = root.querySelector(".rd-hint");
    $.dim = root.querySelector(".rd-dim");
    $.warm = root.querySelector(".rd-warm");
    $.finfo = root.querySelector(".rd-fpct");
    $.bright = root.querySelector(".rd-bright");
    $.warmr = root.querySelector(".rd-warmr");
    $.tipT = root.querySelector(".rd-tip-t");
    $.tipX = root.querySelector(".rd-tip-x");
    $.tipP = root.querySelector(".rd-tip-p");
    $.dots.innerHTML = SIZES.map(function () { return "<i></i>"; }).join("");
    renderActions();

    root.querySelector(".rd-close").addEventListener("click", function () { close(); });
    root.querySelector(".rd-tocbtn").addEventListener("click", function () { togglePanel("toc"); });
    root.querySelector(".rd-setbtn").addEventListener("click", function () { togglePanel("set"); });
    root.querySelector(".rd-findbtn").addEventListener("click", function () { togglePanel("find"); });
    root.querySelector(".rd-keys").addEventListener("click", function () { togglePanel("help"); });
    root.querySelector(".rd-morebtn").addEventListener("click", function () { togglePanel("more"); });
    $.more.addEventListener("click", onMoreClick);
    $.look.addEventListener("click", onLookClick);
    $.tts.addEventListener("click", onTtsClick);
    $.finfo.addEventListener("click", cycleInfo);
    $.bright.addEventListener("input", onShadeInput);
    $.warmr.addEventListener("input", onShadeInput);
    $.bright.addEventListener("change", saveSettings);
    $.warmr.addEventListener("change", saveSettings);
    if (window.matchMedia) {
      var mq = window.matchMedia("(prefers-color-scheme: dark)");
      var onScheme = function () { if (settings.theme === "auto") applySettingsUI(); };
      if (mq.addEventListener) mq.addEventListener("change", onScheme); else if (mq.addListener) mq.addListener(onScheme);
    }
    // the night colours begin and end on time while a book is open
    setInterval(function () { if (S.open && settings.night) applySettingsUI(); }, 60000);
    $.flow.addEventListener("scroll", onXScroll, true);
    $.mark.addEventListener("click", toggleBookmark);
    $.findIn.addEventListener("input", debounce(onFindInput, 220));
    $.findIn.addEventListener("keydown", onFindKey);
    $.findRes.addEventListener("click", onFindClick);
    $.mkList.addEventListener("click", onMarkListClick);
    $.hlList.addEventListener("click", onHlListClick);
    $.selbar.addEventListener("pointerdown", function (e) { e.preventDefault(); });
    $.selbar.addEventListener("click", onSelbarClick);
    document.addEventListener("selectionchange", debounce(onSelection, 180));
    $.range.addEventListener("input", onScrubInput);
    $.range.addEventListener("change", onScrubChange);
    $.range.addEventListener("pointerdown", function () { showChrome(true); });
    $.range.addEventListener("blur", function () { $.tip.hidden = true; armHide(); });
    $.bot.addEventListener("pointerenter", function () { S.overBar = true; });
    $.bot.addEventListener("pointerleave", function () { S.overBar = false; armHide(); });
    $.bot.addEventListener("focusin", function () { showChrome(true); });
    $.bot.addEventListener("focusout", function () { armHide(); });
    wireZoom();
    $.fs.addEventListener("click", toggleFullscreen);
    $.back.addEventListener("click", goBack);
    $.set.addEventListener("click", onSettingsClick);
    $.tocList.addEventListener("click", onTocClick);
    $.bookList.addEventListener("click", onBookClick);
    $.toc.querySelector(".rd-tabs").addEventListener("click", function (e) {
      var t = e.target.closest("button[data-tab]");
      if (t) showTab(t.getAttribute("data-tab"), true);
    });
    $.lib.addEventListener("click", onLibraryClick);
    $.about.addEventListener("click", onAboutClick);
    $.more.querySelector(".rd-mi-lib").addEventListener("click", onLibraryClick);
    $.more.querySelector(".rd-mi-about").addEventListener("click", function (e) { e.preventDefault(); $.about.click(); });
    $.goIn.addEventListener("input", onGotoInput);
    $.goIn.addEventListener("keydown", onGotoKey);
    $.goRes.addEventListener("keydown", onGotoKey);
    $.goRes.addEventListener("click", onGotoClick);
    $.flow.addEventListener("click", onLinkClick);
    $.flow.addEventListener("click", function (e) {
      var xb = e.target.closest && e.target.closest(".rd-expand");
      if (xb) { e.preventDefault(); openZoomDoc(xb.parentNode); }
    });
    $.pop.addEventListener("click", onPopClick);
    $.top.addEventListener("pointerenter", function () { S.overBar = true; });
    $.top.addEventListener("pointerleave", function () { S.overBar = false; armHide(); });
    $.top.addEventListener("focusin", function () { showChrome(true); });
    $.top.addEventListener("focusout", function () { armHide(); });
    // pages
    var st = $.stage;
    st.addEventListener("pointerdown", onPointerDown);
    st.addEventListener("pointermove", onPointerMove);
    st.addEventListener("pointerup", onPointerUp);
    st.addEventListener("pointercancel", onPointerCancel);
    st.addEventListener("wheel", onWheel, { passive: false });
    // a focused link on another page must not scroll the clipped view
    $.view.addEventListener("scroll", function () { $.view.scrollLeft = 0; $.view.scrollTop = 0; });
    $.flow.addEventListener("focusin", function (e) {
      var t = e.target;
      if (t && t !== $.flow && S.stride) {
        var p = pageOfEl(t);
        if (p !== null && !isOnPage(p)) goto(p, false);
      }
    });
    $.flow.addEventListener("load", debounce(function () { if (S.open && !S.loading) relayout(); }, 250), true);
    window.addEventListener("resize", debounce(function () { if (S.open) relayout(true); }, 150));
    window.addEventListener("orientationchange", debounce(function () { if (S.open) relayout(true); }, 250));
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("keydown", function () { S.kbd = true; }, true);
    document.addEventListener("pointerdown", function () { S.kbd = false; }, true);
    window.addEventListener("popstate", onPopState, true);
    window.addEventListener("pagehide", function () { if (S.open) savePos(); });
    document.addEventListener("visibilitychange", function () { if (document.hidden && S.open) savePos(); });
    if (document.fonts && document.fonts.addEventListener) {
      document.fonts.addEventListener("loadingdone", debounce(function () { if (S.open && !S.loading) relayout(true); }, 300));
    }
    // an app on the iPad home screen is already full screen (and WebKit's own full-screen view would cover the reader's controls)
    var fsOk = !!((root.requestFullscreen || root.webkitRequestFullscreen) && (document.fullscreenEnabled || document.webkitFullscreenEnabled)) &&
      navigator.standalone !== true;
    $.fs.hidden = !fsOk;
    applySettingsUI();
  }

  function seg(key, label, opts) {
    var id = "rd-l-" + key;
    var b = opts.map(function (o) {
      return '<button type="button" role="radio" aria-checked="false" data-k="' + key + '" data-v="' + o[0] + '" aria-label="' + o[2] + '" title="' + o[2] + '">' + o[1] + "</button>";
    }).join("");
    return '<div class="rd-row"><span class="rd-lab" id="' + id + '">' + label + '</span><div class="rd-seg" role="radiogroup" aria-labelledby="' + id + '">' + b + "</div></div>";
  }

  /* ---------------------------------------------------------------- opening and closing */
  function navLink(doc, which, base) {
    var a = doc.querySelector(".md-footer__link--" + which);
    var h = a && a.getAttribute("href");
    if (!h) return null;
    try {
      // the navigation of the site runs on into the next book at the end of one: the reader stays in the book
      var u = new URL(h, base), a = volOf(u.pathname), b = volOf(pagePath(base));
      return a && b && a[0] === b[0] ? u.origin + u.pathname + u.search : null;
    } catch (e) { return null; }
  }

  function fixUrls(root, base) {
    var i, e, list = root.querySelectorAll("[href]");
    for (i = 0; i < list.length; i++) {
      e = list[i];
      var h = e.getAttribute("href");
      if (!h || h.charAt(0) === "#") continue;
      try { e.setAttribute("href", new URL(h, base).href); } catch (x) { /* leave */ }
    }
    list = root.querySelectorAll("[src]");
    for (i = 0; i < list.length; i++) {
      e = list[i];
      try { e.setAttribute("src", new URL(e.getAttribute("src"), base).href); } catch (x) { /* leave */ }
    }
  }

  function recFromDocument(doc, url, live) {
    var art = doc.querySelector("article.md-content__inner");
    if (!art) return null;
    var c = live ? art.cloneNode(true) : art;
    fixUrls(c, url);
    return {
      url: pageUrl(url),
      html: c.innerHTML,
      title: stripSite(doc.title),
      prev: navLink(doc, "prev", url),
      next: navLink(doc, "next", url)
    };
  }

  /* a chapter of a linked book arrives as an empty shell: assets/remote.js fetches its text from the source and fills it */
  function remoteFill(rec) { return window.pkRemote ? window.pkRemote.fillRec(rec) : Promise.resolve(rec); }

  function fetchPage(url) {
    url = pageUrl(url);
    if (cache[url]) return Promise.resolve(cache[url]);
    return fetch(url, { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) throw new Error("http " + r.status);
      return r.text();
    }).then(function (t) {
      var d = new DOMParser().parseFromString(t, "text/html");
      var rec = recFromDocument(d, url, false);
      if (!rec) throw new Error("no article");
      return remoteFill(rec);
    }).then(function (rec) {
      if (!rec.remoteError) cache[url] = rec;
      return rec;
    });
  }

  function open(opts) {
    opts = opts || {};
    if (S.open || !isVolPage()) return;
    build();
    var rec = recFromDocument(document, location.href, true);
    if (!rec) return;
    if (!rec.remoteError) cache[rec.url] = rec;
    S.open = true;
    S.origUrl = pageUrl(location.href);
    S.backStack = [];
    S.prevFocus = document.activeElement;
    document.documentElement.classList.add("bjp-reading");
    inertOthers(true);
    S.root.hidden = false;
    $.loading.hidden = false;
    sset("sessionStorage", KEY_OPEN, "1");
    // one history entry, so that the back button of a phone closes the reader
    try {
      if (history.state && history.state.bjpReader) { S.pushed = false; }
      else { history.pushState({ bjpReader: 1 }, "", location.href); S.pushed = true; }
    } catch (e) { S.pushed = false; }
    var hash = location.hash && location.hash.length > 1 ? location.hash : "";
    var where = hash ? { hash: hash } : "saved";
    var go = null;
    try { go = JSON.parse(sget("sessionStorage", KEY_GOTO) || "null"); } catch (e) { go = null; }
    sdel("sessionStorage", KEY_GOTO);
    if (!hash && go && go.path === pagePath(location.href) && typeof go.f === "number") where = { anchor: { i: null, n: 0, f: go.f } };
    setThemeColor(true);
    showCurtain();
    // the cover gives way after 1.5 s at most, even while the page is still being prepared (a slow phone or network)
    setTimeout(liftCurtain, 1500);
    endBoot();
    remoteFill(rec).then(function (r) { return mount(r, where, false); }).then(function () {
      finishOpen();
    });
  }

  /* the opening from a cover: the cover's colour and title fill the screen, then give way to the page */
  function showCurtain() {
    var cov = null;
    try { cov = JSON.parse(sget("sessionStorage", KEY_COVER) || "null"); } catch (e) { cov = null; }
    sdel("sessionStorage", KEY_COVER);
    S.curtain = false;
    if (!cov || !cov.bg || reducedMotion()) { $.curtain.hidden = true; return; }
    $.curtain.className = "rd-curtain";
    $.curtain.style.background = cov.bg;
    $.curtain.style.color = cov.fg || "#fff";
    var t = $.curtain.querySelector("span");
    t.textContent = cov.title || "";
    if (cov.lang) t.setAttribute("lang", cov.lang); else t.removeAttribute("lang");
    $.curtain.hidden = false;
    S.curtain = true;
    S.curtainAt = Date.now();
  }
  function liftCurtain() {
    if (!S.curtain) return;
    S.curtain = false;
    var c = $.curtain, wait = Math.max(0, 150 - (Date.now() - (S.curtainAt || 0)));
    setTimeout(function () {
      c.classList.add("lift");
      setTimeout(function () { c.hidden = true; c.className = "rd-curtain"; }, 300);
    }, wait);
  }

  function finishOpen() {
    $.loading.hidden = true;
    liftCurtain();
    try { $.flow.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    firstHint();
    runQueued();
  }

  function close(opts) {
    opts = opts || {};
    if (!S.open) return;
    savePos();
    S.open = false;
    clearTimeout(S.hideT);
    ttsStop();
    mathToken++;
    closePanels();
    closePop();
    closeZoom();
    hideSelbar();
    S.root.classList.remove("rd-chrome-on");
    S.root.hidden = true;
    document.documentElement.classList.remove("bjp-reading");
    setThemeColor(false);
    inertOthers(false);
    sdel("sessionStorage", KEY_OPEN);
    try { document.dispatchEvent(new Event("bjp:reader-close")); } catch (e) { /* the page under the reader is typeset (mathjax.js) */ }
    if (fsElement()) { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) { /* ignore */ } }
    var changed = S.url !== S.origUrl;
    if (S.prevFocus && S.prevFocus.focus && !changed) { try { S.prevFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    if (opts.fromPop) {
      S.pushed = false;
      if (changed) { sset("sessionStorage", KEY_SUP, "1"); location.replace(S.url); }
      return;
    }
    if (S.pushed) {
      S.pushed = false;
      S.expectPop = true;
      S.afterPop = changed ? S.url : null;
      try { history.back(); } catch (e) { S.expectPop = false; }
    } else if (changed) {
      sset("sessionStorage", KEY_SUP, "1");
      location.replace(S.url);
    }
  }

  function onPopState(e) {
    if (S.expectPop) {
      S.expectPop = false;
      e.stopImmediatePropagation();
      if (S.afterPop) { var u = S.afterPop; S.afterPop = null; sset("sessionStorage", KEY_SUP, "1"); location.replace(u); }
      return;
    }
    if (S.open) { e.stopImmediatePropagation(); close({ fromPop: true }); return; }
    if (e.state && e.state.bjpReader) e.stopImmediatePropagation();
  }

  function inertOthers(on) {
    var i, c;
    if (on) {
      S.inerted = [];
      for (i = 0; i < document.body.children.length; i++) {
        c = document.body.children[i];
        if (c === S.root || c.tagName === "SCRIPT" || c.inert) continue;
        c.inert = true;
        c.setAttribute("aria-hidden", "true");
        S.inerted.push(c);
      }
    } else {
      S.inerted.forEach(function (x) { x.inert = false; x.removeAttribute("aria-hidden"); });
      S.inerted = [];
    }
  }

  /* ---------------------------------------------------------------- chapter content */
  function prepareFlow() {
    var flow = $.flow, i, list;
    // a book's first page: the reader has its own contents (the list button), the page's list of chapters is left out
    list = flow.querySelectorAll("nav.vol-contents, .vc-tools, .bjp-offline, h2#contents, .pk-book-actions, .pk-book-facts, .md-clipboard, .md-code__nav");
    for (i = 0; i < list.length; i++) list[i].parentNode.removeChild(list[i]);
    list = flow.querySelectorAll(".headerlink, script, style");
    for (i = 0; i < list.length; i++) list[i].parentNode.removeChild(list[i]);
    // a book's first page opens with its cover, as a title page (not a link)
    var bo = flow.querySelector(".pk-book-open");
    if (bo) { bo.removeAttribute("href"); bo.setAttribute("aria-hidden", "true"); }
    // tables and code can be shown full screen, where they scroll and can be enlarged
    list = flow.querySelectorAll(".tbl, .highlight, pre");
    for (i = 0; i < list.length; i++) {
      var box = list[i];
      if (box.tagName === "PRE" && box.closest(".highlight, .tbl")) continue;
      if (box.querySelector(".rd-expand")) continue;
      var xb = el("button", "rd-expand", ICON.expand);
      xb.type = "button";
      xb.setAttribute("aria-label", box.classList.contains("tbl") ? "Show the table full screen" : "Show the code full screen");
      xb.title = "Full screen";
      box.classList.add("rd-zoomable");
      box.appendChild(xb);
    }
    // figures open full screen with a tap: a small mark on the picture says so
    list = flow.querySelectorAll("figure img, img.tikz");
    for (i = 0; i < list.length; i++) {
      var im = list[i];
      if (im.closest(".rd-imgbox, a, .pk-book, .pk-sc-fig") || im.closest("mjx-container")) continue;
      var w0 = +im.getAttribute("width") || 0;
      if (w0 && w0 < 120) continue;
      var bx = el("span", "rd-imgbox");
      im.parentNode.insertBefore(bx, im);
      bx.appendChild(im);
      bx.appendChild(el("span", "rd-fig-x", ICON.expand));
    }
    // images in pages that are not on screen must still load, or the page breaks would move later
    list = flow.querySelectorAll("img");
    for (i = 0; i < list.length; i++) {
      list[i].setAttribute("loading", "eager");
      list[i].removeAttribute("fetchpriority");
      // a page scan takes its room before it arrives (its size is in the page), so the pages do not move as scans come
      var sw0 = +list[i].getAttribute("width"), sh0 = +list[i].getAttribute("height");
      if (sw0 > 0 && sh0 > 0 && list[i].classList.contains("pk-scan")) list[i].style.setProperty("--ar", (sw0 / sh0).toFixed(4));
    }
    list = flow.querySelectorAll("a[href]");
    for (i = 0; i < list.length; i++) {
      var a = list[i], h = a.getAttribute("href");
      if (h.charAt(0) === "#") continue;
      try {
        if (new URL(h, location.href).origin !== location.origin) { a.setAttribute("rel", "noopener noreferrer"); a.setAttribute("target", "_blank"); }
      } catch (e) { /* ignore */ }
    }
  }

  /* pictures whose size the page states (width and height, written by the build) take their space at once:
     only those without it are waited for; a late one re-paginates through the flow's load listener */
  function imagesReady(root) {
    var ps = [], imgs = root.querySelectorAll("img");
    for (var i = 0; i < imgs.length; i++) {
      (function (im) {
        if (im.complete && im.naturalWidth > 0) return;
        if (im.getAttribute("width") && im.getAttribute("height")) return;
        ps.push(new Promise(function (res) { im.addEventListener("load", res, { once: true }); im.addEventListener("error", res, { once: true }); }));
      })(imgs[i]);
    }
    return Promise.all(ps);
  }

  function needsMath() {
    return window.bjpMath ? window.bjpMath.pending([$.flow]).length > 0 : $.flow.querySelector(".arithmatex, .math") !== null;
  }

  /* Put a fetched chapter into the flow and show its pages as soon as the text and the fonts are ready: pictures whose
     size the page states are not waited for; the mathematics on and near the page to be shown is typeset first, the
     rest of the chapter a little at a time afterwards (assets/mathjax.js), re-paginating and keeping the place. A
     chapter typeset once is kept typeset (rec.typeset), and the next chapter is typeset ahead while the reader reads. */
  var mathToken = 0;
  function mount(rec, where, fade) {
    var tok = ++mathToken;
    S.loading = true;
    S.mathTodo = null;
    S.rec = rec;
    S.url = rec.url;
    S.path = pagePath(rec.url);
    var bk = bookOfPath(S.path);
    setLang(bk && bk.lang || "en");
    if (bk) $.about.setAttribute("href", location.origin + BOOK_ROOT + bk.path + "/index.html");
    if (!bk || S.modelBook !== bk.id) { S.model = null; S.modelBook = bk ? bk.id : ""; }
    $.flow.classList.add("rd-hidden");
    $.flow.style.transform = "none";
    wantDevanagari(rec.html);
    // a very long chapter is read in segments of a few sections (segments()): the one with the place asked for
    var segs = segments(rec), seg = null;
    if (segs) { var pick = pickSeg(rec, segs, where); S.seg = pick.k; where = pick.where; seg = segs[pick.k]; }
    else S.seg = 0;
    S.segs = segs;
    $.flow.innerHTML = seg ? (seg.typeset || seg.html) : (rec.typeset || rec.html);
    prepareFlow();
    S.anchors = [];
    S.n = 0;
    var h1 = $.flow.querySelector("h1");
    var title = h1 ? h1.textContent.replace(/¶/g, "").trim() : rec.h1 || rec.title;
    S.title = title;
    $.title.textContent = title;
    $.ftitle.textContent = title;
    $.ftitle.title = title;
    if (rec.title) document.title = rec.title + (SITE_NAME ? " - " + SITE_NAME : "");
    try { history.replaceState(history.state, "", rec.url + (where && where.hash ? where.hash : "")); } catch (e) { /* ignore */ }
    buildToc();
    updateBackChip();
    markSeen(S.path);
    loadModel();
    S.tm = { mount: performance.now() };
    return waitBasics().then(function () {
      if (tok !== mathToken) return null;
      S.tm.basics = performance.now();
      applySettingsUI();
      applyHighlights();
      measureAndPaginate(null);
      applyWhere(where);
      var todo = window.bjpMath && needsMath() ? window.bjpMath.pending([$.flow]) : [];
      if (!todo.length || !window.bjpMath.typesetEls) return null;
      var keep = where === "end" ? "end" : captureAnchor(), near = mathAround(todo);
      var first = typesetOut(near.now);
      S.mathTodo = near.later;
      // typeset in time: shown typeset; late (MathJax still arriving): shown, and re-paginated when it is done
      return raceTimeout(first.then(function () { first.done = true; }), 4000).then(function () {
        if (tok !== mathToken) return;
        measureAndPaginate(null);
        reWhere(where, keep);
        if (!first.done) first.then(function () { if (tok === mathToken) relayoutKeep(); });
      });
    }).then(function () {
      if (tok !== mathToken) return;
      $.flow.classList.remove("rd-hidden");
      S.loading = false;
      S.tm.shown = performance.now();
      S.pageAt = Date.now();
      updatePageUI();
      if (S.mathTodo && S.mathTodo.length) typesetRest(tok); else settled(tok);
    });
  }

  /* ---- very long chapters: segments of a few sections, each paginated on its own and loaded when reached. The page's
     address, its anchors and its numbering stay as they are: a link, a search result, a bookmark or the saved place finds
     its segment. Highlights and bookmarks keep the block numbers of the whole chapter (hlOff, anOff). */
  var SEG_MIN = 50000, SEG_CHARS = 24000;
  function segments(rec) {
    if (rec.segs !== undefined) return rec.segs;
    rec.segs = null;
    if (!rec.html || rec.html.length < SEG_MIN) return null;
    var t = document.createElement("template");
    t.innerHTML = rec.html;
    var root = t.content, total = root.textContent.length;
    // the weight of a chapter: its text, and a figure, a table or a formula counted as a few lines more
    if (weight(root) < SEG_MIN) return null;
    // the element whose children are cut: down through the element that holds nearly all the text (the text of a linked
    // book inside its shell); what stands beside it at each level (the title, the credit) goes with the first or last segment
    var host = root, levels = [];
    for (;;) {
      var big = null, ks = host.children;
      for (var q = 0; q < ks.length; q++) if (ks[q].textContent.length > total * 0.85) big = ks[q];
      if (!big || big.children.length < 2 || /^(P|LI|TABLE|PRE|BLOCKQUOTE|FIGURE)$/.test(big.tagName)) break;
      var pre = [], post = [], seen = false;
      for (q = 0; q < ks.length; q++) { if (ks[q] === big) seen = true; else (seen ? post : pre).push(ks[q]); }
      levels.push({ el: big, pre: pre, post: post });
      host = big;
      if (host.children.length > 3) {
        // stop where the text is spread over many blocks
        var top = 0;
        for (q = 0; q < host.children.length; q++) top = Math.max(top, host.children[q].textContent.length);
        if (top < total * 0.85) break;
      }
    }
    var kids = [].slice.call(host.children), hasH2 = kids.some(function (k) { return k.tagName === "H2"; });
    var groups = [], cur = [], len = 0;
    kids.forEach(function (k) {
      // at a section (##) once a segment is long enough; in a long section at a subsection, and in a very long one
      // between any two blocks
      var t = k.tagName, cut = (hasH2 && t === "H2" && len >= SEG_CHARS) || ((/^H[2-4]$/.test(t)) && len >= SEG_CHARS * (hasH2 ? 1.5 : 1)) ||
        (/^(HR|P|DIV|BLOCKQUOTE|UL|OL|TABLE|FIGURE|SECTION|DL|PRE)$/.test(t) && len >= SEG_CHARS * (hasH2 ? 2.5 : 1.2));
      if (cut && !(k.classList && k.classList.contains("footnote"))) { groups.push(cur); cur = []; len = 0; }
      cur.push(k);
      len += weight(k);
    });
    if (cur.length) {
      // a short end (a last section, the notes) stays with the segment before it
      if (groups.length && len < SEG_CHARS / 3) groups[groups.length - 1] = groups[groups.length - 1].concat(cur);
      else groups.push(cur);
    }
    if (groups.length < 2) return null;
    var h1 = root.querySelector("h1");
    rec.h1 = h1 ? h1.textContent.replace(/¶/g, "").trim() : "";
    rec.whole = root;                       // for notes and references in another segment
    var start = 0, hl = 0, an = 0, lastG = groups.length - 1;
    function count(nodes, acc) {
      nodes.forEach(function (n) {
        acc.chars += n.textContent.length;
        acc.nh += (n.matches(HL_SEL) ? 1 : 0) + n.querySelectorAll(HL_SEL).length;
        acc.na += (n.matches(ANCH_SEL) ? 1 : 0) + n.querySelectorAll(ANCH_SEL).length;
        if (n.id) acc.ids[n.id] = 1;
        var withId = n.querySelectorAll("[id]");
        for (var i = 0; i < withId.length; i++) acc.ids[withId[i].id] = 1;
      });
    }
    function html(nodes) { return nodes.map(function (n) { return n.outerHTML; }).join("\n"); }
    rec.segs = groups.map(function (nodes, gi) {
      var acc = { chars: 0, nh: 0, na: 0, ids: {} }, inner = html(nodes);
      // the levels from the inside out: the element itself (a shallow copy), with what stood before it in the first
      // segment and what came after it in the last
      for (var w = levels.length - 1; w >= 0; w--) {
        var L = levels[w], c = L.el.cloneNode(false);
        c.innerHTML = inner;
        inner = (gi === 0 ? html(L.pre) : "") + c.outerHTML + (gi === lastG ? html(L.post) : "");
      }
      levels.forEach(function (L) { if (gi === 0) count(L.pre, acc); });
      count(nodes, acc);
      levels.forEach(function (L) { if (gi === lastG) count(L.post, acc); });
      var sg = { html: inner, start: start, chars: acc.chars, hlOff: hl, hlN: acc.nh, anOff: an, ids: acc.ids };
      start += acc.chars; hl += acc.nh; an += acc.na;
      return sg;
    });
    rec.segChars = start;
    return rec.segs;
  }
  function weight(n) {
    return n.textContent.length + 600 * n.querySelectorAll("img, svg, table, div.arithmatex, pre").length + 120 * n.querySelectorAll("span.arithmatex").length;
  }
  function segOfId(segs, id) {
    for (var i = 0; segs && i < segs.length; i++) if (segs[i].ids[id]) return i;
    return -1;
  }
  function segOfFrac(segs, rec, f) {
    var x = clamp(f, 0, 1) * rec.segChars;
    for (var i = 0; i < segs.length; i++) if (x < segs[i].start + segs[i].chars || i === segs.length - 1) return { k: i, f: clamp((x - segs[i].start) / Math.max(1, segs[i].chars), 0, 0.999) };
    return { k: 0, f: 0 };
  }
  /* the segment that holds the place asked for, and the place within it */
  function pickSeg(rec, segs, where) {
    var last = segs.length - 1;
    if (where === "end") return { k: last, where: "end" };
    if (where && typeof where === "object") {
      if (typeof where.seg === "number") return { k: clamp(where.seg, 0, last), where: where.at || "start" };
      if (where.hash) {
        var k = segOfId(segs, safeDecode(where.hash.slice(1)));
        if (k >= 0) return { k: k, where: where };
      }
      if (where.hl) {
        var hh = findHl(where.hl);
        if (hh) for (var j = 0; j < segs.length; j++) if (hh.h.b >= segs[j].hlOff && hh.h.b < segs[j].hlOff + segs[j].hlN) return { k: j, where: where };
      }
      if (where.anchor) {
        if (typeof where.anchor.seg === "number") return { k: clamp(where.anchor.seg, 0, last), where: where };
        var g = segOfFrac(segs, rec, where.anchor.f || 0);
        return { k: g.k, where: { anchor: { i: null, n: 0, f: g.f } } };
      }
    }
    if (where === "saved") {
      var rp = (jget(KEY_POS, {}) || {})[pagePath(rec.url)];
      if (rp && typeof rp.seg === "number") return { k: clamp(rp.seg, 0, last), where: { anchor: { i: rp.i, n: rp.n, f: rp.f, dp: rp.dp || 0 } } };
      if (rp && typeof rp.f === "number") { var g2 = segOfFrac(segs, rec, rp.f); return { k: g2.k, where: { anchor: { i: null, n: 0, f: g2.f } } }; }
    }
    return { k: 0, where: where };
  }
  function moreSeg(dir) { return !!(S.segs && (dir > 0 ? S.seg < S.segs.length - 1 : S.seg > 0)); }
  function loadSeg(k, at) { return loadChapter(S.url, { seg: k, at: at }); }
  /* how far through the chapter the end of page (pages from the start of the segment) is: 0 to 1 */
  function chapFrac(pages) {
    var f = S.n ? clamp(pages / S.n, 0, 1) : 0;
    if (!S.segs) return f;
    var sg = S.segs[S.seg];
    return clamp((sg.start + f * sg.chars) / Math.max(1, S.rec.segChars), 0, 1);
  }
  /* an element of this chapter, in the segment on screen or, for a note or a reference, anywhere in the chapter */
  function inChapter(id) {
    var t = byId($.flow, id);
    if (t || !S.segs || !S.rec || !S.rec.whole) return t;
    return byId(S.rec.whole, id);
  }

  /* the place again after the first formulas are typeset: the element asked for, or the block that began the page */
  function reWhere(where, keep) {
    if (keep === "end") { goto(S.n - 1, false, true); return; }
    if (where && typeof where === "object") {
      var t = where.find ? $.flow.querySelector("mark.rd-flash") : where.hl ? $.flow.querySelector('mark[data-hl="' + where.hl + '"]') :
        where.hash ? byId($.flow, safeDecode(where.hash.slice(1))) : null;
      var pg = t ? pageOfEl(t) : null;
      if (pg !== null) { goto(pg, false, true); return; }
    }
    restoreAnchor(keep);
  }
  /* the mathematics of the pages around the one shown (now), and the rest in the order to typeset it: the pages after it,
     then those before it, nearest first */
  function mathAround(todo) {
    var lo = S.page - 1, hi = S.page + (S.spread ? 4 : 2), now = [], after = [], before = [];
    for (var i = 0; i < todo.length; i++) {
      var pg = pageOfEl(todo[i]);
      if (pg === null || (pg >= lo && pg <= hi)) now.push(todo[i]);
      else if (pg > hi) after.push(todo[i]);
      else before.push(todo[i]);
    }
    return { now: now, later: after.concat(before.reverse()) };
  }
  /* Formulas are typeset out of the page: MathJax measures text by putting it beside the formula, and inside the paged
     text every such measure would lay out the whole chapter again. Copies are typeset in a box of the page's width
     and type, out of sight, and then take the place of the originals in one go. */
  function typesetOut(els) {
    return typesetCopies(els).then(swapIn);
  }
  /* the copies typeset, not yet put in place: [[original, copy, holder]] */
  function swapIn(pairs) {
    (pairs || []).forEach(function (x) { if (x[0].isConnected && x[1].querySelector("mjx-container")) x[0].parentNode.replaceChild(x[1], x[0]); });
    (pairs || []).forEach(function (x) { if (x[2].parentNode) x[2].parentNode.removeChild(x[2]); });
  }
  function typesetCopies(els) {
    if (!els.length || !window.bjpMath || !window.bjpMath.typesetEls) return Promise.resolve([]);
    var box = $.mj;
    if (!box) {
      box = $.mj = el("div", "rd-pre md-typeset");
      box.setAttribute("aria-hidden", "true");
      box.inert = true;
      S.root.appendChild(box);
    }
    box.style.width = (S.pw || 320) + "px";
    box.style.fontSize = $.flow.style.fontSize;
    box.style.fontFamily = $.flow.style.fontFamily;
    box.style.lineHeight = $.flow.style.lineHeight;
    var pairs = els.map(function (e) {
      var c = e.cloneNode(true), holder = el(e.tagName === "DIV" ? "div" : "p");
      holder.appendChild(c);
      box.appendChild(holder);
      return [e, c, holder];
    });
    return window.bjpMath.typesetEls(pairs.map(function (x) { return x[1]; })).then(function () { return pairs; });
  }
  function idle(fn) {
    if (window.requestIdleCallback) window.requestIdleCallback(fn, { timeout: 250 });
    else setTimeout(fn, 16);
  }
  /* The rest of the chapter's mathematics, a few formulas at a time, out of the page. The copies typeset wait out of
     sight and are put in place together: when the reader comes within a few pages of them, and at the end. Every change
     inside the paged text lays the whole chapter out again, so they are few. The place on the page is kept. */
  function typesetRest(tok) {
    var list = S.mathTodo || [];
    S.mathReady = [];
    function step() {
      if (tok !== mathToken || !S.open) return;
      if (!list.length) { S.mathTodo = null; swapReady(); settled(tok); return; }
      idle(function () {
        if (tok !== mathToken || !S.open) return;
        typesetCopies(list.splice(0, 60)).then(function (pairs) {
          if (tok !== mathToken || !S.open) return;
          S.mathReady = S.mathReady.concat(pairs);
          if (mathNearby()) swapReady();
          step();
        });
      });
    }
    step();
  }
  /* the formulas typeset and the next ones to typeset: is the reader within a few pages of one of them? */
  function mathNearby() {
    var all = (S.mathReady || []).map(function (x) { return x[0]; }).concat((S.mathTodo || []).slice(0, 1));
    for (var i = 0; i < all.length; i++) {
      var pg = all[i].isConnected ? pageOfEl(all[i]) : null;
      if (pg !== null && pg >= S.page - 2 && pg <= S.page + (S.spread ? 5 : 3)) return true;
    }
    return false;
  }
  function swapReady() {
    var r = S.mathReady || [];
    S.mathReady = [];
    if (!r.length) { relayoutKeep(); return; }
    var keep = captureAnchor();
    swapIn(r);
    relayoutKeep(keep);
  }
  /* re-paginate after a change of the text (a formula typeset, a late picture), keeping the place */
  function relayoutKeep(keep) {
    if (!S.open || S.loading || !S.n) return;
    if (S.p && S.p.drag) { setTimeout(function () { relayoutKeep(); }, 300); return; }
    var a = keep || captureAnchor();
    measureAndPaginate(null);
    restoreAnchor(a);
  }
  /* the chapter is complete: its pagination and its typeset text are kept, and the next chapter is made ready */
  function settled(tok) {
    if (tok !== mathToken || !S.open) return;
    pcSet(S.n);
    var unit = S.segs ? S.segs[S.seg] : S.rec;
    if (unit && !unit.typeset && unit.html.indexOf("arithmatex") >= 0) unit.typeset = cleanFlowHtml();
    prefetch();
  }
  function cleanFlowHtml() {
    var c = $.flow.cloneNode(true), i, list = c.querySelectorAll("mark.rd-hl, mark.rd-flash");
    for (i = 0; i < list.length; i++) { var m = list[i], pa = m.parentNode; while (m.firstChild) pa.insertBefore(m.firstChild, m); pa.removeChild(m); }
    list = c.querySelectorAll(".rd-xhint");
    for (i = 0; i < list.length; i++) list[i].parentNode.removeChild(list[i]);
    c.normalize();
    return c.innerHTML;
  }

  /* pages of a chapter, per screen size and settings: the count shown while the chapter is still being typeset */
  var PC = jget(KEY_PC, {}) || {};
  function pcKey() { return S.path + (S.segs ? "#" + S.seg : "") + "|" + S.lastDims; }
  function pcGet() { var v = PC[pcKey()]; return typeof v === "number" ? v : 0; }
  function pcSet(n) {
    var k = pcKey();
    if (PC[k] === n) return;
    PC[k] = n;
    var ks = Object.keys(PC);
    if (ks.length > 400) delete PC[ks[0]];
    jset(KEY_PC, PC);
  }

  /* the book's language (library.yml) for the text: hyphenation, the choice of font, screen readers */
  /* a chapter with Devanagari text: the site's Devanagari face (extra.css) is asked for at once, so that the pages are
     laid out in it the first time (waitBasics waits for the fonts a moment) */
  function wantDevanagari(html) {
    if (!document.fonts || !document.fonts.load || !/[ऀ-ॿ]/.test(html || "")) return;
    try { document.fonts.load('400 1em "Noto Serif Devanagari"', "क"); document.fonts.load('700 1em "Noto Serif Devanagari"', "क"); } catch (e) { /* the installed face stands in */ }
  }
  function setLang(lang) {
    S.lang = lang || "en";
    S.root.setAttribute("lang", S.lang);
    $.flow.setAttribute("lang", S.lang);
  }
  /* the lengths of the book's chapters, for the percentage; the page footer is complete when they have arrived */
  function loadModel() {
    var id = S.modelBook;
    if (!id || S.model) return;
    bookContents().then(function (c) {
      if (c.id !== S.modelBook) return;
      S.model = bookModel(c);
      S.modelBase = c.base;
      S.modelTitles = {};
      (c.groups || []).forEach(function (g) { g.items.forEach(function (it) { if (!S.modelTitles[it.f]) S.modelTitles[it.f] = it.t; }); });
      if (S.open && S.n) { updatePageUI(); scheduleSave(); }
    }, function () { /* without the contents the footer shows the chapter only */ });
  }

  /* the text's fonts and the pictures of unknown size, each for a moment at most (a late one re-paginates) */
  function waitBasics() {
    // (a moment the first time; once a chapter has been shown its faces are there, and a late one re-paginates)
    var fw = S.shown ? 250 : 600;
    S.shown = true;
    return Promise.all([
      document.fonts && document.fonts.ready ? raceTimeout(document.fonts.ready, fw) : null,
      raceTimeout(imagesReady($.flow), 1500)
    ]);
  }

  /* the chapters before and after are fetched while this one is read, and the next one is typeset ahead */
  function prefetch() {
    clearTimeout(S.preT);
    S.preT = setTimeout(function () {
      if (!S.open || !S.rec) return;
      if (moreSeg(1)) pretypeset(S.segs[S.seg + 1]);
      else if (S.rec.next) fetchPage(S.rec.next).then(function (r) { var sg = segments(r); pretypeset(sg ? sg[0] : r); }, function () {});
      if (S.rec.prev) fetchPage(S.rec.prev).catch(function () {});
      bookContents().catch(function () {});
    }, 500);
  }
  function pretypeset(rec) {
    if (!rec || rec.typeset || rec.pre || !window.bjpMath || !window.bjpMath.typesetEls || rec.html.indexOf("arithmatex") < 0) return;
    rec.pre = true;
    var box = $.pre;
    if (!box) {
      box = $.pre = el("div", "rd-pre md-typeset");
      box.setAttribute("aria-hidden", "true");
      box.inert = true;
      S.root.appendChild(box);
    }
    box.style.width = (S.pw || 320) + "px";
    box.style.fontSize = $.flow.style.fontSize;
    box.innerHTML = rec.html;
    var list = window.bjpMath.pending([box]), tok = mathToken;
    function step() {
      if (tok !== mathToken || !S.open || S.loading) { rec.pre = false; box.innerHTML = ""; return; }
      if (!list.length) { rec.typeset = box.innerHTML; box.innerHTML = ""; return; }
      idle(function () {
        if (tok !== mathToken || S.loading) { rec.pre = false; box.innerHTML = ""; return; }
        window.bjpMath.typesetEls(list.splice(0, 20)).then(step, function () { rec.pre = false; });
      });
    }
    step();
  }

  /* the next or another chapter: while it is fetched and made ready a light outline of a page shows (after a moment,
     so that a quick change shows none), then the page slides in from the side it was asked from */
  function showSkeleton(on) {
    if (!$.loading) return;
    $.loading.classList.toggle("is-change", on);
    $.loading.hidden = !on;
  }
  function loadChapter(url, where) {
    if (S.loading) return Promise.resolve();
    S.loading = true;
    savePos();
    closePanels();
    closePop();
    hideSelbar();
    var dir = where === "end" || (where && where.at === "end") ? -1 : 1;
    showSkeleton(true);
    return fetchPage(url).then(function (rec) {
      S.loading = false;
      return mount(rec, where, true);
    }).then(function () {
      showSkeleton(false);
      enterAnim(dir);
      runQueued();
      if (R.on && !R.paused) ttsFromPage();
    }).catch(function () {
      S.loading = false;
      S.queued = 0;
      showSkeleton(false);
      $.flow.classList.remove("rd-hidden");
      $.pageno.textContent = navigator.onLine === false ? "This page is not available offline." : "Could not load the next page. Check the connection.";
      setTimeout(updatePageUI, 2500);
    });
  }
  function enterAnim(dir) {
    var st = turnStyle();
    if (st === "none") return;
    var v = $.view;
    v.classList.remove("rd-enter-l", "rd-enter-r", "rd-enter-f");
    void v.offsetWidth;
    v.classList.add(st === "fade" ? "rd-enter-f" : dir < 0 ? "rd-enter-l" : "rd-enter-r");
    clearTimeout(S.enterT);
    S.enterT = setTimeout(function () { v.classList.remove("rd-enter-l", "rd-enter-r", "rd-enter-f"); }, 400);
  }
  function turnStyle() { return reducedMotion() ? "none" : settings.turn; }
  /* page turns asked for while a chapter was loading are made when it is ready */
  function runQueued() {
    var q = S.queued || 0;
    S.queued = 0;
    while (q !== 0 && !S.loading && S.n) {
      var d = q > 0 ? 1 : -1;
      q -= d;
      turn(d);
    }
    if (q && S.loading) S.queued = q;
  }

  /* ---------------------------------------------------------------- pagination */
  function px(v) { return parseFloat(v) || 0; }

  function measureAndPaginate(keep) {
    var t0 = performance.now();
    try { paginate(); } finally { var dt = performance.now() - t0; S.mp = S.mp || [0, 0, 0]; S.mp[0]++; S.mp[1] += dt; S.mp[2] = dt; }
  }
  /* (a style is written only when it changes: every write between two measures would lay the whole chapter out again,
     which for a long chapter with many formulas takes a good part of a second) */
  function sp(st, name, val) { if (st.getPropertyValue(name) !== val) st.setProperty(name, val); }
  function paginate() {
    var flow = $.flow, root = S.root, i, list, fst = flow.style;
    var fontPx = SIZES[sizeIndex()];
    var vw = window.innerWidth, vh = window.innerHeight;
    var phone = Math.min(vw, vh) < 600;
    // phones: margins of about 22 px (medium), so that a line of 19 px type holds about 36 characters
    sp(root.style, "--rd-mx", Math.max(phone ? 14 : 20, Math.round(vw * (phone ? [0.036, 0.056, 0.1] : MARGINS)[settings.margin])) + "px");
    // The top margin clears the 52px toolbar, so the first line is never hidden under it.
    sp(root.style, "--rd-mt", (phone ? 62 : 68) + "px");
    sp(root.style, "--rd-mb", (phone ? 60 : 52) + "px");
    var cs = getComputedStyle($.stage);
    var availW = Math.floor($.stage.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight));
    var availH = Math.floor($.stage.clientHeight - px(cs.paddingTop) - px(cs.paddingBottom));
    S.spread = vw >= 1100 && vw > vh;
    var gap = S.spread ? clamp(Math.round(fontPx * 2.6), 40, 88) : 32;
    // about 66 characters a line on large screens, 36 to 40 on a phone
    var maxMeasure = Math.round(fontPx * (phone && !S.spread ? 19 : 36));
    var pw = S.spread ? Math.min(Math.floor((availW - gap) / 2), maxMeasure) : Math.min(availW, maxMeasure);
    pw = Math.max(pw, 120);
    var viewW = S.spread ? 2 * pw + gap : pw;
    var ph = Math.max(availH, 120);
    S.pw = pw; S.ph = ph; S.gap = gap; S.stride = pw + gap;
    sp(root.style, "--rd-vw", viewW + "px");
    sp($.view.style, "width", viewW + "px");
    sp($.view.style, "height", ph + "px");
    sp(fst, "width", viewW + "px");
    sp(fst, "height", ph + "px");
    sp(fst, "column-width", pw + "px");
    sp(fst, "column-gap", gap + "px");
    sp(fst, "--rd-h", ph + "px");
    sp(fst, "font-size", fontPx + "px");
    var ff = (FONTS[settings.font] || FONTS.serif).css;
    if (flow.__ff !== ff) { flow.__ff = ff; fst.fontFamily = ff; }
    // Devanagari carries its marks above and below the line: it needs a little more leading
    sp(fst, "line-height", String(LEADS[settings.spacing] + (/^hi\b/.test(S.lang) ? 0.14 : 0)));
    flow.classList.toggle("rd-just", settings.justify);
    flow.classList.toggle("rd-left", !settings.justify);
    var dims = [vw, vh, pw, ph, S.spread, fontPx, settings.spacing, settings.margin, settings.justify, settings.font, S.lang].join("/");
    // tables taller than a page may break across pages; the others scroll inside the table (decided once per chapter
    // and page size: formulas typeset later do not change it)
    list = flow.querySelectorAll(".tbl");
    if (list.length && flow.__tbl !== dims + "|" + mathToken) {
      flow.__tbl = dims + "|" + mathToken;
      for (i = 0; i < list.length; i++) {
        list[i].classList.remove("rd-tbl-flow", "rd-tbl-tight");
        var t0 = list[i].querySelector("table");
        if (t0 && t0.style.zoom) t0.style.zoom = "";
      }
      var tall = [];
      for (i = 0; i < list.length; i++) {
        var tb = list[i].querySelector("table");
        tall.push(!!(tb && tb.offsetHeight > ph * 0.8));
      }
      for (i = 0; i < list.length; i++) if (tall[i]) list[i].classList.add("rd-tbl-flow");
      // a table that runs over several pages cannot scroll sideways: scale it down to the page width instead
      var tight = [];
      for (i = 0; i < list.length; i++) {
        var ft = list[i].querySelector("table");
        if (!ft || !tall[i]) continue;
        var cw = list[i].clientWidth, w0 = ft.scrollWidth;
        if (w0 > cw + 1) tight.push([list[i], ft, Math.max(0.5, (cw - 1) / w0).toFixed(3)]);
      }
      tight.forEach(function (x) { x[0].classList.add("rd-tbl-tight"); x[1].style.zoom = x[2]; });
    }
    // a display formula wider than the page is set smaller to fit (down to three quarters of its size, so that its number
    // stays in sight); only one wider still scrolls sideways
    list = flow.querySelectorAll("mjx-container[display='true']");
    var fit = [], tagged = [];
    // a numbered formula too wide: first its number moves to the right edge of the formula itself (without the space
    // that balanced it on the left), then the whole is made smaller
    for (i = 0; i < list.length; i++) {
      var mt = list[i];
      if (!mt.classList.contains("rd-tagfit") && mt.querySelector("mjx-labels") && mt.scrollWidth > mt.clientWidth + 1) tagged.push(mt);
    }
    tagged.forEach(function (x) { x.classList.add("rd-tagfit"); });
    for (i = 0; i < list.length; i++) {
      var mj = list[i];
      if (mj.closest(".rd-tbl-flow")) continue;
      var base = +mj.getAttribute("data-rd-fs") || 0;
      if (!base) { base = parseFloat(mj.style.fontSize) || 100; mj.setAttribute("data-rd-fs", String(base)); }
      var cur = parseFloat(mj.style.fontSize) || base, cw2 = mj.clientWidth;
      if (!cw2) continue;
      var natural = mj.scrollWidth * base / cur;
      var want = natural > cw2 + 1 ? base * Math.max(mj.classList.contains("rd-tagfit") ? 0.66 : 0.74, (cw2 - 2) / natural) : base;
      if (Math.abs(want - cur) > 0.4) fit.push([mj, want.toFixed(1) + "%"]);
    }
    fit.forEach(function (x) { x[0].style.fontSize = x[1]; });
    list = flow.querySelectorAll(".tbl-scroll, mjx-container[display='true'], pre > code");
    var overs = [];
    for (i = 0; i < list.length; i++) {
      var sb = list[i];
      overs.push(!(sb.closest && sb.closest(".rd-tbl-flow")) && sb.scrollWidth > sb.clientWidth + 1);
    }
    // wide blocks: an edge fade (onXScroll) and a line that says they scroll and open full screen with a tap
    var fresh = [];
    for (i = 0; i < list.length; i++) {
      var bx = list[i], was = bx.classList.contains("rd-xscroll");
      if (overs[i] === was && (!was || (bx.__hint && bx.__hint.isConnected))) continue;
      bx.classList.toggle("rd-xscroll", overs[i]);
      if (bx.__hint && bx.__hint.parentNode) bx.__hint.parentNode.removeChild(bx.__hint);
      bx.__hint = null;
      if (overs[i]) fresh.push(bx);
    }
    fresh.forEach(function (b) { if (b.scrollLeft) b.scrollLeft = 0; });
    fresh.forEach(function (b) {
      b.classList.add("rd-x-r");
      b.classList.remove("rd-x-l");
      var hint = el("div", "rd-xhint", "<span>\u2194</span> Swipe sideways, or tap to enlarge");
      hint.setAttribute("aria-hidden", "true");
      var host = b.closest(".tbl") || b.closest(".highlight") || (b.parentElement && b.parentElement.classList.contains("arithmatex") ? b.parentElement : null);
      if (host && host.classList.contains("tbl")) host.appendChild(hint);
      else (host || b).insertAdjacentElement("afterend", hint);
      b.__hint = hint;
    });
    // inline formulas cannot break across lines: one wider than what is left of its column scrolls sideways
    list = flow.querySelectorAll("mjx-container:not([display='true'])");
    var flowLeft = flow.getBoundingClientRect().left, wideM = [];
    for (i = 0; i < list.length; i++) {
      var m2 = list[i], on = m2.classList.contains("rd-xscroll"), want2 = false;
      if (!m2.parentElement.closest(".rd-xscroll, .rd-tbl-flow")) {
        var r = m2.getBoundingClientRect();
        if (r.width >= 40) {
          var colRight = flowLeft + Math.floor((r.left - flowLeft + 1) / S.stride) * S.stride + pw;
          // (one already scrolling is as wide as its column: it stays so while it would not fit)
          want2 = on ? m2.scrollWidth > m2.clientWidth + 1 || r.right > colRight + 1 : r.right > colRight + 1;
        }
      }
      if (want2 !== on) wideM.push([m2, want2]);
    }
    wideM.forEach(function (x) { x[0].classList.toggle("rd-xscroll", x[1]); });
    // number of pages
    S.anchors = flow.querySelectorAll(ANCH_SEL);
    var fr = flow.getBoundingClientRect();
    var n = Math.max(1, Math.round((flow.scrollWidth + gap) / S.stride));
    var last = flow.lastElementChild;
    while (last && last.classList.contains("rd-xhint") && last.previousElementSibling) last = last.previousElementSibling;
    if (last) {
      var rects = last.getClientRects();
      if (rects.length) {
        var right = rects[rects.length - 1].right - fr.left;
        var nLast = Math.floor((right - 1) / S.stride) + 1;
        if (nLast >= 1 && nLast <= n) n = nLast;
      }
    }
    S.n = n;
    S.textLen = flow.textContent.length;
    S.lastDims = dims;
  }

  function relayout(onlyIfChanged) {
    if (!S.open || S.loading || !S.n) return;
    var vw = window.innerWidth, vh = window.innerHeight;
    var keep = captureAnchor();
    var before = S.lastDims;
    measureAndPaginate(keep);
    if (onlyIfChanged && before === S.lastDims && S.lastN === S.n) { /* unchanged */ }
    S.lastN = S.n;
    restoreAnchor(keep);
    // the text box being typed into (a quiz) stays on screen when the pages are laid out again
    var ae = document.activeElement;
    if (ae && ae !== $.flow && $.flow.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) {
      var p = pageOfEl(ae);
      if (p !== null && !isOnPage(p)) goto(p, false);
    }
  }

  function pageOfEl(e) {
    var rects = e.getClientRects();
    if (!rects.length) return null;
    var fr = $.flow.getBoundingClientRect();
    var x = rects[0].left - fr.left;
    return clamp(Math.floor((x + 2) / S.stride), 0, S.n - 1);
  }
  function isOnPage(p) { return p >= S.page && p < S.page + (S.spread ? 2 : 1); }

  function captureAnchor() {
    if (!S.n || !S.anchors.length) return { i: null, n: 0, f: 0 };
    var fr = $.flow.getBoundingClientRect();
    var start = S.page * S.stride, end = start + S.stride * (S.spread ? 2 : 1);
    var idx = -1, i, r;
    for (i = 0; i < S.anchors.length; i++) {
      r = S.anchors[i].getClientRects();
      if (!r.length) continue;
      if (r[0].left - fr.left >= start - 2) { idx = i; break; }
    }
    if (idx >= 0) {
      r = S.anchors[idx].getClientRects();
      if (r[0].left - fr.left >= end - 2 && idx > 0) idx--;
    } else idx = S.anchors.length - 1;
    // the block may have begun pages earlier (a long paragraph, a stack of page scans): how many
    var ap = idx >= 0 ? pageOfEl(S.anchors[idx]) : null, dp = ap === null ? 0 : Math.max(0, S.page - ap);
    var a = { i: idx, n: S.anchors.length, f: S.n > 1 ? S.page / S.n : 0, dp: dp };
    if (S.segs) a.seg = S.seg;
    return a;
  }

  function restoreAnchor(a) {
    var p = 0;
    // a place in another segment of the chapter: that segment is loaded
    if (a && S.segs && typeof a.seg === "number" && a.seg !== S.seg && !S.loading) { loadChapter(S.url, { anchor: a }); return; }
    if (a && a.i !== null && a.n === S.anchors.length && S.anchors[a.i]) {
      var q = pageOfEl(S.anchors[a.i]);
      p = q === null ? Math.round(a.f * S.n) : q + (a.dp || 0);
    } else if (a) p = Math.round((a.f || 0) * S.n);
    goto(p, false, true);
  }

  function applyWhere(where) {
    if (where === "end") { goto(S.n - 1, false, true); return; }
    if (where && typeof where === "object" && where.hl) {
      var hm = $.flow.querySelector('mark[data-hl="' + where.hl + '"]');
      if (hm) { var hp = pageOfEl(hm); goto(hp === null ? 0 : hp, false, true); return; }
    }
    if (where && typeof where === "object" && where.find) {
      var start = where.hash ? byId($.flow, decodeURIComponent(where.hash.slice(1))) : null;
      var fm = flashFind(where.find, start);
      if (fm) { var fp = pageOfEl(fm); goto(fp === null ? 0 : fp, false, true); return; }
    }
    if (where && typeof where === "object" && where.hash) {
      var t = byId($.flow, decodeURIComponent(where.hash.slice(1)));
      if (t) { var p = pageOfEl(t); goto(p === null ? 0 : p, false, true); return; }
    }
    // (a string such as "saved" has a legacy .anchor() method: only an object carries a place)
    if (where && typeof where === "object" && where.anchor) { restoreAnchor(where.anchor); return; }
    if (where === "saved") {
      var all = jget(KEY_POS, {}) || {};
      var rec = all[S.path];
      if (rec && typeof rec.f === "number") { restoreAnchor({ i: rec.i, n: rec.n, f: rec.f, dp: rec.dp || 0 }); return; }
    }
    goto(0, false, true);
  }

  function goto(p, anim, quiet) {
    p = clamp(Math.round(p), 0, Math.max(0, S.n - 1));
    if (S.spread) p -= p % 2;
    var moved = p !== S.page;
    S.page = p;
    var f = $.flow, st = anim ? turnStyle() : "none", x = "translate3d(" + (-p * S.stride) + "px,0,0)";
    clearTimeout(S.fadeT);
    if (st === "fade" && moved) {
      // fade: the page dims, moves, and comes back
      f.classList.remove("rd-anim");
      $.view.classList.add("rd-fading");
      S.fadeT = setTimeout(function () { f.style.transform = x; $.view.classList.remove("rd-fading"); }, 110);
    } else {
      $.view.classList.remove("rd-fading");
      f.classList.toggle("rd-anim", st === "slide");
      f.style.transform = x;
    }
    if (moved) S.pageAt = Date.now();
    updatePageUI();
    if (moved) { closePop(); scheduleSave(); }
    else if (!quiet) scheduleSave();
  }

  /* how far through the whole book the end of the page on screen is, in percent; null until the contents are known */
  function bookPct() {
    if (!S.model || !S.n) return null;
    var last = S.spread ? Math.min(S.page + 2, S.n) : S.page + 1;
    return pctAt(S.model, S.path, chapFrac(last));
  }
  function shownPct(p) {
    var atEnd = S.model && fileOfPath(S.path) === S.model.last && S.page + (S.spread ? 2 : 1) >= S.n && !moreSeg(1);
    return atEnd ? 100 : Math.max(0, Math.min(99, Math.round(p)));
  }

  function updatePageUI() {
    if (!S.n) return;
    var p = S.page, shown = p + 1, txt;
    if (S.spread && p + 2 <= S.n) txt = (p + 1) + "\u2013" + (p + 2) + " of " + S.n;
    else txt = shown + " of " + S.n;
    var total = S.mathTodo ? Math.max(S.n, pcGet()) : S.n;
    if (total !== S.n) txt = txt.replace(/ of \d+$/, " of " + total);
    if (S.segs) {
      // a chapter in segments: its pages counted at the rate of the segment on screen
      var sg = S.segs[S.seg], perChar = total / Math.max(1, sg.chars), before = Math.round(sg.start * perChar);
      var all = Math.max(before + total, Math.round(S.rec.segChars * perChar));
      txt = (before + p + 1) + (S.spread && p + 2 <= S.n ? "\u2013" + (before + p + 2) : "") + " of " + all;
    }
    $.pageno.textContent = txt;
    var last = S.spread ? Math.min(p + 2, S.n) : p + 1;
    var left = total - last;
    var leftTxt = infoText(left, last);
    var pct = bookPct();
    if (pct === null) {
      $.fpct.textContent = leftTxt;
      $.prog.style.width = (last / S.n * 100).toFixed(2) + "%";
      $.progBar.removeAttribute("aria-valuenow");
      $.botpct.textContent = "";
    } else {
      var sp = shownPct(pct);
      $.fpct.textContent = settings.info === "book" ? leftTxt : leftTxt + " \u00b7 " + sp + "%";
      $.prog.style.width = pct.toFixed(2) + "%";
      $.progBar.setAttribute("aria-valuenow", String(sp));
      $.botpct.textContent = sp + "% of the book";
    }
    updateScrub(pct);
    updateMarkUI();
  }

  function turn(dir) {
    if (S.loading) { S.queued = clamp((S.queued || 0) + dir, -4, 4); return; }
    if (!S.n) return;
    hideHint();
    noteSpeed(dir);
    var step = S.spread ? 2 : 1;
    if ((S.mathReady && S.mathReady.length) || S.mathTodo) {
      if (S.mathReady && S.mathReady.length && mathNearby()) swapReady();
      else if (dir > 0 ? S.page + step >= S.n : S.page - step < 0) relayoutKeep();
    }
    if (dir > 0) {
      if (S.page + step < S.n) goto(S.page + step, true);
      else if (moreSeg(1)) loadSeg(S.seg + 1, "start");
      else if (S.rec && S.rec.next) loadChapter(S.rec.next, "start");
      else nudge(-1);
    } else {
      if (S.page - step >= 0) goto(S.page - step, true);
      else if (moreSeg(-1)) loadSeg(S.seg - 1, "end");
      else if (S.rec && S.rec.prev) loadChapter(S.rec.prev, "end");
      else nudge(1);
    }
    if (!S.panel) hideChrome();
    if (R.on && !R.paused && !R.turning) ttsFromPage();
  }

  function nudge(sign) {
    if (reducedMotion()) return;
    var f = $.flow, base = -S.page * S.stride;
    f.classList.add("rd-anim");
    f.style.transform = "translate3d(" + (base + sign * 14) + "px,0,0)";
    setTimeout(function () { f.style.transform = "translate3d(" + base + "px,0,0)"; }, 130);
  }

  function goToEl(e, anim) {
    var p = pageOfEl(e);
    if (p !== null) goto(p, anim);
  }

  /* ---------------------------------------------------------------- saved position */
  var scheduleSave = debounce(function () { savePos(); }, 500);
  function savePos() {
    if (!S.open || !S.n || S.loading) return;
    var a = captureAnchor();
    var all = jget(KEY_POS, {}) || {};
    all[S.path] = { i: a.i, n: a.n, f: a.f, dp: a.dp, t: Date.now() };
    if (S.segs) all[S.path].seg = S.seg;
    var frac = chapFrac(Math.min(S.page + (S.spread ? 2 : 1), S.n));
    saveLast(S.path, S.title, frac, "reader");
    saveBook(S.path, S.title, frac, "reader", bookPct());
    var keys = Object.keys(all);
    if (keys.length > 300) {
      keys.sort(function (x, y) { return (all[x].t || 0) - (all[y].t || 0); });
      for (var i = 0; i < keys.length - 300; i++) delete all[keys[i]];
    }
    jset(KEY_POS, all);
  }

  /* ---------------------------------------------------------------- links, footnotes, return chip */
  function pushBack() {
    S.backStack.push({ url: S.url, anchor: captureAnchor() });
    if (S.backStack.length > 30) S.backStack.shift();
    updateBackChip();
  }
  function updateBackChip() { if ($.back) $.back.hidden = S.backStack.length === 0; }
  function goBack() {
    var b = S.backStack.pop();
    updateBackChip();
    if (!b) return;
    closePop();
    if (b.url === S.url) restoreAnchor(b.anchor);       // (another segment of this chapter: loaded by restoreAnchor)
    else loadChapter(b.url, { anchor: b.anchor });
  }

  function jumpHash(hash) {
    var id;
    try { id = decodeURIComponent(hash.replace(/^#/, "")); } catch (e) { id = hash.replace(/^#/, ""); }
    var t = byId($.flow, id);
    if (!t && S.segs && segOfId(S.segs, id) >= 0) { loadChapter(S.url, { hash: "#" + id }); return true; }
    if (!t) return false;
    goToEl(t, true);
    return true;
  }

  function onLinkClick(e) {
    var a = e.target.closest ? e.target.closest("a") : null;
    if (!a || e.defaultPrevented) return;
    var href = a.getAttribute("href");
    if (!href) return;
    if (e.button && e.button !== 0) return;
    if (a.classList.contains("footnote-ref")) { e.preventDefault(); showFootnote(a); return; }
    var fromPop = e.currentTarget === $.pop;
    if (href.charAt(0) === "#") {
      e.preventDefault();
      var tgt = inChapter(safeDecode(href.slice(1)));
      if (tgt && !fromPop && refPreview(tgt)) { showRefPop(a, refPreview(tgt), { hash: href }); return; }
      if (fromPop) closePop();
      var cur = captureAnchor();
      if (jumpHash(href)) { S.backStack.push({ url: S.url, anchor: cur }); updateBackChip(); }
      return;
    }
    var u;
    try { u = new URL(a.href); } catch (x) { return; }
    if (u.origin !== location.origin) return; // external links open in a new tab (target=_blank)
    e.preventDefault();
    if (e.currentTarget === $.pop) closePop();
    if (isVolPath(u.pathname)) {
      if (u.hash && u.hash.length > 1 && !fromPop && bookOfPath(u.pathname) && bookOfPath(S.path) && bookOfPath(u.pathname).id === bookOfPath(S.path).id) {
        showRemoteRef(a, u);
        return;
      }
      pushBack();
      if (u.pathname === S.path) {
        if (!(u.hash && jumpHash(u.hash))) goto(0, true);
      } else loadChapter(u.origin + u.pathname + u.search, u.hash ? { hash: u.hash } : "start");
    } else {
      // a page outside the volumes: leave the reader and go there
      var target = u.href;
      sdel("sessionStorage", KEY_OPEN);
      S.pushed = false;
      close({ fromPop: true });
      location.href = target;
    }
  }

  function showFootnote(a) {
    var id = safeDecode((a.getAttribute("href") || "").replace(/^#/, ""));
    var li = inChapter(id);
    if (!li) { jumpHash(a.getAttribute("href")); return; }
    S.popGo = null;
    openPop(previewHtml(li), a, "fn");
  }
  function closePop() {
    if ($.pop && !$.pop.hidden) { $.pop.hidden = true; $.pop.innerHTML = ""; }
    S.popGo = null;
    S.hlPop = null;
  }

  /* ---------------------------------------------------------------- chrome, panels, settings */
  function armHide() {
    clearTimeout(S.hideT);
    S.hideT = setTimeout(hideChrome, 3200);
  }
  function showChrome(sticky) {
    S.root.classList.add("rd-chrome-on");
    clearTimeout(S.hideT);
    if (!sticky) armHide();
  }
  function hideChrome() {
    if (!S.root) return;
    if (S.panel || S.overBar || $.top.contains(document.activeElement)) { armHide(); return; }
    S.root.classList.remove("rd-chrome-on");
  }
  function toggleChrome() {
    if (S.root.classList.contains("rd-chrome-on") && !S.panel) { clearTimeout(S.hideT); S.root.classList.remove("rd-chrome-on"); }
    else showChrome(false);
  }

  var PANEL_BTN = { toc: ".rd-tocbtn", set: ".rd-setbtn", find: ".rd-findbtn", help: ".rd-keys", more: ".rd-morebtn", look: null };
  var PANELS = ["toc", "set", "find", "help", "more", "look"];
  function panelEl(which) { return { toc: $.toc, set: $.set, find: $.find, help: $.help, more: $.more, look: $.look }[which] || $.help; }
  function togglePanel(which) {
    var panel = panelEl(which);
    var willOpen = panel.hidden;
    if (!willOpen || S.panel === "toc") resetGoto();
    closePop();
    hideSelbar();
    PANELS.forEach(function (k) {
      var el2 = panelEl(k);
      if (el2 !== panel) el2.hidden = true;
      var b = PANEL_BTN[k] && S.root.querySelector(PANEL_BTN[k]);
      if (b && b.hasAttribute("aria-expanded")) b.setAttribute("aria-expanded", String(k === which && willOpen));
    });
    panel.hidden = !willOpen;
    S.panel = willOpen ? which : null;
    S.root.classList.toggle("rd-panel-on", !!S.panel);
    if (willOpen) {
      showChrome(true);
      if (which === "toc") showTab(S.tab || (/^(bk|mk|hl)$/.test(sget("localStorage", KEY_TAB) || "") ? sget("localStorage", KEY_TAB) : "bk"), false);
      var f = which === "find" ? $.findIn : panel.querySelector("button[aria-checked='true'], .rd-tab[aria-selected='true'], button, [tabindex]");
      if (which === "find") { S.findBook = null; ensureFindIndex(); }
      if (f && (which === "find" || S.kbd || which === "toc")) { try { f.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
      else { try { panel.setAttribute("tabindex", "-1"); panel.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    } else {
      armHide();
      try { $.flow.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
  }
  function resetGoto() {
    if (!$.goIn || !$.goIn.value) return;
    $.goIn.value = "";
    $.toc.classList.remove("is-goto");
    $.goRes.hidden = true;
    $.goRes.innerHTML = "";
  }
  function closePanels() {
    if (!S.root) return;
    resetGoto();
    PANELS.forEach(function (k) {
      panelEl(k).hidden = true;
      var b = PANEL_BTN[k] && S.root.querySelector(PANEL_BTN[k]);
      if (b && b.hasAttribute("aria-expanded")) b.setAttribute("aria-expanded", "false");
    });
    S.panel = null;
    S.root.classList.remove("rd-panel-on");
  }

  /* while the reader is open, the browser bar (or the installed app's title bar) takes the page colour */
  function setThemeColor(on) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    if (on) {
      if (S.themeWas == null) S.themeWas = meta.getAttribute("content") || "#ffffff";
      meta.setAttribute("content", THEME_BG[effTheme()] || "#ffffff");
    } else if (S.themeWas != null) {
      meta.setAttribute("content", S.themeWas);
      S.themeWas = null;
    }
  }

  function applySettingsUI() {
    if (!S.root) return;
    S.root.setAttribute("data-theme", effTheme());
    S.root.setAttribute("data-turn", turnStyle());
    if (S.open) setThemeColor(true);
    applyShade();
    var si = sizeIndex();
    var dots = $.dots.children;
    for (var i = 0; i < dots.length; i++) dots[i].className = i <= si ? "on" : "";
    S.root.querySelector('[data-act="smaller"]').disabled = si <= 0;
    S.root.querySelector('[data-act="larger"]').disabled = si >= SIZES.length - 1;
    S.root.setAttribute("data-font", settings.font);
    var bs = $.set.querySelectorAll("[data-k]");
    for (var j = 0; j < bs.length; j++) {
      var k = bs[j].getAttribute("data-k"), v = bs[j].getAttribute("data-v"), cur;
      if (k === "justify") cur = settings.justify ? "1" : "0";
      else if (k === "night") cur = settings.night ? "1" : "0";
      else cur = String(settings[k]);
      bs[j].setAttribute("aria-checked", String(cur === v));
      bs[j].tabIndex = cur === v ? 0 : -1;
    }
  }

  function onSettingsClick(e) {
    var b = e.target.closest("button");
    if (!b) return;
    var act = b.getAttribute("data-act"), relayoutNeeded = true;
    if (act) {
      var si = sizeIndex();
      settings.size = clamp(si + (act === "larger" ? 1 : -1), 0, SIZES.length - 1);
    } else if (b.getAttribute("data-k")) {
      var k = b.getAttribute("data-k"), v = b.getAttribute("data-v");
      if (k === "theme") { settings.theme = v; relayoutNeeded = false; }
      else if (k === "font") { settings.font = v; loadFont(v); }
      else if (k === "justify") settings.justify = v === "1";
      else if (k === "night") { settings.night = v === "1"; relayoutNeeded = false; }
      else if (k === "turn") { settings.turn = v; relayoutNeeded = false; }
      else settings[k] = parseInt(v, 10);
    } else return;
    saveSettings();
    applySettingsUI();
    if (relayoutNeeded) relayout();
  }

  /* radio groups: arrow keys move inside the group */
  function groupArrow(e) {
    var b = document.activeElement;
    if (!b || !b.closest || !b.closest(".rd-seg, .rd-tabs, .rd-themes, .rd-fonts") || b.tagName !== "BUTTON") return false;
    var dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return false;
    var sibs = [].slice.call(b.parentNode.querySelectorAll("button"));
    var nx = sibs[(sibs.indexOf(b) + dir + sibs.length) % sibs.length];
    nx.focus(); nx.click();
    return true;
  }

  function buildToc() {
    var hs = $.flow.querySelectorAll("h1, h2, h3"), out = "", i;
    S.tocEls = [];
    for (i = 0; i < hs.length; i++) {
      var h = hs[i];
      var t = h.textContent.replace(/¶/g, "").trim();
      if (!t) continue;
      if (h.tagName !== "H1" && !h.id) continue;
      S.tocEls.push(h);
      out += '<li class="' + (h.tagName === "H3" ? "l3" : "l2") + '"><button type="button" data-i="' + (S.tocEls.length - 1) + '">' +
        (h.tagName === "H1" ? "Start of chapter" : escapeHtml(t)) + "</button></li>";
    }
    $.tocList.innerHTML = out;
  }
  function escapeHtml(s) { return s.replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function onTocClick(e) {
    var b = e.target.closest("button");
    if (!b) return;
    var h = S.tocEls[parseInt(b.getAttribute("data-i"), 10)];
    togglePanel("toc");
    if (h) goToEl(h, false);
  }
  function tocCurrentIndex() {
    var cur = 0;
    for (var i = 0; i < S.tocEls.length; i++) {
      var p = pageOfEl(S.tocEls[i]);
      if (p !== null && p <= S.page + (S.spread ? 1 : 0)) cur = i;
    }
    return cur;
  }
  function markTocCurrent() {
    var items = $.tocList.children, cur = tocCurrentIndex(), i;
    for (i = 0; i < items.length; i++) items[i].classList.toggle("on", i === cur);
  }

  /* ---------------------------------------------------------------- contents: the whole book */
  /* Each book has <book>/contents.json, written at build time from the headings MkDocs found (tools/site_hooks.py):
     {groups: [{name, items: [{f: file, id?, t: title, s: [{id, n, t, l}]}]}]}, addresses relative to the book's
     folder. It is one of the book's offline files, and it is fetched (and so cached) when the reader opens. */
  var bookCache = {};
  function bookOfPath(path) {
    var v = volOf(path);
    if (!v) return null;
    for (var i = 0; BOOKS && i < BOOKS.length; i++) if (BOOKS[i].id === v[0]) return BOOKS[i];
    return { id: v[0], path: v[0] };
  }
  function bookContents() {
    var b = bookOfPath(S.path || location.pathname);
    if (!b) return Promise.reject(new Error("no book"));
    if (bookCache[b.id]) return bookCache[b.id];
    var base = location.origin + BOOK_ROOT + b.path + "/";
    var p = fetch(base + "contents.json", { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    }).then(function (c) {
      // the titles are written as HTML text (&amp; and the like): decoded once here, escaped again where shown
      var dec = document.createElement("textarea");
      function un(t) { if (!t || t.indexOf("&") < 0) return t; dec.innerHTML = t; return dec.value; }
      (c.groups || []).forEach(function (g) {
        g.name = un(g.name);
        g.items.forEach(function (it) { it.t = un(it.t); (it.s || []).forEach(function (x) { x.t = un(x.t); }); });
      });
      c.base = base; c.id = b.id; return c;
    });
    bookCache[b.id] = p;
    p.catch(function () { if (bookCache[b.id] === p) delete bookCache[b.id]; });
    return p;
  }

  /* ---- "Go to": every chapter and section of the book in one list, found by typing a part of the title or number */
  function goIndex(c) {
    if (c.__go) return c.__go;
    var out = [];
    (c.groups || []).forEach(function (g) {
      g.items.forEach(function (it) {
        out.push({ f: it.f, id: it.id || "", t: it.t, n: "", ch: "", k: normq(it.t), kt: normq(it.t), kind: "ch" });
        (it.s || []).forEach(function (x) {
          out.push({ f: it.f, id: x.id, t: x.t, n: x.n || "", ch: it.t, k: normq((x.n || "") + " " + x.t + " " + it.t), kt: normq(x.t), nn: normq(x.n || ""), kind: x.l === 3 ? "l3" : "l2" });
        });
      });
    });
    c.__go = out;
    return out;
  }
  function onGotoInput() {
    var q = normq($.goIn.value);
    $.toc.classList.toggle("is-goto", q !== "");
    $.goRes.hidden = q === "";
    if (!q) { $.goRes.innerHTML = ""; return; }
    $.goRes.innerHTML = '<p class="rd-note">Looking…</p>';
    bookContents().then(function (c) {
      if (normq($.goIn.value) !== q) return;
      var words = q.split(" "), hits = [], idx = goIndex(c), i;
      // a number ("3", "3.2", "b.1"): the chapter of that number and the sections numbered from it
      var numeric = /^[a-z]?\.?\d+(\.\d+)*$/.test(q);
      var numRe = numeric ? new RegExp("^([a-z]+ )?" + q.replace(/\./g, "\\.") + "([^0-9.]|$)") : null;
      for (i = 0; i < idx.length && hits.length < 60; i++) {
        var ok = true, e = idx[i];
        if (numeric) ok = e.n ? (e.nn === q || e.nn.indexOf(q + ".") === 0) : numRe.test(e.kt);
        else for (var w = 0; w < words.length; w++) if (e.k.indexOf(words[w]) < 0) { ok = false; break; }
        if (ok) hits.push(i);
      }
      S.goHits = hits.map(function (h) { return idx[h]; });
      S.goBase = c.base;
      if (!hits.length) { $.goRes.innerHTML = '<p class="rd-note">Nothing in this book matches \u201c' + escapeHtml($.goIn.value.trim()) + '\u201d.</p>'; return; }
      var out = '<ul class="rd-go-list">';
      S.goHits.forEach(function (e, n) {
        out += '<li class="' + (e.kind === "ch" ? "ch" : e.kind) + '"><button type="button" class="rd-go" data-i="' + n + '">' +
          (e.n ? '<span class="bk-n">' + escapeHtml(e.n) + "</span> " : "") + escapeHtml(e.t) +
          (e.ch ? '<small>' + escapeHtml(e.ch) + "</small>" : "") + "</button></li>";
      });
      $.goRes.innerHTML = out + "</ul>";
    }, function () {
      if (normq($.goIn.value) !== q) return;
      $.goRes.innerHTML = '<p class="rd-note">' + (navigator.onLine === false
        ? "The contents of the whole book are not available offline. Keep this book for offline reading on the library page, or open this panel once while online."
        : "The contents of the whole book could not be loaded. Check the connection and try again.") + "</p>";
    });
  }
  function onGotoKey(e) {
    var k = e.key;
    if (k === "Enter" && e.target === $.goIn) {
      var first = $.goRes.querySelector(".rd-go");
      if (first) { e.preventDefault(); first.click(); }
    } else if (k === "ArrowDown" || k === "ArrowUp") {
      var btns = [].slice.call($.goRes.querySelectorAll(".rd-go"));
      if (!btns.length) return;
      var at = btns.indexOf(document.activeElement), to;
      if (k === "ArrowDown") to = at < 0 ? btns[0] : btns[Math.min(btns.length - 1, at + 1)];
      else to = at <= 0 ? null : btns[at - 1];
      e.preventDefault();
      (to || $.goIn).focus();
    } else if (k === "Escape" && $.goIn.value) {
      e.preventDefault();
      e.stopPropagation();
      $.goIn.value = "";
      onGotoInput();
      $.goIn.focus();
    }
  }
  function onGotoClick(e) {
    var b = e.target.closest("button.rd-go");
    if (!b) return;
    var h = S.goHits && S.goHits[parseInt(b.getAttribute("data-i"), 10)];
    if (!h) return;
    $.goIn.value = "";
    onGotoInput();
    togglePanel("toc");
    var u = new URL(S.goBase + h.f);
    if (u.pathname === S.path) {
      if (!(h.id && jumpHash("#" + h.id))) goto(0, true);
    } else {
      pushBack();
      loadChapter(u.origin + u.pathname, h.id ? { hash: "#" + h.id } : "start");
    }
  }

  function showTab(which, focus) {
    S.tab = which === "mk" || which === "hl" ? which : "bk";
    sset("localStorage", KEY_TAB, S.tab);
    var tabs = $.toc.querySelectorAll(".rd-tab");
    for (var i = 0; i < tabs.length; i++) {
      var on = tabs[i].getAttribute("data-tab") === S.tab;
      tabs[i].setAttribute("aria-selected", String(on));
      tabs[i].tabIndex = on ? 0 : -1;
      if (on && focus) tabs[i].focus();
    }
    $.toc.querySelector("#rd-tp-bk").hidden = S.tab !== "bk";
    $.toc.querySelector("#rd-tp-mk").hidden = S.tab !== "mk";
    $.toc.querySelector("#rd-tp-hl").hidden = S.tab !== "hl";
    $.toc.classList.toggle("is-bk", S.tab === "bk");
    if (S.tab === "mk") { renderMarks(); return; }
    if (S.tab === "hl") { renderHls(); return; }
    var want = bookOfPath(S.path);
    if ($.bookList.getAttribute("data-book") !== (want ? want.id : "")) {
      $.bookList.setAttribute("data-book", want ? want.id : "");
      $.bookList.removeAttribute("data-rendered");
      $.bookList.innerHTML = '<p class="rd-note">Loading the contents\u2026</p>';
    }
    bookContents().then(function (c) {
      if (S.tab !== "bk") return;
      $.tocList.hidden = true;
      if ($.bookList.getAttribute("data-rendered") !== c.id) renderBook(c);
      markBookCurrent(true);
    }, function () {
      if (S.tab !== "bk") return;
      // without the contents of the whole book: the sections of this chapter
      $.bookList.removeAttribute("data-rendered");
      $.bookList.innerHTML = '<p class="rd-note">' + (navigator.onLine === false
        ? "The contents of the whole book are not available offline; the sections of this chapter are listed."
        : "The contents of the whole book could not be loaded; the sections of this chapter are listed.") + "</p>";
      $.tocList.hidden = false;
      markTocCurrent();
    });
  }

  function renderBook(c) {
    var out = "";
    c.groups.forEach(function (g) {
      out += '<p class="bk-grp">' + escapeHtml(g.name) + '</p><ul class="bk-list">';
      g.items.forEach(function (it) {
        var href = c.base + it.f + (it.id ? "#" + it.id : "");
        var sec = it.s || [];
        out += '<li class="bk-ch" data-f="' + escapeHtml(it.f) + '"' + (it.id ? ' data-self="1"' : "") + '><div class="bk-row">';
        if (sec.length) {
          out += '<button type="button" class="bk-exp" aria-expanded="false" aria-label="Sections of ' + escapeHtml(it.t) + '">' + ICON.chev + "</button>";
        } else out += '<span class="bk-exp bk-none" aria-hidden="true"></span>';
        out += '<a class="bk-link" href="' + escapeHtml(href) + '">' + escapeHtml(it.t) + "</a></div>";
        if (sec.length) {
          out += '<ul class="bk-secs" hidden>';
          sec.forEach(function (s) {
            out += '<li class="' + (s.l === 3 ? "l3" : "l2") + '"><a href="' + escapeHtml(c.base + it.f + "#" + s.id) + '" data-id="' + escapeHtml(s.id) + '">' +
              (s.n ? '<span class="bk-n">' + escapeHtml(s.n) + "</span> " : "") + escapeHtml(s.t) + "</a></li>";
          });
          out += "</ul>";
        }
        out += "</li>";
      });
      out += "</ul>";
    });
    $.bookList.innerHTML = out;
    $.bookList.setAttribute("data-rendered", c.id);
    var gen = $.toc.querySelector(".rd-gen");
    if (gen) gen.textContent = c.gen ? (c.author ? c.author + " by " : "Generated by ") + c.gen : "";
  }

  /* the chapter being read is marked and opened, and so is the section nearest to the page on screen */
  function markBookCurrent(scroll) {
    var rows = $.bookList.querySelectorAll(".bk-ch"), i, cur = null;
    var here = S.path ? S.path.slice(S.path.lastIndexOf("/") + 1) : "";
    if (here === "") here = "index.html";
    for (i = 0; i < rows.length; i++) {
      var on = !cur && rows[i].getAttribute("data-f") === here && !rows[i].hasAttribute("data-self");
      if (on) cur = rows[i];
      rows[i].classList.toggle("on", on);
      var link = rows[i].querySelector(".bk-link");
      if (on) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
    }
    var old = $.bookList.querySelectorAll(".bk-secs a.on");
    for (i = 0; i < old.length; i++) { old[i].classList.remove("on"); old[i].removeAttribute("aria-current"); }
    if (!cur) return;
    setExpanded(cur, true);
    var h = S.tocEls && S.tocEls.length ? S.tocEls[tocCurrentIndex()] : null;
    if (h && h.id) {
      var cand = cur.querySelectorAll(".bk-secs a");
      for (i = 0; i < cand.length; i++) {
        if (cand[i].getAttribute("data-id") === h.id) { cand[i].classList.add("on"); cand[i].setAttribute("aria-current", "location"); break; }
      }
    }
    if (scroll) {
      var box = $.toc.querySelector(".rd-tabpanels"), t = cur.querySelector(".bk-secs a.on") || cur;
      var br = box.getBoundingClientRect(), tr = t.getBoundingClientRect();
      box.scrollTop += tr.top - br.top - Math.round(br.height / 3);
    }
  }
  function setExpanded(li, on) {
    var b = li.querySelector(".bk-exp"), ul = li.querySelector(".bk-secs");
    if (!ul) return;
    ul.hidden = !on;
    li.classList.toggle("open", on);
    if (b && b.tagName === "BUTTON") b.setAttribute("aria-expanded", String(on));
  }
  function onBookClick(e) {
    var x = e.target.closest("button.bk-exp");
    if (x) { setExpanded(x.closest(".bk-ch"), x.getAttribute("aria-expanded") !== "true"); return; }
    var a = e.target.closest("a");
    if (!a || (e.button && e.button !== 0) || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    var u;
    try { u = new URL(a.href); } catch (err) { return; }
    togglePanel("toc");
    if (u.pathname === S.path) {
      if (!(u.hash && jumpHash(u.hash))) goto(0, true);
    } else {
      pushBack();
      loadChapter(u.origin + u.pathname + u.search, u.hash ? { hash: u.hash } : "start");
    }
  }

  /* the Library button: leave the reader (it stays closed) and open the home page, where all the books are */
  function libraryUrl() { return location.origin + BOOK_ROOT + "index.html"; }
  function onLibraryClick(e) {
    if ((e.button && e.button !== 0) || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    leaveTo(libraryUrl(), false);
  }
  /* "About this book": the book's first page (full contents, offline keeping), which opens as a page and not in the reader */
  function onAboutClick(e) {
    if ((e.button && e.button !== 0) || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    leaveTo($.about.href, true);
  }
  function leaveTo(url, noReader) {
    savePos();
    sdel("sessionStorage", KEY_OPEN);
    S.pushed = false;
    close({ fromPop: true });
    if (noReader) sset("sessionStorage", KEY_SUP, "1"); else sdel("sessionStorage", KEY_SUP);
    location.href = url;
  }

  /* ---------------------------------------------------------------- small helpers */
  function safeDecode(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }
  function announce(t) {
    if (!$.toast) {
      $.toast = el("div", "rd-toast");
      $.toast.setAttribute("role", "status");
      $.toast.setAttribute("aria-live", "polite");
      S.root.appendChild($.toast);
    }
    $.toast.textContent = t;
    $.toast.classList.add("on");
    clearTimeout(S.toastT);
    S.toastT = setTimeout(function () { $.toast.classList.remove("on"); }, 1600);
  }
  function cycleTheme() {
    settings.theme = THEMES[(THEMES.indexOf(effTheme()) + 1) % THEMES.length];
    saveSettings();
    applySettingsUI();
    announce(settings.theme.charAt(0).toUpperCase() + settings.theme.slice(1) + " page");
  }
  function stepSize(d) {
    var si = sizeIndex(), n = clamp(si + d, 0, SIZES.length - 1);
    if (n === si) return;
    settings.size = n;
    saveSettings();
    applySettingsUI();
    relayout();
  }
  function bookId() { var b = bookOfPath(S.path); return b ? b.id : ""; }
  function dateShort(t) {
    try { return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); } catch (e) { return ""; }
  }
  function clip(t, n) {
    t = String(t || "").replace(/¶/g, "").replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : t;
  }

  /* ---------------------------------------------------------------- pop-ups: footnotes, references, citations */
  function placePop(a) {
    var rr = (a && (a.getClientRects()[0] || a.getBoundingClientRect())) || { left: S.root.clientWidth / 2, width: 0, top: 80, bottom: 80 };
    var W = S.root.clientWidth, H = S.root.clientHeight;
    var pw = $.pop.offsetWidth, ph = $.pop.offsetHeight;
    var x = clamp(rr.left + rr.width / 2 - pw / 2, 10, W - pw - 10);
    var y = rr.bottom + 10;
    if (y + ph > H - 40) y = Math.max(60, rr.top - ph - 10);
    if (y + ph > H - 10) y = Math.max(10, H - ph - 10);
    $.pop.style.left = x + "px";
    $.pop.style.top = y + "px";
    $.pop.scrollTop = 0;
  }
  function openPop(html, a, kind) {
    closePanels();
    hideSelbar();
    $.pop.className = "rd-pop md-typeset" + (kind ? " rd-pop-" + kind : "");
    $.pop.innerHTML = html;
    $.pop.hidden = false;
    placePop(a);
  }
  /* what a link to an element shows: the figure, table, box, equation, entry or note, or a heading with its first lines */
  function refPreview(t) {
    if (!t || !t.closest) return null;
    if (t.closest(".footnote")) return t.closest("li") || null;
    var box = t.closest("figure, .tbl, .csl-entry, .admonition, details, mjx-container[display='true'], div.arithmatex, table, dt, .epigraphbox");
    if (box && box !== $.flow) return box;
    if (/^H[1-6]$/.test(t.tagName)) return t;
    return t.closest(HL_SEL) || null;
  }
  function previewHtml(t) {
    var parts = [t], n = t.nextElementSibling, len = 0;
    if (/^H[2-6]$/.test(t.tagName)) {
      while (n && parts.length < 3 && len < 500 && !/^H[1-6]$/.test(n.tagName)) { parts.push(n); len += n.textContent.length; n = n.nextElementSibling; }
    }
    var d = document.createElement("div");
    parts.forEach(function (x) { d.appendChild(x.cloneNode(true)); });
    var junk = d.querySelectorAll("[id]");
    for (var i = 0; i < junk.length; i++) junk[i].removeAttribute("id");
    junk = d.querySelectorAll(".headerlink, .rd-expand, .footnote-backref, mark.rd-flash");
    for (i = 0; i < junk.length; i++) junk[i].parentNode.removeChild(junk[i]);
    return d.innerHTML;
  }
  function showRefPop(a, t, go) {
    S.popGo = go;
    openPop('<div class="rd-pop-body">' + previewHtml(t) + '</div><div class="rd-pop-foot"><button type="button" class="rd-pop-go">' +
      "<span>Go to</span>" + ICON.go + "</button></div>", a, "ref");
  }
  function showRemoteRef(a, u) {
    var url = u.origin + u.pathname + u.search, id = safeDecode(u.hash.slice(1));
    S.popGo = { url: url, hash: u.hash };
    openPop('<p class="rd-note">Loading…</p>', a, "ref");
    fetchPage(url).then(function (rec) {
      if ($.pop.hidden || !S.popGo || S.popGo.url !== url) return;
      var tmp = document.createElement("div");
      tmp.innerHTML = rec.html;
      var t = byId(tmp, id), pv = t && refPreview(t);
      if (!pv) { closePop(); pushBack(); loadChapter(url, { hash: u.hash }); return; }
      showRefPop(a, pv, S.popGo);
      if (window.bjpMath && $.pop.querySelector(".arithmatex, .math")) {
        Promise.resolve(window.bjpMath.typeset([$.pop])).then(function () { placePop(a); }, function () {});
      }
    }, function () {
      if (!$.pop.hidden) $.pop.innerHTML = '<p class="rd-note">' + (navigator.onLine === false ? "This page is not available offline." : "Could not load the page.") + "</p>";
    });
  }
  function onPopClick(e) {
    var go = e.target.closest(".rd-pop-go");
    if (go && S.popGo) {
      var g = S.popGo;
      closePop();
      if (g.url && pagePath(g.url) !== S.path) { pushBack(); loadChapter(g.url, { hash: g.hash }); }
      else { var cur = captureAnchor(); if (jumpHash(g.hash)) { S.backStack.push({ url: S.url, anchor: cur }); updateBackChip(); } }
      return;
    }
    if (onHlPopClick(e)) return;
    onLinkClick(e);
  }

  /* ---------------------------------------------------------------- bookmarks ("bjp.marks": {book: [{path, ch, i, n, f, x, pct, t}]}) */
  function marksAll() { var m = jget(KEY_MARKS, {}); return m && typeof m === "object" ? m : {}; }
  function bookMarks() { var a = marksAll()[bookId()]; return Array.isArray(a) ? a : []; }
  function saveMarks(list) {
    var all = marksAll(), id = bookId();
    if (!id) return;
    if (list.length) all[id] = list; else delete all[id];
    jset(KEY_MARKS, all);
  }
  function markPage(m) {
    if (m.n === S.anchors.length && S.anchors[m.i]) {
      var p = pageOfEl(S.anchors[m.i]);
      if (p !== null) return p;
    }
    return Math.round((m.f || 0) * S.n);
  }
  function currentMark() {
    var l = bookMarks();
    for (var i = 0; i < l.length; i++) {
      if (l[i].path !== S.path || (S.segs && (l[i].seg || 0) !== S.seg)) continue;
      if (isOnPage(markPage(l[i])) || isOnPage(Math.round((l[i].f || 0) * S.n))) return i;
    }
    return -1;
  }
  function toggleBookmark() {
    if (!S.n || !bookId()) return;
    var list = bookMarks(), at = currentMark();
    if (at >= 0) { list.splice(at, 1); announce("Bookmark removed"); }
    else {
      var a = captureAnchor(), e2 = a.i !== null ? S.anchors[a.i] : null;
      var bm = { path: S.path, ch: S.title, i: a.i, n: a.n, f: S.n > 1 ? S.page / S.n : 0, x: clip(e2 ? e2.textContent : "", 140), pct: bookPct(), t: Date.now() };
      if (S.segs) bm.seg = S.seg;
      list.push(bm);
      announce("Page bookmarked");
    }
    saveMarks(list);
    updateMarkUI();
    if (S.panel === "toc" && S.tab === "mk") renderMarks();
  }
  function updateMarkUI() {
    if (!$.mark) return;
    var on = S.n > 0 && currentMark() >= 0;
    $.mark.setAttribute("aria-pressed", String(on));
    $.mark.setAttribute("aria-label", on ? "Remove the bookmark on this page (B)" : "Bookmark this page (B)");
    $.mark.classList.toggle("on", on);
    $.ribbon.hidden = !on;
  }
  function byPlace(a, b) { return (typeof a.pct === "number" ? a.pct : 0) - (typeof b.pct === "number" ? b.pct : 0) || a.t - b.t; }
  function renderMarks() {
    var list = bookMarks().slice().sort(byPlace);
    if (!list.length) {
      $.mkList.innerHTML = '<p class="rd-note rd-empty">' + ICON.mark + "No bookmarks in this book yet. Use the bookmark button at the top, or press B, to mark the page you are on.</p>";
      return;
    }
    $.mkList.innerHTML = '<ul class="rd-items">' + list.map(function (m) {
      return '<li class="rd-it"><button type="button" class="rd-it-go" data-t="' + m.t + '"><span class="rd-it-ch">' + escapeHtml(m.ch || "") + "</span>" +
        (m.x ? '<span class="rd-it-x">' + escapeHtml(m.x) + "</span>" : "") +
        '<span class="rd-it-meta">' + (typeof m.pct === "number" ? Math.round(m.pct) + "% · " : "") + escapeHtml(dateShort(m.t)) + "</span></button>" +
        '<button type="button" class="rd-it-del" data-t="' + m.t + '" aria-label="Remove this bookmark" title="Remove">' + ICON.trash + "</button></li>";
    }).join("") + "</ul>";
  }
  function onMarkListClick(e) {
    var b = e.target.closest("button[data-t]");
    if (!b) return;
    var t = +b.getAttribute("data-t"), list = bookMarks(), m = null, k;
    for (k = 0; k < list.length; k++) if (list[k].t === t) { m = list[k]; break; }
    if (!m) return;
    if (b.classList.contains("rd-it-del")) { list.splice(k, 1); saveMarks(list); renderMarks(); updateMarkUI(); return; }
    togglePanel("toc");
    var where = { anchor: { i: m.i, n: m.n, f: m.f, seg: m.seg } };
    if (m.path === S.path) restoreAnchor(where.anchor);
    else { pushBack(); loadChapter(location.origin + m.path, where); }
  }

  /* ---------------------------------------------------------------- highlights and notes ("bjp.hl": {book: [{id, path, ch, b, o, q, c, n, pct, t}]}) */
  function hlAll() { var m = jget(KEY_HL, {}); return m && typeof m === "object" ? m : {}; }
  function bookHls() { var a = hlAll()[bookId()]; return Array.isArray(a) ? a : []; }
  function saveHls(list) {
    var all = hlAll(), id = bookId();
    if (!id) return;
    if (list.length) all[id] = list; else delete all[id];
    jset(KEY_HL, all);
  }
  function blockOf(node) {
    var e = node && (node.nodeType === 1 ? node : node.parentElement);
    e = e && e.closest ? e.closest(HL_SEL) : null;
    return e && $.flow.contains(e) ? e : null;
  }
  function textOffset(block, node, off) {
    try { var r = document.createRange(); r.setStart(block, 0); r.setEnd(node, off); return r.toString().length; } catch (e) { return -1; }
  }
  /* wrap the characters start..end of a block's text in <mark> elements (one per text node; formulas are left alone) */
  function wrapRange(block, start, end, id, color, cls) {
    var w = document.createTreeWalker(block, NodeFilter.SHOW_TEXT), n, acc = 0, todo = [], first = null;
    while ((n = w.nextNode())) {
      var len = n.nodeValue.length, a = Math.max(start, acc), b = Math.min(end, acc + len);
      if (b > a && !(n.parentElement && n.parentElement.closest("mjx-container, mark"))) todo.push([n, a - acc, b - acc]);
      acc += len;
      if (acc >= end) break;
    }
    todo.forEach(function (x) {
      var node = x[0];
      if (x[2] < node.nodeValue.length) node.splitText(x[2]);
      if (x[1] > 0) node = node.splitText(x[1]);
      var m = document.createElement("mark");
      m.className = cls || "rd-hl rd-hl-" + color;
      if (id) m.setAttribute("data-hl", id);
      node.parentNode.insertBefore(m, node);
      m.appendChild(node);
      if (!first) first = m;
    });
    return first;
  }
  function applyHighlights() {
    var list = bookHls().filter(function (h) { return h.path === S.path; });
    if (!list.length) return;
    var blocks = $.flow.querySelectorAll(HL_SEL), off = S.segs ? S.segs[S.seg].hlOff : 0;
    list.forEach(function (h) {
      // a chapter in segments: only the highlights of the segment on screen (block numbers of the whole chapter)
      if (S.segs && (h.b < off || h.b >= off + blocks.length)) return;
      var b = blocks[h.b - off], t = b ? b.textContent : "", o = h.o;
      if (!b || t.substr(o, h.q.length) !== h.q) {
        o = b ? t.indexOf(h.q) : -1;
        if (o < 0 && !S.segs) {
          for (var k = 0; k < blocks.length; k++) { o = blocks[k].textContent.indexOf(h.q); if (o >= 0) { b = blocks[k]; break; } }
        }
      }
      if (b && o >= 0) {
        var m = wrapRange(b, o, o + h.q.length, h.id, h.c);
        if (m && h.n) m.classList.add("rd-hl-note");
      }
    });
  }
  function onSelection() {
    if (!S.open || S.panel || S.zoomOpen) return;
    var sel = window.getSelection && window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) { hideSelbar(); return; }
    var r = sel.getRangeAt(0);
    if (!$.flow.contains(r.commonAncestorContainer) || !blockOf(r.startContainer) || String(sel).trim().length < 2) { hideSelbar(); return; }
    S.sel = r.cloneRange();
    var words = String(sel).trim();
    $.selbar.querySelector(".rd-sel-look").hidden = !(words.length <= 48 && words.split(/\s+/).length <= 3);
    var rects = r.getClientRects(), r0 = rects[0] || r.getBoundingClientRect(), r1 = rects[rects.length - 1] || r0;
    $.selbar.hidden = false;
    var W = S.root.clientWidth, H = S.root.clientHeight, bw = $.selbar.offsetWidth, bh = $.selbar.offsetHeight;
    var coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
    var x = clamp(r0.left + (r1.right - r0.left) / 2 - bw / 2, 8, W - bw - 8);
    // above the selection with a mouse; below it on touch screens, where the system shows its own menu above
    var y = coarse ? r1.bottom + 14 : r0.top - bh - 10;
    if (y < 8) y = r1.bottom + 14;
    if (y + bh > H - 8) y = Math.max(8, r0.top - bh - 10);
    $.selbar.style.left = x + "px";
    $.selbar.style.top = y + "px";
  }
  function hideSelbar() { if ($.selbar && !$.selbar.hidden) { $.selbar.hidden = true; } S.sel = null; }
  function createHighlight(color) {
    var r = S.sel;
    if (!r) return null;
    var b1 = blockOf(r.startContainer), b2 = blockOf(r.endContainer);
    if (!b1) return null;
    var start = textOffset(b1, r.startContainer, r.startOffset);
    var end = b2 === b1 ? textOffset(b1, r.endContainer, r.endOffset) : b1.textContent.length;
    if (start < 0 || end <= start) return null;
    var q = b1.textContent.slice(start, end);
    var lead = q.length - q.replace(/^\s+/, "").length;
    q = q.trim();
    start += lead;
    end = start + q.length;
    if (q.length < 1) return null;
    var blocks = [].slice.call($.flow.querySelectorAll(HL_SEL));
    var h = { id: "h" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36), path: S.path, ch: S.title, b: blocks.indexOf(b1) + (S.segs ? S.segs[S.seg].hlOff : 0), o: start, q: q, c: color, n: "", pct: bookPct(), t: Date.now() };
    var list = bookHls();
    list.push(h);
    saveHls(list);
    var m = wrapRange(b1, start, end, h.id, color);
    try { window.getSelection().removeAllRanges(); } catch (e) { /* ignore */ }
    hideSelbar();
    return { h: h, m: m };
  }
  function onSelbarClick(e) {
    var b = e.target.closest("button");
    if (!b) return;
    var c = b.getAttribute("data-hl"), act = b.getAttribute("data-act");
    if (c) { if (createHighlight(c)) announce("Highlighted"); return; }
    if (act === "look") {
      var w = S.sel ? S.sel.toString() : "";
      hideSelbar();
      try { window.getSelection().removeAllRanges(); } catch (er0) { /* ignore */ }
      openLookup(w);
      return;
    }
    if (act === "note") { var x = createHighlight("yellow"); if (x && x.m) showHlPop(x.m, true); return; }
    if (act === "copy") {
      var t = S.sel ? S.sel.toString() : "";
      try { if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { announce("Copied"); }, function () {}); } catch (er) { /* ignore */ }
      hideSelbar();
      try { window.getSelection().removeAllRanges(); } catch (er2) { /* ignore */ }
    }
  }
  function findHl(id) { var l = bookHls(); for (var i = 0; i < l.length; i++) if (l[i].id === id) return { list: l, i: i, h: l[i] }; return null; }
  function showHlPop(m, focusNote) {
    var id = m.getAttribute("data-hl"), f = findHl(id);
    if (!f) return;
    S.hlPop = id;
    openPop('<div class="rd-hlpop"><div class="rd-hlpop-row">' + HL_COLORS.map(function (c) {
      return '<button type="button" class="rd-hlc rd-hlc-' + c + (c === f.h.c ? " on" : "") + '" data-hlc="' + c + '" aria-label="Colour: ' + c + '" aria-pressed="' + (c === f.h.c) + '"></button>';
    }).join("") + '<button type="button" class="rd-hl-del" aria-label="Remove the highlight" title="Remove">' + ICON.trash + "</button></div>" +
      '<label class="rd-sr" for="rd-note-in">Note</label><textarea id="rd-note-in" class="rd-note-in" rows="3" placeholder="Add a note…">' + escapeHtml(f.h.n || "") + "</textarea>" +
      '<div class="rd-pop-foot"><button type="button" class="rd-pop-save">Save</button></div></div>', m, "hl");
    if (focusNote) { var ta = $.pop.querySelector("textarea"); try { ta.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }
  function marksOf(id) { return $.flow.querySelectorAll('mark[data-hl="' + id + '"]'); }
  function onHlPopClick(e) {
    if (!S.hlPop || !$.pop.classList.contains("rd-pop-hl")) return false;
    var f = findHl(S.hlPop), i, ms;
    if (!f) return false;
    var c = e.target.closest("[data-hlc]");
    if (c) {
      f.h.c = c.getAttribute("data-hlc");
      saveHls(f.list);
      ms = marksOf(f.h.id);
      for (i = 0; i < ms.length; i++) ms[i].className = "rd-hl rd-hl-" + f.h.c + (f.h.n ? " rd-hl-note" : "");
      var cs = $.pop.querySelectorAll("[data-hlc]");
      for (i = 0; i < cs.length; i++) { cs[i].classList.toggle("on", cs[i] === c); cs[i].setAttribute("aria-pressed", String(cs[i] === c)); }
      return true;
    }
    if (e.target.closest(".rd-hl-del")) {
      f.list.splice(f.i, 1);
      saveHls(f.list);
      ms = marksOf(f.h.id);
      for (i = 0; i < ms.length; i++) { var p = ms[i].parentNode; while (ms[i].firstChild) p.insertBefore(ms[i].firstChild, ms[i]); p.removeChild(ms[i]); p.normalize(); }
      closePop();
      announce("Highlight removed");
      return true;
    }
    if (e.target.closest(".rd-pop-save")) {
      f.h.n = $.pop.querySelector("textarea").value.trim();
      saveHls(f.list);
      ms = marksOf(f.h.id);
      for (i = 0; i < ms.length; i++) ms[i].classList.toggle("rd-hl-note", !!f.h.n);
      closePop();
      announce(f.h.n ? "Note saved" : "Saved");
      return true;
    }
    return e.target.closest(".rd-hlpop") ? true : false;
  }
  function renderHls() {
    var list = bookHls().slice().sort(byPlace);
    if (!list.length) {
      $.hlList.innerHTML = '<p class="rd-note rd-empty">' + ICON.note + "No highlights or notes in this book yet. Select a passage to highlight it or to add a note.</p>";
      return;
    }
    $.hlList.innerHTML = '<ul class="rd-items">' + list.map(function (h) {
      return '<li class="rd-it rd-it-hl rd-it-' + escapeHtml(h.c) + '"><button type="button" class="rd-it-go" data-id="' + escapeHtml(h.id) + '">' +
        '<span class="rd-it-q">' + escapeHtml(clip(h.q, 220)) + "</span>" + (h.n ? '<span class="rd-it-n">' + escapeHtml(h.n) + "</span>" : "") +
        '<span class="rd-it-meta">' + escapeHtml(clip(h.ch || "", 60)) + (typeof h.pct === "number" ? " · " + Math.round(h.pct) + "%" : "") + "</span></button>" +
        '<button type="button" class="rd-it-del" data-id="' + escapeHtml(h.id) + '" aria-label="Remove this highlight" title="Remove">' + ICON.trash + "</button></li>";
    }).join("") + "</ul>";
  }
  function onHlListClick(e) {
    var b = e.target.closest("button[data-id]");
    if (!b) return;
    var f = findHl(b.getAttribute("data-id"));
    if (!f) return;
    if (b.classList.contains("rd-it-del")) {
      f.list.splice(f.i, 1);
      saveHls(f.list);
      var ms = marksOf(f.h.id);
      for (var i = 0; i < ms.length; i++) { var p = ms[i].parentNode; while (ms[i].firstChild) p.insertBefore(ms[i].firstChild, ms[i]); p.removeChild(ms[i]); p.normalize(); }
      renderHls();
      return;
    }
    togglePanel("toc");
    if (f.h.path === S.path) { var m = marksOf(f.h.id)[0]; if (m) goToEl(m, false); else if (S.segs) loadChapter(S.url, { hl: f.h.id }); }
    else { pushBack(); loadChapter(location.origin + f.h.path, { hl: f.h.id }); }
  }

  /* ---------------------------------------------------------------- search of the book's text (<book>/search.json) */
  var findCache = {};
  function normMap(str) {
    var out = "", map = [];
    for (var i = 0; i < str.length; i++) {
      var d = str.charAt(i).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      if (/\s/.test(d)) d = " ";
      for (var k = 0; k < d.length; k++) { out += d.charAt(k); map.push(i); }
    }
    return { n: out, m: map };
  }
  function ensureFindIndex() {
    var b = bookOfPath(S.path);
    if (!b) return Promise.reject(new Error("no book"));
    if (findCache[b.id]) return findCache[b.id];
    var dec = document.createElement("textarea");
    var p = fetch(location.origin + BOOK_ROOT + b.path + "/search.json", { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    }).then(function (j) {
      var pages = {};
      (j.docs || []).forEach(function (d) { if (d.location.indexOf("#") < 0) pages[d.location] = d.title; });
      return (j.docs || []).filter(function (d) { return d.text; }).map(function (d) {
        dec.innerHTML = String(d.text).replace(/<[^>]+>/g, " ");
        var text = dec.value.replace(/\s+/g, " ").trim();
        var nm = normMap(text);
        return { loc: d.location, title: d.title, page: pages[d.location.split("#")[0]] || "", text: text, n: nm.n, m: nm.m };
      });
    });
    findCache[b.id] = p;
    p.catch(function () { if (findCache[b.id] === p) delete findCache[b.id]; });
    return p;
  }
  function onFindInput() {
    var raw = $.findIn.value.trim(), q = normq(raw);
    if (q.length < 2) { $.findRes.innerHTML = q ? "" : '<p class="rd-note">Type a word or a phrase to search the text of this book.</p>'; return; }
    $.findRes.innerHTML = '<p class="rd-note">Searching…</p>';
    ensureFindIndex().then(function (docs) {
      if (normq($.findIn.value.trim()) !== q) return;
      var hits = [], total = 0;
      for (var i = 0; i < docs.length && hits.length < 120; i++) {
        var d = docs[i], at = d.n.indexOf(q), k = 0;
        while (at >= 0 && k < 3) {
          total++;
          var s0 = d.m[Math.max(0, at - 60)], e0 = d.m[Math.min(d.m.length - 1, at + q.length + 70)];
          var a0 = d.m[at], a1 = d.m[at + q.length - 1] + 1;
          var pre = d.text.slice(s0, a0), mid = d.text.slice(a0, a1), post = d.text.slice(a1, e0 + 1);
          hits.push({ loc: d.loc, title: d.title, page: d.page, html: (s0 > 0 ? "…" : "") + escapeHtml(pre.replace(/^\S*\s/, s0 > 0 ? "" : "$&")) + "<mark>" + escapeHtml(mid) + "</mark>" + escapeHtml(post.replace(/\s\S*$/, "")) + "…" });
          k++;
          at = d.n.indexOf(q, at + q.length);
        }
      }
      S.findHits = hits;
      S.findQ = raw;
      if (!hits.length) { $.findRes.innerHTML = '<p class="rd-note">Nothing in this book matches “' + escapeHtml(raw) + "”.</p>"; return; }
      var out = '<p class="rd-find-n">' + (hits.length >= 120 ? "More than 100 places" : hits.length === 1 ? "1 place" : hits.length + " places") + "</p><ul class=\"rd-items\">", lastPage = null;
      hits.forEach(function (h, n) {
        if (h.page !== lastPage) { out += '<li class="rd-find-pg">' + escapeHtml(h.page || h.title) + "</li>"; lastPage = h.page; }
        out += '<li><button type="button" class="rd-fr" data-i="' + n + '">' + (h.title && h.title !== h.page ? '<span class="rd-fr-t">' + escapeHtml(h.title) + "</span>" : "") +
          '<span class="rd-fr-x">' + h.html + "</span></button></li>";
      });
      $.findRes.innerHTML = out + "</ul>";
    }, function () {
      $.findRes.innerHTML = '<p class="rd-note">' + (navigator.onLine === false ? "The search of this book is not available offline. Keep the book for offline reading, or search once while online." : "The search could not be loaded. Check the connection and try again.") + "</p>";
    });
  }
  function onFindKey(e) {
    if (e.key === "Enter") { var f = $.findRes.querySelector(".rd-fr"); if (f) { e.preventDefault(); f.click(); } }
    else if (e.key === "ArrowDown") { var g = $.findRes.querySelector(".rd-fr"); if (g) { e.preventDefault(); g.focus(); } }
  }
  function onFindClick(e) {
    var b = e.target.closest(".rd-fr");
    if (!b) return;
    var h = S.findHits && S.findHits[+b.getAttribute("data-i")];
    if (!h) return;
    togglePanel("find");
    var u = new URL(location.origin + BOOK_ROOT + h.loc), where = { hash: u.hash || "", find: S.findQ };
    if (u.pathname === S.path && S.segs && u.hash && !byId($.flow, safeDecode(u.hash.slice(1)))) { pushBack(); loadChapter(S.url, where); return; }
    if (u.pathname === S.path) {
      clearFlash();
      var start = u.hash ? byId($.flow, safeDecode(u.hash.slice(1))) : null, m = flashFind(S.findQ, start);
      var cur = captureAnchor();
      if (m) goToEl(m, true); else if (!(u.hash && jumpHash(u.hash))) goto(0, true);
      S.backStack.push({ url: S.url, anchor: cur });
      updateBackChip();
    } else { pushBack(); loadChapter(u.origin + u.pathname, where); }
  }
  /* the first place at or after `start` where the words occur, marked for a moment */
  function flashFind(q, start) {
    var nq = normq(q);
    if (!nq) return null;
    var w = document.createTreeWalker($.flow, NodeFilter.SHOW_TEXT), n, began = !start;
    while ((n = w.nextNode())) {
      if (!began) { if (start.contains(n) || (start.compareDocumentPosition(n) & 4)) began = true; else continue; }
      if (n.parentElement && n.parentElement.closest("mjx-container")) continue;
      var nm = normMap(n.nodeValue), at = nm.n.indexOf(nq);
      if (at < 0) continue;
      var a = nm.m[at], b = nm.m[at + nq.length - 1] + 1;
      if (b < n.nodeValue.length) n.splitText(b);
      var node = a > 0 ? n.splitText(a) : n;
      var m = document.createElement("mark");
      m.className = "rd-flash";
      node.parentNode.insertBefore(m, node);
      m.appendChild(node);
      S.flashT = setTimeout(clearFlash, 4000);
      return m;
    }
    return null;
  }
  function clearFlash() {
    clearTimeout(S.flashT);
    var ms = $.flow.querySelectorAll("mark.rd-flash");
    for (var i = 0; i < ms.length; i++) { var p = ms[i].parentNode; while (ms[i].firstChild) p.insertBefore(ms[i].firstChild, ms[i]); p.removeChild(ms[i]); p.normalize(); }
  }

  /* ---------------------------------------------------------------- the slider over the whole book, a mark per chapter */
  function updateScrub(pct) {
    if (!$.range || S.scrubbing) return;
    var v = pct !== null && pct !== undefined ? pct * 10 : (S.n > 1 ? S.page / (S.n - 1) * 1000 : 0);
    $.range.value = String(Math.round(v));
    $.range.setAttribute("aria-valuetext", pct !== null && pct !== undefined ? Math.round(pct) + "% of the book, " + (S.title || "") : "Page " + (S.page + 1) + " of " + S.n);
    $.botch.textContent = S.title || "";
    if (S.model && $.ticks.getAttribute("data-book") !== S.modelBook) {
      var m = S.model, out = "";
      m.order.forEach(function (f, i) { if (i) out += '<i style="left:' + (m.units[f].before / m.total * 100).toFixed(2) + '%"></i>'; });
      $.ticks.innerHTML = out;
      $.ticks.setAttribute("data-book", S.modelBook);
    } else if (!S.model) { $.ticks.innerHTML = ""; $.ticks.removeAttribute("data-book"); }
  }
  function scrubTarget(v) {
    var m = S.model;
    if (!m || !m.total) return null;
    var x = v / 1000 * m.total, f = m.order[m.order.length - 1];
    for (var i = 0; i < m.order.length; i++) { var u = m.units[m.order[i]]; if (x < u.before + u.w) { f = m.order[i]; break; } }
    var un = m.units[f];
    return { f: f, frac: clamp((x - un.before) / un.w, 0, 0.995), title: (S.modelTitles && S.modelTitles[f]) || "" };
  }
  function onScrubInput() {
    S.scrubbing = true;
    showChrome(true);
    var v = +$.range.value, t = scrubTarget(v), here = (!t || fileOfPath(S.path) === t.f) && !S.segs;
    var pg = here ? (t ? Math.floor(t.frac * S.n) : Math.round(v / 1000 * Math.max(0, S.n - 1))) : -1;
    $.tipT.textContent = t ? clip(t.title, 60) : S.title || "";
    $.tipX.textContent = pg >= 0 ? clip(pageSnippet(pg), 90) : "";
    $.tipX.hidden = !$.tipX.textContent;
    $.tipP.textContent = (pg >= 0 ? "Page " + (pg + 1) + " of " + S.n + (t ? " \u00b7 " : "") : "") + (t ? Math.round(v / 10) + "% of the book" : "");
    $.tip.hidden = false;
    var w = $.range.clientWidth, tw = $.tip.offsetWidth;
    $.tip.style.left = clamp(v / 1000 * w - tw / 2, 0, Math.max(0, w - tw)) + "px";
  }
  function onScrubChange() {
    S.scrubbing = false;
    $.tip.hidden = true;
    var v = +$.range.value, t = scrubTarget(v);
    if (!t) { goto(Math.round(v / 1000 * Math.max(0, S.n - 1)), true); return; }
    if (fileOfPath(S.path) === t.f && S.segs) {
      var gs = segOfFrac(S.segs, S.rec, t.frac);
      if (gs.k === S.seg) { goto(Math.floor(gs.f * S.n), true); armHide(); }
      else { pushBack(); loadChapter(S.url, { anchor: { i: null, n: 0, f: t.frac } }); }
      return;
    }
    if (fileOfPath(S.path) === t.f) { goto(Math.floor(t.frac * S.n), true); armHide(); return; }
    pushBack();
    loadChapter(S.modelBase + t.f, { anchor: { i: null, n: 0, f: t.frac } });
  }

  /* ---------------------------------------------------------------- full-screen view: figures (zoom and pan), tables and code */
  var Z = { s: 1, x: 0, y: 0, pts: {}, doc: false };
  function zoomApply() {
    var t = $.zoom.querySelector(".rd-zoom-img");
    if (t) t.style.transform = "translate(" + Z.x + "px," + Z.y + "px) scale(" + Z.s + ")";
    var d = $.zoom.querySelector(".rd-zoom-doc");
    if (d) d.style.fontSize = (Z.s * 100).toFixed(0) + "%";
  }
  function zoomBy(f) {
    Z.s = clamp(Z.s * f, Z.doc ? 0.6 : 1, Z.doc ? 2.4 : 6);
    if (Z.s === 1 && !Z.doc) { Z.x = 0; Z.y = 0; }
    zoomApply();
  }
  function openZoom(html, cap, doc) {
    S.zoomOpen = true;
    Z = { s: 1, x: 0, y: 0, pts: {}, doc: doc };
    closePop();
    hideSelbar();
    $.zoom.classList.toggle("is-doc", !!doc);
    $.zoom.querySelector(".rd-zoom-stage").innerHTML = html;
    var c = $.zoom.querySelector(".rd-zoom-cap");
    c.innerHTML = cap || "";
    c.hidden = !cap;
    $.zoom.hidden = false;
    zoomApply();
    try { $.zoom.querySelector('[data-z="close"]').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  function openZoomImg(img) {
    var fig = img.closest("figure"), cap = fig && fig.querySelector("figcaption");
    openZoom('<img class="rd-zoom-img" src="' + escapeHtml(img.currentSrc || img.src) + '" alt="' + escapeHtml(img.getAttribute("alt") || "") + '" draggable="false">',
      cap ? previewHtml(cap) : "", false);
  }
  function openZoomDoc(box) {
    var c = box.cloneNode(true), junk = c.querySelectorAll(".rd-expand, .rd-xhint, [id]");
    for (var i = 0; i < junk.length; i++) { if (junk[i].classList.contains("rd-expand")) junk[i].parentNode.removeChild(junk[i]); else junk[i].removeAttribute("id"); }
    c.classList.remove("rd-tbl-flow", "rd-tbl-tight", "rd-zoomable");
    var t = c.querySelector("table");
    if (t) t.style.zoom = "";
    c.classList.remove("rd-xscroll", "rd-x-l", "rd-x-r");
    var ms = c.querySelectorAll("mjx-container[data-rd-fs]");
    for (var k = 0; k < ms.length; k++) { ms[k].style.fontSize = ms[k].getAttribute("data-rd-fs") + "%"; ms[k].classList.remove("rd-xscroll", "rd-x-l", "rd-x-r"); }
    if (c.matches && c.matches("mjx-container[data-rd-fs]")) c.style.fontSize = c.getAttribute("data-rd-fs") + "%";
    openZoom('<div class="rd-zoom-doc md-typeset">' + c.outerHTML + "</div>", "", true);
  }
  function closeZoom() {
    if (!S.zoomOpen) return;
    S.zoomOpen = false;
    $.zoom.hidden = true;
    $.zoom.querySelector(".rd-zoom-stage").innerHTML = "";
    try { $.flow.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  function wireZoom() {
    var z = $.zoom, st = z.querySelector(".rd-zoom-stage"), last = 0, pinch = null, drag = null;
    z.querySelector(".rd-zoom-bar").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      var a = b.getAttribute("data-z");
      if (a === "close") closeZoom(); else zoomBy(a === "in" ? 1.4 : 1 / 1.4);
    });
    st.addEventListener("pointerdown", function (e) {
      if (Z.doc) return;
      Z.pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      try { st.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      var ids = Object.keys(Z.pts);
      if (ids.length === 2) {
        var a = Z.pts[ids[0]], b = Z.pts[ids[1]];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: Z.s };
        drag = null;
      } else if (ids.length === 1) drag = { x: e.clientX, y: e.clientY, ox: Z.x, oy: Z.y, moved: false, onImg: !!e.target.closest(".rd-zoom-img") };
    });
    st.addEventListener("pointermove", function (e) {
      if (Z.doc || !Z.pts[e.pointerId]) return;
      Z.pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(Z.pts);
      if (pinch && ids.length >= 2) {
        var a = Z.pts[ids[0]], b = Z.pts[ids[1]];
        Z.s = clamp(pinch.s * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, 1, 6);
        if (Z.s === 1) { Z.x = 0; Z.y = 0; }
        zoomApply();
      } else if (drag) {
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
        if (Z.s > 1) { Z.x = drag.ox + dx; Z.y = drag.oy + dy; zoomApply(); }
      }
    });
    function up(e) {
      if (Z.doc || !Z.pts[e.pointerId]) return;
      delete Z.pts[e.pointerId];
      if (Object.keys(Z.pts).length < 2) pinch = null;
      if (drag && !drag.moved && !Object.keys(Z.pts).length) {
        var now = Date.now();
        if (now - last < 320) { Z.s = Z.s > 1 ? 1 : 2.5; Z.x = 0; Z.y = 0; zoomApply(); last = 0; }
        else {
          last = now;
          if (!drag.onImg && Z.s === 1) setTimeout(function () { if (last === now) closeZoom(); }, 330);
        }
      }
      if (!Object.keys(Z.pts).length) drag = null;
    }
    st.addEventListener("pointerup", up);
    st.addEventListener("pointercancel", up);
    st.addEventListener("wheel", function (e) {
      if (Z.doc && !e.ctrlKey) return;
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15);
    }, { passive: false });
  }

  /* ---------------------------------------------------------------- full screen */
  function fsElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  function toggleFullscreen() {
    try {
      if (fsElement()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else (S.root.requestFullscreen || S.root.webkitRequestFullscreen).call(S.root);
    } catch (e) { /* ignore */ }
  }
  function onFsChange() {
    var on = !!fsElement();
    $.fs.innerHTML = (on ? ICON.fsExit : ICON.fs) + "<span>" + (on ? "Leave full screen" : "Full screen") + "</span>";
    if (S.open) setTimeout(function () { relayout(); }, 120);
  }

  /* ---------------------------------------------------------------- input: pointer, wheel, keyboard */
  var INTERACTIVE = "a,button,summary,input,select,textarea,label,.pk-q-ui,.rd-panel,.rd-pop,.rd-top,.rd-bot,.rd-back,.rd-selbar,[role=button]";

  function onPointerDown(e) {
    if (!S.open) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.target && e.target.closest && e.target.closest("input, textarea, select")) return;     // a text box of a quiz: no page turns
    S.p = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, mouse: e.pointerType === "mouse", drag: false, moved: false, target: e.target, dx: 0 };
  }
  function edgeResist(dx) {
    var vw = $.view.clientWidth || 300;
    var noPrev = S.page === 0, noNext = S.page + (S.spread ? 2 : 1) >= S.n;
    if (dx > 0 && noPrev) dx *= (S.rec && S.rec.prev) || moreSeg(-1) ? 0.5 : 0.22;
    else if (dx < 0 && noNext) dx *= (S.rec && S.rec.next) || moreSeg(1) ? 0.5 : 0.22;
    return clamp(dx, -vw, vw);
  }
  function onPointerMove(e) {
    var p = S.p;
    if (e.pointerType === "mouse" && !p) {
      // mouse movement shows the bar; the cursor hints at the page-turning zones
      var f = e.clientX / S.root.clientWidth;
      $.stage.classList.toggle("rd-cur-prev", f < 1 / 3);
      $.stage.classList.toggle("rd-cur-next", f > 2 / 3);
      if (!S.lastMouse || Math.abs(e.clientX - S.lastMouse[0]) + Math.abs(e.clientY - S.lastMouse[1]) > 3) { S.lastMouse = [e.clientX, e.clientY]; showChrome(false); }
      return;
    }
    if (!p || p.id !== e.pointerId) return;
    var dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (p.mouse) { if (Math.hypot(dx, dy) > 5) p.moved = true; return; }
    if (!p.drag) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        p.drag = true;
        try { $.stage.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
        $.flow.classList.remove("rd-anim");
        closePop();
      } else if (Math.abs(dy) > 12 || Math.abs(dx) > 12) p.moved = true;
    }
    if (p.drag && !S.loading) {
      p.dx = dx;
      $.flow.style.transform = "translate3d(" + (-S.page * S.stride + edgeResist(dx)) + "px,0,0)";
    }
  }
  function onPointerUp(e) {
    var p = S.p;
    if (!p || p.id !== e.pointerId) return;
    S.p = null;
    var dx = e.clientX - p.x, dt = Math.max(1, e.timeStamp - p.t);
    if (p.drag) {
      try { $.stage.releasePointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      var thr = Math.max(40, ($.view.clientWidth || 300) * 0.14);
      var v = Math.abs(dx) / dt;
      if (Math.abs(dx) > thr || (v > 0.45 && Math.abs(dx) > 24)) {
        var dir = dx < 0 ? 1 : -1;
        if (S.loading) { turn(dir); return; }
        var step = S.spread ? 2 : 1;
        var hasPage = dir > 0 ? S.page + step < S.n : S.page - step >= 0;
        var hasChapter = moreSeg(dir) || (dir > 0 ? S.rec && S.rec.next : S.rec && S.rec.prev);
        if (hasPage || hasChapter) { turn(dir); return; }
      }
      if (!S.loading) goto(S.page, true, true);
      return;
    }
    if (p.moved) return;
    if (p.mouse) {
      var sel = window.getSelection && window.getSelection();
      if (sel && String(sel).length > 0) return;
    }
    if (dt > 700 && !p.mouse) return; // a long press is not a tap
    tap(e.clientX, p.target);
  }
  function onPointerCancel(e) {
    var p = S.p;
    if (!p || p.id !== e.pointerId) return;
    S.p = null;
    if (p.drag) goto(S.page, true, true);
  }
  function tap(x, target) {
    if (target && target.closest && target.closest(INTERACTIVE)) return;
    hideHint();
    if ($.pop && !$.pop.hidden) { closePop(); return; }
    if (S.panel) { closePanels(); armHide(); return; }
    if (!$.selbar.hidden) { hideSelbar(); return; }
    if (target && target.closest && !S.loading) {
      var hl = target.closest("mark.rd-hl");
      if (hl) { showHlPop(hl); return; }
      var img = target.closest("figure img, img.tikz, .rd-flow p > img, .rd-imgbox");
      if (img && img.classList.contains("rd-imgbox")) img = img.querySelector("img");
      if (img && $.flow.contains(img)) { openZoomImg(img); return; }
      // a table, a formula or code too wide for the page opens full screen
      var wide = target.closest(".rd-xscroll, .tbl.rd-tbl-tight, .rd-xhint");
      if (wide && $.flow.contains(wide)) {
        var box = wide.classList.contains("rd-xhint") ? wide.previousElementSibling || wide.parentNode : wide;
        box = box.closest(".tbl, .highlight") || box.closest("div.arithmatex") || box;
        if (box.querySelector && (box.matches("mjx-container") || box.querySelector("mjx-container[display='true']")) && !box.closest(".tbl")) openZoomDoc(box, true);
        else openZoomDoc(box);
        return;
      }
    }
    var f = x / S.root.clientWidth;
    if (f < 1 / 3) turn(-1);
    else if (f > 2 / 3) turn(1);
    else toggleChrome();
  }
  function onWheel(e) {
    if (!S.open) return;
    if (e.target.closest && e.target.closest(".rd-panel,.rd-pop")) return;
    if (e.ctrlKey) return; // pinch zoom
    var t = e.target.closest && e.target.closest(".rd-xscroll");
    var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (t && Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    var now = e.timeStamp;
    if (Math.abs(d) < 12 || now - S.wheelAt < 480) { if (Math.abs(d) >= 12) S.wheelAt = now; return; }
    S.wheelAt = now;
    turn(d > 0 ? 1 : -1);
  }

  function onKey(e) {
    if (!S.open) return;
    var k = e.key;
    if (S.zoomOpen) {
      if (k === "Escape" || k === "Esc") { e.preventDefault(); closeZoom(); }
      else if (k === "+" || k === "=") { e.preventDefault(); zoomBy(1.4); }
      else if (k === "-" || k === "_") { e.preventDefault(); zoomBy(1 / 1.4); }
      return;
    }
    if (k === "Escape" || k === "Esc") {
      if (fsElement()) return; // the browser leaves full screen first
      e.preventDefault();
      if (!$.selbar.hidden) { hideSelbar(); try { window.getSelection().removeAllRanges(); } catch (x) { /* ignore */ } }
      else if ($.pop && !$.pop.hidden) closePop();
      else if (S.panel === "toc" && $.goIn && $.goIn.value) { resetGoto(); try { $.goIn.focus(); } catch (x) { /* ignore */ } }
      else if (S.panel) { togglePanel(S.panel); }
      else close();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var ae = document.activeElement, atag = ae && ae.tagName;
    if (atag === "TEXTAREA" || (atag === "INPUT" && ae.type !== "radio") || (ae && ae.isContentEditable)) return;
    if (S.panel) {
      if (groupArrow(e)) e.preventDefault();
      return;
    }
    if ($.pop && !$.pop.hidden && $.pop.contains(ae)) return;
    var cmd = { c: function () { togglePanel("toc"); }, a: function () { togglePanel("set"); }, "/": function () { togglePanel("find"); },
      b: toggleBookmark, "?": function () { togglePanel("help"); }, t: cycleTheme, f: toggleFullscreen,
      "]": function () { if (S.rec && S.rec.next) loadChapter(S.rec.next, "start"); }, "[": function () { if (S.rec && S.rec.prev) loadChapter(S.rec.prev, "start"); },
      "+": function () { stepSize(1); }, "=": function () { stepSize(1); }, "-": function () { stepSize(-1); }, "_": function () { stepSize(-1); } }[k.length === 1 ? k.toLowerCase() : ""];
    if (cmd && !(k === "f" && $.fs.hidden)) { e.preventDefault(); showChrome(false); cmd(); return; }
    var tag = document.activeElement && document.activeElement.tagName;
    var onButton = tag === "BUTTON" || tag === "A" || tag === "INPUT" || tag === "SELECT";
    var dir = 0;
    if (k === "ArrowRight" || k === "PageDown") dir = 1;
    else if (k === "ArrowLeft" || k === "PageUp") dir = -1;
    else if ((k === " " || k === "Spacebar") && !onButton) dir = e.shiftKey ? -1 : 1;
    else if (k === "Home" && !onButton) { e.preventDefault(); goto(0, true); return; }
    else if (k === "End" && !onButton) { e.preventDefault(); goto(S.n - 1, true); return; }
    if (dir) {
      if ((k === " " || k === "Spacebar") && onButton) return;
      e.preventDefault();
      turn(dir);
    }
  }


  /* ---------------------------------------------------------------- the footer: pages or minutes left */
  /* The reading speed is measured on this device: the characters of a page and the time it stayed on screen, for pages
     read for between 4 seconds and 4 minutes (a running average in "bjp.reader.speed", characters a minute). */
  function speed() { var v = +sget("localStorage", KEY_SPEED); return v > 0 ? v : 1000; }
  function noteSpeed(dir) {
    var now = Date.now(), dt = now - (S.pageAt || now);
    if (dir <= 0 || !S.textLen || !S.n || dt < 4000 || dt > 240000 || R.on) return;
    var sample = clamp(S.textLen / S.n * (S.spread ? 2 : 1) / (dt / 60000), 250, 5000), v = +sget("localStorage", KEY_SPEED) || 0;
    sset("localStorage", KEY_SPEED, String(Math.round(v ? v * 0.85 + sample * 0.15 : sample)));
  }
  function minText(chars) {
    var m = Math.round(chars / speed());
    if (m < 1) return "Less than a minute";
    if (m < 60) return m + " min";
    var h = Math.floor(m / 60), r = m % 60;
    return h + " h" + (r ? " " + r + " min" : "");
  }
  function infoText(left, last) {
    if (settings.info === "pages" || !S.textLen) {
      if (S.segs) left = Math.round((1 - chapFrac(last)) * S.rec.segChars * S.n / Math.max(1, S.textLen));
      return left <= 0 ? "Last page in chapter" : left === 1 ? "1 page left in chapter" : left + " pages left in chapter";
    }
    if (settings.info === "book" && S.model && S.model.total) {
      var pct = bookPct(), rest = pct === null ? 0 : (100 - pct) / 100 * S.model.total * 20;
      return rest < 1 ? "End of the book" : minText(rest) + " left in book";
    }
    var chars = Math.max(0, left) / Math.max(1, S.n) * S.textLen;
    if (S.segs) chars = (1 - chapFrac(last)) * S.rec.segChars;
    return left <= 0 && !moreSeg(1) ? "Last page in chapter" : minText(chars) + " left in chapter";
  }
  function cycleInfo() {
    var order = ["ch", "book", "pages"];
    settings.info = order[(order.indexOf(settings.info) + 1) % order.length];
    if (settings.info === "book" && !(S.model && S.model.total)) settings.info = "pages";
    saveSettings();
    updatePageUI();
  }

  /* ---------------------------------------------------------------- light and warmth: overlays over the reader only */
  function applyShade() {
    if (!$.dim) return;
    $.dim.style.opacity = ((1 - settings.bright) * 1.15).toFixed(3);
    var nightWarm = settings.night && isNight() ? 0.25 : 0;
    $.warm.style.opacity = (Math.max(settings.warm, nightWarm) * 0.42).toFixed(3);
    if (document.activeElement !== $.bright) $.bright.value = String(Math.round(settings.bright * 100));
    if (document.activeElement !== $.warmr) $.warmr.value = String(Math.round(settings.warm * 100));
    $.bright.setAttribute("aria-valuetext", Math.round(settings.bright * 100) + "%");
    $.warmr.setAttribute("aria-valuetext", Math.round(settings.warm * 100) + "%");
  }
  function onShadeInput() {
    settings.bright = clamp(+$.bright.value / 100, 0.35, 1);
    settings.warm = clamp(+$.warmr.value / 100, 0, 1);
    applyShade();
  }

  /* ---------------------------------------------------------------- wide blocks: the edges fade where there is more */
  function onXScroll(e) {
    var b = e.target;
    if (!b || !b.classList || !b.classList.contains("rd-xscroll")) return;
    b.classList.toggle("rd-x-l", b.scrollLeft > 2);
    b.classList.toggle("rd-x-r", b.scrollLeft + b.clientWidth < b.scrollWidth - 2);
  }
  /* the first words of a page of this chapter (the preview of the slider) */
  function pageSnippet(pg) {
    var fr = $.flow.getBoundingClientRect(), start = pg * S.stride;
    for (var i = 0; i < S.anchors.length; i++) {
      var r = S.anchors[i].getClientRects();
      if (!r.length || r[r.length - 1].right - fr.left <= start + 2) continue;
      var t = S.anchors[i].textContent.replace(/\s+/g, " ").trim();
      if (t) return t;
    }
    return "";
  }

  /* ---------------------------------------------------------------- the More sheet */
  var ACTIONS = [];
  /* other scripts add their own entries (assets/slides.js: Present): {id, label, title, icon, run} */
  function addAction(a) {
    if (!a || !a.id) return;
    for (var i = 0; i < ACTIONS.length; i++) if (ACTIONS[i].id === a.id) return;
    ACTIONS.push(a);
    renderActions();
  }
  function renderActions() {
    if (!$.more) return;
    var grid = $.more.querySelector(".rd-mgrid"), after = grid.querySelector(".rd-mi-speak");
    ACTIONS.forEach(function (a) {
      if (grid.querySelector('[data-mi="x:' + a.id + '"]')) return;
      var b = el("button", "rd-mi rd-mi-x", (a.icon || "") + "<span>" + escapeHtml(a.label) + "</span>");
      b.type = "button";
      b.setAttribute("data-mi", "x:" + a.id);
      if (a.title) b.title = a.title;
      after.insertAdjacentElement("afterend", b);
      after = b;
    });
  }
  function onMoreClick(e) {
    var b = e.target.closest("[data-mi]");
    if (!b) return;
    var k = b.getAttribute("data-mi");
    if (k === "find") { togglePanel("find"); return; }
    if (k === "keys") { togglePanel("help"); return; }
    if (k === "marks" || k === "notes") { togglePanel("toc"); showTab(k === "marks" ? "mk" : "hl", true); return; }
    closePanels();
    if (k === "speak") ttsStart();
    else if (k === "fs") toggleFullscreen();
    else if (k.indexOf("x:") === 0) {
      for (var i = 0; i < ACTIONS.length; i++) if ("x:" + ACTIONS[i].id === k) { try { ACTIONS[i].run(); } catch (er) { /* ignore */ } }
    }
  }

  /* ---------------------------------------------------------------- look up a word (Wiktionary) */
  /* The word selected (the Look up button of the selection bar) is looked up in the English Wiktionary, which explains
     words of English, French, Hindi, Sanskrit and many other languages, from the browser: nothing but the word is sent
     (no cookies, no referrer). Links to Wikipedia and a translation open in a new tab only when tapped. */
  var lookCache = {};
  var WIKI_LANGS = { en: 1, fr: 1, hi: 1, sa: 1, de: 1, es: 1 };
  function lookWord(w) {
    try { return String(w || "").replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, "").trim(); }
    catch (e) { return String(w || "").replace(/^[\s.,;:!?"'()\[\]«»“”‘’]+|[\s.,;:!?"'()\[\]«»“”‘’]+$/g, "").trim(); }
  }
  function fetchDefs(q) {
    if (lookCache[q]) return lookCache[q];
    var url = "https://en.wiktionary.org/api/rest_v1/page/definition/" + encodeURIComponent(q.replace(/ /g, "_"));
    var p = fetch(url, { credentials: "omit", referrerPolicy: "no-referrer", mode: "cors", headers: { Accept: "application/json" } }).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    });
    lookCache[q] = p;
    p.catch(function () { delete lookCache[q]; });
    return p;
  }
  function textOf(html) {
    var d = document.createElement("div");
    d.innerHTML = String(html || "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
    return d.textContent.replace(/\s+/g, " ").trim();
  }
  function openLookup(word) {
    var q = lookWord(word);
    if (!q) return;
    if (S.panel !== "look") togglePanel("look");
    var lang = (S.lang || "en").split("-")[0], wl = WIKI_LANGS[lang] ? lang : "en", enc = encodeURIComponent(q);
    var links = '<p class="rd-look-links">' +
      '<a href="https://en.wiktionary.org/wiki/' + enc + '" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Wiktionary' + ICON.ext + "</a>" +
      '<a href="https://' + wl + '.wikipedia.org/wiki/Special:Search?search=' + enc + '" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Wikipedia' + ICON.ext + "</a>" +
      (lang !== "en" || /[^\u0000-\u024f]/.test(q) ? '<a href="https://translate.google.com/?sl=auto&tl=en&op=translate&text=' + enc + '" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Translate' + ICON.ext + "</a>" : "") +
      "</p>";
    var head = '<h2 class="rd-look-w" lang="' + escapeHtml(S.lang || "en") + '">' + escapeHtml(q) + "</h2>";
    if (navigator.onLine === false) {
      $.lookBody.innerHTML = head + '<p class="rd-note">Looking up a word needs a connection.</p>' + links;
      return;
    }
    $.lookBody.innerHTML = head + '<p class="rd-note">Looking it up\u2026</p>' + links;
    var tries = [q];
    if (q.toLowerCase() !== q) tries.push(q.toLowerCase());
    (function next(i) {
      fetchDefs(tries[i]).then(function (j) {
        if (S.panel !== "look") return;
        if (!j && i + 1 < tries.length) { next(i + 1); return; }
        $.lookBody.innerHTML = head + renderDefs(j, lang) + links;
      }, function () {
        if (S.panel === "look") $.lookBody.innerHTML = head + '<p class="rd-note">The dictionary could not be reached. Try again later.</p>' + links;
      });
    })(0);
  }
  function renderDefs(j, lang) {
    if (!j) return '<p class="rd-note">No entry for this word in Wiktionary.</p>';
    var keys = Object.keys(j), order = (lang === "en" ? ["en"] : [lang, "en"]).concat(keys.filter(function (k) { return k !== lang && k !== "en"; })), out = "", shown = 0;
    order.forEach(function (k) {
      if (shown >= 2 || !Array.isArray(j[k])) return;
      var parts = "";
      j[k].slice(0, 3).forEach(function (pos) {
        var defs = (pos.definitions || []).map(function (d) { return textOf(d.definition); }).filter(Boolean).slice(0, 3);
        if (!defs.length) return;
        parts += '<p class="rd-look-pos">' + escapeHtml(pos.partOfSpeech || "") + "</p><ol>" + defs.map(function (d) { return "<li>" + escapeHtml(d) + "</li>"; }).join("") + "</ol>";
      });
      if (!parts) return;
      shown++;
      out += '<div class="rd-look-lang"><p class="rd-look-ln">' + escapeHtml((j[k][0] && j[k][0].language) || k) + "</p>" + parts + "</div>";
    });
    return out || '<p class="rd-note">No entry for this word in Wiktionary.</p>';
  }
  function onLookClick(e) {
    var a = e.target.closest("a[href]");
    if (a) e.stopPropagation();
  }

  /* ---------------------------------------------------------------- read aloud */
  /* A small shared helper over the browser's speech synthesis (window.bjpTTS), and the reader's use of it: the text from
     the page on screen, sentence by sentence, in the book's language; the pages follow the voice; pause, speed, stop.
     The voice and speed chosen for the phrases of the language books (assets/speak.js, "Voice and speed", kept in
     localStorage "pk.speak") are used here too, and a phrase played there pauses the reading. */
  var TTS = window.bjpTTS || (window.bjpTTS = (function () {
    var synth = window.speechSynthesis;
    function supported() { return !!(synth && window.SpeechSynthesisUtterance); }
    function prefs() { try { return JSON.parse(localStorage.getItem("pk.speak") || "{}") || {}; } catch (e) { return {}; } }
    function voiceFor(lang) {
      if (!supported()) return null;
      var vs = synth.getVoices() || [], l = String(lang || "en").toLowerCase(), base = l.split("-")[0], alt = base === "sa" ? "hi" : base;
      var want = (prefs().voice || {})[base];
      function find(f) { for (var i = 0; i < vs.length; i++) if (f(String(vs[i].lang || "").toLowerCase().replace("_", "-"), vs[i])) return vs[i]; return null; }
      return (want && find(function (x, v) { return v.name === want; })) || find(function (x) { return x === l; }) ||
        (base === "en" && find(function (x) { return x === "en-in" || x === "en-gb"; })) ||
        find(function (x) { return x.split("-")[0] === base; }) || find(function (x) { return x.split("-")[0] === alt; });
    }
    function speak(text, lang, o) {
      o = o || {};
      var u = new window.SpeechSynthesisUtterance(text), v = voiceFor(lang);
      u.lang = lang || "en";
      if (v) u.voice = v;
      u.rate = (o.rate || 1) * (+prefs().speed || 1);
      if (o.onend) u.onend = o.onend;
      if (o.onerror) u.onerror = o.onerror;
      if (o.onboundary) u.onboundary = o.onboundary;
      synth.speak(u);
      return u;
    }
    function stop() { if (supported()) synth.cancel(); }
    if (supported() && synth.getVoices) { synth.getVoices(); }
    return { supported: supported, voiceFor: voiceFor, speak: speak, stop: stop };
  })());
  var R = { on: false, paused: false, rate: 1, blocks: [], bi: 0, units: [], ui: 0, gen: 0, turning: false };
  var READ_SEL = "p,li,dd,dt,h1,h2,h3,h4,h5,figcaption,blockquote,.admonition-title,.srcline,.translation,td,th";
  function readBlocks() {
    var all = $.flow.querySelectorAll(READ_SEL), out = [];
    for (var i = 0; i < all.length; i++) {
      var b = all[i];
      if (b.querySelector(READ_SEL) || b.closest(".rd-pre, .footnote, .rd-xhint")) continue;
      out.push(b);
    }
    return out;
  }
  /* the text of a block without its formulas and buttons, with the text node of every stretch (for the page it is on) */
  function blockText(b) {
    var w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT, { acceptNode: function (n) {
      var pe = n.parentElement;
      return pe && pe.closest("mjx-container, .rd-expand, .rd-fig-x, sup, .headerlink, script, style") ? 2 : 1;
    } }), n, text = "", map = [];
    while ((n = w.nextNode())) { map.push([text.length, n]); text += n.nodeValue; }
    return { text: text, map: map };
  }
  function splitUnits(t) {
    var out = [], re = /[^.!?।॥;:]+[.!?।॥;:]*["'”’)\]]*\s*/g, m, at = 0;
    while ((m = re.exec(t))) {
      var seg = m[0];
      while (seg.length > 240) {
        var cut = seg.lastIndexOf(" ", 220);
        if (cut < 60) cut = 220;
        out.push([at, seg.slice(0, cut)]);
        at += cut; seg = seg.slice(cut);
      }
      if (seg.trim()) out.push([at, seg]);
      at += seg.length;
    }
    return out;
  }
  function pageOfOffset(bt, off) {
    var node = null, start = 0;
    for (var i = 0; i < bt.map.length; i++) { if (bt.map[i][0] <= off) { node = bt.map[i][1]; start = bt.map[i][0]; } else break; }
    if (!node) return null;
    try {
      var r = document.createRange(), o = clamp(off - start, 0, node.nodeValue.length - 1);
      r.setStart(node, Math.max(0, o)); r.setEnd(node, Math.min(node.nodeValue.length, o + 1));
      var rc = r.getClientRects()[0];
      if (!rc) return null;
      return clamp(Math.floor((rc.left - $.flow.getBoundingClientRect().left + 2) / S.stride), 0, S.n - 1);
    } catch (e) { return null; }
  }
  function markSpoken(bt, a, b) {
    if (!window.CSS || !CSS.highlights || typeof window.Highlight !== "function") return;
    try {
      var r = document.createRange(), sn = null, so = 0, en = null, eo = 0;
      for (var i = 0; i < bt.map.length; i++) {
        var st = bt.map[i][0], nd = bt.map[i][1], ln = nd.nodeValue.length;
        if (!sn && a < st + ln) { sn = nd; so = Math.max(0, a - st); }
        if (b <= st + ln) { en = nd; eo = Math.max(0, b - st); break; }
      }
      if (!sn || !en) return;
      r.setStart(sn, so); r.setEnd(en, Math.min(eo, en.nodeValue.length));
      CSS.highlights.set("rd-tts", new window.Highlight(r));
    } catch (e) { /* no highlight */ }
  }
  function clearSpoken() { try { if (window.CSS && CSS.highlights) CSS.highlights.delete("rd-tts"); } catch (e) { /* ignore */ } }
  function ttsUI() {
    var t = $.tts.querySelector('[data-tts="toggle"]');
    t.innerHTML = R.paused ? ICON.play : ICON.pause;
    t.setAttribute("aria-label", R.paused ? "Go on reading aloud" : "Pause");
    $.tts.querySelector(".rd-tts-lab").textContent = R.paused ? "Paused" : "Reading aloud";
    $.tts.querySelector(".rd-tts-rate").textContent = String(R.rate).replace(/^0\./, ".") + "\u00d7";
  }
  function ttsStart() {
    if (!TTS.supported()) { announce("Reading aloud is not available in this browser"); return; }
    if (window.pkSpeak && window.pkSpeak.stop) { try { window.pkSpeak.stop(); } catch (e) { /* ignore */ } }
    R.on = true; R.paused = false;
    $.tts.hidden = false;
    S.root.classList.add("rd-tts-on");
    ttsUI();
    ttsFromPage();
  }
  /* read from the first block that reaches the page on screen */
  function ttsFromPage() {
    if (!R.on || S.loading) return;
    R.gen++;
    TTS.stop();
    R.blocks = readBlocks();
    var fr = $.flow.getBoundingClientRect(), start = S.page * S.stride;
    R.bi = R.blocks.length;
    for (var i = 0; i < R.blocks.length; i++) {
      var rc = R.blocks[i].getClientRects();
      if (rc.length && rc[rc.length - 1].right - fr.left > start + 2) { R.bi = i; break; }
    }
    R.units = null;
    R.ui = 0;
    // a block that began on the page before: from its first sentence on this page
    if (R.bi < R.blocks.length) {
      var bt = blockText(R.blocks[R.bi]), us = splitUnits(bt.text);
      for (var k = 0; k < us.length; k++) { var pg = pageOfOffset(bt, us[k][0] + us[k][1].search(/\S|$/)); if (pg === null || pg >= S.page) { R.ui = k; break; } R.ui = k; }
      R.bt = bt; R.units = us;
    }
    ttsSpeak(R.gen);
  }
  function ttsSpeak(gen) {
    if (!R.on || R.paused || gen !== R.gen) return;
    while (R.bi < R.blocks.length && (!R.units || R.ui >= R.units.length)) {
      if (R.units) { R.bi++; R.units = null; R.ui = 0; continue; }
      R.bt = blockText(R.blocks[R.bi]);
      R.units = splitUnits(R.bt.text);
      if (!R.units.length) { R.bi++; R.units = null; }
    }
    if (R.bi >= R.blocks.length) {
      // the end of the chapter: on into the next one
      clearSpoken();
      if (moreSeg(1)) { R.turning = true; loadSeg(S.seg + 1, "start").then(function () { R.turning = false; }); }
      else if (S.rec && S.rec.next) { R.turning = true; loadChapter(S.rec.next, "start").then(function () { R.turning = false; }); }
      else ttsStop();
      return;
    }
    var u = R.units[R.ui], bt = R.bt, base = u[0];
    followVoice(bt, base + u[1].search(/\S|$/));
    markSpoken(bt, base, base + u[1].length);
    TTS.speak(u[1], S.lang || "en", {
      rate: R.rate,
      onboundary: function (ev) { if (gen === R.gen && typeof ev.charIndex === "number") followVoice(bt, base + ev.charIndex); },
      onend: function () { if (gen !== R.gen) return; R.ui++; ttsSpeak(gen); },
      onerror: function (ev) {
        if (gen !== R.gen) return;
        // stopped from elsewhere (a phrase of a language book played): the reading pauses where it was
        if (ev && (ev.error === "interrupted" || ev.error === "canceled")) { R.paused = true; R.gen++; ttsUI(); return; }
        R.ui++; setTimeout(function () { ttsSpeak(gen); }, 50);
      }
    });
  }
  /* the page turns when the voice reaches the next one */
  function followVoice(bt, off) {
    var pg = pageOfOffset(bt, off);
    if (pg === null || isOnPage(pg)) return;
    if (pg > S.page) { R.turning = true; goto(pg, true); R.turning = false; }
  }
  function ttsStop() {
    if (!R.on) return;
    R.on = false; R.paused = false; R.gen++;
    TTS.stop();
    clearSpoken();
    if ($.tts) $.tts.hidden = true;
    if (S.root) S.root.classList.remove("rd-tts-on");
  }
  function onTtsClick(e) {
    var b = e.target.closest("[data-tts]");
    if (!b) return;
    var k = b.getAttribute("data-tts");
    if (k === "stop") { ttsStop(); return; }
    if (k === "rate") {
      var rates = [1, 1.25, 1.5, 0.8];
      R.rate = rates[(rates.indexOf(R.rate) + 1) % rates.length];
      ttsUI();
      if (!R.paused) { R.gen++; TTS.stop(); ttsSpeak(R.gen); }
      return;
    }
    if (R.paused) { R.paused = false; ttsUI(); R.gen++; ttsSpeak(R.gen); }
    else { R.paused = true; R.gen++; TTS.stop(); ttsUI(); }
  }

  /* ---------------------------------------------------------------- the first time: how to use the reader */
  function firstHint() {
    if (sget("localStorage", KEY_HINT) === "1" || !$.hint) return;
    sset("localStorage", KEY_HINT, "1");
    $.hint.hidden = false;
    clearTimeout(S.hintT);
    S.hintT = setTimeout(hideHint, 5000);
  }
  function hideHint() {
    if (!$.hint || $.hint.hidden || $.hint.classList.contains("out")) return;
    clearTimeout(S.hintT);
    $.hint.classList.add("out");
    setTimeout(function () { $.hint.hidden = true; $.hint.classList.remove("out"); }, 320);
  }

  /* ---------------------------------------------------------------- start */
  window.bjpReader = { open: open, close: close, goto: function (p) { goto(p, false); }, state: S,
    relayout: function () { relayout(false); },      // assets/quiz.js: a question that grew
    addAction: addAction,                            // a tile in the More sheet (assets/slides.js: Present)
    toEnd: function () { if (moreSeg(1)) loadSeg(S.segs.length - 1, "end"); else goto(S.n - 1, false); },   // the last page of the chapter
    lookup: function (w) { if (S.open) openLookup(w); } };
  if (window.document$ && window.document$.subscribe) window.document$.subscribe(init);
  else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
