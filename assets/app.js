/* Pustakālaya: web edition. The reading app: library, offline books, updates.
 *
 *  - the shelf on the home page: a tap on a cover opens the book in the reader (reader.js) at the place last
 *    read, or at its start; each cover shows how far through the book the reader is; "Continue reading" lists the
 *    books opened last; a row of collection buttons and a title search filter the covers. The records come from
 *    localStorage ("bjp.books", kept by the reader);
 *  - "Keep for offline reading" on the home page and on each volume's first page: every page and image of
 *    the volume (listed in library.json, written at build time by tools/site_hooks.py) is stored in the
 *    "bjp-offline" cache, which the service worker (sw.js) reads when there is no connection;
 *  - the pages that find books (All books, the categories, the reading lists; tools/browse.py): covers or a list,
 *    filters (category, then subcategory, level, kind) and sorting, and the reader's progress through each reading list;
 *  - the Categories button in the header of every page: a panel of the categories, each with its subcategories
 *    (a sheet on phones, a menu on wider screens); and on the front page, "Browse categories": a tap on a category
 *    shows its subcategories below it;
 *  - a notice when a new edition of the site has been installed in the background ("Updated - reload");
 *  - a Back button in the header when the site runs as an installed app (which has no browser toolbar);
 *  - the reader's interests: on the first visit the front page asks "What would you like to read?" (streams, then,
 *    if wished, subjects and a level); the front page, the Categories panel and All books then show those books, with
 *    "Show all" a tap away. Kept in localStorage ("bjp.interests:<site path>") only;
 *  - on a phone, the page of a book keeps "Start reading" (or "Continue 34%") in a bar at the foot of the screen.
 *
 * Without localStorage, the Cache API or service workers the parts that need them are simply not shown.
 */
(function () {
  "use strict";
  if (window.__bjpApp) return;
  window.__bjpApp = true;

  var ROOT = (function () {
    var s = document.currentScript && document.currentScript.src;
    if (!s) { var e = document.querySelector('script[src*="assets/app.js"]'); s = e && e.src; }
    try { return new URL("../", s || location.href).href; } catch (x) { return location.origin + "/"; }
  })();
  var ROOT_PATH = new URL(ROOT).pathname;
  var KEY_LAST = "bjp.reader.last", KEY_POS = "bjp.reader.pos", KEY_OPEN = "bjp.reader.open",
      KEY_GOTO = "bjp.reader.goto", KEY_SEEN = "bjp.lib.seen", KEY_SUP = "bjp.reader.suppress",
      KEY_BOOKS = "bjp.books", KEY_COVER = "bjp.reader.cover";
  var KEEP = "bjp-offline", EXT = "bjp-ext", META = ROOT + "offline-meta/";
  var CAN_KEEP = !!(window.caches && window.fetch && "serviceWorker" in navigator && window.isSecureContext);
  var STANDALONE = !!((window.matchMedia && (matchMedia("(display-mode: standalone)").matches ||
      matchMedia("(display-mode: fullscreen)").matches)) || navigator.standalone === true);
  var ICON = {
    keep: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
    kept: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/><path d="M9 9.5l2.2 2.2L15.5 7.5"/></svg>',
    book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7c-1.6-1.3-3.9-2-8-2v13c4.1 0 6.4.7 8 2 1.6-1.3 3.9-2 8-2V5c-4.1 0-6.4.7-8 2zM12 7v13"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
  };

  /* ---------------------------------------------------------------- helpers */
  function noop() {}
  function store(kind) { try { return window[kind]; } catch (e) { return null; } }
  function sget(kind, k) { try { var s = store(kind); return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function sset(kind, k, v) { try { var s = store(kind); if (s) s.setItem(k, v); } catch (e) { /* unavailable */ } }
  function sdel(kind, k) { try { var s = store(kind); if (s) s.removeItem(k); } catch (e) { /* unavailable */ } }
  function jget(k, d) { try { var v = sget("localStorage", k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function jset(k, v) { try { sset("localStorage", k, JSON.stringify(v)); } catch (e) { /* unavailable */ } }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function mb(bytes) {
    var m = bytes / 1e6;
    return m < 0.1 ? "under 0.1 MB" : (m < 10 ? m.toFixed(1) : String(Math.round(m))) + " MB";
  }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
  function ago(t) {
    var s = (Date.now() - t) / 1000;
    if (s < 90) return "just now";
    if (s < 3600) return plural(Math.round(s / 60), "minute", "minutes") + " ago";
    if (s < 86400) return plural(Math.round(s / 3600), "hour", "hours") + " ago";
    if (s < 2 * 86400) return "yesterday";
    if (s < 14 * 86400) return Math.round(s / 86400) + " days ago";
    return "on " + dateText(t);
  }
  function dateText(t) {
    try { return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }); }
    catch (e) { return new Date(t).toDateString(); }
  }
  /* The books' folders come from library.yml, through a JSON list in the page head (id, path relative to the
     site root). "/…/vol16_vastu/chapter03_x.html" -> ["vol16_vastu", "chapter03_x"]; null outside the books. */
  var BOOKS = (function () {
    try { var e = document.getElementById("bjp-books"); return e ? JSON.parse(e.textContent) : null; } catch (x) { return null; }
  })();
  var BOOK_ROOT = (function () {
    var s = document.currentScript && document.currentScript.src;
    if (!s) { var e = document.querySelector('script[src*="assets/app.js"]'); s = e && e.src; }
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
  function isHome() {
    var p = location.pathname;
    return p === ROOT_PATH || p === ROOT_PATH + "index.html";
  }
  function online() { return navigator.onLine !== false; }

  /* ---------------------------------------------------------------- data: library.json and kept volumes */
  var st = { lib: null, meta: {}, jobs: {}, errors: {}, ready: null };
  var libP = null;
  function library() {
    if (!libP) {
      libP = fetch(ROOT + "library.json", { credentials: "same-origin" }).then(function (r) {
        if (!r.ok) throw new Error("library " + r.status);
        return r.json();
      }).then(function (lib) { st.lib = lib; return lib; }).catch(function () { libP = null; return null; });
    }
    return libP;
  }
  function findVol(vid) {
    var vs = st.lib && st.lib.books || [];
    for (var i = 0; i < vs.length; i++) if (vs[i].id === vid) return vs[i];
    return null;
  }
  function openKeep() { return caches.open(KEEP); }
  function loadMeta() {
    if (!CAN_KEEP) return Promise.resolve({});
    return openKeep().then(function (c) {
      return c.keys().then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k.url.indexOf(META) === 0; }).map(function (k) {
          return c.match(k).then(function (r) { return r ? r.json() : null; }).catch(function () { return null; });
        }));
      });
    }).then(function (list) {
      var out = {};
      list.forEach(function (m) { if (m && m.vid) out[m.vid] = m; });
      st.meta = out;
      return out;
    }).catch(function () { return {}; });
  }
  function ready() {
    if (!st.ready) st.ready = Promise.all([library(), loadMeta()]);
    return st.ready;
  }
  function requestPersist() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persisted().then(function (p) { return p || navigator.storage.persist(); }).catch(noop);
      }
    } catch (e) { /* not supported */ }
  }
  function estimate() {
    try {
      if (navigator.storage && navigator.storage.estimate) return navigator.storage.estimate().catch(function () { return null; });
    } catch (e) { /* not supported */ }
    return Promise.resolve(null);
  }

  /* ---------------------------------------------------------------- keeping and removing a volume */
  function fetchForKeep(url, tries) {
    // the header tells the service worker to pass the request through (the copy goes into the volume cache only)
    return fetch(url, { credentials: "same-origin", cache: "no-cache", headers: { "X-BJP-Keep": "1" } }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r;
    }).catch(function (e) {
      if (tries > 0 && online()) return new Promise(function (res) { setTimeout(res, 600); }).then(function () { return fetchForKeep(url, tries - 1); });
      throw e;
    });
  }

  function keep(vid, quiet) {
    if (!CAN_KEEP) return Promise.resolve();
    if (st.jobs[vid]) return st.jobs[vid].promise;
    var job = { done: 0, total: 0, failed: 0, cancel: false, quiet: !!quiet };
    st.jobs[vid] = job;
    delete st.errors[vid];
    if (!quiet) requestPersist();
    emit(vid);
    job.promise = library().then(function (lib) {
      var v = findVol(vid);
      if (!lib || !v) throw new Error("no list");
      var urls = v.pages.concat(v.files).map(function (u) { return ROOT + u; });
      var ext = v.math ? lib.mathjax || [] : [];
      job.total = urls.length + ext.length;
      emit(vid);
      return openKeep().then(function (cache) {
        var i = 0;
        function worker() {
          if (job.cancel || i >= urls.length) return Promise.resolve();
          var u = urls[i++];
          return fetchForKeep(u, 1).then(function (r) { return cache.put(u, r); })
            .catch(function () { job.failed++; })
            .then(function () { job.done++; emit(vid); return worker(); });
        }
        var ws = [];
        for (var k = 0; k < 4; k++) ws.push(worker());
        return Promise.all(ws).then(function () {
          if (job.cancel || !ext.length) return null;
          // MathJax and its fonts, for the mathematics of this volume (kept with the other external files)
          return caches.open(EXT).then(function (ec) {
            return Promise.all(ext.map(function (u) {
              return ec.match(u).then(function (hit) { return hit || ec.add(u); }).catch(noop)
                .then(function () { job.done++; emit(vid); });
            }));
          });
        }).then(function () {
          if (job.cancel) {
            return Promise.all([cache.delete(META + vid), removeFrom(cache, vid, null)]).then(function () { delete st.meta[vid]; libStatus(); });
          }
          if (job.failed) throw new Error("incomplete");
          var m = { vid: vid, hash: v.hash, bytes: v.bytes, count: urls.length, t: Date.now(), version: lib.version };
          return cache.put(META + vid, new Response(JSON.stringify(m), { headers: { "Content-Type": "application/json" } }))
            .then(function () { st.meta[vid] = m; return removeFrom(cache, vid, urls); });
        });
      });
    }).then(function () {
      delete st.jobs[vid];
      emit(vid);
      libStatus();
    }, function () {
      delete st.jobs[vid];
      if (!job.cancel) st.errors[vid] = job.failed ? plural(job.failed, "file", "files") + " could not be stored." : "The list of pages could not be loaded.";
      emit(vid);
    });
    return job.promise;
  }

  /* delete the volume's entries from the cache; with keepList, only those no longer in the volume */
  function removeFrom(cache, vid, keepList) {
    var v = findVol(vid);
    var prefix = ROOT + (v ? v.path : vid) + "/";
    return cache.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        return k.url.indexOf(prefix) === 0 && (!keepList || keepList.indexOf(k.url) < 0);
      }).map(function (k) { return cache.delete(k); }));
    });
  }

  function remove(vid) {
    if (!CAN_KEEP) return Promise.resolve();
    var job = st.jobs[vid];
    if (job) { job.cancel = true; return job.promise; }
    return openKeep().then(function (c) {
      return Promise.all([c.delete(META + vid), removeFrom(c, vid, null)]);
    }).then(function () {
      delete st.meta[vid];
      delete st.errors[vid];
      emit(vid);
      libStatus();
    }).catch(noop);
  }

  /* kept volumes are brought up to date after a new edition has been published */
  function refreshKept() {
    if (!CAN_KEEP || !online() || refreshKept.done) return;
    refreshKept.done = true;
    ready().then(function () {
      Object.keys(st.meta).forEach(function (vid) {
        var v = findVol(vid);
        if (v && st.meta[vid].hash !== v.hash) keep(vid, true);
      });
    });
  }

  /* ---------------------------------------------------------------- rendering the offline controls */
  function state(vid) {
    var job = st.jobs[vid], m = st.meta[vid];
    if (job && !(job.quiet && m)) return "busy";
    if (m) return "kept";
    if (st.errors[vid]) return "error";
    return "idle";
  }
  function pct(job) { return job && job.total ? Math.round(job.done / job.total * 100) : 0; }
  function volSummary(v) {
    if (!v) return "";
    var imgs = v.files.length;
    return plural(v.pages.length, "page", "pages") + (imgs ? " and " + plural(imgs, "figure or photograph", "figures and photographs") : "") +
      ", about " + mb(v.bytes);
  }

  function emit(vid) {
    var i, list = document.querySelectorAll('.bjp-offline[data-vol="' + vid + '"]');
    for (i = 0; i < list.length; i++) renderBox(list[i], vid);
    list = document.querySelectorAll('.vol-item[data-vol="' + vid + '"]');
    for (i = 0; i < list.length; i++) renderCardFooter(list[i], vid);
  }
  function emitAll() {
    var seen = {}, i, list = document.querySelectorAll(".bjp-offline[data-vol], .vol-item[data-vol]");
    for (i = 0; i < list.length; i++) {
      var vid = list[i].getAttribute("data-vol");
      if (!seen[vid]) { seen[vid] = 1; emit(vid); }
    }
  }

  /* the control on the page of a book: one button, a line of status under it, a progress bar while keeping */
  function renderBox(box, vid) {
    if (!CAN_KEEP) return;
    if (!box.__bjp) {
      box.__bjp = true;
      box.innerHTML = '<button type="button" class="pk-btn pk-btn-quiet bo-btn"></button>' +
        '<span class="bo-sub" role="status" aria-live="polite"></span><span class="bo-bar" hidden><i></i></span>';
      box.querySelector(".bo-btn").addEventListener("click", function () { if (state(vid) !== "kept") act(vid); });
      box.querySelector(".bo-sub").addEventListener("click", function (e) { if (e.target.closest("button")) remove(vid); });
    }
    var s = state(vid), v = findVol(vid), m = st.meta[vid], job = st.jobs[vid];
    var label, icon = ICON.keep, sub = "", disabled = false, removable = false;
    if (s === "busy") {
      label = "Keeping\u2026 " + pct(job) + "%";
      sub = job.total ? job.done + " of " + job.total + " files \u00b7 " : "";
      sub += '<button type="button">Cancel</button>';
      removable = true;
    } else if (s === "kept") {
      label = "Available offline";
      icon = ICON.kept;
      sub = "Kept " + esc(ago(m.t)) + " \u00b7 about " + mb(m.bytes) + (job ? " \u00b7 updating\u2026" : "") + ' \u00b7 <button type="button">Remove</button>';
      removable = true;
    } else if (s === "error") {
      label = "Try again";
      sub = esc(st.errors[vid] + " Check the connection.");
    } else {
      label = "Keep for offline reading";
      sub = v ? esc(volSummary(v)) : "";
      if (!online()) { disabled = true; sub = "Connect to the internet to keep this book."; }
    }
    box.className = "bjp-offline is-" + s;
    var b = box.querySelector(".bo-btn");
    b.innerHTML = icon + "<span>" + esc(label) + "</span>";
    b.disabled = disabled;
    b.setAttribute("aria-disabled", String(s === "kept"));
    box.querySelector(".bo-sub").innerHTML = sub;
    var bar = box.querySelector(".bo-bar");
    bar.hidden = s !== "busy";
    bar.firstChild.style.width = pct(job) + "%";
    void removable;
  }

  /* a cover on the front page: greyed when it cannot be read offline, marked when it is kept on this device */
  function renderCardFooter(item, vid) {
    var unavailable = !online() && !st.meta[vid];
    item.classList.toggle("is-unavailable", unavailable && CAN_KEEP);
    if (!CAN_KEEP) return;
    var cv = item.querySelector(".book-cover"), mark = item.querySelector(".vol-kept");
    var kept = state(vid) === "kept";
    if (kept && !mark && cv) {
      mark = el("span", "vol-kept", ICON.check);
      mark.setAttribute("title", "Available offline");
      mark.setAttribute("role", "img");
      mark.setAttribute("aria-label", "Available offline");
      cv.appendChild(mark);
    } else if (!kept && mark) mark.parentNode.removeChild(mark);
  }

  function act(vid) {
    var s = state(vid);
    if (s === "busy" || s === "kept") remove(vid);
    else keep(vid, false);
  }

  /* ---------------------------------------------------------------- the shelf: progress, continue reading, opening a book */
  /* "bjp.books" holds one record per book that has been read: {path, title, f, pct, mode, t}: the page last
     read, its title, how far through that page (f), how far through the whole book (pct, in percent: an estimate
     from the length of each chapter in <book>/contents.json, written by reader.js), and when. */
  function booksRec() { var b = jget(KEY_BOOKS, {}); return b && typeof b === "object" ? b : {}; }
  function migrate() {
    // a book read before the records above existed: the last chapter read (bjp.reader.last) becomes its record
    var all = booksRec(), last = jget(KEY_LAST, null);
    if (last && last.path && last.vol && !all[last.vol]) {
      all[last.vol] = { path: last.path, title: last.title, f: last.f, mode: last.mode, t: last.t };
      jset(KEY_BOOKS, all);
    }
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function norm(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }
  function reducedMotion() { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }

  function seenPages(vid) {
    var out = {}, all = jget(KEY_SEEN, {}) || {}, rec = all[vid], k;
    if (rec && Array.isArray(rec.p)) rec.p.forEach(function (p) { out[p] = 1; });
    var pos = jget(KEY_POS, {}) || {};
    for (k in pos) {
      var v = volOf(k);
      if (v && v[0] === vid && v[1] !== "index") out[v[1]] = 1;
    }
    return Object.keys(out).length;
  }

  function shownPct(rec) {
    var p = rec && typeof rec.pct === "number" ? clamp(rec.pct, 0, 100) : null;
    return p === null ? null : (p >= 100 ? 100 : Math.max(0, Math.min(99, Math.round(p))));
  }
  /* each cover: a bar along its foot and the percentage under it once the book has been read */
  function markStarted() {
    var all = booksRec(), items = document.querySelectorAll(".vol-item[data-vol]");
    for (var i = 0; i < items.length; i++) {
      var it = items[i], vid = it.getAttribute("data-vol"), rec = all[vid];
      var pct = shownPct(rec);
      var started = !!(rec && rec.path) || seenPages(vid) > 0;
      var cv = it.querySelector(".book-cover"), cap = it.querySelector(".vol-cap");
      it.classList.toggle("is-started", started);
      it.style.setProperty("--pct", (pct || 0) + "%");
      var olds = it.querySelectorAll(".vol-prog, .vol-pct, .vol-done");
      for (var k = 0; k < olds.length; k++) olds[k].parentNode.removeChild(olds[k]);
      if (!started || !cv || !cap) continue;
      var lab = el("span", "vol-pct");
      if (pct === null) lab.textContent = "Started";
      else {
        lab.innerHTML = pct >= 100 ? "Finished" : pct + "% read";
        var bar = el("span", "vol-prog", '<i style="width:' + pct + '%"></i>');
        bar.setAttribute("role", "progressbar");
        bar.setAttribute("aria-label", "Progress in this book");
        bar.setAttribute("aria-valuemin", "0");
        bar.setAttribute("aria-valuemax", "100");
        bar.setAttribute("aria-valuenow", String(pct));
        cv.appendChild(bar);
      }
      cap.appendChild(lab);
    }
  }

  /* where a tap on a cover (or on a "Continue reading" card) takes the reader: the page last read, else the start */
  function resumeTarget(vid) {
    var v = findVol(vid), rec = booksRec()[vid];
    if (rec && rec.path && rec.path.indexOf(ROOT_PATH) === 0 && (!v || v.pages.indexOf(rec.path.slice(ROOT_PATH.length)) >= 0)) {
      return { url: location.origin + rec.path, rec: rec };
    }
    if (v) return { url: location.origin + ROOT_PATH + v.path + "/" + (v.start || "index.html"), rec: null };
    return null;
  }
  function coverLook(item) {
    var card = item && (item.matches && item.matches(".vol-card") ? item : item.querySelector(".vol-card"));
    if (!card) return null;
    var cs = getComputedStyle(card), t = item.querySelector(".vol-title"), s = item.querySelector(".vol-sub");
    return { bg: cs.getPropertyValue("--cv-bg").trim(), fg: cs.getPropertyValue("--cv-fg").trim(), accent: cs.getPropertyValue("--cv-accent").trim(),
      title: t ? t.textContent : "", sub: s ? s.textContent : "", lang: t && t.getAttribute("lang") || "" };
  }
  function openBook(vid, item) {
    var look = coverLook(item || document.querySelector('.vol-item[data-vol="' + vid + '"], .pk-book[data-vol="' + vid + '"]'));
    return library().then(function () {
      var t = resumeTarget(vid);
      if (!t) return false;
      sdel("sessionStorage", KEY_SUP);
      sset("sessionStorage", KEY_OPEN, "1");
      if (t.rec && t.rec.mode === "scroll" && typeof t.rec.f === "number") sset("sessionStorage", KEY_GOTO, JSON.stringify({ path: t.rec.path, f: t.rec.f }));
      else sdel("sessionStorage", KEY_GOTO);
      if (look) sset("sessionStorage", KEY_COVER, JSON.stringify(look)); else sdel("sessionStorage", KEY_COVER);
      curtainThen(t.url, look);
      return true;
    });
  }
  /* a brief, quiet opening: the cover's colour fills the screen while the reader loads (reader.js lifts it) */
  function curtainThen(url, look) {
    if (reducedMotion() || !look || !look.bg || !document.body) { location.assign(url); return; }
    var c = el("div", "bjp-curtain");
    c.setAttribute("aria-hidden", "true");
    c.style.background = look.bg;
    c.style.color = look.fg || "#fff";
    c.innerHTML = '<span class="bjp-cu-title"' + (look.lang ? ' lang="' + esc(look.lang) + '"' : "") + ">" + esc(look.title) + "</span>";
    document.body.appendChild(c);
    void c.offsetWidth;
    c.classList.add("on");
    setTimeout(function () { location.assign(url); }, 230);
    setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 6000);
  }
  window.addEventListener("pageshow", function (e) {
    if (!e.persisted) return;
    var cs = document.querySelectorAll(".bjp-curtain");
    for (var i = 0; i < cs.length; i++) cs[i].parentNode.removeChild(cs[i]);
  });
  function onShelfClick(e) {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest ? e.target.closest("a.vol-card, a.pk-cont, a.pk-mini, a.pk-read") : null;
    if (!a) return;
    var item = a.closest("[data-vol]");
    var vid = item && item.getAttribute("data-vol");
    if (!vid) return;
    e.preventDefault();
    e.stopPropagation();
    var shelfItem = document.querySelector('.vol-item[data-vol="' + vid + '"]') || document.querySelector('.pk-book[data-vol="' + vid + '"]');
    if (shelfItem && shelfItem.classList.contains("vol-item")) shelfItem.classList.add("is-opening");
    openBook(vid, shelfItem).then(function (ok) { if (!ok) location.assign(a.href); }, function () { location.assign(a.href); });
  }
  document.addEventListener("click", onShelfClick, true);

  /* "Continue reading": the book opened last, large, and the others opened recently as small covers */
  function recentBooks() {
    var all = booksRec(), list = [];
    Object.keys(all).forEach(function (vid) {
      var r = all[vid], item = document.querySelector('.vol-item[data-vol="' + vid + '"]');
      if (!r || !r.path || !r.t || !item) return;
      var v = findVol(vid);
      if (st.lib && v && r.path.indexOf(ROOT_PATH) === 0 && v.pages.indexOf(r.path.slice(ROOT_PATH.length)) < 0) return;
      list.push({ vid: vid, r: r, item: item });
    });
    list.sort(function (a, b) { return b.r.t - a.r.t; });
    return list;
  }
  function coverOf(item) {
    var cover = item.querySelector(".book-cover");
    if (!cover) return "";
    var c = cover.cloneNode(true), junk = c.querySelectorAll(".vol-kept, .vol-prog, .vol-done");
    for (var i = 0; i < junk.length; i++) junk[i].parentNode.removeChild(junk[i]);
    return c.outerHTML;
  }
  function renderContinue() {
    var box = document.querySelector(".bjp-continue");
    if (!box) return;
    var list = recentBooks().slice(0, 5);
    if (!list.length) { box.hidden = true; box.innerHTML = ""; return; }
    var x = list[0], card = x.item.querySelector(".vol-card"), title = x.item.querySelector(".vol-title");
    var lang = title && title.getAttribute("lang");
    var pct = shownPct(x.r);
    var unavailable = !online() && CAN_KEEP && !st.meta[x.vid];
    var html = '<span class="pk-kick" id="bc-head">Continue reading</span>' +
      '<a class="pk-cont" data-vol="' + esc(x.vid) + '" href="' + esc(location.origin + x.r.path) + '" style="' + esc(card ? card.getAttribute("style") || "" : "") + '" aria-describedby="bc-head">' +
      '<span class="pk-cont-cover" aria-hidden="true">' + coverOf(x.item) + "</span>" +
      '<span class="pk-cont-body"><span class="pk-cont-title"' + (lang ? ' lang="' + esc(lang) + '"' : "") + ">" + esc(title ? title.textContent : "") + "</span>" +
      '<span class="pk-cont-ch">' + esc(x.r.title || "") + "</span>" +
      (pct === null ? "" : '<span class="pk-bar" role="progressbar" aria-label="Progress in this book" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></span>') +
      '<span class="pk-cont-meta">' + (pct === null ? "" : pct + "% \u00b7 ") + esc(ago(x.r.t)) + (unavailable ? " \u00b7 not kept for offline reading" : "") + "</span>" +
      '<span class="pk-btn pk-btn-primary">' + ICON.book + "<span>Resume</span></span></span></a>";
    if (list.length > 1) {
      html += '<div class="pk-also"><span class="pk-also-lab">Also reading</span>';
      list.slice(1).forEach(function (y) {
        var c2 = y.item.querySelector(".vol-card"), t2 = y.item.querySelector(".vol-title");
        html += '<a class="pk-mini" data-vol="' + esc(y.vid) + '" href="' + esc(location.origin + y.r.path) + '" style="' + esc(c2 ? c2.getAttribute("style") || "" : "") + '"' +
          ' title="' + esc((t2 ? t2.textContent : "") + (shownPct(y.r) !== null ? " \u00b7 " + shownPct(y.r) + "%" : "")) + '" aria-label="Continue ' + esc(t2 ? t2.textContent : "") + '">' + coverOf(y.item) + "</a>";
      });
      html += "</div>";
    }
    box.innerHTML = html;
    box.hidden = false;
  }

  /* the title search in the hero and the collection chips */
  function wireShelf() {
    var input = document.getElementById("bjp-find-in"), home = document.querySelector(".pk-home");
    if (!input || input.__bjp) return;
    input.__bjp = true;
    var chips = document.querySelectorAll(".bjp-chip"), none = document.querySelector(".bjp-none");
    var coll = "", q = "";
    function apply() {
      var secs = document.querySelectorAll(".bjp-coll"), total = 0, i, k, act = q ? null : activeInterests(), byColl = {};
      for (i = 0; i < secs.length; i++) {
        var sec = secs[i], show = !coll || sec.getAttribute("data-collection") === coll, n = 0;
        var items = sec.querySelectorAll(".vol-item");
        for (k = 0; k < items.length; k++) {
          var t = items[k].querySelector(".vol-title"), s2 = items[k].querySelector(".vol-sub");
          // the title, the line under it, and the book's subjects and tags (data-find, tools/pages.py)
          if (items[k].__find == null) items[k].__find = norm((t ? t.textContent : "") + " " + (s2 ? s2.textContent : "") + " " + (items[k].getAttribute("data-find") || ""));
          var hit = (!q || items[k].__find.indexOf(q) >= 0) && (!act || matchesInterests(items[k], act));
          items[k].hidden = !hit;
          if (hit) n++;
        }
        byColl[sec.getAttribute("data-collection")] = n;
        sec.hidden = !show || n === 0;
        if (show) total += n;
      }
      // the collection chips: only those with books to show
      for (i = 0; i < chips.length; i++) {
        var cid = chips[i].getAttribute("data-coll");
        chips[i].hidden = !!cid && !byColl[cid];
      }
      if (home) home.classList.toggle("is-filtered", !!(q || coll));
      if (none) {
        none.hidden = total > 0;
        none.textContent = act ? "None of the books here matches your interests." : "No book in the library matches that title.";
      }
      renderForYou(act, total);
    }
    shelfApply = apply;
    for (var c = 0; c < chips.length; c++) {
      chips[c].addEventListener("click", function () {
        coll = this.getAttribute("data-coll") || "";
        for (var j = 0; j < chips.length; j++) chips[j].setAttribute("aria-pressed", String(chips[j] === this));
        apply();
      });
    }
    input.addEventListener("input", function () { q = norm(input.value); apply(); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && input.value) { input.value = ""; q = ""; apply(); }
      else if (e.key === "Enter") {
        // Enter opens the only book left, or moves to the first match
        var vis = document.querySelectorAll(".bjp-coll:not([hidden]) .vol-item:not([hidden]) a.vol-card");
        if (vis.length) { e.preventDefault(); vis[0].focus(); }
      }
    });
  }

  /* the page of a book: "Start reading" becomes "Continue" with the percentage for a book that has been read */
  function wireBookPage() {
    var hero = document.querySelector(".pk-book[data-vol]");
    if (!hero) return;
    var vid = hero.getAttribute("data-vol"), rec = booksRec()[vid], btn = hero.querySelector(".pk-read");
    if (!btn) return;
    var t = resumeTarget(vid);
    if (t && t.rec) {
      var p = shownPct(t.rec);
      btn.querySelector("span").innerHTML = p !== null && p >= 100 ? "Read again" : "Continue" + (p !== null ? ' <i class="pk-pct">' + p + "%</i>" : "");
      btn.setAttribute("href", t.url);
      btn.setAttribute("aria-label", "Continue reading" + (rec && rec.title ? ": " + rec.title : ""));
    } else if (t) btn.setAttribute("href", t.url);
    stickyStart(hero, btn, vid);
  }
  /* on a phone the button stays at hand: a bar at the foot of the screen while the button itself is out of sight */
  var stickyIO = null;
  function stickyStart(hero, btn, vid) {
    var bar = document.querySelector(".pk-sticky");
    if (!bar) {
      var title = hero.querySelector(".pk-book-title"), card = hero.querySelector(".vol-card, .book-cover");
      bar = el("div", "pk-sticky");
      bar.setAttribute("data-vol", vid);
      bar.innerHTML = '<span class="pk-sticky-t"' + (title && title.getAttribute("lang") ? ' lang="' + esc(title.getAttribute("lang")) + '"' : "") + ">" +
        esc(title ? title.textContent.replace(/^\s+|\s+$/g, "") : "") + "</span>";
      var a = btn.cloneNode(true);
      a.removeAttribute("id");
      bar.appendChild(a);
      document.body.appendChild(bar);
      document.documentElement.classList.add("pk-has-sticky");
      if (card) bar.style.setProperty("--cv-bg", getComputedStyle(card).getPropertyValue("--cv-bg"));
      if (window.IntersectionObserver) {
        if (stickyIO) stickyIO.disconnect();
        stickyIO = new IntersectionObserver(function (es) {
          var vis = es[es.length - 1].isIntersecting;
          bar.classList.toggle("on", !vis);
        });
        stickyIO.observe(btn);
      } else bar.classList.add("on");
    }
    var b2 = bar.querySelector(".pk-read");
    if (b2) { b2.innerHTML = btn.innerHTML; b2.setAttribute("href", btn.getAttribute("href")); if (btn.getAttribute("aria-label")) b2.setAttribute("aria-label", btn.getAttribute("aria-label")); }
  }

  /* the Get the app page: the card of the visitor's own device comes first and is marked; inside the installed
     app a line says so. The other cards stay, for installing it on another device. */
  function devicePlatform() {
    var ua = navigator.userAgent || "";
    if (/android/i.test(ua)) return "android";
    if (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
    return "desktop";
  }
  function wireInstallPage() {
    var page = document.querySelector(".pk-apps");
    if (!page) return;
    var mine = devicePlatform(), cards = page.querySelectorAll(".pk-app"), i;
    for (i = 0; i < cards.length; i++) {
      var yours = cards[i].getAttribute("data-platform") === mine, tag = cards[i].querySelector(".pk-app-you");
      cards[i].classList.toggle("is-yours", yours);
      if (tag) tag.hidden = !yours;
    }
    var here = page.querySelector(".pk-apps-here");
    if (here && STANDALONE) {
      here.textContent = "You are reading in the installed app. The steps below are for putting it on another device.";
      here.hidden = false;
    }
  }

  function libStatus() {
    var box = document.querySelector(".bjp-lib-status");
    if (!box || !CAN_KEEP) return;
    var kept = Object.keys(st.meta);
    if (!kept.length) { box.hidden = true; return; }
    var bytes = kept.reduce(function (a, k) { return a + (st.meta[k].bytes || 0); }, 0);
    box.textContent = plural(kept.length, "book is", "books are").replace(/^1 book is/, "One book is") +
      " kept on this device for offline reading (about " + mb(bytes) + ").";
    box.hidden = false;
    estimate().then(function (e) {
      if (e && e.usage && box.isConnected) box.textContent += " Storage used by this site in the browser: about " + mb(e.usage) + ".";
    });
  }

  /* ---------------------------------------------------------------- the offline page */
  function renderOfflinePage() {
    var box = document.querySelector(".bjp-offline-list");
    if (!box) return;
    var from = null;
    try { from = new URL(location.href).searchParams.get("from"); } catch (e) { from = null; }
    var retry = document.querySelector(".bjp-retry a");
    if (retry && from && !/^[a-z]+:|^\/\//i.test(from)) retry.setAttribute("href", ROOT + from.replace(/^\/+/, ""));
    var kept = Object.keys(st.meta).sort();
    if (!CAN_KEEP) { box.innerHTML = ""; return; }
    if (!kept.length) { box.innerHTML = "<p>No book is kept on this device yet.</p>"; return; }
    box.innerHTML = "<p><strong>Kept on this device:</strong></p><ul>" + kept.map(function (vid) {
      var v = findVol(vid);
      return '<li><a href="' + esc(ROOT + (v ? v.path : vid) + "/index.html") + '">' + esc(v ? (v.label ? v.label + ": " : "") + v.title : vid) + "</a></li>";
    }).join("") + "</ul>";
  }

  /* ---------------------------------------------------------------- installed app: back button, offline mark */
  function setupChrome() {
    var root = document.documentElement;
    root.classList.toggle("bjp-standalone", STANDALONE);
    root.classList.toggle("bjp-is-offline", !online());
    var hdr = document.querySelector(".md-header__inner");
    if (!hdr) return;
    if (STANDALONE && !hdr.querySelector(".bjp-backbtn")) {
      var b = el("button", "md-header__button bjp-backbtn", ICON.back);
      b.type = "button";
      b.setAttribute("aria-label", "Back");
      b.title = "Back";
      b.addEventListener("click", function () {
        var here = location.href;
        history.back();
        setTimeout(function () { if (location.href === here) location.href = ROOT + "index.html"; }, 450);
      });
      var title = hdr.querySelector(".md-header__title");
      hdr.insertBefore(b, title || hdr.firstChild);
    }
    var bb = hdr.querySelector(".bjp-backbtn");
    if (bb) bb.hidden = isHome();
    if (!hdr.querySelector(".bjp-netmark")) {
      var m = el("span", "bjp-netmark", "Offline");
      m.setAttribute("role", "status");
      var t2 = hdr.querySelector(".md-header__title");
      if (t2) t2.insertAdjacentElement("afterend", m); else hdr.appendChild(m);
    }
  }

  /* ---------------------------------------------------------------- updates: "Updated - reload" */
  var wantReload = false;
  function showUpdate(reg) {
    if (document.querySelector(".bjp-toast")) return;
    var t = el("div", "bjp-toast",
      '<span class="bt-text">Updated — a new edition is ready.</span>' +
      '<button type="button" class="bt-reload">Reload</button>' +
      '<button type="button" class="bt-close" aria-label="Dismiss">' + ICON.close + "</button>");
    t.setAttribute("role", "status");
    document.body.appendChild(t);
    t.querySelector(".bt-reload").addEventListener("click", function () {
      wantReload = true;
      if (reg && reg.waiting) reg.waiting.postMessage({ type: "skip-waiting" });
      else location.reload();
      setTimeout(function () { location.reload(); }, 3000);
    });
    t.querySelector(".bt-close").addEventListener("click", function () { t.parentNode.removeChild(t); });
  }
  function watchUpdates() {
    if (!("serviceWorker" in navigator)) return;
    var sw = navigator.serviceWorker, reloading = false, lastCheck = Date.now();
    sw.addEventListener("controllerchange", function () {
      if (wantReload && !reloading) { reloading = true; location.reload(); }
    });
    sw.ready.then(function (reg) {
      function track(w) {
        if (!w) return;
        w.addEventListener("statechange", function () { if (w.state === "installed" && sw.controller) showUpdate(reg); });
      }
      if (reg.waiting && sw.controller) showUpdate(reg);
      track(reg.installing);
      reg.addEventListener("updatefound", function () { track(reg.installing); });
      // an installed app can stay open for days: look for a new edition when it comes back to the front
      document.addEventListener("visibilitychange", function () {
        if (!document.hidden && Date.now() - lastCheck > 30 * 60 * 1000) { lastCheck = Date.now(); reg.update().catch(noop); }
      });
    }).catch(noop);
  }

  /* ---------------------------------------------------------------- a book's contents */
  /* each group (front matter, the parts or chapters, back matter) folds; the chapters read are marked, and the one
     being read says so */
  function wireContents() {
    var boxes = document.querySelectorAll("nav.vol-contents");
    for (var i = 0; i < boxes.length; i++) {
      var box = boxes[i];
      if (box.__bjp) { markRead(box); continue; }
      box.__bjp = true;
      var heads = box.querySelectorAll(":scope > p.toc-group");
      var many = heads.length > 1;
      for (var h = 0; h < heads.length; h++) {
        var p = heads[h], ul = p.nextElementSibling;
        if (!ul || ul.tagName !== "UL") continue;
        var d = document.createElement("details");
        d.className = "pk-grp";
        // the chapters are open; short groups of front and back matter too, when the book has few groups
        d.open = !many || ul.children.length > 3 || /chapter|part|unit/i.test(p.textContent);
        d.innerHTML = '<summary><span>' + esc(p.textContent) + '</span><span class="pk-grp-n">' + ul.children.length + "</span></summary>";
        box.insertBefore(d, p);
        d.appendChild(ul);
        box.removeChild(p);
      }
      if (box.querySelector("details:not(.pk-grp)")) {
        var tools = el("div", "vc-tools",
          '<button type="button" data-open="1">Show all sections</button><button type="button" data-open="0">Hide sections</button>');
        tools.setAttribute("role", "group");
        tools.setAttribute("aria-label", "Sections in the contents");
        tools.addEventListener("click", function (e) {
          var b = e.target.closest("button");
          if (!b) return;
          var on = b.getAttribute("data-open") === "1";
          var ds = this.parentNode.querySelectorAll("details");
          for (var k = 0; k < ds.length; k++) if (on || !ds[k].classList.contains("pk-grp")) ds[k].open = on || ds[k].open && ds[k].classList.contains("pk-grp");
        });
        box.insertBefore(tools, box.firstChild);
      }
      markRead(box);
    }
  }
  function markRead(box) {
    var vid = box.getAttribute("data-vol");
    if (!vid) return;
    var seen = {}, all = jget(KEY_SEEN, {}) || {}, rec = booksRec()[vid], i;
    if (all[vid] && Array.isArray(all[vid].p)) all[vid].p.forEach(function (x) { seen[x + ".html"] = 1; });
    var cur = rec && rec.path ? rec.path.slice(rec.path.lastIndexOf("/") + 1) : "";
    var groups = box.querySelectorAll("details.pk-grp");
    var lis = box.querySelectorAll(".vol-toc > li");
    for (i = 0; i < lis.length; i++) {
      var a = lis[i].querySelector("a"), f = a ? (a.getAttribute("href") || "").split("#")[0] : "";
      f = f.slice(f.lastIndexOf("/") + 1);
      lis[i].classList.toggle("is-read", !!seen[f] && f !== cur);
      var tag = lis[i].querySelector(".pk-here");
      if (f && f === cur) {
        if (!tag && a) a.insertAdjacentHTML("afterend", '<span class="pk-here">Reading</span>');
      } else if (tag) tag.parentNode.removeChild(tag);
    }
    for (i = 0; i < groups.length; i++) {
      var n = groups[i].querySelectorAll(".vol-toc > li").length, r = groups[i].querySelectorAll(".vol-toc > li.is-read").length;
      var lab = groups[i].querySelector(".pk-grp-n");
      if (lab) lab.textContent = r ? r + " of " + n + " read" : String(n);
    }
  }

  /* ---------------------------------------------------------------- finding books: All books, a category, a reading list */
  /* The pages of tools/browse.py: the books as covers or as a list (the reader's choice, kept in "bjp.view"; the class
     bjp-view-list on <html> is set before the first paint by overrides/main.html), filtered by category and then
     subcategory, level, kind, language or words, and sorted. The choices are kept in the address (?cat=...&sub=...
     &level=...), so that Back returns to them and a filtered list can be shared. */
  var KEY_VIEW = "bjp.view", LEVEL_RANK = { beginner: 1, intermediate: 2, advanced: 3 };
  function pageView() {
    var v = sget("localStorage", KEY_VIEW);
    if (v === "grid" || v === "list") return v;
    var box = document.querySelector(".pk-books[data-view-default]");
    return box && box.getAttribute("data-view-default") === "list" ? "list" : "grid";
  }
  function applyView(v) {
    var root = document.documentElement;
    root.classList.toggle("bjp-view-list", v === "list");
    var bs = document.querySelectorAll(".pk-view button");
    for (var i = 0; i < bs.length; i++) bs[i].setAttribute("aria-pressed", String(bs[i].getAttribute("data-view") === v));
  }
  function wireBrowse() {
    // the chip of this category in the row of chips (which scrolls sideways on phones) is brought into sight
    var cur = document.querySelector(".pk-subchips [aria-current]");
    if (cur && cur.parentNode.scrollWidth > cur.parentNode.clientWidth) {
      var row = cur.parentNode;
      row.scrollLeft = Math.max(0, cur.offsetLeft - row.offsetLeft - (row.clientWidth - cur.offsetWidth) / 2);
    }
    var box = document.querySelector(".pk-books[data-view-default]");
    if (!box) return;
    applyView(pageView());
    if (box.__bjp) return;
    box.__bjp = true;
    var page = box.closest(".pk-browse-page") || document;
    var items = Array.prototype.slice.call(box.querySelectorAll(".pk-item"));
    var controls = page.querySelectorAll(".pk-tools [data-f], .pk-tools [data-sort]");
    var shown = page.querySelector(".pk-shown"), empty = page.querySelector(".pk-empty");
    var st0 = { q: "", cat: "", sub: "", level: "", kind: "", lang: "", sort: "" }, s = {}, k;
    for (k in st0) s[k] = st0[k];
    var finds = items.map(function (it) { return norm(it.getAttribute("data-find") || it.textContent); });
    var allBooks = /\/books\.html$/.test(location.pathname) && !/[?&](cat|sub|subject|find|level|kind|lang)=/.test(location.search);
    var fyBox = null;
    if (allBooks) {
      fyBox = el("div", "pk-foryou pk-foryou-browse");
      fyBox.hidden = true;
      var tools0 = page.querySelector(".pk-tools");
      if (tools0) tools0.insertAdjacentElement("beforebegin", fyBox);
    }
    var titles = items.map(function (it) { var t = it.querySelector(".vol-name"); return norm(t ? t.textContent : ""); });
    function ctl(name) {
      for (var i = 0; i < controls.length; i++) {
        var c = controls[i];
        if ((c.getAttribute("data-f") || (c.hasAttribute("data-sort") ? "sort" : "")) === name) return c;
      }
      return null;
    }
    // the subcategories offered are those of the category chosen (all of them are kept here)
    var catSel = ctl("cat"), subSel = ctl("sub"), subAll = [];
    if (subSel) {
      subAll = Array.prototype.slice.call(subSel.querySelectorAll("option[data-cat]"));
      subAll.forEach(function (o) { subSel.removeChild(o); });
    }
    function fillSubs() {
      if (!subSel) return;
      var first = subSel.options[0], cat = catSel && catSel.selectedIndex > 0 ? catSel.options[catSel.selectedIndex] : null, n = 0;
      while (subSel.options.length > 1) subSel.removeChild(subSel.options[1]);
      subAll.forEach(function (o) { if (o.getAttribute("data-cat") === s.cat) { subSel.appendChild(o); n++; } });
      first.textContent = cat ? "All in " + cat.textContent.replace(/\s*\(\d+\)$/, "") : "Subcategory";
      subSel.disabled = !n;
      subSel.value = s.sub;
      if (subSel.value !== s.sub) { s.sub = ""; subSel.value = ""; }
    }
    // the choices in the address (an old address with ?subject= is read as a category or a subcategory)
    var old = null;
    try {
      var sp = new URL(location.href).searchParams;
      old = sp.get("subject");
      if (old && !sp.get("cat")) {
        var so = subAll.filter(function (o) { return o.value === old; })[0];
        if (so) { sp.set("cat", so.getAttribute("data-cat")); sp.set("sub", old); } else sp.set("cat", old);
      }
      for (k in st0) {
        var val = sp.get(k === "q" ? "find" : k), c0 = ctl(k);
        if (k === "sub") fillSubs();
        if (val && c0 && (c0.tagName !== "SELECT" || c0.querySelector('option[value="' + val.replace(/["\\]/g, "") + '"]'))) { s[k] = val; c0.value = val; }
      }
    } catch (e) { /* no URL API: the page starts unfiltered */ }
    fillSubs();
    function keepInAddress() {
      try {
        var u = new URL(location.href);
        for (var key in st0) {
          var name = key === "q" ? "find" : key;
          if (s[key]) u.searchParams.set(name, s[key]); else u.searchParams.delete(name);
        }
        u.searchParams.delete("subject");
        if (u.href !== location.href) history.replaceState(history.state, "", u.href);
      } catch (e) { /* the address stays as it is */ }
    }
    function apply(reorder) {
      var n = 0, q = norm(s.q), words = q ? q.split(" ") : [];
      var act = allBooks && !q && !s.cat && !s.sub ? activeInterests() : null;
      items.forEach(function (it, i) {
        var subs = " " + it.getAttribute("data-subjects") + " ";
        var hit = (!s.cat || subs.indexOf(" " + s.cat + " ") >= 0) && (!s.sub || subs.indexOf(" " + s.sub + " ") >= 0) &&
          (!s.level || it.getAttribute("data-level") === s.level) &&
          (!s.kind || it.getAttribute("data-kind") === s.kind) &&
          (!s.lang || it.getAttribute("data-lang") === s.lang) &&
          words.every(function (w) { return finds[i].indexOf(w) >= 0; }) && (!act || matchesInterests(it, act));
        it.hidden = !hit;
        if (hit) n++;
      });
      if (reorder) {
        var rec = booksRec(), idx = items.map(function (_, i) { return i; });
        idx.sort(function (a, b) {
          var A = items[a], B = items[b], d = 0;
          if (s.sort === "title") d = titles[a].localeCompare(titles[b]);
          else if (s.sort === "level") d = (LEVEL_RANK[A.getAttribute("data-level")] || 9) - (LEVEL_RANK[B.getAttribute("data-level")] || 9);
          else if (s.sort === "recent") {
            var ra = rec[A.getAttribute("data-vol")], rb = rec[B.getAttribute("data-vol")];
            d = ((rb && rb.t) || 0) - ((ra && ra.t) || 0);
          }
          return d || (+A.getAttribute("data-n") - +B.getAttribute("data-n"));
        });
        idx.forEach(function (i) { box.appendChild(items[i]); });
      }
      if (shown) shown.textContent = n === items.length ? plural(n, "book", "books") : n + " of " + plural(items.length, "book", "books");
      if (fyBox) {
        var fh = forYouBar(act, n);
        fyBox.innerHTML = fh;
        fyBox.hidden = !fh;
        fyBox.classList.toggle("is-on", !!act);
      }
      if (empty) empty.hidden = n > 0;
      for (var i = 0; i < controls.length; i++) {
        var lab = controls[i].closest(".pk-sel");
        if (lab && !controls[i].hasAttribute("data-sort")) lab.classList.toggle("is-set", !!controls[i].value);
      }
    }
    for (var i = 0; i < controls.length; i++) {
      controls[i].addEventListener(controls[i].tagName === "INPUT" ? "input" : "change", function () {
        var name = this.getAttribute("data-f") || "sort";
        s[name] = this.value;
        if (name === "cat") { s.sub = ""; fillSubs(); }
        apply(name === "sort");
        keepInAddress();
      });
      if (controls[i].tagName === "INPUT") controls[i].addEventListener("keydown", function (e) {
        if (e.key === "Escape" && this.value) { this.value = ""; s.q = ""; apply(false); keepInAddress(); }
      });
    }
    var clear = page.querySelector(".pk-clear");
    if (clear) clear.addEventListener("click", function () {
      for (var key in st0) { if (key !== "sort") { s[key] = ""; var c = ctl(key); if (c) c.value = ""; } }
      fillSubs();
      apply(false);
      keepInAddress();
    });
    var vb = page.querySelectorAll(".pk-view button");
    for (i = 0; i < vb.length; i++) {
      vb[i].addEventListener("click", function () {
        var v = this.getAttribute("data-view");
        sset("localStorage", KEY_VIEW, v);
        applyView(v);
      });
    }
    apply(!!s.sort);
    browseApply = function () { apply(false); };
    if (old) keepInAddress();      // ?subject= becomes ?cat=...&sub=...
  }

  /* the progress through the books of a reading list: on its page (the next book, "Start the path" or "Continue")
     and on its card */
  function pathState(ids) {
    var all = booksRec(), out = { books: [], begun: 0, done: 0, sum: 0, next: null };
    ids.forEach(function (vid) {
      var rec = all[vid], p = shownPct(rec), started = !!(rec && rec.path) || seenPages(vid) > 0;
      var b = { vid: vid, pct: p, started: started, done: p !== null && p >= 100, t: (rec && rec.t) || 0 };
      out.books.push(b);
      if (started) out.begun++;
      if (b.done) out.done++;
      out.sum += b.done ? 100 : (p || 0);
    });
    // the book to read now: the one read last among those begun and not finished; else the first not finished
    out.books.forEach(function (b) { if (b.started && !b.done && (!out.next || b.t > out.next.t)) out.next = b; });
    if (!out.next) out.books.some(function (b) { if (!b.done) { out.next = b; return true; } return false; });
    out.pct = ids.length ? Math.round(out.sum / ids.length) : 0;
    return out;
  }
  function wirePath() {
    var list = document.querySelector(".pk-steps-list[data-path]");
    if (!list) return;
    var items = list.querySelectorAll(".pk-item"), ids = [], i;
    for (i = 0; i < items.length; i++) ids.push(items[i].getAttribute("data-vol"));
    var ps = pathState(ids), act = document.querySelector(".pk-lp-act"), prog = document.querySelector(".pk-lp-prog");
    for (i = 0; i < items.length; i++) {
      items[i].classList.toggle("is-done", ps.books[i].done);
      items[i].classList.toggle("is-next", !!(ps.begun && ps.next && ps.next.vid === ids[i]));
    }
    if (prog) {
      prog.hidden = !ps.begun;
      prog.querySelector("i").style.width = ps.pct + "%";
      prog.querySelector(".pk-lp-pt").textContent = ps.done + " of " + plural(ids.length, "book", "books") + " finished \u00b7 " + ps.pct + "%";
    }
    if (!act) return;
    var nb = ps.next || ps.books[0], item = items[ids.indexOf(nb.vid)], a = act.querySelector(".pk-read");
    var card = item && item.querySelector("a.vol-card"), title = item && item.querySelector(".vol-name");
    var label = !ps.begun ? "Start the path" : (!ps.next ? "Read again" : (nb.started ? "Continue" : "Next book"));
    act.setAttribute("data-vol", nb.vid);
    if (a && card) {
      a.setAttribute("href", card.getAttribute("href"));
      a.querySelector("span").innerHTML = esc(label) + (nb.started && nb.pct !== null && nb.pct < 100 ? ' <i class="pk-pct">' + nb.pct + "%</i>" : "");
    }
    var next = act.querySelector(".pk-lp-next");
    if (next && title) next.innerHTML = (ps.begun ? "Book " + (ids.indexOf(nb.vid) + 1) + " of " + ids.length + ": " : "Begins with ") + "<b>" + esc(title.textContent) + "</b>";
  }
  function markLists() {
    var cards = document.querySelectorAll(".pk-lcard[data-books]");
    for (var i = 0; i < cards.length; i++) {
      var ids = (cards[i].getAttribute("data-books") || "").split(" ").filter(Boolean), ps = pathState(ids);
      var box = cards[i].querySelector(".pk-lc-prog");
      if (!box) continue;
      box.hidden = !ps.begun;
      if (ps.begun) box.innerHTML = '<span class="pk-bar" aria-hidden="true"><i style="width:' + ps.pct + '%"></i></span><span>' +
        (ps.done === ids.length ? "Finished" : ps.pct + "% \u00b7 " + ps.begun + " of " + ids.length + " begun") + "</span>";
    }
  }

  /* ---------------------------------------------------------------- categories: the header panel, the front page */
  /* The Categories button in the header (tools/pages.py) is a link to the page of the categories; here it opens a
     panel instead, built when it is first opened from the categories written beside the button (#pk-cats, from
     tools/browse.py menu_data: [{id, t, n, d, h, i, s: [[id, title, books]]}]). On a phone the panel is a sheet over
     the whole screen, with each category opening below itself (an accordion); on wider screens it is a menu below the
     button: the categories on the left, the subcategories of the one pointed at or chosen on the right. A tap on a
     category's name opens its page, the arrow beside it shows its subcategories. Arrow keys move through the panel,
     Escape closes it. */
  var CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  var catMenu = null, catBtn = null, catHover = 0, catJson;
  function catData() {
    if (catJson === undefined) {
      try { catJson = JSON.parse(document.getElementById("pk-cats").textContent); } catch (e) { catJson = null; }
    }
    return catJson && catJson.c && catJson.c.length ? catJson : null;
  }
  function catWide() { return !!(window.matchMedia && matchMedia("(min-width: 60em)").matches); }
  function catHere() {
    var m = /\/subjects\/([a-z0-9-]+)\.html$/.exec(location.pathname);
    return m ? m[1] : "";
  }
  function buildCatMenu(d) {
    var m = el("div", "pk-cm"), h = [];
    m.id = "pk-cm";
    m.hidden = true;
    m.setAttribute("role", "dialog");
    m.setAttribute("aria-label", "Categories");
    h.push('<div class="pk-cm-head"><p class="pk-cm-title">Categories</p><a class="pk-cm-all" href="' + esc(ROOT + "books.html") + '">All ' +
      plural(d.n, "book", "books") + '</a><button type="button" class="pk-cm-close" aria-label="Close the categories">' + ICON.close + "</button></div>");
    h.push('<ul class="pk-cm-list">');
    d.c.forEach(function (c) {
      var href = esc(ROOT + "subjects/" + c.id + ".html"), sid = "pk-cm-s-" + c.id;
      h.push('<li class="pk-cm-cat" data-id="' + esc(c.id) + '" style="--h:' + (+c.h || 212) + '"><div class="pk-cm-row">' +
        '<a class="pk-cm-link" href="' + href + '"><span class="pk-cm-ic"><svg class="pk-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        c.i + '</svg></span><span class="pk-cm-t">' + esc(c.t) + '</span><span class="pk-cm-n" aria-label="' + plural(c.n, "book", "books") + '">' + c.n + "</span></a>" +
        (c.s.length ? '<button type="button" class="pk-cm-exp" aria-expanded="false" aria-controls="' + sid + '" title="Subcategories">' +
          '<span class="bjp-sr">Subcategories of ' + esc(c.t) + "</span>" + CHEV + "</button>" : "") + "</div>");
      if (c.s.length) {
        h.push('<div class="pk-cm-subs" id="' + sid + '" hidden><p class="pk-cm-sh">' + esc(c.t) + "</p>" +
          (c.d ? '<p class="pk-cm-sd">' + esc(c.d) + "</p>" : "") + "<ul>" +
          '<li><a class="pk-cm-sub pk-cm-suball" href="' + href + '">All in ' + esc(c.t) + "<span>" + c.n + "</span></a></li>" +
          c.s.map(function (x) {
            return '<li><a class="pk-cm-sub" href="' + esc(ROOT + "subjects/" + x[0] + ".html") + '">' + esc(x[1]) + "<span>" + x[2] + "</span></a></li>";
          }).join("") + "</ul></div>");
      }
      h.push("</li>");
    });
    h.push("</ul>");
    m.innerHTML = h.join("");
    return m;
  }
  function catItem(id) { return catMenu && catMenu.querySelector('.pk-cm-cat[data-id="' + id + '"]'); }
  function catShow(li, on) {
    if (!li) return;
    var b = li.querySelector(".pk-cm-exp"), box = li.querySelector(".pk-cm-subs");
    if (!b || !box) return;
    b.setAttribute("aria-expanded", String(on));
    box.hidden = !on;
    li.classList.toggle("is-open", on);
  }
  function catOpenOnly(li) {
    var all = catMenu.querySelectorAll(".pk-cm-cat");
    for (var i = 0; i < all.length; i++) if (all[i] !== li) catShow(all[i], false);
    catShow(li, true);
  }
  function catPlace() {
    if (!catMenu || catMenu.hidden) return;
    var wide = catWide();
    catMenu.classList.toggle("is-wide", wide);
    if (!wide) { catMenu.style.left = catMenu.style.top = ""; catMenu.querySelector(".pk-cm-list").style.minHeight = ""; return; }
    // the menu is as tall as the longest list of subcategories, so that none of them has to be scrolled to
    var list = catMenu.querySelector(".pk-cm-list"), boxes = catMenu.querySelectorAll(".pk-cm-subs"), tall = 0, was = [];
    for (var i = 0; i < boxes.length; i++) { was.push(boxes[i].hidden); boxes[i].hidden = false; }
    for (i = 0; i < boxes.length; i++) tall = Math.max(tall, boxes[i].scrollHeight);
    for (i = 0; i < boxes.length; i++) boxes[i].hidden = was[i];
    list.style.minHeight = tall ? tall + "px" : "";
    var hdr = document.querySelector(".md-header"), r = catBtn.getBoundingClientRect();
    var top = hdr ? hdr.getBoundingClientRect().bottom : r.bottom;
    var w = catMenu.offsetWidth, left = Math.min(Math.max(12, r.right - w), window.innerWidth - w - 12);
    catMenu.style.top = Math.round(top + 6) + "px";
    catMenu.style.left = Math.round(Math.max(12, left)) + "px";
  }
  function catFocusables() {
    return Array.prototype.filter.call(catMenu.querySelectorAll("a, button"), function (x) { return x.offsetParent !== null; });
  }
  function openCats() {
    if (!catBtn) return;
    if (!catMenu) {
      var d = catData();
      if (!d) { location.href = catBtn.href; return; }
      catMenu = buildCatMenu(d);
      document.body.appendChild(catMenu);
      catBtn.setAttribute("aria-controls", catMenu.id);
      wireCatMenu();
    }
    var here = catHere(), li = null;
    if (here) {
      li = catItem(here);
      if (!li) { var sub = catMenu.querySelector('.pk-cm-sub[href$="/subjects/' + here + '.html"]'); li = sub && sub.closest(".pk-cm-cat"); }
    }
    var wide = catWide(), all = catMenu.querySelectorAll(".pk-cm-cat");
    catInterests();
    for (var i = 0; i < all.length; i++) catShow(all[i], false);
    if (li || wide) catShow(li || catMenu.querySelector(".pk-cm-cat:not(.is-other)") || catMenu.querySelector(".pk-cm-cat"), true);
    catMenu.hidden = false;
    document.documentElement.classList.add("pk-cm-on");
    catBtn.setAttribute("aria-expanded", "true");
    catPlace();
    var f = (li && li.querySelector(".pk-cm-link")) || catMenu.querySelector(".pk-cm-link");
    if (f) f.focus({ preventScroll: true });
    if (li && !wide) li.scrollIntoView({ block: "nearest" });
  }
  function closeCats(back) {
    if (!catMenu || catMenu.hidden) return;
    catMenu.hidden = true;
    document.documentElement.classList.remove("pk-cm-on");
    if (catBtn) {
      catBtn.setAttribute("aria-expanded", "false");
      if (back) catBtn.focus();
    }
  }
  function wireCatMenu() {
    catMenu.addEventListener("click", function (e) {
      var t = e.target;
      if (t.closest(".pk-cm-close")) { closeCats(true); return; }
      if (t.closest(".pk-cm-fyall")) { catMenu.classList.toggle("is-all"); catInterests(true); return; }
      if (t.closest("[data-pk-interests]")) { closeCats(false); openInterests(); return; }
      var b = t.closest(".pk-cm-exp");
      if (b) {
        var li = b.closest(".pk-cm-cat");
        if (catWide() || b.getAttribute("aria-expanded") !== "true") {
          catOpenOnly(li);
          if (catWide()) { var f = li.querySelector(".pk-cm-sub"); if (f) f.focus(); }
          else li.scrollIntoView({ block: "nearest", behavior: "smooth" });
        } else catShow(li, false);
        return;
      }
      if (t.closest("a[href]")) setTimeout(function () { closeCats(false); }, 0);
    });
    // wider screens: the subcategories of the category pointed at (after a moment, so that a pointer on its way to
    // the right does not change them) or reached with the keyboard
    catMenu.addEventListener("mouseover", function (e) {
      if (!catWide()) return;
      var li = e.target.closest(".pk-cm-cat");
      if (!li || li.classList.contains("is-open") || e.target.closest(".pk-cm-subs")) { clearTimeout(catHover); return; }
      clearTimeout(catHover);
      catHover = setTimeout(function () { catOpenOnly(li); }, 110);
    });
    catMenu.addEventListener("focusin", function (e) {
      var a = e.target.closest(".pk-cm-link");
      if (a && catWide()) catOpenOnly(a.closest(".pk-cm-cat"));
    });
    catMenu.addEventListener("keydown", function (e) {
      var k = e.key, t = e.target, li = t.closest(".pk-cm-cat");
      if (k === "Escape") { e.preventDefault(); closeCats(true); return; }
      if (k === "Tab") {
        // the sheet keeps the focus while it is open; the menu closes when the focus leaves it
        var fs = catFocusables(), first = fs[0], last = fs[fs.length - 1];
        if (!catWide()) {
          if (e.shiftKey && t === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && t === last) { e.preventDefault(); first.focus(); }
        }
        return;
      }
      if (k !== "ArrowDown" && k !== "ArrowUp" && k !== "ArrowRight" && k !== "ArrowLeft" && k !== "Home" && k !== "End") return;
      var inSubs = !!t.closest(".pk-cm-subs");
      var list = inSubs ? Array.prototype.slice.call(li.querySelectorAll(".pk-cm-sub"))
        : Array.prototype.slice.call(catMenu.querySelectorAll(".pk-cm-link"));
      var i = list.indexOf(t.closest(".pk-cm-link") || t);
      if (k === "ArrowRight" && li && !inSubs) {
        if (!li.querySelector(".pk-cm-subs")) return;
        e.preventDefault();
        catOpenOnly(li);
        li.querySelector(".pk-cm-sub").focus();
        return;
      }
      if (k === "ArrowLeft" && inSubs) { e.preventDefault(); li.querySelector(".pk-cm-link").focus(); return; }
      if (k === "ArrowLeft" || k === "ArrowRight") return;
      e.preventDefault();
      if (k === "Home") i = 0;
      else if (k === "End") i = list.length - 1;
      else i = (i + (k === "ArrowDown" ? 1 : -1) + list.length) % list.length;
      if (list[i]) list[i].focus();
    });
    catMenu.addEventListener("focusout", function (e) {
      var to = e.relatedTarget;
      if (catWide() && to && !catMenu.contains(to) && to !== catBtn) closeCats(false);
    });
    document.addEventListener("pointerdown", function (e) {
      if (catMenu.hidden || catMenu.contains(e.target) || (catBtn && catBtn.contains(e.target))) return;
      closeCats(false);
    }, true);
    window.addEventListener("resize", catPlace);
  }
  function setupCats() {
    var b = document.querySelector(".pk-catbtn");
    if (!b || b === catBtn) return;
    catBtn = b;
    b.setAttribute("role", "button");
    b.addEventListener("click", function (e) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (catMenu && !catMenu.hidden) closeCats(false); else openCats();
    });
    b.addEventListener("keydown", function (e) {
      if (e.key === " ") { e.preventDefault(); b.click(); }
      else if (e.key === "ArrowDown" && (!catMenu || catMenu.hidden)) { e.preventDefault(); openCats(); }
    });
  }

  /* the front page: "Browse categories" (tools/browse.py): a tap on a category with subcategories shows them in a row
     below its own row (the row is found from the buttons' positions, so it follows the columns of the screen); a
     second tap, or a tap on another category, closes it */
  function wireCatGrid() {
    var grid = document.querySelector(".pk-catgrid");
    if (!grid || grid.__bjp) return;
    grid.__bjp = true;
    var open = null;
    function place(b, panel) {
      var items = grid.querySelectorAll(".pk-cat"), last = b;
      for (var i = 0; i < items.length; i++) if (items[i].offsetTop === b.offsetTop) last = items[i];
      if (last.nextElementSibling !== panel) last.insertAdjacentElement("afterend", panel);
      panel.style.setProperty("--x", Math.round(b.offsetLeft + b.offsetWidth / 2 - grid.offsetLeft) + "px");
    }
    function shut() {
      if (!open) return;
      open.b.setAttribute("aria-expanded", "false");
      open.b.classList.remove("is-open");
      open.panel.hidden = true;
      open = null;
    }
    function panelOf(b) {
      var id = b.getAttribute("data-cat"), panel = document.getElementById("pk-cs-" + id), d = catData(), c;
      if (panel || !d) return panel;
      for (var i = 0; i < d.c.length; i++) if (d.c[i].id === id) c = d.c[i];
      if (!c || !c.s.length) return null;
      var href = function (x) { return esc(ROOT + "subjects/" + x + ".html"); };
      panel = el("div", "pk-catsub", '<nav class="pk-chips" aria-label="Subcategories of ' + esc(c.t) + '">' +
        '<a class="pk-chip pk-chip-all" href="' + href(c.id) + '">All in ' + esc(c.t) + "<span>" + c.n + "</span></a>" +
        c.s.map(function (x) { return '<a class="pk-chip" href="' + href(x[0]) + '">' + esc(x[1]) + "<span>" + x[2] + "</span></a>"; }).join("") + "</nav>");
      panel.id = "pk-cs-" + id;
      panel.hidden = true;
      grid.appendChild(panel);
      b.setAttribute("aria-controls", panel.id);
      return panel;
    }
    function toggle(b) {
      var panel = panelOf(b);
      if (!panel) { location.href = b.href; return; }
      var same = open && open.b === b;
      shut();
      if (same) return;
      place(b, panel);
      panel.hidden = false;
      b.setAttribute("aria-expanded", "true");
      b.classList.add("is-open");
      open = { b: b, panel: panel };
      var r = panel.getBoundingClientRect();
      if (r.bottom > window.innerHeight - 8) {
        try { panel.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (e) { panel.scrollIntoView(false); }
      }
    }
    var bs = grid.querySelectorAll(".pk-cat[data-cat]");
    for (var i = 0; i < bs.length; i++) {
      bs[i].setAttribute("role", "button");
      bs[i].setAttribute("aria-expanded", "false");
      bs[i].addEventListener("click", function (e) {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        toggle(this);
      });
      bs[i].addEventListener("keydown", function (e) {
        if (e.key === " ") { e.preventDefault(); toggle(this); }
        else if (e.key === "Escape" && open) { shut(); }
      });
    }
    window.addEventListener("resize", function () { if (open) place(open.b, open.panel); });
  }


  /* ---------------------------------------------------------------- interests: "What would you like to read?" */
  /* The streams come with the categories (#pk-cats "st", tools/browse.py menu_data, from tools/subjects.yml streams:):
     [{id, t: title, d: blurb, i: icon, n: books, c: [category or subcategory ids], s: [[subcategory id, title, books]]}].
     The choice ({streams, subs, level}, or {skip: true}) is kept per site in localStorage. A book matches a stream when
     one of its subjects (data-subjects, with their categories) is in the stream, or, where subjects of the stream were
     chosen, in those; a level chosen leaves out the books of another level (books without one stay). */
  var KEY_INT = "bjp.interests:" + ROOT_PATH, shelfApply = null, browseApply = null;
  function interests() { var v = jget(KEY_INT, null); return v && typeof v === "object" ? v : null; }
  function saveInterests(v) { v.v = 1; v.t = Date.now(); jset(KEY_INT, v); }
  function streamList() { var d = catData(); return d && d.st && d.st.length ? d.st : []; }
  function activeInterests(evenIfAll) {
    var it = interests(), st = streamList();
    if (!it || it.skip || (it.all && !evenIfAll) || !Array.isArray(it.streams) || !it.streams.length || !st.length) return null;
    var sets = [], names = [];
    st.forEach(function (x) {
      if (it.streams.indexOf(x.id) < 0) return;
      var mine = (it.subs || []).filter(function (id) { return x.s.some(function (y) { return y[0] === id; }); });
      sets.push(mine.length ? mine : x.c);
      names.push(x.t);
    });
    return sets.length ? { sets: sets, level: it.level || "", names: names } : null;
  }
  function matchesInterests(item, act) {
    var subs = " " + (item.getAttribute("data-subjects") || "") + " ", lv = item.getAttribute("data-level") || "";
    if (act.level && lv && lv !== act.level) return false;
    return act.sets.some(function (set) { return set.some(function (x) { return subs.indexOf(" " + x + " ") >= 0; }); });
  }
  /* the categories of the chosen streams (a subcategory counts for its category) */
  function interestCats(act) {
    var d = catData(), out = {};
    if (!d || !act) return out;
    act.sets.forEach(function (set) {
      set.forEach(function (id) {
        d.c.forEach(function (c) { if (c.id === id || c.s.some(function (y) { return y[0] === id; })) out[c.id] = 1; });
      });
    });
    return out;
  }
  function setShowAll(on) {
    var it = interests();
    if (!it) return;
    it.all = !!on;
    saveInterests(it);
    applyInterests();
  }
  function applyInterests() {
    if (shelfApply) shelfApply();
    if (browseApply) browseApply();
    wireCatGridInterests();
    var now = document.querySelectorAll(".pk-int-now"), act = activeInterests(true), it = interests();
    for (var i = 0; i < now.length; i++) now[i].textContent = act ? "Now: " + act.names.join(", ") + (it && it.all ? " (showing all books)" : "") : "Now: all books";
  }
  var SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/></svg>';
  /* the bar above the shelves: "For you: Engineering, Languages · Show all · Change" */
  function forYouBar(act, n) {
    var it = interests();
    if (act) {
      return '<div class="pk-fy-l">' + SPARK + '<span class="pk-fy-k">For you</span><span class="pk-fy-n">' + esc(act.names.join(", ")) +
        (act.level ? " \u00b7 " + esc(act.level.charAt(0).toUpperCase() + act.level.slice(1)) : "") + (typeof n === "number" ? ' <span class="pk-fy-c">(' + plural(n, "book", "books") + ")</span>" : "") +
        '</span></div><div class="pk-fy-r"><button type="button" class="pk-fy-b" data-fy="all">Show all</button><button type="button" class="pk-fy-b" data-pk-interests>Change</button></div>';
    }
    if (it && it.all && activeInterests(true)) {
      return '<div class="pk-fy-l"><span class="pk-fy-k">Showing all books</span></div><div class="pk-fy-r"><button type="button" class="pk-fy-b" data-fy="mine">Only my interests</button>' +
        '<button type="button" class="pk-fy-b" data-pk-interests>Change</button></div>';
    }
    if (streamList().length > 1) {
      return '<div class="pk-fy-l">' + SPARK + '<span class="pk-fy-q">See only the books you want</span></div><div class="pk-fy-r"><button type="button" class="pk-fy-b" data-pk-interests>Choose interests</button></div>';
    }
    return "";
  }
  function renderForYou(act, n) {
    var box = document.querySelector(".pk-foryou");
    if (!box) return;
    var html = forYouBar(act, n);
    box.innerHTML = html;
    box.hidden = !html;
    box.classList.toggle("is-on", !!act);
  }
  document.addEventListener("click", function (e) {
    var t = e.target && e.target.closest && e.target.closest("[data-fy], [data-pk-interests]");
    if (!t || (catMenu && catMenu.contains(t))) return;
    e.preventDefault();
    if (t.hasAttribute("data-pk-interests")) openInterests();
    else setShowAll(t.getAttribute("data-fy") === "all");
  });
  /* "Browse categories" on the front page: the reader's categories, the others behind "All categories" */
  function wireCatGridInterests() {
    var grid = document.querySelector(".pk-catgrid");
    if (!grid) return;
    var act = activeInterests(), mine = interestCats(act), cats = grid.querySelectorAll(".pk-cat"), hidden = 0, i;
    var showAll = grid.classList.contains("is-all");
    for (i = 0; i < cats.length; i++) {
      var id = cats[i].getAttribute("data-cat") || ((/\/subjects\/([a-z0-9-]+)\.html/.exec(cats[i].getAttribute("href") || "") || [])[1]);
      var other = !!act && !mine[id];
      cats[i].classList.toggle("is-other", other);
      cats[i].hidden = other && !showAll;
      if (other) hidden++;
    }
    var more = grid.querySelector(".pk-cat-allbtn");
    if (!hidden) { if (more) more.parentNode.removeChild(more); return; }
    if (!more) {
      more = el("button", "pk-cat pk-cat-allbtn");
      more.type = "button";
      more.addEventListener("click", function () { grid.classList.toggle("is-all"); wireCatGridInterests(); });
      grid.appendChild(more);
    }
    more.innerHTML = '<span class="pk-cat-tx"><span class="pk-cat-t">' + (showAll ? "Fewer categories" : "All categories") + '</span><span class="pk-cat-n">' +
      (showAll ? "Only your interests" : hidden + " more") + "</span></span>";
  }
  /* the Categories panel of the header: the reader's categories, the others behind "Show all categories" */
  function catInterests() {
    if (!catMenu) return;
    var act = activeInterests(), mine = interestCats(act), lis = catMenu.querySelectorAll(".pk-cm-cat");
    for (var i = 0; i < lis.length; i++) lis[i].classList.toggle("is-other", !!act && !mine[lis[i].getAttribute("data-id")]);
    var bar = catMenu.querySelector(".pk-cm-fy");
    if (!bar) {
      bar = el("div", "pk-cm-fy");
      catMenu.querySelector(".pk-cm-head").insertAdjacentElement("afterend", bar);
    }
    var all = catMenu.classList.contains("is-all");
    if (act) {
      bar.innerHTML = '<span class="pk-cm-fyt">' + SPARK + "<span>For you: " + esc(act.names.join(", ")) + "</span></span>" +
        '<button type="button" class="pk-cm-fyall">' + (all ? "Only my interests" : "Show all categories") + '</button><button type="button" class="pk-cm-fych" data-pk-interests>Change</button>';
    } else if (streamList().length > 1) {
      bar.innerHTML = '<span class="pk-cm-fyt">' + SPARK + '<span>Choose what you would like to read</span></span><button type="button" class="pk-cm-fych" data-pk-interests>Choose interests</button>';
    } else bar.innerHTML = "";
    bar.hidden = !bar.innerHTML;
  }

  /* the picker: a sheet in two steps; Skip shows everything */
  var picker = null, pickerPrev = null;
  function openInterests(first) {
    var st = streamList(), d = catData();
    if (!st.length || !d) return;
    if (picker) picker.parentNode.removeChild(picker);
    var it = interests() || {}, chosen = (it.streams || []).slice(), subs = (it.subs || []).slice(), level = it.level || "";
    var hue = {};
    st.forEach(function (x) {
      for (var i = 0; i < x.c.length && hue[x.id] == null; i++) {
        d.c.forEach(function (c) { if (hue[x.id] == null && (c.id === x.c[i] || c.s.some(function (y) { return y[0] === x.c[i]; }))) hue[x.id] = c.h; });
      }
    });
    var name = (document.querySelector('meta[name="application-name"]') || {}).content || "";
    var m = el("div", "pk-int");
    m.setAttribute("role", "dialog");
    m.setAttribute("aria-modal", "true");
    m.setAttribute("aria-labelledby", "pk-int-h1");
    m.innerHTML = '<div class="pk-int-card">' +
      '<button type="button" class="pk-int-x" aria-label="Close: show all books">' + ICON.close + "</button>" +
      '<section class="pk-int-step" data-step="1">' +
        '<p class="pk-int-kick">' + (first && name ? "Welcome to " + esc(name) : "Your interests") + "</p>" +
        '<h2 class="pk-int-h" id="pk-int-h1">What would you like to read?</h2>' +
        '<p class="pk-int-sub">Pick one or more. You can change this at any time.</p>' +
        '<div class="pk-int-grid" role="group" aria-label="Streams">' + st.map(function (x) {
          return '<button type="button" class="pk-int-st" data-st="' + esc(x.id) + '" aria-pressed="' + (chosen.indexOf(x.id) >= 0) + '" style="--h:' + (+hue[x.id] || 212) + '">' +
            '<span class="pk-int-ic"><svg class="pk-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + x.i + "</svg></span>" +
            '<span class="pk-int-t">' + esc(x.t) + '</span><span class="pk-int-d">' + esc(x.d) + "</span>" +
            '<span class="pk-int-n">' + plural(x.n, "book", "books") + '</span><span class="pk-int-ck" aria-hidden="true">' + ICON.check + "</span></button>";
        }).join("") + "</div>" +
        '<div class="pk-int-foot"><button type="button" class="pk-int-skip">Skip, show everything</button>' +
          '<button type="button" class="pk-btn pk-btn-primary pk-int-next">Next</button></div>' +
      "</section>" +
      '<section class="pk-int-step" data-step="2" hidden>' +
        '<p class="pk-int-kick">Optional</p><h2 class="pk-int-h" id="pk-int-h2" tabindex="-1">Narrow it down</h2>' +
        '<p class="pk-int-sub">Choose subjects, or leave them all. A level, if you like.</p>' +
        '<div class="pk-int-subs"></div>' +
        '<div class="pk-int-lvrow"><span class="pk-int-lvl" id="pk-int-lv">Level</span><div class="pk-int-lv" role="radiogroup" aria-labelledby="pk-int-lv">' +
          [["", "Any"], ["beginner", "Beginner"], ["intermediate", "Intermediate"], ["advanced", "Advanced"]].map(function (l) {
            return '<button type="button" role="radio" data-lv="' + l[0] + '" aria-checked="' + (level === l[0]) + '">' + l[1] + "</button>";
          }).join("") + "</div></div>" +
        '<div class="pk-int-foot"><button type="button" class="pk-int-back">Back</button>' +
          '<button type="button" class="pk-btn pk-btn-primary pk-int-done">Show my books</button></div>' +
      "</section></div>";
    document.body.appendChild(m);
    picker = m;
    pickerPrev = document.activeElement;
    document.documentElement.classList.add("pk-int-on");
    function nextState() {
      var n = m.querySelectorAll('.pk-int-st[aria-pressed="true"]').length, b = m.querySelector(".pk-int-next");
      b.disabled = !n;
      b.textContent = "Next";
      b.title = n ? "" : "Pick at least one";
    }
    function fillSubs() {
      var box = m.querySelector(".pk-int-subs"), html = "";
      st.forEach(function (x) {
        if (chosen.indexOf(x.id) < 0 || x.s.length < 2) return;
        html += '<div class="pk-int-grp" role="group" aria-label="' + esc(x.t) + '"><p class="pk-int-gh">' + esc(x.t) + '</p><div class="pk-int-chips">' +
          x.s.map(function (y) {
            return '<button type="button" class="pk-int-chip" data-sub="' + esc(y[0]) + '" aria-pressed="' + (subs.indexOf(y[0]) >= 0) + '">' + esc(y[1]) + "<span>" + y[2] + "</span></button>";
          }).join("") + "</div></div>";
      });
      box.innerHTML = html || '<p class="pk-int-none">Nothing more to choose here: all the books of your streams will show.</p>';
    }
    function step(n) {
      m.querySelector('[data-step="1"]').hidden = n !== 1;
      m.querySelector('[data-step="2"]').hidden = n !== 2;
      if (n === 2) { fillSubs(); m.querySelector("#pk-int-h2").focus(); }
      else { var f = m.querySelector('.pk-int-st[aria-pressed="true"]') || m.querySelector(".pk-int-st"); if (f) f.focus(); }
      m.querySelector(".pk-int-card").scrollTop = 0;
    }
    function done(skip) {
      if (skip) saveInterests({ skip: true });
      else {
        var keep = subs.filter(function (id) { return st.some(function (x) { return chosen.indexOf(x.id) >= 0 && x.s.some(function (y) { return y[0] === id; }); }); });
        saveInterests({ streams: chosen, subs: keep, level: level });
      }
      closeInterests();
      applyInterests();
      var bar = document.querySelector(".pk-foryou:not([hidden])");
      if (bar && !skip) try { bar.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" }); } catch (e) { /* ignore */ }
    }
    m.addEventListener("click", function (e) {
      var t = e.target;
      var b = t.closest(".pk-int-st");
      if (b) {
        var id = b.getAttribute("data-st"), on = b.getAttribute("aria-pressed") !== "true";
        b.setAttribute("aria-pressed", String(on));
        if (on) chosen.push(id); else chosen = chosen.filter(function (x) { return x !== id; });
        nextState();
        return;
      }
      var c = t.closest(".pk-int-chip");
      if (c) {
        var sid = c.getAttribute("data-sub"), on2 = c.getAttribute("aria-pressed") !== "true";
        c.setAttribute("aria-pressed", String(on2));
        if (on2) subs.push(sid); else subs = subs.filter(function (x) { return x !== sid; });
        return;
      }
      var l = t.closest("[data-lv]");
      if (l) {
        level = l.getAttribute("data-lv");
        var ls = m.querySelectorAll("[data-lv]");
        for (var i = 0; i < ls.length; i++) ls[i].setAttribute("aria-checked", String(ls[i] === l));
        return;
      }
      if (t.closest(".pk-int-next")) { if (chosen.length) step(2); return; }
      if (t.closest(".pk-int-back")) { step(1); return; }
      if (t.closest(".pk-int-done")) { done(false); return; }
      if (t.closest(".pk-int-skip")) { done(true); return; }
      if (t.closest(".pk-int-x") || t === m) { if (interests()) closeInterests(); else done(true); }
    });
    m.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); if (interests()) closeInterests(); else done(true); return; }
      if (e.key === "Tab") {
        var fs = Array.prototype.filter.call(m.querySelectorAll("button:not([disabled]), [tabindex='0']"), function (x) { return x.offsetParent !== null; });
        var first0 = fs[0], last0 = fs[fs.length - 1];
        if (e.shiftKey && document.activeElement === first0) { e.preventDefault(); last0.focus(); }
        else if (!e.shiftKey && document.activeElement === last0) { e.preventDefault(); first0.focus(); }
      }
      if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && e.target.closest("[data-lv]")) {
        var ls2 = Array.prototype.slice.call(m.querySelectorAll("[data-lv]")), k = ls2.indexOf(e.target.closest("[data-lv]"));
        var nx = ls2[(k + (e.key === "ArrowRight" ? 1 : -1) + ls2.length) % ls2.length];
        nx.focus(); nx.click(); e.preventDefault();
      }
    });
    nextState();
    step(1);
  }
  function closeInterests() {
    if (!picker) return;
    picker.parentNode.removeChild(picker);
    picker = null;
    document.documentElement.classList.remove("pk-int-on");
    if (pickerPrev && pickerPrev.focus && pickerPrev.isConnected) { try { pickerPrev.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }
  /* the first visit to the front page or to All books: asked once (never over the reader or the slides) */
  function maybeAskInterests() {
    if (interests() || streamList().length < 2 || picker) return;
    if (!(isHome() || /\/books\.html$/.test(location.pathname))) return;
    if (sget("sessionStorage", KEY_OPEN) === "1" || document.documentElement.classList.contains("bjp-reading")) return;
    if (/[?&](find|cat|sub|q)=/.test(location.search)) return;
    setTimeout(function () { if (!interests() && !picker) openInterests(true); }, 350);
  }

  /* ---------------------------------------------------------------- start */
  function onPage() {
    setupChrome();
    setupCats();
    closeCats(false);
    wireCatGrid();
    migrate();
    wireContents();
    wireShelf();
    markStarted();
    renderContinue();
    wireBookPage();
    wireBrowse();
    wirePath();
    markLists();
    wireInstallPage();
    applyInterests();
    maybeAskInterests();
    emitAll();
    ready().then(function () {
      markStarted();
      renderContinue();
      wireBookPage();
      wirePath();
      emitAll();
      libStatus();
      renderOfflinePage();
    });
  }
  function onNet() {
    document.documentElement.classList.toggle("bjp-is-offline", !online());
    emitAll();
    renderContinue();
    if (online()) refreshKept();
  }

  /* the search covers the book of the page that was loaded in full (the service worker answers the theme's request
     for the index with that book's index; on the shelf, the titles of the library). A link to another book, or
     between a book and the shelf, therefore loads the page in full, so that the search follows the reader */
  var SEARCH_SCOPE = (function () { var v = volOf(location.pathname); return v ? v[0] : ""; })();
  function searchPlaceholder() {
    if (!(navigator.serviceWorker && navigator.serviceWorker.controller)) return;
    var q = document.querySelector(".md-search__input");
    if (q) q.setAttribute("placeholder", SEARCH_SCOPE ? "Search this book" : "Search titles");
  }
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest && e.target.closest("a[href]");
    if (!a || (a.target && a.target !== "_self") || a.getAttribute("role") === "button") return;     // the Categories buttons open panels
    var u;
    try { u = new URL(a.getAttribute("href"), location.href); } catch (x) { return; }
    if (u.origin !== location.origin || u.pathname.indexOf(BOOK_ROOT) !== 0 || u.pathname === location.pathname) return;
    var v = volOf(u.pathname);
    if ((v ? v[0] : "") === SEARCH_SCOPE) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    location.href = u.href;
  }, true);
  searchPlaceholder();
  if (window.document$ && window.document$.subscribe) window.document$.subscribe(searchPlaceholder);

  window.addEventListener("online", onNet);
  window.addEventListener("offline", onNet);
  window.bjpApp = { keep: keep, remove: remove, state: st, root: ROOT };
  watchUpdates();
  if (window.document$ && window.document$.subscribe) window.document$.subscribe(onPage);
  else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", onPage);
  else onPage();
  setTimeout(refreshKept, 4000);
})();
