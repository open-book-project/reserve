/* Scanned books of the Internet Archive (tools/remote_archive.py), shown in this library's own reader and viewer.
 *
 * remote.js hands a chapter of an `archive` book to this script (window.pkScans.chapter). A chapter is a range of
 * scanned pages. Two ways of showing it, chosen per book:
 *
 *   text    the page's OCR text, cleaned lightly (running heads and folios out, hyphenated words joined, lines made
 *           paragraphs) and set in the library's typography, with a "View page scan" button on every page;
 *   scans   the pages as images, one below the other, each opening in the viewer.
 *
 * The viewer (window.pkScans.open) is the library's own: a full-screen layer with zoom (pinch, Ctrl+wheel, buttons,
 * double tap), pan, fit to width or to the page, a jump to a page number, a strip of thumbnails, the keyboard, swipes,
 * and light, dark or sepia surroundings. It never embeds or opens the Internet Archive's own reader: images come from
 * the Internet Archive's image service (IIIF) at a size that fits the screen, and a larger one on zoom.
 *
 * Nothing of a book is stored by the library. "Keep these pages offline" keeps the pages of a chapter (and the text of
 * the book) in this browser's cache "pk-scans-kept" only, after telling how much room it takes.
 */
(function () {
  "use strict";
  var KEPT = "pk-scans-kept", FAKE = "https://pk-scans.invalid/";
  var BASE_W = 1000, THUMB_W = 160, BUCKETS = [1000, 1500, 2200, 3000];
  var MB_PER_PAGE = 0.25;
  var BOOKS = {}, TEXTS = {}, S = null, state = { theme: "", thumbs: true, fit: "width" };
  var CAN_CACHE = !!(window.caches && window.fetch);

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function $(sel, el) { return (el || document).querySelector(sel); }
  function online() { return navigator.onLine !== false; }
  function pad4(n) { return ("0000" + n).slice(-4); }
  function range(m, c) { return c.from === c.to ? "Page " + c.from : "Pages " + c.from + "–" + c.to; }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (x) { /* private mode */ } return null; }

  /* ---------------------------------------------------------------- the addresses (the same for showing and keeping) */
  function imgUrl(a, n, w) {
    var name = a.id + "/" + a.base + "_jp2.zip/" + a.base + "_jp2/" + a.base + "_" + pad4(n - 1) + ".jp2";
    // the service gives no size larger than the scan itself: a small scan is asked for at its own size ("max")
    var size = a.size && a.size[0] && w > a.size[0] * 0.95 ? "max" : w + ",";
    return a.iiif + encodeURIComponent(name) + "/full/" + size + "/0/default.jpg";
  }
  /* the Internet Archive's other image address (for <img> only: it sends no CORS header), when the image service is slow */
  function altUrl(a, n, w) { return a.ia + "/down" + "load/" + encodeURIComponent(a.id) + "/page/n" + (n - 1) + "_w" + w + ".jpg"; }
  function fileUrl(a, suffix) { return a.ia + "/down" + "load/" + encodeURIComponent(a.id) + "/" + encodeURIComponent(a.base) + suffix; }
  function ratio(a) { return a.size && a.size[0] ? a.size[1] / a.size[0] : 1.45; }

  /* ---------------------------------------------------------------- what is kept on the device */
  function cacheOpen() { return CAN_CACHE ? caches.open(KEPT) : Promise.reject(new Error("no cache")); }
  function fromKept(url) {
    if (!CAN_CACHE) return Promise.resolve(null);
    return caches.open(KEPT).then(function (c) { return c.match(url); }).catch(function () { return null; });
  }
  /* the network first; the kept copy when the network does not answer */
  function getBuf(url) {
    var net = online() ? fetch(url, { mode: "cors", credentials: "omit" }).then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r; }) : Promise.reject(new Error("offline"));
    return net.catch(function (err) { return fromKept(url).then(function (r) { if (r) return r; throw err; }); }).then(function (r) { return r.arrayBuffer(); });
  }
  function gunzip(buf) {
    var b = new Uint8Array(buf);
    if (!(b[0] === 0x1f && b[1] === 0x8b)) return Promise.resolve(b);
    if (!window.DecompressionStream) return Promise.reject(new Error("no gzip"));
    return new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer().then(function (x) { return new Uint8Array(x); });
  }

  /* ---------------------------------------------------------------- the OCR text of a book: one answer, split into pages */
  function textOf(m) {
    var a = m.archive;
    if (!TEXTS[m.id]) {
      TEXTS[m.id] = Promise.all([
        getBuf(fileUrl(a, "_hocr_searchtext.txt.gz")).then(gunzip),
        getBuf(fileUrl(a, "_hocr_pageindex.json.gz")).then(gunzip)
      ]).then(function (r) {
        var idx = JSON.parse(new TextDecoder("utf-8").decode(r[1]));
        return { bytes: r[0], idx: idx };
      });
      TEXTS[m.id].catch(function () { delete TEXTS[m.id]; });
    }
    return TEXTS[m.id];
  }
  function pageText(t, n) {
    var e = t.idx[n - 1];
    if (!e) return "";
    return new TextDecoder("utf-8").decode(t.bytes.subarray(e[0], e[1]));
  }

  /* light cleaning: folios and running heads out, words broken at a line end joined, lines made paragraphs */
  function upperRatio(s) {
    var letters = s.replace(/[^A-Za-z]/g, "");
    return letters.length ? letters.replace(/[^A-Z]/g, "").length / letters.length : 0;
  }
  function isFolio(l) { return l.length < 12 && /^[\W_]*(\d{1,4}|[ivxlcIVXLC]{1,7})[\W_]*$/.test(l); }
  function isHead(l) { return l.length <= 70 && /(^\d{1,4}\W|\W\d{1,4}\W*$)/.test(l) && upperRatio(l) >= 0.5; }
  var HEAD_IN = /(?:^|\s)[A-Z][A-Z .,'’&-]{9,}?[.,]?\s+(?:[IVXLC]{1,7}|[Xx]?[ivxl]{1,6}|\d{1,4})(?=\s|$)/;
  function scrubHead(l) {
    var m = HEAD_IN.exec(l);
    if (!m) return l;
    var cap = m[0].replace(/[^A-Za-z]/g, "");
    return upperRatio(cap.slice(0, Math.max(0, cap.length - 4))) >= 0.85 ? (l.slice(0, m.index) + " " + l.slice(m.index + m[0].length)).replace(/\s+/g, " ").trim() : l;
  }
  function cleanLines(raw) {
    var lines = raw.split(/\r?\n/).map(function (s) { return s.replace(/\s+/g, " ").trim(); }).filter(function (s) { return s && !/^[\W_]{1,}$/.test(s); });
    lines = lines.map(scrubHead).filter(Boolean);
    if (lines.length && (isFolio(lines[0]) || isHead(lines[0]))) lines.shift();
    if (lines.length && (isFolio(lines[lines.length - 1]) || isHead(lines[lines.length - 1]))) lines.pop();
    return lines;
  }
  function paragraphs(lines) {
    var lens = lines.map(function (l) { return l.length; }).filter(function (n) { return n > 20; }).sort(function (a, b) { return a - b; });
    var max = lens.length ? lens[Math.floor(lens.length * 0.9)] : 60, out = [], cur = "";
    function flush() { if (cur) out.push(cur); cur = ""; }
    lines.forEach(function (l, i) {
      var heading = l.length <= 60 && l.length >= 3 && upperRatio(l) >= 0.7 && !/[a-z]{3}/.test(l);
      if (heading) { flush(); out.push({ h: l }); return; }
      if (cur) {
        if (/[A-Za-z]-$/.test(cur) && /^[a-z]/.test(l)) cur = cur.slice(0, -1) + l;
        else cur += " " + l;
      } else cur = l;
      if (l.length < max * 0.62 && /[.!?:;”"')\]]$/.test(l)) flush();
    });
    flush();
    return out.map(function (p) { return typeof p === "string" ? p.replace(/([a-z])- ([a-z])/g, "$1$2") : p; });
  }
  function textHtml(m, from, to, t) {
    var h = [], a = m.archive;
    for (var n = from; n <= to; n++) {
      var ps = paragraphs(cleanLines(pageText(t, n)));
      h.push('<section class="pk-sc-tp" id="p-' + n + '" data-n="' + n + '"><div class="pk-sc-pn"><span>Page ' + n + '</span>' +
        '<button type="button" class="pk-sc-view" data-book="' + esc(m.id) + '" data-n="' + n + '">View page scan</button></div>');
      if (!ps.length) h.push('<p class="pk-sc-blank">No text was read on this page.</p>');
      ps.forEach(function (p) { h.push(typeof p === "string" ? "<p>" + esc(p) + "</p>" : '<p class="pk-sc-h">' + esc(p.h) + "</p>"); });
      h.push("</section>");
    }
    return h.join("\n");
  }
  function scansHtml(m, from, to) {
    var a = m.archive, r = ratio(a), h = ['<div class="pk-sc-stack">'];
    for (var n = from; n <= to; n++) {
      h.push('<div class="pk-sc-fig" id="p-' + n + '" data-n="' + n + '"><img class="pk-scan" src="' + esc(imgUrl(a, n, BASE_W)) + '" width="' + BASE_W +
        '" height="' + Math.round(BASE_W * r) + '" loading="lazy" decoding="async" alt="Scan of page ' + n + '" data-book="' + esc(m.id) + '" data-n="' + n + '">' +
        '<div class="pk-sc-cap"><span>Page ' + n + '</span><button type="button" class="pk-sc-view" data-book="' + esc(m.id) + '" data-n="' + n + '">Open in the viewer</button></div></div>');
    }
    h.push("</div>");
    return h.join("\n");
  }
  function toolsHtml(m, c, mode) {
    return '<div class="pk-sc-tools" data-book="' + esc(m.id) + '" data-from="' + c.from + '" data-to="' + c.to + '">' +
      '<button type="button" class="pk-btn pk-btn-quiet pk-sc-viewall" data-book="' + esc(m.id) + '" data-n="' + c.from + '">' + (mode === "text" ? "View the page scans" : "Open the viewer") + "</button>" +
      '<button type="button" class="pk-btn pk-btn-quiet pk-sc-keep">Keep pages offline</button>' +
      '<span class="pk-sc-keepnote" role="status" aria-live="polite"></span></div>';
  }

  /* ---------------------------------------------------------------- what remote.js asks for */
  /* a chapter: resolves with {html, math, m, c} like the answers of the other sources, once converted */
  function chapter(m, c) {
    BOOKS[m.id] = m;
    var a = m.archive;
    var done = function (mode, body, note) {
      var html = '<div class="pk-scn" data-mode="' + mode + '" lang="' + (mode === "text" ? esc(m.lang || "en") : "en") + '">' + toolsHtml(m, c, mode) +
        (note ? '<p class="pk-sc-note">' + esc(note) + "</p>" : "") + body + "</div>";
      return { html: html, math: false, m: m, c: c };
    };
    if (a.mode === "text") {
      return textOf(m).then(function (t) { return done("text", textHtml(m, c.from, c.to, t)); }, function () {
        return done("scans", scansHtml(m, c.from, c.to), "The text of this book could not be read now; the pages are shown as scans.");
      });
    }
    return Promise.resolve(done("scans", scansHtml(m, c.from, c.to)));
  }
  function credit(m, c) {
    var a = m.archive, ext = ' target="_blank" rel="noopener noreferrer"';
    return '<div class="pk-remote-credit pk-sc-credit" lang="en"><p>' + esc(String(m.attribution).replace(/\.$/, "")) + ". “" + esc(a.title || m.title) + "”" +
      (a.creator ? ", " + esc(a.creator) : "") + (a.date ? ", " + esc(a.date) : "") + ". " + esc(range(m, c)) + " of " + a.pages + " scanned pages. " +
      "<strong>" + esc(String(a.pd).replace(/\.$/, "")) + ".</strong> " +
      (a.mode === "text" ? "The text is the machine reading (OCR) of the scan, lightly cleaned, and may contain errors; the scan of each page is the authority. " : "") +
      'Item on the Internet Archive: <a href="' + esc(a.details) + '"' + ext + ">" + esc(a.id) + "</a>.</p></div>";
  }

  /* ---------------------------------------------------------------- keeping a chapter's pages on the device */
  function keyOf(id, from, to) { return FAKE + encodeURIComponent(id) + "/" + from + "-" + to; }
  function urlsOf(m, from, to) {
    var a = m.archive, u = [], n;
    for (n = from; n <= to; n++) u.push(imgUrl(a, n, BASE_W));
    if (a.mode === "text") { u.push(fileUrl(a, "_hocr_searchtext.txt.gz")); u.push(fileUrl(a, "_hocr_pageindex.json.gz")); }
    return u;
  }
  function mb(x) { return x < 1 ? "under 1 MB" : "about " + Math.round(x) + " MB"; }
  function keepNote(box, html) { var n = $(".pk-sc-keepnote", box) || box; n.innerHTML = html; }
  function keepState(box) {
    var id = box.getAttribute("data-book"), from = +box.getAttribute("data-from"), to = +box.getAttribute("data-to");
    var btn = $(".pk-sc-keep", box);
    if (!CAN_CACHE || !window.isSecureContext) { if (btn) btn.hidden = true; return; }
    fromKept(keyOf(id, from, to)).then(function (r) { return r ? r.json() : null; }).then(function (ix) {
      if (!btn) return;
      if (ix) {
        btn.hidden = true;
        keepNote(box, "These pages are kept on this device (" + mb(ix.bytes / 1048576) + ")." +
          (ix.failed ? " " + ix.failed + (ix.failed === 1 ? " file" : " files") + " the image service did not give; <button type=\"button\" class=\"pk-sc-yes\">try again</button>" : "") +
          " <button type=\"button\" class=\"pk-sc-unkeep\">Remove</button>");
      }
      else { btn.hidden = false; keepNote(box, ""); }
    });
  }
  function askKeep(box) {
    var id = box.getAttribute("data-book"), from = +box.getAttribute("data-from"), to = +box.getAttribute("data-to");
    var m = BOOKS[id], n = to - from + 1, est = n * MB_PER_PAGE + (m.archive.mode === "text" ? 1 : 0);
    keepNote(box, "Keeping pages " + from + "–" + to + " on this device takes " + mb(est) + " of its storage; scans are large. " +
      '<button type="button" class="pk-sc-yes">Keep</button> <button type="button" class="pk-sc-no">Not now</button>');
  }
  function doKeep(box) {
    var id = box.getAttribute("data-book"), from = +box.getAttribute("data-from"), to = +box.getAttribute("data-to");
    var m = BOOKS[id], urls = urlsOf(m, from, to), done = 0, bytes = 0, failed = 0, i = 0;
    if (!online()) { keepNote(box, "You are offline: the pages cannot be kept now."); return; }
    return cacheOpen().then(function (cache) {
      function worker() {
        if (i >= urls.length) return Promise.resolve();
        var u = urls[i++];
        function attempt(k) {
          var ac = window.AbortController ? new AbortController() : null, tm = ac ? setTimeout(function () { ac.abort(); }, /\.gz$/.test(u) ? 150000 : 30000) : 0;
          return fetch(u, { mode: "cors", credentials: "omit", signal: ac ? ac.signal : undefined }).then(function (r) {
            clearTimeout(tm);
            if (!r.ok) throw new Error("http " + r.status);
            return r.clone().arrayBuffer().then(function (b) { bytes += b.byteLength; return cache.put(u, r); });
          }).catch(function (err) {
            clearTimeout(tm);
            if (k >= 3) throw err;
            return new Promise(function (res) { setTimeout(res, 1500 * k); }).then(function () { return attempt(k + 1); });
          });
        }
        return attempt(1).catch(function () { failed++; }).then(function () { done++; keepNote(box, "Keeping the pages… " + Math.min(done, urls.length) + " of " + urls.length); return worker(); });
      }
      keepNote(box, "Keeping the pages… 0 of " + urls.length);
      return Promise.all([worker(), worker()]).then(function () {
        if (failed === urls.length) { keepNote(box, "The pages could not be kept (the image service did not answer). <button type=\"button\" class=\"pk-sc-yes\">Try again</button>"); return null; }
        var ix = { urls: urls, bytes: bytes, failed: failed, t: Date.now() };
        return cache.put(keyOf(id, from, to), new Response(JSON.stringify(ix), { headers: { "Content-Type": "application/json" } })).then(function () { keepState(box); });
      });
    }).catch(function () { keepNote(box, "The pages could not be kept on this device."); });
  }
  function unkeep(box) {
    var id = box.getAttribute("data-book"), from = +box.getAttribute("data-from"), to = +box.getAttribute("data-to");
    var key = keyOf(id, from, to);
    return cacheOpen().then(function (cache) {
      return cache.match(key).then(function (r) { return r ? r.json() : { urls: [] }; }).then(function (ix) {
        return Promise.all(ix.urls.map(function (u) { return cache.delete(u); })).then(function () { return cache.delete(key); });
      });
    }).then(function () { keepState(box); }, function () { keepState(box); });
  }

  /* an image that does not arrive: the image service answers a few at a time and sometimes not at all, so the other
     address of the Internet Archive is tried, then the first once more, and last the copy kept on this device */
  document.addEventListener("error", function (e) {
    var im = e.target;
    if (!im || im.nodeName !== "IMG" || !im.classList || !im.classList.contains("pk-scan")) return;
    var src = im.getAttribute("src"), step = im.getAttribute("data-step") || "0", m = BOOKS[im.getAttribute("data-book")], n = +im.getAttribute("data-n");
    if (/^blob:/.test(src)) return;
    var w = +((/\/full\/(\d+),/.exec(src) || [])[1] || (/_w(\d+)\.jpg/.exec(src) || [])[1] || BASE_W);     // ("max": the base size)
    if (online() && m && n && step === "0") { im.setAttribute("data-step", "1"); im.src = altUrl(m.archive, n, w); return; }
    if (online() && m && n && step === "1") { im.setAttribute("data-step", "2"); setTimeout(function () { im.src = imgUrl(m.archive, n, w); }, 1500); return; }
    if (step === "3") return;
    im.setAttribute("data-step", "3");
    var key = m && n ? imgUrl(m.archive, n, BASE_W) : src;
    fromKept(key).then(function (r) { return r ? r.blob() : null; }).then(function (b) { if (b) im.src = URL.createObjectURL(b); else im.classList.add("pk-failed"); });
  }, true);

  /* ---------------------------------------------------------------- the viewer */
  var THEME_NAMES = { light: "Light", dark: "Dark", sepia: "Sepia" };
  function surroundings() {
    var saved = store("pk-sv-theme");
    if (THEME_NAMES[saved]) return saved;
    var rd = $(".bjp-reader[data-theme]");
    if (rd) { var t = rd.getAttribute("data-theme"); return t === "sepia" ? "sepia" : t === "dark" || t === "black" ? "dark" : "light"; }
    return document.body && document.body.getAttribute("data-md-color-scheme") === "slate" ? "dark" : "light";
  }
  var ICONS = {
    close: '<path d="M6 6l12 12M18 6L6 18"/>', prev: '<path d="M15 5l-7 7 7 7"/>', next: '<path d="M9 5l7 7-7 7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', fitw: '<path d="M4 5v14M20 5v14M8 12h8M8 12l2-2M8 12l2 2M16 12l-2-2M16 12l-2 2"/>',
    fitp: '<rect x="7" y="4" width="10" height="16" rx="1"/>', thumbs: '<rect x="4" y="5" width="6" height="6"/><rect x="14" y="5" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/>',
    theme: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16"/>', keep: '<path d="M7 4h10v16l-5-4-5 4z"/>'
  };
  function icon(n) { return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[n] + "</svg>"; }
  function ibtn(cls, name, label) { return '<button type="button" class="pk-sv-b ' + cls + '" aria-label="' + label + '" title="' + label + '">' + icon(name) + "</button>"; }

  function openViewer(id, n, opener) {
    var m = BOOKS[id];
    if (!m) { loadMeta(id).then(function () { openViewer(id, n, opener); }); return; }
    if (S) closeViewer(true);
    var a = m.archive;
    if (!state.theme) state.theme = surroundings();
    var root = document.createElement("div");
    root.className = "pk-sv";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Page scans of " + (a.title || m.title));
    root.setAttribute("data-theme", state.theme);
    root.tabIndex = -1;
    root.innerHTML =
      '<div class="pk-sv-bar">' + ibtn("pk-sv-close", "close", "Close the viewer") +
      '<div class="pk-sv-title"><strong>' + esc(m.title || a.title) + '</strong><span>' + esc(a.pd) + "</span></div>" +
      '<div class="pk-sv-pager">' + ibtn("pk-sv-prev", "prev", "Previous page") +
      '<label class="pk-sv-jump"><span class="pk-sv-sr">Page</span><input type="number" min="1" max="' + a.pages + '" inputmode="numeric" aria-label="Go to page"><span class="pk-sv-of">of ' + a.pages + "</span></label>" +
      ibtn("pk-sv-next", "next", "Next page") + "</div>" +
      '<div class="pk-sv-tools">' + ibtn("pk-sv-zout", "minus", "Zoom out") + ibtn("pk-sv-zin", "plus", "Zoom in") + ibtn("pk-sv-fit", "fitw", "Fit the page to the width") +
      ibtn("pk-sv-th", "thumbs", "Show or hide the thumbnails") + ibtn("pk-sv-theme", "theme", "Surroundings: light, dark, sepia") + ibtn("pk-sv-keep", "keep", "Keep this page offline") + "</div></div>" +
      '<div class="pk-sv-stage" tabindex="0" aria-label="Page image: arrow keys turn the page, plus and minus zoom"><div class="pk-sv-pane"><img class="pk-sv-img" alt="" draggable="false"></div>' +
      '<div class="pk-sv-wait" aria-hidden="true"><span class="pk-spin"></span></div><div class="pk-sv-msg" role="status" aria-live="polite" hidden></div></div>' +
      '<div class="pk-sv-thumbs" role="listbox" aria-label="Thumbnails"></div>';
    document.body.appendChild(root);
    document.documentElement.classList.add("pk-sv-open");
    if (!state.fitSet) state.fit = window.innerWidth > 900 && window.innerWidth > window.innerHeight ? "page" : "width";     // a whole page on a wide screen
    S = { m: m, a: a, root: root, n: 0, z: 1, tx: 0, ty: 0, fit: state.fit, bucket: 0, ptr: {}, opener: opener || document.activeElement, io: null, last: 0, token: 0 };
    S.stage = $(".pk-sv-stage", root); S.pane = $(".pk-sv-pane", root); S.img = $(".pk-sv-img", root);
    S.input = $(".pk-sv-jump input", root); S.thumbs = $(".pk-sv-thumbs", root); S.wait = $(".pk-sv-wait", root); S.msg = $(".pk-sv-msg", root);
    root.classList.toggle("no-thumbs", !state.thumbs);
    fitRoot();
    fitLabel();
    buildThumbs();
    wire();
    layout(true);
    go(Math.max(1, Math.min(a.pages, n || 1)));
    root.focus({ preventScroll: true });
  }
  function closeViewer(quiet) {
    if (!S) return;
    var s = S; S = null;
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", onResize);
    if (window.visualViewport) window.visualViewport.removeEventListener("resize", onResize);
    if (s.io) s.io.disconnect();
    if (s.img) s.img.removeAttribute("src");
    s.root.remove();
    document.documentElement.classList.remove("pk-sv-open");
    if (!quiet && s.opener && s.opener.focus && document.contains(s.opener)) { try { s.opener.focus({ preventScroll: true }); } catch (x) { /* ignore */ } }
  }

  function buildThumbs() {
    var a = S.a, h = [];
    for (var n = 1; n <= a.pages; n++) h.push('<button type="button" role="option" class="pk-sv-t" data-n="' + n + '" aria-label="Page ' + n + '"><span>' + n + "</span></button>");
    S.thumbs.innerHTML = h.join("");
    S.io = window.IntersectionObserver ? new IntersectionObserver(function (list) {
      list.forEach(function (en) {
        if (!en.isIntersecting) return;
        var b = en.target;
        S.io.unobserve(b);
        var im = document.createElement("img");
        im.alt = ""; im.decoding = "async"; im.className = "pk-scan pk-sv-ti";
        im.setAttribute("data-book", S.m.id); im.setAttribute("data-n", b.getAttribute("data-n"));
        im.src = imgUrl(S.a, +b.getAttribute("data-n"), THUMB_W);
        b.insertBefore(im, b.firstChild);
      });
    }, { root: S.thumbs, rootMargin: "300px" }) : null;
    Array.prototype.forEach.call(S.thumbs.children, function (b) { if (S.io) S.io.observe(b); });
  }

  /* the size of the page at zoom 1 (fitting the stage) and the room it has */
  function metrics() {
    var sw = S.stage.clientWidth, sh = S.stage.clientHeight;
    var r = S.img.naturalWidth ? S.img.naturalHeight / S.img.naturalWidth : ratio(S.a);
    var bw = S.fit === "page" ? Math.min(sw - 16, (sh - 16) / r) : sw - (sw > 700 ? 32 : 0);
    bw = Math.max(40, bw);
    return { sw: sw, sh: sh, r: r, bw: bw, bh: bw * r };
  }
  function layout(reset) {
    var mt = metrics();
    S.mt = mt;
    S.pane.style.width = mt.bw + "px";
    S.pane.style.height = mt.bh + "px";
    if (reset) { S.z = 1; S.tx = 0; S.ty = 0; }
    clamp(); paint();
  }
  function clamp() {
    var mt = S.mt, cw = mt.bw * S.z, ch = mt.bh * S.z;
    S.tx = cw <= mt.sw ? (mt.sw - cw) / 2 : Math.min(0, Math.max(mt.sw - cw, S.tx));
    S.ty = ch <= mt.sh ? (mt.sh - ch) / 2 : Math.min(0, Math.max(mt.sh - ch, S.ty));
    if (S.top) { S.top = false; if (ch > mt.sh) S.ty = 0; }
  }
  function paint() {
    S.pane.style.transform = "translate(" + S.tx.toFixed(1) + "px," + S.ty.toFixed(1) + "px) scale(" + S.z.toFixed(4) + ")";
    clearTimeout(S.upT);
    S.upT = setTimeout(upgrade, 180);
  }
  function zoomAt(z2, cx, cy) {
    z2 = Math.max(1, Math.min(8, z2));
    var k = z2 / S.z;
    S.tx = cx - (cx - S.tx) * k;
    S.ty = cy - (cy - S.ty) * k;
    S.z = z2;
    clamp(); paint();
  }
  function stagePoint(e) { var r = S.stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

  /* the picture: the smallest size that is sharp at this zoom; a larger one is fetched when the reader zooms in */
  function bucketFor() {
    var need = S.mt.bw * S.z * (window.devicePixelRatio || 1), i = 0, native = S.a.size && S.a.size[0];
    while (i < BUCKETS.length - 1 && BUCKETS[i] < need && !(native && BUCKETS[i] >= native)) i++;
    return Math.min(i, S.cap === undefined ? 9 : S.cap);
  }
  function setSrc(url, token, w) {
    var n = S.n, tries = [url, altUrl(S.a, n, w), url], k = 0, done = false, timer = null;
    function ok(u) {
      if (done || !S || token !== S.token) return;
      done = true; clearTimeout(timer);
      S.img.src = u; S.bucket = w; S.wait.hidden = true; S.msg.hidden = true;
      if (!S.sized) { S.sized = true; layout(false); }
    }
    function next() {
      if (done || !S || token !== S.token) return;
      clearTimeout(timer);
      if (k < tries.length && online()) { attempt(tries[k++]); return; }
      // a size the service does not give (a smaller scan), or no answer at all: the next smaller one; none left: the kept copy
      var i = BUCKETS.indexOf(w);
      if (i > 0 && online()) { S.cap = i - 1; done = true; setSrc(imgUrl(S.a, n, BUCKETS[i - 1]), token, BUCKETS[i - 1]); return; }
      done = true;
      fromKept(imgUrl(S.a, n, BASE_W)).then(function (r) { return r ? r.blob() : null; }).then(function (b) {
        if (!S || token !== S.token) return;
        if (b) { S.img.src = URL.createObjectURL(b); S.bucket = BASE_W; S.wait.hidden = true; return; }
        S.wait.hidden = true; S.msg.hidden = false;
        S.msg.textContent = online() ? "This page could not be fetched. Try another page, or try again later." : "You are offline, and this page was not kept on this device.";
      });
    }
    function attempt(u) {
      var probe = new Image();
      probe.onload = function () { ok(u); };
      probe.onerror = function () { if (!done && u === tries[k - 1]) setTimeout(next, k === 3 ? 1200 : 0); };
      probe.src = u;
      timer = setTimeout(function () { if (!done && u === tries[k - 1] && k < tries.length) next(); }, 12000);   // slow: the other address meanwhile
    }
    next();
  }
  function upgrade() {
    if (!S || !S.sized) return;
    var w = BUCKETS[bucketFor()];
    if (w > S.bucket) setSrc(imgUrl(S.a, S.n, w), S.token, w);
  }
  function preload(n) {
    if (n < 1 || n > S.a.pages) return;
    var im = new Image();
    im.src = imgUrl(S.a, n, BUCKETS[Math.min(bucketFor(), 1)]);
  }
  function go(n, keepZoom) {
    n = Math.max(1, Math.min(S.a.pages, n));
    var first = S.n === 0;
    S.n = n; S.token++; S.sized = false; S.bucket = 0; S.cap = S.cap;
    S.wait.hidden = false; S.msg.hidden = true;
    if (!keepZoom) { S.z = 1; S.tx = 0; S.ty = 0; S.top = true; }
    var w = BUCKETS[Math.max(0, Math.min(bucketFor(), BUCKETS.length - 1))];
    S.img.alt = "Scan of page " + n;
    S.input.value = n;
    $(".pk-sv-prev", S.root).disabled = n <= 1;
    $(".pk-sv-next", S.root).disabled = n >= S.a.pages;
    var cur = $(".pk-sv-t[aria-selected=true]", S.thumbs);
    if (cur) cur.removeAttribute("aria-selected");
    var t = S.thumbs.children[n - 1];
    if (t) { t.setAttribute("aria-selected", "true"); if (!first || true) scrollThumb(t); }
    setSrc(imgUrl(S.a, n, w), S.token, w);
    layout(false);
    S.pane.style.opacity = "1";
    setTimeout(function () { if (S && S.n === n) { preload(n + 1); preload(n - 1); } }, 250);
    S.last = Date.now();
  }
  function scrollThumb(t) {
    var box = S.thumbs, vertical = box.scrollHeight > box.clientHeight + 4;
    if (vertical) box.scrollTop = t.offsetTop - box.clientHeight / 2 + t.offsetHeight / 2;
    else box.scrollLeft = t.offsetLeft - box.clientWidth / 2 + t.offsetWidth / 2;
  }
  function fitLabel() {
    var b = $(".pk-sv-fit", S.root);
    b.innerHTML = icon(S.fit === "width" ? "fitw" : "fitp");
    var lab = S.fit === "width" ? "Fit the page to the screen" : "Fit the page to the width";
    b.setAttribute("aria-label", lab); b.title = lab;
  }
  function fitToggle(to) {
    S.fit = to || (S.fit === "width" ? "page" : "width");
    state.fit = S.fit; state.fitSet = true;
    fitLabel();
    S.top = true;
    layout(true);
  }
  function cycleTheme() {
    var names = ["light", "sepia", "dark"];
    state.theme = names[(names.indexOf(state.theme) + 1) % names.length];
    store("pk-sv-theme", state.theme);
    S.root.setAttribute("data-theme", state.theme);
    toast(THEME_NAMES[state.theme] + " surroundings");
  }
  function toast(t) {
    S.msg.hidden = false; S.msg.textContent = t;
    clearTimeout(S.msgT);
    S.msgT = setTimeout(function () { if (S) S.msg.hidden = true; }, 1400);
  }
  /* the layer is as large as the screen shows, even when the page behind it is wider than the screen */
  function fitRoot() {
    var vv = window.visualViewport;
    S.root.style.width = document.documentElement.clientWidth + "px";
    S.root.style.height = (vv ? vv.height : window.innerHeight) + "px";
    S.root.style.right = "auto"; S.root.style.bottom = "auto";
  }
  function onResize() { if (S) { fitRoot(); layout(false); } }

  /* pointers: one finger or the mouse drags (a swipe turns the page when the page is not enlarged), two fingers pinch */
  function wire() {
    var root = S.root, stage = S.stage;
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onResize);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", onResize);
    ["pointerdown", "pointerup", "pointermove", "click", "dblclick", "wheel", "touchstart", "touchmove", "contextmenu"].forEach(function (t) {
      root.addEventListener(t, function (e) { if (t !== "contextmenu") e.stopPropagation(); }, false);
    });
    root.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("button");
      if (!b) return;
      var c = b.className;
      if (b.classList.contains("pk-sv-close")) closeViewer();
      else if (b.classList.contains("pk-sv-prev")) go(S.n - 1);
      else if (b.classList.contains("pk-sv-next")) go(S.n + 1);
      else if (b.classList.contains("pk-sv-zin")) zoomAt(S.z * 1.4, S.mt.sw / 2, S.mt.sh / 2);
      else if (b.classList.contains("pk-sv-zout")) zoomAt(S.z / 1.4, S.mt.sw / 2, S.mt.sh / 2);
      else if (b.classList.contains("pk-sv-fit")) fitToggle();
      else if (b.classList.contains("pk-sv-th")) { state.thumbs = !state.thumbs; S.root.classList.toggle("no-thumbs", !state.thumbs); setTimeout(function () { layout(false); if (state.thumbs) scrollThumb(S.thumbs.children[S.n - 1]); }, 30); }
      else if (b.classList.contains("pk-sv-theme")) cycleTheme();
      else if (b.classList.contains("pk-sv-keep")) keepPageHere();
      else if (b.classList.contains("pk-sv-t")) go(+b.getAttribute("data-n"));
    });
    S.input.addEventListener("change", function () { var v = parseInt(S.input.value, 10); if (v) go(v); else S.input.value = S.n; });
    S.input.addEventListener("focus", function () { S.input.select(); });
    stage.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      stage.setPointerCapture(e.pointerId);
      S.ptr[e.pointerId] = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: Date.now() };
      var ids = Object.keys(S.ptr);
      if (ids.length === 2) { var p = S.ptr[ids[0]], q = S.ptr[ids[1]]; S.pinch = { d: Math.hypot(p.x - q.x, p.y - q.y) || 1, z: S.z }; }
      stage.classList.add("is-drag");
    });
    stage.addEventListener("pointermove", function (e) {
      var p = S.ptr[e.pointerId];
      if (!p) return;
      var ids = Object.keys(S.ptr);
      if (ids.length >= 2 && S.pinch) {
        var p1 = S.ptr[ids[0]], q = S.ptr[ids[1]];
        p.x = e.clientX; p.y = e.clientY;
        var d = Math.hypot(p1.x - q.x, p1.y - q.y) || 1, r = S.stage.getBoundingClientRect();
        zoomAt(S.pinch.z * d / S.pinch.d, (p1.x + q.x) / 2 - r.left, (p1.y + q.y) / 2 - r.top);
        return;
      }
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      S.ty += dy;
      if (S.z > 1.02) S.tx += dx;
      clamp(); paintLight();
    });
    function up(e) {
      var p = S.ptr[e.pointerId];
      if (!p) return;
      delete S.ptr[e.pointerId];
      if (Object.keys(S.ptr).length < 2) S.pinch = null;
      if (!Object.keys(S.ptr).length) stage.classList.remove("is-drag");
      var dx = e.clientX - p.x0, dy = e.clientY - p.y0, dt = Date.now() - p.t0, moved = Math.hypot(dx, dy);
      var swipe = S.z <= 1.02 && Math.abs(dx) > 60 && Math.abs(dx) > 1.6 * Math.abs(dy) && dt < 700;
      if (swipe && e.type === "pointerup") { go(S.n + (dx < 0 ? 1 : -1)); return; }
      if (e.type === "pointerup" && moved < 10 && dt < 350) {
        var now = Date.now();
        if (S.tapAt && now - S.tapAt < 320 && Math.hypot(e.clientX - S.tapX, e.clientY - S.tapY) < 30) {
          S.tapAt = 0;
          var pt = stagePoint(e);
          if (S.z > 1.2) { S.z = 1; layout(true); S.top = false; } else zoomAt(2.6, pt[0], pt[1]);
        } else { S.tapAt = now; S.tapX = e.clientX; S.tapY = e.clientY; }
      }
      layout(false);
    }
    stage.addEventListener("pointerup", up);
    stage.addEventListener("pointercancel", up);
    stage.addEventListener("wheel", function (e) {
      e.preventDefault();
      var pt = stagePoint(e);
      if (e.ctrlKey || e.metaKey) zoomAt(S.z * Math.exp(-e.deltaY * 0.004), pt[0], pt[1]);
      else if (e.shiftKey && !e.deltaX) { S.tx -= e.deltaY; clamp(); paint(); }
      else { S.tx -= e.deltaX; S.ty -= e.deltaY; clamp(); paint(); }
    }, { passive: false });
  }
  function paintLight() { S.pane.style.transform = "translate(" + S.tx.toFixed(1) + "px," + S.ty.toFixed(1) + "px) scale(" + S.z.toFixed(4) + ")"; clearTimeout(S.upT); S.upT = setTimeout(upgrade, 250); }

  function onKey(e) {
    if (!S) return;
    var inInput = e.target === S.input;
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); if (inInput) { S.input.blur(); S.root.focus(); } else closeViewer(); return; }
    if (inInput) { if (e.key === "Enter") { e.preventDefault(); S.input.blur(); S.stage.focus(); } e.stopImmediatePropagation(); return; }
    if (e.ctrlKey || e.altKey || e.metaKey) { e.stopImmediatePropagation(); return; }
    var k = e.key, handled = true, zoomed = S.z > 1.02, step = 80;
    if (e.target && e.target.closest && e.target.closest("button") && (k === "Enter" || k === " ")) { e.stopImmediatePropagation(); return; }
    if (k === "ArrowRight" || k === "PageDown" || k === "n") { if (zoomed && k === "ArrowRight") { S.tx -= step; clamp(); paint(); } else go(S.n + 1); }
    else if (k === "ArrowLeft" || k === "PageUp" || k === "p") { if (zoomed && k === "ArrowLeft") { S.tx += step; clamp(); paint(); } else go(S.n - 1); }
    else if (k === "ArrowDown") { S.ty -= step; clamp(); paint(); }
    else if (k === "ArrowUp") { S.ty += step; clamp(); paint(); }
    else if (k === " ") { go(S.n + (e.shiftKey ? -1 : 1)); }
    else if (k === "+" || k === "=") zoomAt(S.z * 1.4, S.mt.sw / 2, S.mt.sh / 2);
    else if (k === "-" || k === "_") zoomAt(S.z / 1.4, S.mt.sw / 2, S.mt.sh / 2);
    else if (k === "0") { S.top = true; layout(true); }
    else if (k === "f") fitToggle();
    else if (k === "t") $(".pk-sv-th", S.root).click();
    else if (k === "Home") go(1);
    else if (k === "End") go(S.a.pages);
    else if (k === "g" || k === "/") { S.input.focus(); }
    else if (k === "Tab") { handled = false; }
    else handled = false;
    if (handled) { e.preventDefault(); }
    e.stopImmediatePropagation();
  }
  function keepPageHere() {
    var m = S.m, n = S.n, a = S.a;
    if (!CAN_CACHE || !window.isSecureContext) { toast("Keeping pages needs a secure connection"); return; }
    var urls = [imgUrl(a, n, BASE_W)];
    toast("Keeping page " + n + " (about " + MB_PER_PAGE.toFixed(1) + " MB)…");
    cacheOpen().then(function (c) {
      return Promise.all(urls.map(function (u) { return fetch(u, { mode: "cors", credentials: "omit" }).then(function (r) { if (!r.ok) throw new Error(); return c.put(u, r); }); }));
    }).then(function () { if (S) toast("Page " + n + " is kept on this device"); }, function () { if (S) toast("This page could not be kept"); });
  }

  /* ---------------------------------------------------------------- the pages of a book: its remote.json (for the viewer opened before a chapter) */
  function loadMeta(id) {
    var lk = window.pkRemote && window.pkRemote.books && window.pkRemote.books[id];
    if (!lk) return Promise.reject(new Error("unknown book"));
    var root = new URL("../", document.currentScript ? document.currentScript.src : (document.querySelector('script[src*="assets/scans.js"]') || {}).src || location.href).href;
    return fetch(root + lk.path + "/remote.json", { credentials: "same-origin" }).then(function (r) { return r.json(); }).then(function (m) { BOOKS[id] = m; return m; });
  }

  /* ---------------------------------------------------------------- buttons of the chapters (page and reader) */
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("button");
    if (!t) return;
    if (t.classList.contains("pk-sc-view") || t.classList.contains("pk-sc-viewall")) {
      e.preventDefault();
      openViewer(t.getAttribute("data-book"), +t.getAttribute("data-n"), t);
    } else if (t.closest(".pk-sc-tools")) {
      var box = t.closest(".pk-sc-tools");
      if (t.classList.contains("pk-sc-keep")) askKeep(box);
      else if (t.classList.contains("pk-sc-yes")) doKeep(box);
      else if (t.classList.contains("pk-sc-no")) keepState(box);
      else if (t.classList.contains("pk-sc-unkeep")) unkeep(box);
    }
  });
  /* a chapter that has just arrived: what of it is already kept */
  function seen(root) {
    Array.prototype.forEach.call((root || document).querySelectorAll(".pk-sc-tools:not([data-seen])"), function (b) { b.setAttribute("data-seen", "1"); keepState(b); });
  }
  if (window.MutationObserver) {
    new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) for (var j = 0; j < list[i].addedNodes.length; j++) {
        var n = list[i].addedNodes[j];
        if (n.nodeType === 1 && (n.matches(".pk-sc-tools") || n.querySelector(".pk-sc-tools"))) { seen(n.parentNode || n); return; }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  window.pkScans = { chapter: chapter, credit: credit, open: openViewer, close: closeViewer, imgUrl: imgUrl, clean: function (raw) { return paragraphs(cleanLines(raw)); } };
})();
