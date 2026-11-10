/* Pustakālaya: web edition. Presentation mode: the deck.
 *
 * Loaded by assets/slides.js the first time a presentation is opened. It turns a chapter page into slides in the
 * browser, so that every book (LaTeX, Markdown and HTML alike) can be presented without being built again:
 *
 *   title slide      the book, the chapter's number and title, its subtitle and author, the portal's mark
 *   contents         the chapter's sections (when there are three or more)
 *   section slides   one for each "##" section, with its subsections
 *   content slides   the key sentence of each paragraph as a bullet point, at most about 6 bullets and 60 words on
 *                    a slide; the full paragraphs are the speaker notes. Lists keep their items.
 *   one slide each   figures, tables (long ones over several slides), code (likewise), large equations,
 *                    visualizations (opened in place) and step-through figures (stepped with the arrow keys)
 *   boxes            callouts; a worked example is revealed step by step; an exercise is a question whose answer
 *                    is revealed with the next key press
 *   closing          the chapter's summary (or its sections) and the next chapter
 *
 * An author can shape the deck (BOOK_FORMAT.md, "Slides"): a <!-- slide --> comment keeps the blocks that follow it,
 * up to the next marker or heading, together on one slide as written; a `::: slide` block (a hidden
 * <div class="pk-slide"> on the page) is a slide of its own; a file slides/NN_slug.md replaces the automatic deck
 * (a hidden <div class="pk-slides">). tools/slides.py writes these when the book is built.
 *
 * Presenting: a 16:9 stage (1280 x 720) scaled to the screen; keys, swipes and click zones; overview (O), speaker
 * view (S: a second window kept in step through a BroadcastChannel), blank screen (B), laser pointer (L), themes
 * (T), full screen (F); Escape returns to the page or the reader at the place of the slide. The browser's print
 * dialog prints the deck, one slide a page.
 */
(function () {
  "use strict";
  if (window.bjpSlidesDeck) return;

  var W = 1280, H = 720;
  var MAX_BULLETS = 6, MAX_WORDS = 60;
  var KEY_THEME = "bjp.slides.theme", KEY_NOTES = "bjp.slides.notes";
  var THEMES = ["portal", "light", "dark"];
  var ENTRY = window.bjpSlides || {};
  var ROOT = ENTRY.root || "/";
  var ICON = {
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="7" height="6" rx="1"/><rect x="13.5" y="4.5" width="7" height="6" rx="1"/><rect x="3.5" y="13.5" width="7" height="6" rx="1"/><rect x="13.5" y="13.5" width="7" height="6" rx="1"/></svg>',
    speaker: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="4" width="12" height="9" rx="1.2"/><path d="M17.5 6.5h4M17.5 10h4M17.5 13.5h4M5 17.5h7M8.5 13v4.5"/></svg>',
    theme: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 000-17z" fill="currentColor"/></svg>',
    fs: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    print: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9V3.5h10V9M7 17H4.5a1 1 0 01-1-1v-6a1 1 0 011-1h15a1 1 0 011 1v6a1 1 0 01-1 1H17"/><rect x="7" y="14" width="10" height="6.5" rx=".5"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/></svg>',
    help: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 014.8.9c0 1.7-2.4 2.2-2.4 3.8M12 17.2v.1"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    laser: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="16" r="3"/><path d="M10.5 13.5L20 4M15 4h5v5"/></svg>',
    blank: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="13" rx="1.5" fill="currentColor"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>',
    reset: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 102.6-5.9M4 4v5h5"/></svg>'
  };

  /* ================================================================ helpers */
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function norm(s) { return String(s || "").replace(/¶/g, "").replace(/\s+/g, " ").trim(); }
  function txt(n) { return n ? norm(n.textContent) : ""; }
  function countWords(s) { s = norm(s); return s ? s.split(" ").length : 0; }
  function sget(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function sset(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
  function reduced() { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function each(list, fn) { for (var i = 0; i < list.length; i++) fn(list[i], i); }
  function rm(root, sel) { each(root.querySelectorAll(sel), function (n) { if (n.parentNode) n.parentNode.removeChild(n); }); }
  function isMath(n) { return n.nodeType === 1 && (n.classList.contains("arithmatex") || n.classList.contains("math") || n.tagName === "MJX-CONTAINER"); }
  function frag() { return document.createDocumentFragment(); }
  function importNode(n) { return n.ownerDocument === document ? n.cloneNode(true) : document.importNode(n, true); }
  function headingNum(t) { var m = /^((?:[A-Z]\.)?\d+(?:\.\d+)*)\.?\s+(\S.*)$/.exec(t); return m ? { num: m[1], rest: m[2] } : null; }
  function timeout(p, ms) { return new Promise(function (res) { var t = setTimeout(res, ms); Promise.resolve(p).then(function () { clearTimeout(t); res(); }, function () { clearTimeout(t); res(); }); }); }

  /* words of a node, a mathematical formula counted by its length */
  function nodeWords(n) {
    if (!n) return 0;
    if (n.nodeType === 3) return countWords(n.nodeValue);
    if (n.nodeType !== 1 && n.nodeType !== 11) return 0;
    if (n.nodeType === 1 && isMath(n)) return Math.max(1, Math.round(norm(n.textContent).length / 9));
    var w = 0;
    for (var c = n.firstChild; c; c = c.nextSibling) w += nodeWords(c);
    return w;
  }

  /* ================================================================ sentences and key points */
  var BOUND = /[.!?…]+["'’”»)\]]*(?=\s)|[।॥]+["'’”)]*(?=\s|$)/g;
  var ABBR = /(?:^|[\s(])(?:e\.g|i\.e|etc|cf|vs|viz|al|ca|c|fl|r|Dr|Mr|Mrs|Ms|Prof|St|Sr|Jr|No|Nos|Fig|Figs|Eq|Eqs|Ch|Chap|Sec|Vol|Vols|pp|p|ed|eds|trans|approx|ibid|op|lit|esp|resp|ff|Skt|Gk|Lat|Mt|[A-Z])\.["'’”)]*$/;
  var LEAD_RE = /^(for example|for instance|e\.g\.|thus|so|but|however|this|that|these|those|it|in other words|also|and|or|then|here|there|such|see)\b/i;
  var DEF_RE = /\b(is|are|was|were|means|refers to|is called|are called|is known as|defined as|consists? of)\b/i;
  var CREDIT_RE = /\b(photo|photograph|credit|licen[cs]e|cc[ -]by|cc0|public domain|wikimedia|courtesy|source:)\b|©/i;
  function startsSentence(n) {
    if (!n) return false;
    if (n.nodeType === 1 && isMath(n)) return true;
    var t = (n.textContent || "").replace(/^\s+/, "");
    var c = t.charAt(0);
    return !!c && (c !== c.toLowerCase() || /[0-9"“‘'(\[ऀ-ॿ]/.test(c));
  }
  function skipInline(n) {
    if (n.nodeType !== 1) return n.nodeType !== 3;
    if (n.tagName === "SUP" && n.querySelector("a.footnote-ref, a[href^='#fn']")) return true;
    return n.classList.contains("footnote-ref") || n.classList.contains("headerlink") || n.tagName === "SCRIPT" || n.tagName === "STYLE";
  }
  /* The sentences of a block of inline content: [{frag, text}], each a fragment of copies of the nodes. A
     formula, a link and any other element is never cut; a sentence ends at . ! ? (not after a known abbreviation
     or an initial) followed by a capital letter, a digit or a Devanagari letter, or at a danda. */
  function sentences(src) {
    var out = [], cur = frag(), curText = "";
    function push() {
      if (curText.replace(/\s+/g, "")) out.push({ frag: cur, text: norm(curText) });
      cur = frag(); curText = "";
    }
    function addText(s) {
      if (!curText) s = s.replace(/^\s+/, "");
      if (!s) return;
      cur.appendChild(document.createTextNode(s));
      curText += s;
    }
    var kids = [].slice.call(src.childNodes);
    for (var k = 0; k < kids.length; k++) {
      var n = kids[k];
      if (n.nodeType === 3) {
        var s = n.nodeValue, last = 0, m;
        BOUND.lastIndex = 0;
        while ((m = BOUND.exec(s))) {
          var end = m.index + m[0].length;
          var head = curText + s.slice(last, end);
          if (/[.]/.test(m[0]) && ABBR.test(head)) continue;
          if (/\d\.$/.test(m[0]) === false && /[.]$/.test(m[0]) && /\b\d+\.$/.test(head) && /^\s*\d/.test(s.slice(end))) continue;
          var rest = s.slice(end).replace(/^\s+/, "");
          var danda = /[।॥]/.test(m[0]);
          if (rest) {
            var c = rest.charAt(0);
            if (!danda && !(c !== c.toLowerCase() || /[0-9"“‘'(\[ऀ-ॿ]/.test(c))) continue;
          } else if (!danda) {
            var nx = kids[k + 1];
            if (nx && !startsSentence(nx)) continue;
          }
          addText(s.slice(last, end));
          push();
          last = end;
        }
        if (last < s.length) addText(s.slice(last));
      } else if (n.nodeType === 1) {
        if (skipInline(n)) continue;
        if (n.tagName === "BR") { addText(" "); continue; }
        cur.appendChild(importNode(n));
        curText += n.textContent;
      }
    }
    push();
    return out;
  }
  function joinSentences(ss) {
    var f = frag();
    ss.forEach(function (s, k) { if (k) f.appendChild(document.createTextNode(" ")); f.appendChild(s.frag); });
    return f;
  }
  /* a long sentence is cut at its first semicolon or dash, when at least ten words come before it */
  function shorten(s) {
    if (s.w <= 36) return { frag: s.frag, w: s.w };
    var seen = 0, kids = [].slice.call(s.frag.childNodes);
    for (var i = 0; i < kids.length; i++) {
      var n = kids[i];
      if (n.nodeType === 3) {
        var re = /;\s|\s[—–]\s|—/g, m;
        while ((m = re.exec(n.nodeValue))) {
          var before = seen + countWords(n.nodeValue.slice(0, m.index));
          if (before >= 10 && s.w - before >= 6) {
            n.nodeValue = n.nodeValue.slice(0, m.index).replace(/[\s,]+$/, "") + ".";
            for (var j = kids.length - 1; j > i; j--) s.frag.removeChild(kids[j]);
            return { frag: s.frag, w: nodeWords(s.frag) };
          }
        }
        seen += countWords(n.nodeValue);
      } else seen += nodeWords(n);
    }
    return { frag: s.frag, w: s.w };
  }
  /* The key points of a paragraph: the whole of a short one; otherwise its best sentence (two for a long one),
     chosen for being first, defining a term, carrying bold words, and being of a speakable length. */
  function keyPoints(node, most) {
    var ss = sentences(node), total = 0;
    ss.forEach(function (s) { s.w = nodeWords(s.frag); total += s.w; });
    if (!ss.length) return [];
    if (total <= 30 || ss.length === 1) return [{ frag: joinSentences(ss), w: total }];
    var n = Math.min(most || 2, total > 110 ? 2 : 1);
    ss.forEach(function (s, k) {
      var t = s.text, sc = 0;
      if (k === 0) sc += 2.5; else if (k === 1) sc += 0.4;
      if (s.frag.querySelector("strong, b, dfn")) sc += 2;
      else if (s.frag.querySelector("em")) sc += 0.3;
      if (DEF_RE.test(t)) sc += 1.2;
      if (LEAD_RE.test(t)) sc -= 1.6;
      if (s.w < 6) sc -= 2.5; else if (s.w < 9) sc -= 0.8;
      if (s.w > 38) sc -= 1.5; else if (s.w > 28) sc -= 0.5;
      if (/\?$/.test(t)) sc -= 0.8;
      s.sc = sc;
    });
    var order = ss.map(function (s, k) { return k; }).sort(function (a, b) { return ss[b].sc - ss[a].sc || a - b; });
    return order.slice(0, n).sort(function (a, b) { return a - b; }).map(function (k) { return shorten(ss[k]); });
  }
  /* the inline content of a list item or a box: its paragraphs run together, nested lists left out */
  function inlineOf(n) {
    var d = el("div");
    each(n.childNodes, function (c) {
      if (c.nodeType === 1 && /^(UL|OL|DL|TABLE|PRE|FIGURE)$/.test(c.tagName)) return;
      if (c.nodeType === 1 && (c.classList.contains("highlight") || c.classList.contains("admonition"))) return;
      if (c.nodeType === 1 && /^(P|DIV)$/.test(c.tagName)) {
        if (d.childNodes.length) d.appendChild(document.createTextNode(" "));
        each(c.childNodes, function (x) { d.appendChild(importNode(x)); });
      } else d.appendChild(importNode(c));
    });
    return d;
  }

  /* citations in parentheses, "(Jamison and Brereton 2014; Witzel 2003)", are left off the slides */
  function isCite(a) { var h = a.getAttribute("href") || ""; return /(^|\/)(bibliography|references)\.html#|#(ref|cite)-/.test(h); }
  function stripCites(root) {
    var as = [].slice.call(root.querySelectorAll("a[href]")).filter(isCite);
    as.forEach(function (a) {
      if (!a.parentNode) return;
      var run = [a], n = a.nextSibling;
      while (n) {
        if (n.nodeType === 3 && /^[\s;,]*(and|&)?[\s;,]*$/.test(n.nodeValue) && n.nextSibling && n.nextSibling.nodeType === 1 && n.nextSibling.tagName === "A" && isCite(n.nextSibling)) {
          run.push(n, n.nextSibling); n = n.nextSibling.nextSibling;
        } else break;
      }
      var before = run[0].previousSibling, after = run[run.length - 1].nextSibling;
      if (before && before.nodeType === 3 && after && after.nodeType === 3 && /\((?:see |cf\. )?$/.test(before.nodeValue) && /^\)/.test(after.nodeValue)) {
        before.nodeValue = before.nodeValue.replace(/\s*\((?:see |cf\. )?$/, "");
        after.nodeValue = after.nodeValue.replace(/^\)/, "");
        run.forEach(function (x) { if (x.parentNode) x.parentNode.removeChild(x); });
      }
    });
  }
  /* on a slide, links inside the book do not navigate (a click turns the slide); links to other sites open apart */
  function tameLinks(root) {
    each(root.querySelectorAll("a:not(.viz-src)"), function (a) {
      var h = a.getAttribute("href") || "", ext = false;
      try { ext = /^https?:/.test(h) && new URL(h, location.href).origin !== location.origin; } catch (e) { ext = false; }
      if (ext) { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener noreferrer"); return; }
      var s = el("span", "sl-a");
      while (a.firstChild) s.appendChild(a.firstChild);
      a.parentNode.replaceChild(s, a);
    });
    each(root.querySelectorAll("[id]"), function (n) { n.removeAttribute("id"); });
    rm(root, "sup[id^='fnref'], a.footnote-ref, .headerlink, .rd-expand, [data-viz-gen]");
  }

  /* ================================================================ the chapter's page */
  var docCache = {};
  function fetchDoc(url) {
    url = url.split("#")[0];
    if (docCache[url]) return docCache[url];
    var p = fetch(url, { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) throw new Error("http " + r.status);
      return r.text();
    }).then(function (t) { return new DOMParser().parseFromString(t, "text/html"); });
    p.catch(function () { delete docCache[url]; });
    docCache[url] = p;
    return p;
  }
  function absolutize(root, base) {
    [["img", "src"], ["source", "src"], ["video", "src"], ["video", "poster"], ["a", "href"]].forEach(function (p) {
      each(root.querySelectorAll(p[0] + "[" + p[1] + "]"), function (n) {
        var v = n.getAttribute(p[1]);
        if (!v || v.charAt(0) === "#" || /^(data|mailto|tel|javascript):/.test(v)) return;
        try { n.setAttribute(p[1], new URL(v, base).href); } catch (e) { /* leave it */ }
      });
    });
  }
  function linkRel(doc, rel, base) {
    var l = doc.querySelector('link[rel="' + rel + '"]');
    if (!l) return "";
    try { var u = new URL(l.getAttribute("href"), base); return ENTRY.bookOf && ENTRY.bookOf(u.pathname) ? u.href : ""; } catch (e) { return ""; }
  }
  /* a chapter of a linked book (assets/remote.js) is an empty shell in its page: its text is fetched and put in
     before the deck is made */
  function fillRemote(src) {
    if (!window.pkRemote || !src.art.querySelector(".pk-remote[data-book]")) return Promise.resolve(src);
    var box = document.createElement("div");
    box.appendChild(src.art);
    return window.pkRemote.fill(box).then(function () { return src; }, function () { return src; }).then(function (s) {
      s.art = box.firstElementChild || s.art;
      absolutize(s.art, s.url);
      return s;
    });
  }
  function loadSource(opts) {
    var url = String(opts.url).split("#")[0];
    if (opts.html) {
      var d = document.implementation.createHTMLDocument("");
      var art = d.createElement("article");
      art.innerHTML = opts.html;
      absolutize(art, url);
      return fillRemote({ url: url, art: art, next: opts.next || "", prev: opts.prev || "" });
    }
    return fetchDoc(url).then(function (doc) {
      var a = doc.querySelector("article.md-content__inner");
      if (!a) throw new Error("no article");
      a = a.cloneNode(true);
      absolutize(a, url);
      return fillRemote({ url: url, art: a, next: linkRel(doc, "next", url), prev: linkRel(doc, "prev", url) });
    }, function (err) {
      // the page on screen, when it cannot be fetched again (its mathematics may be typeset already)
      if (url === location.href.split("#")[0].split("?")[0]) {
        var live = document.querySelector("article.md-content__inner");
        if (live) {
          var c = live.cloneNode(true);
          return { url: url, art: c, next: linkRel(document, "next", url), prev: linkRel(document, "prev", url) };
        }
      }
      throw err;
    });
  }

  /* the book: its title, author and cover colours (from its first page) and its contents (contents.json) */
  var bookCache = {};
  function bookFor(url) {
    try { var v = ENTRY.bookOf(new URL(url, location.href).pathname); return v ? v.book : null; } catch (e) { return null; }
  }
  function bookInfo(url) {
    var b = bookFor(url);
    if (!b) return Promise.resolve({ lang: "en" });
    if (bookCache[b.id]) return bookCache[b.id];
    var base = location.origin + ROOT + b.path + "/";
    var pIndex = fetchDoc(base + "index.html").then(function (d) {
      var info = {};
      var t = d.querySelector(".pk-book-title") || d.querySelector(".vol-title");
      if (t) { t = t.cloneNode(true); rm(t, ".bjp-sr"); info.title = txt(t); }
      var by = d.querySelector(".pk-book-by") || d.querySelector(".cv-author");
      if (by) info.author = txt(by);
      var gb = d.querySelector(".pk-book-gen");
      if (gb) info.gen = txt(gb);
      var card = d.querySelector(".vol-card[style]");
      if (card) {
        var st = card.getAttribute("style") || "", m;
        info.cover = {};
        if ((m = /--cv-bg:\s*([^;]+)/.exec(st))) info.cover.bg = m[1].trim();
        if ((m = /--cv-accent:\s*([^;]+)/.exec(st))) info.cover.accent = m[1].trim();
        if ((m = /--cv-fg:\s*([^;]+)/.exec(st))) info.cover.fg = m[1].trim();
      }
      return info;
    }).catch(function () { return {}; });
    var pCont = fetch(base + "contents.json", { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    var p = Promise.all([pIndex, pCont]).then(function (r) {
      var info = r[0];
      info.contents = r[1];
      info.id = b.id;
      info.lang = b.lang || "en";
      info.base = base;
      return info;
    });
    bookCache[b.id] = p;
    return p;
  }
  function decode(t) { if (!t || t.indexOf("&") < 0) return t; var d = el("textarea"); d.innerHTML = t; return d.value; }
  function contentsItems(info) {
    var out = [];
    if (info && info.contents && info.contents.groups) info.contents.groups.forEach(function (g) { (g.items || []).forEach(function (it) { out.push(it); }); });
    return out;
  }
  function pageTitleAfter(info, url) {
    var f = String(url).split("#")[0].split("/").pop(), items = contentsItems(info);
    for (var i = 0; i < items.length; i++) if (items[i].f === f) return items[i + 1] ? decode(items[i + 1].t) : "";
    return "";
  }

  /* ================================================================ making the deck */
  var SUMMARY_RE = /\b(summary|summing up|key (points|ideas|takeaways)|takeaways|recap|in brief|wrap[- ]?up|conclusions?|concluding remarks)\b|सारांश/i;
  var READING_RE = /^(further reading|references|bibliography|notes|sources|works cited|suggested reading|reading list|endnotes|acknowledge?ments?|credits|image credits|readings)\b/i;
  var EXSEC_RE = /\b(exercises?|practice|problems|questions|review questions|self[- ]assessment|quiz|test yourself|worksheet)\b|अभ्यास/i;
  var EXERCISE_RE = /^(exercise|question|practice|quiz|try it|try this|check yourself|self[- ]check|problem \d|q\.?\s*\d|प्रश्न|अभ्यास)/i;
  var ANSWER_RE = /^(answers?|solutions?|hints?|उत्तर|हल)\b/i;
  var EXAMPLE_RE = /^(example|worked example|solved (example|problem)|illustration|problem|उदाहरण)/i;

  function admTitleEl(n) { return n.querySelector(":scope > .admonition-title, :scope > summary"); }
  function admTitle(n) { var t = admTitleEl(n); return t ? txt(t) : ""; }
  function admBody(n) { var t = admTitleEl(n); return [].filter.call(n.childNodes, function (c) { return c !== t && (c.nodeType === 1 || (c.nodeType === 3 && c.nodeValue.trim())); }); }
  function isAnswer(n) { return !!n && n.nodeType === 1 && (n.tagName === "DETAILS" || n.classList.contains("admonition")) && ANSWER_RE.test(admTitle(n)); }
  function htmlOf(nodes) { var d = el("div"); nodes.forEach(function (n) { d.appendChild(importNode(n)); }); return d.innerHTML; }
  function innerHtmlOf(n, strip) {
    var c = importNode(n);
    if (strip) rm(c, strip);
    rm(c, ".headerlink");
    return c.innerHTML.trim();
  }

  function parseHeading(h) {
    var c = importNode(h);
    rm(c, ".headerlink");
    var text = txt(c), num = "";
    var sn = c.querySelector(".secnum");
    if (sn) { num = txt(sn); sn.parentNode.removeChild(sn); }
    else {
      var hn = headingNum(text);
      if (hn) {
        num = hn.num;
        var t = c.firstChild;
        while (t && t.nodeType !== 3) t = t.firstChild;
        if (t) t.nodeValue = t.nodeValue.replace(/^\s*(?:[A-Z]\.)?\d+(?:\.\d+)*\.?\s+/, "");
      }
    }
    var html = c.innerHTML.trim();
    return { num: num, html: html, text: norm(c.textContent), id: h.id || "" };
  }
  function chapterHead(art, fallback) {
    var h1 = art.querySelector("h1");
    var t = h1 ? parseHeading(h1) : { html: esc(fallback || ""), text: fallback || "", num: "" };
    var label = "", m = /^([^:]{1,40}?\s[\dIVXLCivxlc]+[A-Z]?)\s*:\s+(\S[\s\S]*)$/.exec(t.text);
    if (m) {
      label = m[1];
      var c = el("div", null, t.html), n = c.firstChild;
      while (n && n.nodeType !== 3) n = n.firstChild;
      if (n) n.nodeValue = n.nodeValue.replace(/^[^:]*:\s*/, "");
      t.html = c.innerHTML.trim();
      t.text = m[2];
    }
    t.label = label;
    var sub = h1 && h1.nextElementSibling;
    if (sub && sub.tagName === "P" && sub.children.length === 1 && /^(EM|I)$/.test(sub.children[0].tagName) && txt(sub) === txt(sub.children[0]) && countWords(txt(sub)) < 30) {
      t.subtitle = sub.children[0].innerHTML;
      t.subEl = sub;
    }
    return t;
  }

  function prepareArt(art) {
    rm(art, ".headerlink, script, style, nav.vol-contents, .md-source-file, [data-viz-gen], .rd-expand, .md-clipboard, .footnote-backref, h2#contents, .pk-book-actions, .bjp-offline");
  }
  function makeDeck(src, info) {
    var art = src.art;
    prepareArt(art);
    var M = { slides: [], sections: [], info: info, url: src.url, next: src.next, prev: src.prev, summary: [], summaryNotes: [] };
    M.head = chapterHead(art, "");
    M.lang = info.lang || "en";
    var blocks = [].filter.call(art.childNodes, function (n) {
      return n.nodeType === 1 || (n.nodeType === 8 && /^\s*\/?\s*slide\b/i.test(n.nodeValue));
    });
    // the sections, with their subsections, for the contents and the section slides
    var secs = [], cur = null;
    blocks.forEach(function (n) {
      if (n.nodeType !== 1) return;
      if (n.tagName === "H2") { cur = parseHeading(n); cur.subs = []; cur.mode = sectionMode(cur.text); secs.push(cur); }
      else if (n.tagName === "H3" && cur) cur.subs.push(parseHeading(n).text);
    });
    M.secList = secs;
    titleSlide(M);
    var authored = art.querySelector(".pk-slides");
    if (authored) {
      walk(M, blocks, true);                      // only for the summary on the closing slide
      [].forEach.call(authored.querySelectorAll(":scope > .pk-slide"), function (s) { authoredSlide(M, s, null); });
    } else {
      var shown = secs.filter(function (s) { return s.mode !== "reading" && s.mode !== "summary"; });
      if (shown.length >= 3) agendaSlide(M, shown);
      walk(M, blocks, false);
    }
    closingSlides(M);
    return M;
  }
  function sectionMode(t) {
    var core = t.replace(/^(?:[A-Z]\.)?\d+(?:\.\d+)*\.?\s+/, "");
    if (READING_RE.test(core)) return "reading";
    if (SUMMARY_RE.test(core) && countWords(core) <= 6) return "summary";
    if (EXSEC_RE.test(core) && countWords(core) <= 7) return "exercises";
    return "normal";
  }

  /* ---------------------------------------------------------------- the walk over the chapter's blocks */
  function walk(M, blocks, collectOnly) {
    var C = { M: M, sec: null, sub: null, buf: [], mode: "normal", used: new Set(), collectOnly: collectOnly, bi: 0, secIndex: -1 };
    M.C = C;
    for (var i = 0; i < blocks.length; i++) {
      var n = blocks[i];
      if (C.used.has(n)) continue;
      C.bi = i;
      CUR_BI = i;
      if (n === M.head.subEl) continue;
      if (n.nodeType === 8) {
        if (/^\s*slide\b/i.test(n.nodeValue)) i = authoredGroup(C, blocks, i);
        continue;
      }
      block(C, n, blocks, i);
    }
    flush(C);
  }
  function add(C, s) {
    if (C.collectOnly) return;
    if (s.bi == null) s.bi = C.bi;
    s.sec = C.secIndex;
    C.M.slides.push(s);
  }
  function heading(C) {
    var M = C.M;
    if (C.sub) return { title: C.sub.html, kicker: C.sec ? (C.sec.num ? C.sec.num + " · " : "") + C.sec.html : esc(M.head.label) };
    if (C.sec) return { title: C.sec.html, kicker: C.sec.num ? esc(C.sec.num) : esc(M.head.label) };
    return { title: M.head.html, kicker: esc(M.head.label) };
  }
  function context(C) {
    if (C.sec) return (C.sec.num ? C.sec.num + " · " : "") + C.sec.html;
    return esc(C.M.head.label || "") ;
  }
  function next(blocks, i, C) {
    for (var k = i + 1; k < blocks.length; k++) { var n = blocks[k]; if (n.nodeType === 1 && !C.used.has(n)) return n; if (n.nodeType === 8) return null; }
    return null;
  }

  function block(C, n, blocks, i) {
    var tag = n.tagName, cls = n.classList;
    if (tag === "H1") return;
    if (n.hasAttribute("hidden") && !cls.contains("pk-slide")) return;
    if (cls.contains("pk-slides")) return;
    if (tag === "H2") { startSection(C, n); return; }
    if (/^H[3-6]$/.test(tag) || cls.contains("parahead")) {
      flush(C);
      var h = cls.contains("parahead") ? { html: innerHtmlOf(n.querySelector("p") || n).replace(/[.:]\s*$/, ""), text: txt(n).replace(/[.:]\s*$/, ""), num: "" } : parseHeading(n);
      if (tag === "H3" || cls.contains("parahead") || !C.sub) C.sub = h;
      else C.sub = { html: h.html, text: h.text, num: "" };
      return;
    }
    if (C.mode === "reading") { readingBlock(C, n); return; }
    if (cls.contains("pk-slide")) { flush(C); authoredSlide(C.M, n, C); return; }
    if (tag === "P") {
      if (exerciseStart(n)) { flush(C); exerciseFromParagraph(C, n, blocks, i); return; }
      var only = n.children.length === 1 && txt(n) === txt(n.children[0]) ? n.children[0] : null;
      if (only && only.tagName === "IMG") { flush(C); figureSlide(C, n); return; }
      if (C.mode === "summary") { summaryText(C, n); return; }
      paragraph(C, n);
      return;
    }
    if (tag === "UL" || tag === "OL") { if (C.mode === "summary") summaryList(C, n); else listItems(C, n, 1); return; }
    if (tag === "DL") { if (C.mode === "summary") summaryList(C, n); else defList(C, n); return; }
    if (tag === "TABLE" || cls.contains("tbl")) { tableSlides(C, n, blocks, i); return; }
    if (cls.contains("highlight") || tag === "PRE") { codeSlides(C, n); return; }
    if (cls.contains("arithmatex") || (cls.contains("math") && cls.contains("display"))) { equation(C, n, blocks, i); return; }
    if (tag === "FIGURE") { figureSlide(C, n); return; }
    if (cls.contains("admonition") || tag === "DETAILS") { admonition(C, n, blocks, i); return; }
    if (tag === "BLOCKQUOTE" || cls.contains("srcline") || cls.contains("translation") || cls.contains("epigraphbox")) { flush(C); verseSlide(C, n, tag === "BLOCKQUOTE" ? "quote" : "verse"); return; }
    if (cls.contains("footnote") || cls.contains("references") || cls.contains("csl-bib-body") || tag === "HR" || tag === "NAV" || tag === "SCRIPT") return;
    if (tag === "DIV" || tag === "SECTION") {
      // a wrapper (center, minipage, a list in a div): its children are blocks
      var kids = [].filter.call(n.childNodes, function (c) { return c.nodeType === 1; });
      kids.forEach(function (c) { block(C, c, kids, kids.indexOf(c)); });
      return;
    }
    if (txt(n)) paragraph(C, n);
  }

  function startSection(C, h) {
    flush(C);
    var s = parseHeading(h);
    s.mode = sectionMode(s.text);
    C.sec = s; C.sub = null; C.mode = s.mode;
    C.M.sections.push({ num: s.num, title: s.text, html: s.html, mode: s.mode, first: C.M.slides.length });
    C.secIndex = C.M.sections.length - 1;
    if (s.mode === "summary") { C.M.summaryTitle = s.html; return; }
    if (s.mode === "reading") return;
    var subs = [];
    (C.M.secList || []).forEach(function (x) { if (x.id && x.id === s.id) subs = x.subs; });
    add(C, { kind: "section", num: s.num, title: s.html, titleText: s.text, subs: subs, notes: "" });
  }

  /* ---------------------------------------------------------------- bullets */
  var CUR_BI = 0;           // the block of the chapter being turned into slides (to return to it from a slide)
  function bullet(f, w, level, notesNode, ord) { return { t: "b", node: f, w: Math.max(1, w), units: 1, level: level || 1, notes: notesNode || null, ord: ord || "", bi: CUR_BI }; }
  function paragraph(C, p) {
    var pts = keyPoints(p, 2);
    pts.forEach(function (pt, k) { C.buf.push(bullet(pt.frag, pt.w, 1, k === 0 ? p : null)); });
  }
  function listItems(C, list, level, into) {
    var out = into || C.buf, ordered = list.tagName === "OL", k = 0;
    each(list.children, function (li) {
      if (li.tagName !== "LI") return;
      k++;
      var inl = inlineOf(li), w = nodeWords(inl), f;
      if (w > 34) { var pts = keyPoints(inl, 1); f = pts.length ? pts[0].frag : frag(); w = pts.length ? pts[0].w : 0; }
      else { f = frag(); each([].slice.call(inl.childNodes), function (c) { f.appendChild(c); }); }
      out.push(bullet(f, w, level, w > 34 || level === 1 ? li : null, ordered ? k + "." : ""));
      if (level < 2) {
        var sub = li.querySelector(":scope > ul, :scope > ol");
        if (sub) listItems(C, sub, 2, out);
      }
    });
  }
  function defList(C, dl) {
    var term = null;
    each(dl.children, function (c) {
      if (c.tagName === "DT") term = c;
      else if (c.tagName === "DD") {
        var f = frag(), w = 0;
        if (term) { var s = el("strong"); each(term.childNodes, function (x) { s.appendChild(importNode(x)); }); f.appendChild(s); f.appendChild(document.createTextNode(" — ")); w += nodeWords(term); }
        var pts = keyPoints(inlineOf(c), 1);
        if (pts.length) { f.appendChild(pts[0].frag); w += pts[0].w; }
        C.buf.push(bullet(f, w, 1, c));
        term = null;
      }
    });
  }
  /* bullets in groups: at most MAX_BULLETS and about MAX_WORDS on a slide, the slides of a run evenly filled */
  function pack(items) {
    var units = 0, words = 0;
    items.forEach(function (it) { units += it.units; words += it.w; });
    var n = Math.max(1, Math.ceil(units / MAX_BULLETS), Math.ceil(words / MAX_WORDS));
    var target = words / n, chunks = [], cur = [], cw = 0, cu = 0;
    items.forEach(function (it) {
      var full = cu + it.units > MAX_BULLETS || cw + it.w > MAX_WORDS * 1.15 || (cw >= target * 0.92 && chunks.length < n - 1);
      if (cur.length && full && it.level === 2 && cu + it.units <= MAX_BULLETS + 1 && cw + it.w <= MAX_WORDS * 1.3) full = false;
      if (cur.length && full) { chunks.push(cur); cur = []; cw = 0; cu = 0; }
      cur.push(it); cw += it.w; cu += it.units;
    });
    if (cur.length) chunks.push(cur);
    return chunks;
  }
  function flush(C) {
    if (!C.buf.length) return;
    var items = C.buf;
    C.buf = [];
    if (C.mode === "summary") { items.forEach(function (it) { C.M.summary.push(it); }); return; }
    var h = heading(C);
    pack(items).forEach(function (chunk) {
      var ul = el("ul", "sl-bullets"), notes = [];
      chunk.forEach(function (it) {
        var li = el("li", it.t === "eq" ? "sl-li-eq" : (it.level === 2 ? "sl-l2" : ""));
        if (it.ord) li.setAttribute("data-n", it.ord);
        li.appendChild(it.node);
        ul.appendChild(li);
        if (it.notes && notes.indexOf(it.notes) < 0) notes.push(it.notes);
      });
      // a single short point is shown as a statement, larger and centred
      var single = chunk.length === 1 && chunk[0].t === "b" && chunk[0].w <= 34 && chunk[0].level === 1;
      add(C, { kind: "bullets", cls: single ? "sl-statement" : "", title: h.title, kicker: h.kicker, body: ul, notes: htmlOf(notes), bi: chunk[0].bi });
    });
  }

  /* a short run of bullets just before a table, a listing or a figure goes on its slide, above it */
  function takeLead(C, maxW, maxN) {
    var items = C.buf, w = 0;
    if (!items.length || C.mode === "summary") { flush(C); return null; }
    // the last group of the run of bullets, if it is short, goes with the table or figure; the others before it
    var chunks = pack(items), last = chunks[chunks.length - 1];
    last.forEach(function (it) { w += it.w; });
    if (last.length > maxN || w > maxW || last.some(function (it) { return it.t !== "b"; }) || last[0].level !== 1) { flush(C); return null; }
    C.buf = items.slice(0, items.length - last.length);
    flush(C);
    items = last;
    var ul = el("ul", "sl-bullets sl-leadlist"), notes = [];
    items.forEach(function (it) {
      var li = el("li", it.level === 2 ? "sl-l2" : "");
      li.appendChild(it.node);
      ul.appendChild(li);
      if (it.notes) notes.push(it.notes);
    });
    return { el: ul, notes: htmlOf(notes), bi: items[0].bi };
  }

  /* ---------------------------------------------------------------- equations */
  function texOf(n) { return norm(n.textContent); }
  function bigEquation(n) {
    var t = texOf(n);
    return t.length > 90 || /\\begin\{(align|aligned|array|[pbvBV]?matrix|cases|gather|split|eqnarray|multline)/.test(t) || /\\\\/.test(t);
  }
  function equation(C, n, blocks, i) {
    if (C.mode === "summary") { C.M.summary.push({ t: "eq", node: importNode(n), w: 12, units: 2, level: 1 }); return; }
    if (!bigEquation(n) && C.buf.length) {
      C.buf.push({ t: "eq", node: importNode(n), w: 14, units: 2, level: 1, notes: null, bi: CUR_BI });
      return;
    }
    // a slide of its own: the sentence that leads into it, then the equations that follow closely
    var lead = null;
    if (C.buf.length) {
      var last = C.buf[C.buf.length - 1];
      if (last.t === "b" && last.w <= 26) lead = C.buf.pop();
    }
    flush(C);
    var box = el("div", "sl-eqs"), notes = [];
    if (lead) { var lp = el("p", "sl-lead"); lp.appendChild(lead.node); box.appendChild(lp); if (lead.notes) notes.push(lead.notes); }
    box.appendChild(importNode(n));
    var k = i, count = 1;
    while (count < 2) {
      var a = next(blocks, k, C);
      if (!a) break;
      if (a.classList.contains("arithmatex")) { box.appendChild(importNode(a)); C.used.add(a); k = blocks.indexOf(a); count++; continue; }
      if (a.tagName === "P" && nodeWords(a) <= 14) {
        var b2 = next(blocks, blocks.indexOf(a), C);
        if (b2 && b2.classList.contains("arithmatex")) {
          var pp = el("p", "sl-between"); each(a.childNodes, function (x) { pp.appendChild(importNode(x)); });
          box.appendChild(pp); box.appendChild(importNode(b2));
          C.used.add(a); C.used.add(b2); k = blocks.indexOf(b2); count++; continue;
        }
      }
      break;
    }
    var h = heading(C);
    add(C, { kind: "math", title: h.title, kicker: h.kicker, body: box, notes: htmlOf(notes) });
  }

  /* ---------------------------------------------------------------- figures */
  function shortCaption(cap) {
    if (!cap) return null;
    var w = nodeWords(cap);
    var c = el("figcaption");
    if (w <= 32) { each(cap.childNodes, function (x) { c.appendChild(importNode(x)); }); return c; }
    var ss = sentences(cap);
    ss.forEach(function (s, k) {
      if (k === 0 || CREDIT_RE.test(s.text)) {
        if (c.childNodes.length) c.appendChild(document.createTextNode(" "));
        c.appendChild(s.frag);
      }
    });
    each(cap.querySelectorAll(".credit"), function (cr) { if (!c.querySelector(".credit")) { c.appendChild(document.createTextNode(" ")); c.appendChild(importNode(cr)); } });
    return c;
  }
  function figureSlide(C, n) {
    var fig = n.tagName === "FIGURE" ? n : null;
    var lead = null;
    if (fig && /fig-(viz|steps)/.test(fig.className)) flush(C); else lead = takeLead(C, 32, 2);    // these need the room
    var h = heading(C), kind = "figure", steps = 0;
    var box = el("div", "sl-figbox");
    if (lead) box.appendChild(lead.el);
    var f = importNode(n);
    if (fig && fig.classList.contains("fig-viz")) kind = "viz";
    else if (fig && fig.classList.contains("fig-steps")) { kind = "steps"; steps = Math.max(0, f.querySelectorAll(".steps-frame").length - 1); }
    else if (fig && fig.classList.contains("fig-mermaid")) kind = "mermaid";
    else if (fig && fig.classList.contains("fig-video")) kind = "video";
    var cap = f.querySelector(":scope > figcaption");
    var notes = cap ? cap.innerHTML : "";
    if (cap && kind === "figure") cap.parentNode.replaceChild(shortCaption(cap), cap);
    if (kind === "figure" && f.querySelectorAll("img").length > 1) f.classList.add("sl-multi");
    box.appendChild(f);
    var title = h.title;
    if (kind === "viz" || kind === "steps") {
      var vt = fig.getAttribute("data-viz-title") || fig.getAttribute("data-steps-title");
      if (vt) title = esc(vt);
    }
    add(C, { kind: kind, fig: true, title: title, kicker: h.kicker, body: box, notes: (lead ? lead.notes : "") + notes, steps: steps, bi: lead ? lead.bi : null });
  }

  /* ---------------------------------------------------------------- tables */
  function tableSlides(C, n, blocks, i) {
    var table = n.tagName === "TABLE" ? n : n.querySelector("table");
    if (!table) { flush(C); return; }
    var lead = takeLead(C, 40, 2);
    var capNode = n.querySelector(".tbl-caption"), cap = null;
    if (!capNode) {
      var nx = next(blocks, i, C);
      if (nx && nx.tagName === "P" && /^(table|tab\.|सारणी|तालिका)\s*[\dA-Z]/i.test(txt(nx)) && nodeWords(nx) < 60) { capNode = nx; C.used.add(nx); }
    }
    if (capNode) { cap = el("p", "sl-cap"); each(capNode.childNodes, function (x) { cap.appendChild(importNode(x)); }); if (cap.children.length === 1 && cap.children[0].tagName === "EM" && txt(cap) === txt(cap.children[0])) cap.innerHTML = cap.children[0].innerHTML; }
    var t = importNode(table);
    var head = t.querySelector("thead");
    var rows = [].slice.call(t.querySelectorAll(":scope > tbody > tr, :scope > tr"));
    if (!head && rows.length && rows[0].querySelector("th")) { head = el("thead"); head.appendChild(rows.shift()); }
    var cols = 0;
    each(t.querySelectorAll("tr"), function (r) { cols = Math.max(cols, r.children.length); });
    var chars = 0;
    rows.forEach(function (r) { chars += txt(r).length; });
    var avg = rows.length ? chars / rows.length : 0;
    var per = avg > 220 ? 4 : avg > 140 ? 5 : avg > 80 ? 7 : 9;
    var parts = Math.max(1, Math.ceil(rows.length / per));
    per = Math.ceil(rows.length / parts);
    var h = heading(C);
    for (var p = 0; p < parts; p++) {
      var tt = el("table");
      if (head) tt.appendChild(head.cloneNode(true));
      var tb = el("tbody");
      rows.slice(p * per, (p + 1) * per).forEach(function (r) { tb.appendChild(r.cloneNode(true)); });
      tt.appendChild(tb);
      var box = el("div", "sl-tblbox");
      if (lead && p === 0) box.appendChild(lead.el);
      var wrap = el("div", "sl-tblwrap");
      wrap.appendChild(tt);
      box.appendChild(wrap);
      if (cap) { var c = cap.cloneNode(true); if (parts > 1) c.appendChild(document.createTextNode(" (" + (p + 1) + "/" + parts + ")")); box.appendChild(c); }
      add(C, { kind: "table", title: h.title, kicker: h.kicker, body: box, notes: (lead && p === 0 ? lead.notes : "") + (cap ? cap.innerHTML : ""), bi: lead && p === 0 ? lead.bi : null });
    }
  }

  /* ---------------------------------------------------------------- code */
  /* the lines of a highlighted listing, each with its spans closed and opened again */
  function codeLines(code) {
    var lines = [], cur = "", stack = [];
    function open(e) { return "<" + e.tagName.toLowerCase() + (e.className ? ' class="' + esc(e.className) + '"' : "") + ">"; }
    function rec(n) {
      if (n.nodeType === 3) {
        var parts = n.nodeValue.split("\n");
        parts.forEach(function (part, k) {
          if (k > 0) {
            lines.push(cur + stack.map(function () { return "</span>"; }).join(""));
            cur = stack.map(open).join("");
          }
          cur += esc(part);
        });
      } else if (n.nodeType === 1) {
        if (n.tagName !== "SPAN") { cur += esc(n.textContent); return; }
        stack.push(n);
        cur += open(n);
        for (var c = n.firstChild; c; c = c.nextSibling) rec(c);
        stack.pop();
        cur += "</span>";
      }
    }
    for (var c = code.firstChild; c; c = c.nextSibling) rec(c);
    lines.push(cur);
    while (lines.length && !lines[lines.length - 1].replace(/<[^>]+>/g, "").trim()) lines.pop();
    return lines;
  }
  function codeSlides(C, n) {
    var pre = n.tagName === "PRE" ? n : n.querySelector("pre");
    if (!pre) { flush(C); return; }
    var lead = takeLead(C, 40, 2);
    var code = pre.querySelector("code") || pre;
    var lines = codeLines(code), MAX = lead ? 13 : 16, chunks = [];
    var s = 0;
    while (s < lines.length) {
      var e = Math.min(lines.length, s + MAX);
      if (e < lines.length) {
        // end a part at an empty line near its end, when there is one
        for (var k = e; k > s + MAX - 6; k--) if (!lines[k - 1].replace(/<[^>]+>/g, "").trim()) { e = k; break; }
        if (lines.length - e < 4) e = lines.length;
      }
      chunks.push(lines.slice(s, e));
      s = e;
    }
    var h = heading(C), lang = (n.className.match(/language-[\w+-]+/) || [""])[0];
    chunks.forEach(function (ch, k) {
      while (ch.length && !ch[0].replace(/<[^>]+>/g, "").trim()) ch.shift();
      var box = el("div", "sl-codebox");
      if (lead && k === 0) box.appendChild(lead.el);
      var d = el("div", "highlight " + lang);
      d.innerHTML = "<pre><code>" + ch.join("\n") + "</code></pre>";
      box.appendChild(d);
      if (chunks.length > 1) box.appendChild(el("p", "sl-cap", (k + 1) + "/" + chunks.length));
      add(C, { kind: "code", title: h.title, kicker: h.kicker, body: box, notes: lead && k === 0 ? lead.notes : "", bi: lead && k === 0 ? lead.bi : null });
    });
  }

  /* ---------------------------------------------------------------- boxes */
  function admonition(C, n, blocks, i) {
    var cls = n.className, title = admTitle(n);
    if (isAnswer(n)) return;                       // an answer whose exercise was not recognised: left for the notes
    if (EXERCISE_RE.test(title) && !/box-exercises/.test(cls)) {
      flush(C);
      var ans = next(blocks, i, C);
      if (!isAnswer(ans)) ans = null; else C.used.add(ans);
      exerciseSlide(C, esc(title), admBody(n), ans);
      return;
    }
    if (/\bkind-verse\b|box-(shloka|sutra|verse|paliverse|prakritverse|upanishad)/.test(cls) || (/\bquote\b/.test(cls) && /[ऀ-ॿ]|[āīūṛṁḥśṣ]/.test(txt(n)) && nodeWords(n) < 120)) { flush(C); verseSlide(C, n, "verse"); return; }
    if (C.mode === "summary" && (/\babstract\b|\bsummary\b|\bsuccess\b|\bnote\b|\binfo\b/.test(cls))) {
      admBody(n).forEach(function (c) {
        if (c.nodeType !== 1) return;
        if (c.tagName === "UL" || c.tagName === "OL") summaryList(C, c);
        else if (c.tagName === "P") summaryText(C, c);
      });
      return;
    }
    if ((/\bexample\b/.test(cls) && EXAMPLE_RE.test(title)) || /box-(solvedproblem|example)\b/.test(cls)) { flush(C); exampleSlides(C, n); return; }
    if (/\bquote\b/.test(cls) || /kind-quote|epigraph/.test(cls)) { flush(C); verseSlide(C, n, "quote"); return; }
    calloutSlides(C, n);
  }
  function boxShell(n) {
    var cl = (n.className || "").split(/\s+/).filter(function (c) { return c && c !== "open"; });
    if (n.tagName === "DETAILS") cl.unshift("admonition");
    var b = el("div", cl.join(" ") + " sl-box");
    var t = admTitleEl(n);
    if (t) { var tt = el("p", "admonition-title"); each(t.childNodes, function (x) { tt.appendChild(importNode(x)); }); b.appendChild(tt); }
    return b;
  }
  /* the pieces of a box, paragraph by paragraph (long paragraphs condensed), for callouts */
  function condensed(nodes, keep) {
    var out = [];
    nodes.forEach(function (c) {
      if (c.nodeType === 3) { if (c.nodeValue.trim()) { var p0 = el("p"); p0.textContent = c.nodeValue.trim(); out.push({ node: p0, w: nodeWords(p0) }); } return; }
      var tag = c.tagName;
      if (tag === "P" && !keep) {
        var pts = keyPoints(c, 1);
        pts.forEach(function (pt) { var p = el("p"); p.appendChild(pt.frag); out.push({ node: p, w: pt.w, src: c }); });
      } else if (tag === "UL" || tag === "OL") {
        // each item a piece of its own, so that a long list can go on over several slides
        var items = [];
        if (keep) each(c.children, function (li) { var f = frag(); each(li.childNodes, function (x) { f.appendChild(importNode(x)); }); items.push({ node: f, w: nodeWords(li), level: 1 }); });
        else listItems(null, c, 1, items);
        items.forEach(function (it) {
          var li = el("li", it.level === 2 ? "sl-l2" : "");
          li.appendChild(it.node);
          out.push({ node: li, w: Math.max(2, it.w), list: tag.toLowerCase(), src: c });
        });
      } else out.push({ node: importNode(c), w: Math.max(8, nodeWords(c)), src: c });
    });
    return out;
  }
  /* pieces into a box: list items gathered again into their lists */
  function appendPieces(box, ch) {
    var list = null, src = null;
    ch.forEach(function (p) {
      if (p.list) {
        if (!list || src !== p.src) { list = el(p.list); src = p.src; box.appendChild(list); }
        list.appendChild(p.node);
      } else { list = null; box.appendChild(p.node); }
    });
  }
  function chunkPieces(pieces, maxW, maxN) {
    var chunks = [], cur = [], w = 0;
    pieces.forEach(function (p) {
      if (cur.length && (w + p.w > maxW || cur.length >= maxN)) { chunks.push(cur); cur = []; w = 0; }
      cur.push(p); w += p.w;
    });
    if (cur.length) chunks.push(cur);
    return chunks;
  }
  function calloutSlides(C, n) {
    var body = admBody(n), w = 0;
    body.forEach(function (c) { w += nodeWords(c); });
    var lead = null;
    if (w <= 60) lead = takeLead(C, 34, 2); else flush(C);
    var pieces = condensed(body, w <= 70);
    var chunks = chunkPieces(pieces, 70, 7);
    var h = heading(C);
    chunks.forEach(function (ch, k) {
      var box = boxShell(n);
      appendPieces(box, ch);
      var notes = htmlOf(body.filter(function (x) { return x.nodeType === 1; }));
      if (lead && k === 0) {
        var wrap = el("div", "sl-callwrap");
        wrap.appendChild(lead.el);
        wrap.appendChild(box);
        add(C, { kind: "callout", cls: "sl-has-lead", title: h.title, kicker: h.kicker, body: wrap, notes: lead.notes + notes, bi: lead.bi });
      } else add(C, { kind: "callout", kicker: context(C), body: box, notes: notes });
    });
  }
  function verseSlide(C, n, kind) {
    var c;
    if (n.classList.contains("admonition")) { c = boxShell(n); admBody(n).forEach(function (x) { c.appendChild(importNode(x)); }); }
    else c = importNode(n);
    var box = el("div", "sl-versebox");
    box.appendChild(c);
    var long = nodeWords(n) > 90 && kind === "quote";
    if (long) {
      var p = el("blockquote");
      keyPoints(n, 2).forEach(function (pt) { var q = el("p"); q.appendChild(pt.frag); p.appendChild(q); });
      box.innerHTML = "";
      box.appendChild(p);
    }
    add(C, { kind: kind, kicker: context(C), body: box, notes: long ? n.innerHTML : "" });
  }
  /* a worked example: its first piece, then the others one key press at a time */
  function exampleSlides(C, n) {
    var pieces = [];
    admBody(n).forEach(function (c) {
      if (c.nodeType === 3) return;
      var w = nodeWords(c);
      if (c.tagName === "P" && w > 50) {
        var ss = sentences(c), cur = [], cw = 0;
        ss.forEach(function (s) {
          var sw = nodeWords(s.frag);
          if (cur.length && cw + sw > 42) { var p = el("p"); p.appendChild(joinSentences(cur)); pieces.push({ node: p, w: cw }); cur = []; cw = 0; }
          cur.push(s); cw += sw;
        });
        if (cur.length) { var p2 = el("p"); p2.appendChild(joinSentences(cur)); pieces.push({ node: p2, w: cw }); }
      } else if (c.tagName === "DETAILS" || c.classList.contains("admonition")) {
        pieces.push({ node: boxShellWith(c), w: Math.max(10, w) });
      } else pieces.push({ node: importNode(c), w: c.classList.contains("arithmatex") ? 16 : Math.max(6, w) });
    });
    var chunks = chunkPieces(pieces, 100, 6);
    var title = admTitleEl(n) ? innerHtmlOf(admTitleEl(n)) : heading(C).title;
    chunks.forEach(function (ch, k) {
      var box = el("div", "sl-example");
      ch.forEach(function (p, j) {
        if (j > 0) { p.node.classList.add("sl-build"); p.node.setAttribute("data-step", String(j)); }
        box.appendChild(p.node);
      });
      add(C, { kind: "example", title: title + (k ? ' <span class="sl-cont">(continued)</span>' : ""), kicker: context(C), body: box, steps: ch.length - 1, notes: "" });
    });
  }
  function boxShellWith(n) { var b = boxShell(n); admBody(n).forEach(function (x) { b.appendChild(importNode(x)); }); return b; }

  /* ---------------------------------------------------------------- exercises */
  function exerciseStart(p) {
    var f = p.firstElementChild;
    return !!f && /^(STRONG|B)$/.test(f.tagName) && EXERCISE_RE.test(txt(f)) && txt(p).indexOf(txt(f)) === 0;
  }
  function exerciseFromParagraph(C, p, blocks, i) {
    var f = importNode(p), lab = f.firstElementChild, title = txt(lab).replace(/[.:]\s*$/, "");
    lab.parentNode.removeChild(lab);
    var parts = [f], k = i;
    for (;;) {
      var nx = next(blocks, k, C);
      if (!nx) break;
      if (nx.tagName === "UL" || nx.tagName === "OL") { parts.push(nx); C.used.add(nx); k = blocks.indexOf(nx); continue; }
      break;
    }
    var ans = next(blocks, k, C);
    if (isAnswer(ans)) C.used.add(ans); else ans = null;
    exerciseSlide(C, esc(title), parts, ans);
  }
  function exerciseSlide(C, titleHtml, parts, ans) {
    var box = el("div", "sl-ex"), q = el("div", "sl-q"), opts = null;
    parts.forEach(function (c) {
      if (c.nodeType !== 1 && !(c.nodeType === 3 && c.nodeValue.trim())) return;
      if (c.nodeType === 1 && (c.tagName === "UL" || c.tagName === "OL") && !opts) {
        opts = el("ol", "sl-opts");
        var lettered = true;
        each(c.children, function (li) { if (!/^\(?[A-Ha-h][.)]\s/.test(txt(li))) lettered = false; });
        if (lettered) opts.classList.add("sl-lettered");
        each(c.children, function (li) { var o = el("li"); each(li.childNodes, function (x) { o.appendChild(importNode(x)); }); opts.appendChild(o); });
        if (opts.children.length > 4 || [].some.call(opts.children, function (o) { return txt(o).length > 40; })) opts.classList.add("sl-opts-col");
        q.appendChild(opts);
      } else q.appendChild(c.nodeType === 1 ? importNode(c) : document.createTextNode(c.nodeValue));
    });
    box.appendChild(q);
    var steps = 0;
    var qw = nodeWords(q), aw = ans ? admBody(ans).reduce(function (s, x) { return s + nodeWords(x); }, 0) : 0;
    if (ans && qw + aw > 105) {
      // too much for one slide: the question, then the answer on a slide of its own
      add(C, { kind: "exercise", title: titleHtml, kicker: context(C), body: box, steps: 0, notes: htmlOf(admBody(ans)) });
      var a2 = el("div", "sl-ans");
      a2.appendChild(el("p", "sl-ans-lab", esc(admTitle(ans) || "Answer")));
      admBody(ans).forEach(function (x) { a2.appendChild(importNode(x)); });
      var box2 = el("div", "sl-ex");
      box2.appendChild(a2);
      add(C, { kind: "exercise", title: titleHtml + ' <span class="sl-cont">(answer)</span>', kicker: context(C), body: box2, steps: 0, notes: "" });
      return;
    }
    if (ans) {
      var a = el("div", "sl-ans sl-build");
      a.setAttribute("data-step", "1");
      a.appendChild(el("p", "sl-ans-lab", esc(admTitle(ans) || "Answer")));
      admBody(ans).forEach(function (x) { a.appendChild(importNode(x)); });
      box.appendChild(a);
      steps = 1;
      if (opts) markRightOption(opts, ans);
    }
    add(C, { kind: "exercise", title: titleHtml, kicker: context(C), body: box, steps: steps, notes: ans ? htmlOf(admBody(ans)) : "" });
  }
  function markRightOption(opts, ans) {
    var at = admBody(ans).map(function (x) { return x.textContent; }).join(" "), t = norm(at);
    var m = /^\(?([A-Ha-h])[.)]?(\s|$)/.exec(t), pick = -1, items = opts.children;
    if (m) pick = m[1].toUpperCase().charCodeAt(0) - 65;
    if (pick < 0) {
      var strong = null;
      admBody(ans).some(function (x) { if (x.nodeType === 1) { strong = x.querySelector("strong, b"); } return !!strong; });
      var key = strong ? txt(strong).toLowerCase().replace(/[.:]$/, "") : t.toLowerCase(), best = 0;
      each(items, function (o, k) {
        var ot = txt(o).toLowerCase().replace(/[.:]$/, "");
        if (ot && (key === ot || (key.indexOf(ot) === 0 && /^[\s.,:;]|^$/.test(key.slice(ot.length)))) && ot.length > best) { best = ot.length; pick = k; }
      });
    }
    if (pick >= 0 && items[pick]) { items[pick].classList.add("sl-mark"); items[pick].setAttribute("data-step", "1"); }
  }

  /* ---------------------------------------------------------------- summary, reading, authored */
  function summaryText(C, p) { keyPoints(p, 2).forEach(function (pt, k) { C.M.summary.push(bullet(pt.frag, pt.w, 1, k ? null : p)); }); }
  function summaryList(C, list) {
    if (list.tagName === "DL") { var keep = C.buf; C.buf = []; defList(C, list); C.buf.forEach(function (it) { C.M.summary.push(it); }); C.buf = keep; return; }
    listItems(C, list, 1, C.M.summary);
  }
  function readingBlock(C, n) {
    if (C.readingDone) return;
    var items = [];
    if (n.tagName === "UL" || n.tagName === "OL") each(n.children, function (li) { items.push(li); });
    else if (n.tagName === "P" || n.classList.contains("csl-entry")) items.push(n);
    else return;
    var list = C.readingList;
    if (!list) {
      list = C.readingList = el("ul", "sl-bullets sl-reading");
      add(C, { kind: "bullets", cls: "sl-k-reading", title: C.sec.html, kicker: esc(C.M.head.label), body: list, notes: "" });
    }
    items.forEach(function (it) {
      if (list.children.length >= 6) { C.readingDone = true; return; }
      var li = el("li");
      each(it.childNodes, function (x) { li.appendChild(importNode(x)); });
      list.appendChild(li);
    });
  }
  function authoredSlide(M, n, C) {
    var c = importNode(n);
    c.removeAttribute("hidden");
    var notesEl = c.querySelector(".pk-slide-notes"), notes = "";
    if (notesEl) { notes = notesEl.innerHTML; notesEl.parentNode.removeChild(notesEl); }
    var body = el("div", "sl-authored");
    while (c.firstChild) body.appendChild(c.firstChild);
    var title = n.getAttribute("data-title") || "";
    var s = { kind: "authored", title: esc(title), kicker: C ? context(C) : esc(M.head.label), body: body, notes: notes };
    if (C) add(C, s);
    else { s.bi = -1; s.sec = -1; M.slides.push(s); }
  }
  /* <!-- slide: Title --> ... the blocks up to the next marker, <!-- /slide --> or heading, as written */
  function authoredGroup(C, blocks, i) {
    flush(C);
    var m = /^\s*slide\s*:?\s*([\s\S]*?)\s*$/i.exec(blocks[i].nodeValue);
    var title = m && m[1] ? esc(m[1]) : heading(C).title;
    var body = el("div", "sl-authored"), notes = [], k = i + 1;
    for (; k < blocks.length; k++) {
      var n = blocks[k];
      if (n.nodeType === 8) { if (/^\s*\/\s*slide\b/i.test(n.nodeValue)) k++; break; }
      if (/^H[1-3]$/.test(n.tagName) || n.classList.contains("pk-slide") || n.classList.contains("pk-slides")) break;
      body.appendChild(importNode(n));
      notes.push(n);
    }
    add(C, { kind: "authored", title: title, kicker: context(C), body: body, notes: "" });
    return k - 1;
  }

  /* ---------------------------------------------------------------- title, contents, closing */
  function titleSlide(M) {
    var info = M.info, h = M.head;
    var notes = (h.label ? h.label + ": " : "") + esc(h.text) + (info.title ? " — " + esc(info.title) : "") + (h.subtitle ? ". " + h.subtitle : "");
    M.slides.push({ kind: "title", title: h.html, titleText: h.text, label: h.label, subtitle: h.subtitle || "", book: info.title || "", author: info.author || "", gen: info.gen || "", cover: info.cover || null, notes: notes, bi: 0, sec: -1 });
  }
  function agendaSlide(M, secs) {
    var ol = el("ol", "sl-agenda" + (secs.length > 6 ? " sl-agenda-2" : ""));
    secs.forEach(function (s) {
      var li = el("li");
      li.innerHTML = (s.num ? '<span class="sl-agn">' + esc(s.num) + "</span>" : "") + '<span class="sl-agt">' + s.html + "</span>";
      ol.appendChild(li);
    });
    M.slides.push({ kind: "agenda", title: "In this chapter", kicker: esc(M.head.label), body: ol, notes: "", bi: 0, sec: -1 });
  }
  function closingSlides(M) {
    var items = M.summary, title = M.summaryTitle ? M.summaryTitle.replace(/^\s*(?:[A-Z]\.)?\d+(?:\.\d+)*\.?\s+/, "") : "";
    var chunks = items.length ? pack(items) : [];
    if (chunks.length > 2) {
      // a long summary: its main points on two slides, the rest in the notes
      var main = items.filter(function (it) { return it.level === 1 && it.t === "b"; });
      chunks = pack(main.slice(0, 2 * MAX_BULLETS));
      if (chunks.length > 2) chunks = chunks.slice(0, 2);
    }
    if (!chunks.length) {
      // without a summary: the sections of the chapter
      var ul = el("ul", "sl-bullets sl-recap"), n = 0;
      M.sections.forEach(function (s) {
        if (s.mode === "reading" || n >= 8) return;
        n++;
        var li = el("li");
        li.innerHTML = s.html;
        ul.appendChild(li);
      });
      chunks = [[]];
      chunks.recap = ul;
      title = "In this chapter";
    }
    var nextTitle = pageTitleAfter(M.info, M.url) || "";
    chunks.forEach(function (ch, k) {
      var body = el("div", "sl-closing"), ul = chunks.recap || el("ul", "sl-bullets"), notes = [];
      if (!chunks.recap) ch.forEach(function (it) {
        var li = el("li", it.t === "eq" ? "sl-li-eq" : (it.level === 2 ? "sl-l2" : ""));
        li.appendChild(it.node);
        ul.appendChild(li);
        if (it.notes) notes.push(it.notes);
      });
      if (ul.children.length) body.appendChild(ul);
      var last = k === chunks.length - 1;
      if (last) {
        var nx = el("div", "sl-next");
        if (M.next) nx.innerHTML = '<button type="button" class="sl-nextbtn" data-act="nextch"><span class="sl-next-k">Next</span><span class="sl-next-t">' + esc(nextTitle || "The next chapter") + '</span>' + ICON.next + "</button>";
        else nx.innerHTML = '<p class="sl-end-note">End of the book</p>';
        body.appendChild(nx);
      }
      M.slides.push({ kind: "closing", title: title || "Summary", kicker: esc(M.head.label || ""), body: body, notes: htmlOf(notes), bi: 1e9, sec: M.sections.length - 1 });
    });
  }

  /* ================================================================ rendering */
  function slideEl(M, s, k, n) {
    var sec = el("section", "sl-slide sl-k-" + s.kind + (s.cls ? " " + s.cls : ""));
    sec.setAttribute("role", "group");
    sec.setAttribute("aria-roledescription", "slide");
    var tt = s.titleText || norm(el("div", null, s.title || "").textContent) || norm(el("div", null, s.kicker || "").textContent);
    sec.setAttribute("aria-label", (k + 1) + " of " + n + (tt ? ": " + tt : ""));
    s.name = tt;
    var inner = el("div", "sl-in");
    var info = M.info || {};
    if (s.kind === "title") {
      if (s.cover && s.cover.bg) {
        sec.style.setProperty("--sl-cv-bg", s.cover.bg);
        if (s.cover.fg) sec.style.setProperty("--sl-cv-fg", s.cover.fg);
        if (s.cover.accent) sec.style.setProperty("--sl-cv-accent", s.cover.accent);
        sec.classList.add("sl-has-cover");
      }
      var logo = document.querySelector(".md-header__button.md-logo img, .md-logo img");
      var site = (document.querySelector('meta[name="application-name"]') || {}).content || "";
      inner.innerHTML =
        '<div class="sl-mark">' + (logo ? '<img src="' + esc(logo.src) + '" alt="">' : "") + '<span>' + esc(site) + "</span></div>" +
        '<div class="sl-tmain">' +
          (s.book ? '<p class="sl-tbook">' + esc(s.book) + "</p>" : "") +
          (s.label ? '<p class="sl-tlabel">' + esc(s.label) + "</p>" : "") +
          '<h1 class="sl-ttitle">' + s.title + "</h1>" +
          (s.subtitle ? '<p class="sl-tsub">' + s.subtitle + "</p>" : "") +
        "</div>" +
        (s.author ? '<p class="sl-tauthor">' + esc(s.author) + (s.gen ? '<span class="sl-tgen">' + esc(s.gen) + "</span>" : "") + "</p>" : "");
    } else if (s.kind === "section") {
      inner.innerHTML = (s.num ? '<p class="sl-snum">' + esc(s.num) + "</p>" : "") + '<h2 class="sl-stitle">' + s.title + "</h2>" +
        (s.subs && s.subs.length ? '<ul class="sl-ssubs">' + s.subs.slice(0, 6).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "");
    } else {
      var head = el("header", "sl-head");
      if (s.kicker) head.appendChild(el("p", "sl-kicker", s.kicker));
      if (s.title) head.appendChild(el("h2", "sl-title", s.title));
      if (s.kicker || s.title) inner.appendChild(head);
      var body = el("div", "sl-body md-typeset");
      if (s.body) body.appendChild(s.body);
      stripCites(body);
      tameLinks(body);
      inner.appendChild(body);
    }
    if (s.kind !== "title") {
      var foot = el("footer", "sl-foot");
      foot.innerHTML = '<span class="sl-foot-t">' + esc([info.title, M.head.label || M.head.text].filter(Boolean).join(" · ")) + '</span><span class="sl-foot-n">' + (k + 1) + "</span>";
      inner.appendChild(foot);
    }
    sec.appendChild(inner);
    sec.hidden = true;
    s.el = sec;
    return sec;
  }
  function stepsOf(s) { return s.steps || 0; }

  /* fitting: the text is made smaller, step by step, until the slide holds it; what still does not fit is zoomed */
  function overflows(b) { return b.scrollHeight > b.clientHeight + 2 || b.scrollWidth > b.clientWidth + 2; }
  function fit(s, force) {
    var sec = s.el;
    if (!sec || (s.fitted && !force)) return;
    var body = sec.querySelector(".sl-body");
    s.fitted = true;
    if (!body || s.kind === "viz" || s.kind === "steps" || s.kind === "video") return;    // these are sized by the slide
    var wasHidden = sec.hidden;
    sec.hidden = false;
    sec.classList.add("sl-measure");
    body.style.removeProperty("--sl-fs");
    var inner = body.firstElementChild;
    if (inner) inner.style.zoom = "";
    var f = 1;
    while (overflows(body) && f > 0.64) { f = Math.round((f - 0.06) * 100) / 100; body.style.setProperty("--sl-fs", String(f)); }
    if (overflows(body) && inner) {
      var z = Math.min(body.clientWidth / Math.max(1, body.scrollWidth), body.clientHeight / Math.max(1, body.scrollHeight));
      inner.style.zoom = String(Math.max(0.4, Math.floor(z * 98) / 100));
      for (var t = 0; t < 4 && overflows(body); t++) inner.style.zoom = String(Math.max(0.4, (parseFloat(inner.style.zoom) || 1) * 0.92));
    }
    sec.classList.remove("sl-measure");
    sec.hidden = wasHidden;
  }

  /* ================================================================ presenting */
  var D = null;            // the open presentation
  var ignorePop = false;

  function portalStyle() {
    var v = "";
    try { v = getComputedStyle(document.documentElement).getPropertyValue("--pk-display") || ""; } catch (e) { v = ""; }
    return /(^|[\s,"'])serif\b/i.test(v) ? "classic" : "modern";
  }
  function themeName() { var t = sget(KEY_THEME); return THEMES.indexOf(t) >= 0 ? t : "portal"; }
  function applyTheme(root, t) {
    var portal = portalStyle();
    root.setAttribute("data-portal", portal);
    root.setAttribute("data-theme", t === "portal" ? portal : t);
    root.setAttribute("data-md-color-scheme", t === "dark" ? "slate" : "default");
  }
  function sid() { return Math.random().toString(36).slice(2, 10); }
  function fsElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }

  function buildRoot(speaker) {
    var root = el("div", "sl-root" + (speaker ? " sl-speaker" : ""));
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-roledescription", speaker ? "speaker view" : "presentation");
    root.setAttribute("aria-label", speaker ? "Speaker view" : "Presentation");
    root.setAttribute("tabindex", "-1");
    applyTheme(root, themeName());
    if (speaker) {
      root.innerHTML =
        '<div class="sl-sp">' +
          '<header class="sl-sp-top">' +
            '<span class="sl-sp-timer" role="timer" aria-label="Time presenting">00:00</span>' +
            '<button type="button" class="sl-btn" data-act="timer" aria-label="Pause the timer" title="Pause or start the timer">' + ICON.pause + "</button>" +
            '<button type="button" class="sl-btn" data-act="reset" aria-label="Start the timer again" title="Start the timer again">' + ICON.reset + "</button>" +
            '<span class="sl-sp-clock" aria-label="Time of day"></span>' +
            '<span class="sl-sp-count" aria-live="polite"></span>' +
            '<span class="sl-sp-state"></span>' +
            '<span class="sl-sp-gap"></span>' +
            '<button type="button" class="sl-btn" data-act="prev" aria-label="Previous">' + ICON.prev + "</button>" +
            '<button type="button" class="sl-btn" data-act="next" aria-label="Next">' + ICON.next + "</button>" +
            '<button type="button" class="sl-btn" data-act="blank" aria-label="Blank the screen (B)" title="Blank the screen (B)">' + ICON.blank + "</button>" +
          "</header>" +
          '<div class="sl-sp-main">' +
            '<div class="sl-sp-cur"><div class="sl-sp-frame"></div></div>' +
            '<div class="sl-sp-side">' +
              '<div class="sl-sp-next"><p class="sl-sp-lab">Next</p><div class="sl-sp-frame"></div></div>' +
              '<div class="sl-sp-notes"><p class="sl-sp-lab">Notes<span class="sl-sp-sz">' +
                '<button type="button" class="sl-btn" data-act="smaller" aria-label="Smaller notes">A−</button>' +
                '<button type="button" class="sl-btn" data-act="larger" aria-label="Larger notes">A+</button></span></p>' +
                '<div class="sl-sp-text md-typeset"></div></div>' +
            "</div>" +
          "</div>" +
          '<div class="sl-hold" aria-hidden="true"><div class="sl-stage"></div></div>' +
          '<div class="sl-loading" role="status"><span>Preparing the slides</span></div>' +
        "</div>";
    } else {
      root.innerHTML =
        '<div class="sl-view"><div class="sl-stage"></div></div>' +
        '<div class="sl-laser" aria-hidden="true" hidden></div>' +
        '<div class="sl-progress" aria-hidden="true"><i></i></div>' +
        '<div class="sl-bar" role="toolbar" aria-label="Presentation">' +
          '<button type="button" class="sl-btn" data-act="prev" aria-label="Previous (left arrow)" title="Previous">' + ICON.prev + "</button>" +
          '<span class="sl-count" aria-hidden="true"></span>' +
          '<button type="button" class="sl-btn" data-act="next" aria-label="Next (right arrow, space)" title="Next">' + ICON.next + "</button>" +
          '<span class="sl-where"></span>' +
          '<button type="button" class="sl-btn" data-act="overview" aria-label="All slides (O)" title="All slides (O)">' + ICON.grid + "</button>" +
          '<button type="button" class="sl-btn" data-act="speaker" aria-label="Speaker view (S)" title="Speaker view in a second window (S)">' + ICON.speaker + "</button>" +
          '<button type="button" class="sl-btn" data-act="laser" aria-label="Laser pointer (L)" aria-pressed="false" title="Laser pointer (L)">' + ICON.laser + "</button>" +
          '<button type="button" class="sl-btn" data-act="theme" aria-label="Theme (T)" title="Theme (T)">' + ICON.theme + "</button>" +
          '<button type="button" class="sl-btn" data-act="link" aria-label="Copy a link to this slide" title="Copy a link to this slide">' + ICON.link + "</button>" +
          '<button type="button" class="sl-btn" data-act="print" aria-label="Print or save as PDF" title="Print or save as PDF">' + ICON.print + "</button>" +
          '<button type="button" class="sl-btn sl-fsbtn" data-act="fs" aria-label="Full screen (F)" title="Full screen (F)">' + ICON.fs + "</button>" +
          '<button type="button" class="sl-btn" data-act="help" aria-label="Keyboard shortcuts (?)" title="Keyboard shortcuts (?)">' + ICON.help + "</button>" +
          '<button type="button" class="sl-btn" data-act="close" aria-label="Back to the book (Esc)" title="Back to the book (Esc)">' + ICON.close + "</button>" +
        "</div>" +
        '<div class="sl-blank" hidden></div>' +
        '<div class="sl-over" role="dialog" aria-label="All slides" hidden><div class="sl-over-head"><p class="sl-over-t">All slides</p><div class="sl-chips" role="navigation" aria-label="Sections"></div>' +
          '<button type="button" class="sl-btn" data-act="overview" aria-label="Close (O)">' + ICON.close + '</button></div><div class="sl-grid"></div></div>' +
        '<div class="sl-help" role="dialog" aria-label="Keyboard shortcuts" hidden></div>' +
        '<div class="sl-end" hidden></div>' +
        '<div class="sl-toast2" role="status" aria-live="polite"></div>' +
        '<div class="sl-live" aria-live="polite"></div>' +
        '<div class="sl-loading" role="status"><span>Preparing the slides</span></div>';
    }
    document.body.appendChild(root);
    return root;
  }

  function inert(on) {
    if (on) {
      D.inerted = [];
      each(document.body.children, function (c) {
        if (c === D.root || c.tagName === "SCRIPT" || c.inert || c.classList.contains("viz-overlay")) return;
        c.inert = true;
        c.setAttribute("aria-hidden", "true");
        D.inerted.push(c);
      });
    } else if (D && D.inerted) {
      D.inerted.forEach(function (c) { c.inert = false; c.removeAttribute("aria-hidden"); });
      D.inerted = [];
    }
  }

  function open(opts) {
    if (D) return;
    opts = opts || {};
    var speaker = !!opts.speaker;
    D = { opts: opts, speaker: speaker, i: 0, b: 0, sid: speaker ? opts.speaker : sid(), deck: null, url: String(opts.url).split("#")[0] };
    D.prevFocus = document.activeElement;
    D.root = buildRoot(speaker);
    D.stage = D.root.querySelector(".sl-stage");
    document.documentElement.classList.add("sl-open");
    inert(true);
    try { D.root.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    if (!speaker && !opts.quiet) {
      try { history.pushState({ bjpSlides: 1 }, "", location.href); D.pushed = true; } catch (e) { D.pushed = false; }
      if (opts.gesture && !fsElement() && !(window.matchMedia && window.matchMedia("(display-mode: fullscreen)").matches)) enterFs();
    }
    wire();
    if (window.BroadcastChannel) {
      try { D.chan = new BroadcastChannel("bjp-slides-" + D.sid); D.chan.onmessage = onChannel; } catch (e) { D.chan = null; }
    }
    if (speaker) startSpeaker();
    load(opts).then(function () {
      if (!D) return;
      var start = 0;
      if (opts.slide) start = clamp(opts.slide - 1, 0, D.slides.length - 1);
      else if (opts.at) start = slideAt(opts.at);
      D.root.querySelector(".sl-loading").hidden = true;
      if (speaker) { send({ t: "hello" }); spRender(); }
      else { go(start, 0, true); idleFit(); }
    }, function () {
      if (!D) return;
      var l = D.root.querySelector(".sl-loading span");
      l.textContent = navigator.onLine === false ? "This chapter is not available offline." : "The slides could not be made from this page.";
      setTimeout(function () { if (D && !D.slides) close(); }, 2600);
    });
  }

  function load(opts) {
    D.loading = true;
    return Promise.all([loadSource(opts), bookInfo(opts.url)]).then(function (r) {
      var src = r[0], info = r[1];
      var M = makeDeck(src, info);
      D.deck = M;
      D.url = src.url;
      D.slides = M.slides;
      D.stage.innerHTML = "";
      D.root.setAttribute("lang", M.lang || "en");
      D.root.setAttribute("aria-label", (D.speaker ? "Speaker view: " : "Presentation: ") + (M.head.label ? M.head.label + ": " : "") + M.head.text);
      M.slides.forEach(function (s, k) { D.stage.appendChild(slideEl(M, s, k, M.slides.length)); });
      buildChips();
      // the mathematics is typeset with all slides laid out (hidden), then the fonts and the sized pictures are waited for
      D.slides.forEach(function (s) { s.el.hidden = false; s.el.classList.add("sl-measure"); });
      var wait = Promise.resolve();
      if (window.bjpMath && window.bjpMath.pending([D.stage]).length) wait = timeout(window.bjpMath.typeset([D.stage]), 15000);
      return wait.then(function () {
        return document.fonts && document.fonts.ready ? timeout(document.fonts.ready, 1500) : null;
      }).then(function () {
        if (!D) return;
        D.slides.forEach(function (s) { s.el.classList.remove("sl-measure"); s.el.hidden = true; });
        D.loading = false;
        layout();
      });
    });
  }
  function slideAt(at) {
    var best = 0;
    D.slides.forEach(function (s, k) {
      if (s.kind === "title" || s.kind === "agenda" || s.kind === "closing") return;
      if (s.bi <= at.i) best = k;
    });
    return best;
  }
  function idleFit() {
    var k = 0;
    var ric = window.requestIdleCallback || function (fn) { return setTimeout(function () { fn({ timeRemaining: function () { return 8; } }); }, 30); };
    function work(dl) {
      if (!D || !D.slides) return;
      while (k < D.slides.length && dl.timeRemaining() > 4) { fit(D.slides[k]); k++; }
      if (k < D.slides.length) ric(work);
    }
    ric(work);
  }

  /* the stage is scaled to fit the window, letterboxed */
  function layout() {
    if (!D || D.speaker) { if (D && D.speaker) spLayout(); return; }
    var vw = window.innerWidth, vh = window.innerHeight;
    var s = Math.min(vw / W, vh / H);
    D.scale = s;
    D.stage.style.transform = "translate(" + Math.round((vw - W * s) / 2) + "px," + Math.round((vh - H * s) / 2) + "px) scale(" + s + ")";
  }

  function current() { return D && D.slides ? D.slides[D.i] : null; }
  function activate(s) {
    if (s.live) return;
    s.live = true;
    if ((s.kind === "viz" || s.kind === "steps" || s.kind === "mermaid" || s.kind === "video") && window.bjpViz) {
      try { window.bjpViz.scan(s.el); } catch (e) { /* ignore */ }
      if (s.kind === "mermaid") setTimeout(function () { s.fitted = false; fit(s); }, 900);
    }
  }
  function applyBuilds(s, b) {
    each(s.el.querySelectorAll(".sl-build, .sl-mark"), function (x) {
      var on = (parseInt(x.getAttribute("data-step"), 10) || 0) <= b;
      x.classList.toggle("is-on", on);
      if (x.classList.contains("sl-build")) { if (on) x.removeAttribute("aria-hidden"); else x.setAttribute("aria-hidden", "true"); }
    });
    if (s.kind === "steps") {
      var fig = s.el.querySelector("figure.fig-steps");
      if (fig && fig._steps) { fig._steps.pause(); fig._steps.go(b); }
    }
  }
  function go(i, b, first) {
    if (!D || !D.slides || !D.slides.length) return;
    i = clamp(i, 0, D.slides.length - 1);
    var s = D.slides[i];
    b = clamp(b, 0, stepsOf(s));
    var old = D.slides[D.i];
    if (old && (old !== s || first)) { old.el.hidden = true; old.el.classList.remove("is-current"); pauseMedia(old); }
    D.i = i; D.b = b;
    activate(s);
    fit(s);
    s.el.hidden = false;
    s.el.classList.add("is-current");
    if (old !== s && !reduced()) { s.el.classList.remove("sl-enter"); void s.el.offsetWidth; s.el.classList.add("sl-enter"); }
    activate(s);
    applyBuilds(s, b);
    if (D.slides[i + 1]) fit(D.slides[i + 1]);
    hideEnd();
    updateUI();
    send({ t: "state", url: D.url, i: D.i, b: D.b, n: D.slides.length, blank: !!D.blank });
  }
  function pauseMedia(s) {
    each(s.el.querySelectorAll("video"), function (v) { try { v.pause(); } catch (e) { /* ignore */ } });
    var fig = s.el.querySelector("figure.fig-steps");
    if (fig && fig._steps) fig._steps.pause();
  }
  function nextStep() {
    if (!D || !D.slides) return;
    if (D.endShown) { if (D.deck.next) nextChapter(); return; }
    var s = current();
    if (D.b < stepsOf(s)) go(D.i, D.b + 1);
    else if (D.i < D.slides.length - 1) go(D.i + 1, 0);
    else showEnd();
  }
  function prevStep() {
    if (!D || !D.slides) return;
    if (D.endShown) { hideEnd(); return; }
    if (D.b > 0) go(D.i, D.b - 1);
    else if (D.i > 0) go(D.i - 1, stepsOf(D.slides[D.i - 1]));
  }
  function updateUI() {
    var n = D.slides.length, s = current();
    var c = D.root.querySelector(".sl-count");
    if (c) c.textContent = (D.i + 1) + " / " + n;
    var p = D.root.querySelector(".sl-progress i");
    if (p) p.style.width = (n > 1 ? (D.i / (n - 1)) * 100 : 100) + "%";
    var w = D.root.querySelector(".sl-where");
    if (w) {
      var sec = s.sec >= 0 ? D.deck.sections[s.sec] : null;
      w.innerHTML = sec ? (sec.num ? esc(sec.num) + " " : "") + sec.html : esc(D.deck.head.text);
    }
    var live = D.root.querySelector(".sl-live");
    if (live && D.lastAnnounced !== D.i) { live.textContent = "Slide " + (D.i + 1) + " of " + n + (s.name ? ": " + s.name : ""); D.lastAnnounced = D.i; }
  }

  /* the end of the deck: the next chapter, or back to the book */
  function showEnd() {
    var e = D.root.querySelector(".sl-end");
    if (!e) return;
    var nt = pageTitleAfter(D.deck.info, D.url);
    e.innerHTML = '<div class="sl-end-in"><p class="sl-end-t">End of ' + esc(D.deck.head.label || "the chapter") + "</p>" +
      (D.deck.next ? '<button type="button" class="sl-nextbtn" data-act="nextch"><span class="sl-next-k">Next</span><span class="sl-next-t">' + esc(nt || "The next chapter") + "</span>" + ICON.next + "</button>" : "") +
      '<p class="sl-end-h">' + (D.deck.next ? "Press → for the next chapter, " : "") + "Esc to return to the book</p></div>";
    e.hidden = false;
    D.endShown = true;
  }
  function hideEnd() { var e = D && D.root.querySelector(".sl-end"); if (e) e.hidden = true; if (D) D.endShown = false; }
  function nextChapter() {
    if (!D || !D.deck.next || D.loading) return;
    var url = D.deck.next;
    hideEnd();
    D.root.querySelector(".sl-loading").hidden = false;
    D.root.querySelector(".sl-loading span").textContent = "Preparing the slides";
    load({ url: url }).then(function () {
      if (!D) return;
      D.root.querySelector(".sl-loading").hidden = true;
      D.i = 0;
      go(0, 0, true);
      idleFit();
    }, function () {
      if (!D) return;
      D.root.querySelector(".sl-loading span").textContent = navigator.onLine === false ? "The next chapter is not available offline." : "The next chapter could not be loaded.";
    });
  }

  /* ---------------------------------------------------------------- input */
  function onAct(act, btn) {
    if (act === "prev") prevStep();
    else if (act === "next") nextStep();
    else if (act === "overview") toggleOverview();
    else if (act === "speaker") openSpeaker();
    else if (act === "laser") toggleLaser();
    else if (act === "theme") cycleTheme();
    else if (act === "link") copyLink();
    else if (act === "print") printDeck();
    else if (act === "fs") toggleFs();
    else if (act === "help") toggleHelp();
    else if (act === "close") close();
    else if (act === "nextch") nextChapter();
    else if (act === "go") { toggleOverview(false); go(parseInt(btn.getAttribute("data-i"), 10) || 0, 0); }
    else if (act === "blank") toggleBlank();
  }
  function wire() {
    var root = D.root;
    root.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("[data-act]") : null;
      if (b && root.contains(b)) { e.preventDefault(); onAct(b.getAttribute("data-act"), b); showBar(); }
    });
    if (D.speaker) return;
    var view = root.querySelector(".sl-view");
    var down = null;
    view.addEventListener("pointerdown", function (e) { down = { x: e.clientX, y: e.clientY, t: Date.now(), type: e.pointerType }; }, { passive: true });
    view.addEventListener("pointerup", function (e) {
      if (!down) return;
      var dx = e.clientX - down.x, dy = e.clientY - down.y, d = down;
      down = null;
      if (interactive(e.target)) return;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) { if (dx < 0) nextStep(); else prevStep(); return; }
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8 || Date.now() - d.t > 700) return;
      var sel = window.getSelection && String(window.getSelection());
      if (sel) return;
      var x = e.clientX / window.innerWidth;
      if (d.type === "touch" && x > 0.3 && x < 0.7) { toggleBar(); return; }
      if (x < 0.3) prevStep(); else nextStep();
    });
    root.addEventListener("pointermove", function (e) { if (e.pointerType === "mouse") showBar(); moveLaser(e); }, { passive: true });
    root.addEventListener("wheel", function (e) {
      if (!D || D.overview || interactive(e.target)) return;
      var now = Date.now();
      if (Math.abs(e.deltaY) < 30 || now - (D.wheelAt || 0) < 550) return;
      D.wheelAt = now;
      if (e.deltaY > 0) nextStep(); else prevStep();
    }, { passive: true });
  }
  function interactive(t) {
    return !!(t && t.closest && t.closest("a, button, input, select, textarea, video, iframe, summary, details, .viz-box, .steps-bar, .viz-tools, .sl-bar, [contenteditable]"));
  }
  function showBar() {
    if (!D || D.speaker) return;
    D.root.classList.add("sl-bar-on");
    clearTimeout(D.barT);
    D.barT = setTimeout(function () { if (D && !D.root.querySelector(".sl-bar:hover, .sl-bar:focus-within")) D.root.classList.remove("sl-bar-on"); }, 2600);
  }
  function toggleBar() { if (D.root.classList.contains("sl-bar-on")) D.root.classList.remove("sl-bar-on"); else showBar(); }

  function onKey(e) {
    if (!D) return;
    if (D.speaker) { spKey(e); return; }
    var k = e.key;
    if (document.querySelector(".viz-overlay")) return;          // the full-screen visualization has the keys
    if (e.defaultPrevented) { e.stopPropagation(); return; }     // a step-through figure took the arrow key
    if (e.ctrlKey || e.metaKey) {
      if (k === "p" || k === "P") { e.preventDefault(); e.stopPropagation(); printDeck(); }
      return;
    }
    if (e.altKey) return;
    var a = document.activeElement, tag = a && a.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") { if (k === "Escape") a.blur(); e.stopPropagation(); return; }
    var handled = true;
    if (D.overview) {
      if (k === "Escape" || k === "o" || k === "O") toggleOverview(false);
      else if (/^Arrow/.test(k) || k === "Home" || k === "End") overviewMove(k);
      else handled = k === "Enter" || k === " " || k === "Tab";
      if (k === "Enter" || k === " ") handled = false;
      if (handled && k !== "Tab") e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (D.help && (k === "Escape" || k === "?" || k === "h" || k === "H")) { toggleHelp(); e.preventDefault(); e.stopPropagation(); return; }
    var onBtn = tag === "BUTTON" || tag === "A" || tag === "SUMMARY";
    if (/^\d$/.test(k)) { D.typed = (D.typed || "") + k; clearTimeout(D.typedT); D.typedT = setTimeout(function () { if (D) D.typed = ""; }, 1500); e.preventDefault(); e.stopPropagation(); return; }
    switch (k) {
      case "ArrowRight": case "ArrowDown": case "PageDown": case "n": case "N": nextStep(); break;
      case "ArrowLeft": case "ArrowUp": case "PageUp": case "Backspace": prevStep(); break;
      case " ": case "Spacebar": if (onBtn) { handled = false; break; } if (e.shiftKey) prevStep(); else nextStep(); break;
      case "Enter":
        if (D.typed) { go(parseInt(D.typed, 10) - 1, 0); D.typed = ""; }
        else if (onBtn) handled = false;
        else nextStep();
        break;
      case "Home": go(0, 0); break;
      case "End": go(D.slides.length - 1, 0); break;
      case "Escape": case "Esc":
        if (D.laser) toggleLaser();
        else if (D.blank) toggleBlank();
        else if (D.endShown) hideEnd();
        else close();
        break;
      case "o": case "O": case "g": case "G": toggleOverview(); break;
      case "s": case "S": openSpeaker(); break;
      case "b": case "B": case ".": toggleBlank("black"); break;
      case "w": case "W": case ",": toggleBlank("white"); break;
      case "l": case "L": toggleLaser(); break;
      case "t": case "T": cycleTheme(); break;
      case "f": case "F": toggleFs(); break;
      case "?": case "h": case "H": toggleHelp(); break;
      default: handled = false;
    }
    if (handled) { e.preventDefault(); e.stopPropagation(); }
    else if (!/^(Tab|Shift|Control|Alt|Meta)$/.test(k)) e.stopPropagation();   // the reader behind must not act on keys
  }

  /* ---------------------------------------------------------------- blank, laser, theme, full screen, link, print */
  function toggleBlank(kind) {
    var b = D.root.querySelector(".sl-blank");
    if (D.blank) { D.blank = null; b.hidden = true; }
    else { D.blank = kind || "black"; b.className = "sl-blank sl-blank-" + D.blank; b.hidden = false; }
    send({ t: "state", url: D.url, i: D.i, b: D.b, n: D.slides ? D.slides.length : 0, blank: !!D.blank });
  }
  function toggleLaser() {
    D.laser = !D.laser;
    D.root.classList.toggle("sl-lasering", D.laser);
    var l = D.root.querySelector(".sl-laser");
    if (l) l.hidden = !D.laser;
    var b = D.root.querySelector('[data-act="laser"]');
    if (b) b.setAttribute("aria-pressed", D.laser ? "true" : "false");
    toast(D.laser ? "Laser pointer on (L to turn off)" : "Laser pointer off");
  }
  function moveLaser(e) {
    if (!D || !D.laser) return;
    var l = D.root.querySelector(".sl-laser");
    l.style.transform = "translate(" + (e.clientX - 9) + "px," + (e.clientY - 9) + "px)";
  }
  function cycleTheme() {
    var t = THEMES[(THEMES.indexOf(themeName()) + 1) % THEMES.length];
    sset(KEY_THEME, t);
    applyTheme(D.root, t);
    D.slides.forEach(function (s) { s.fitted = false; });
    fit(current());
    toast("Theme: " + (t === "portal" ? "the library's own" : t));
    send({ t: "theme", theme: t });
  }
  function enterFs() {
    var e = document.documentElement, f = e.requestFullscreen || e.webkitRequestFullscreen;
    if (!f) return;
    try {
      var p = f.call(e);
      D.fsOurs = true;
      if (p && p.catch) p.catch(function () { if (D) D.fsOurs = false; });
    } catch (x) { D.fsOurs = false; }
  }
  function toggleFs() {
    if (fsElement()) {
      D.fsLeaving = true;
      try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) { D.fsLeaving = false; }
    } else enterFs();
  }
  function onFsChange() {
    if (!D) return;
    if (!fsElement()) {
      // Escape in full screen leaves full screen without a key event: it also ends the presentation
      if (D.fsOurs && !D.fsLeaving) { D.fsOurs = false; close(); return; }
      D.fsOurs = false;
    }
    D.fsLeaving = false;
    setTimeout(layout, 60);
  }
  function slideLink() {
    var u = new URL(D.url, location.href);
    u.search = "?slides=" + (D.i + 1);
    u.hash = "";
    return u.href;
  }
  function copyLink() {
    var link = slideLink();
    var done = function () { toast("Link to this slide copied"); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, function () { toast(link); });
    else toast(link);
  }
  function toast(t) {
    var e = D && D.root.querySelector(".sl-toast2");
    if (!e) return;
    e.textContent = t;
    e.classList.add("on");
    clearTimeout(D.toastT);
    D.toastT = setTimeout(function () { e.classList.remove("on"); }, 1800);
  }
  function printDeck() {
    if (!D || !D.slides) return;
    D.slides.forEach(function (s) { fit(s); activate(s); });
    document.documentElement.classList.add("sl-printing");
    D.slides.forEach(function (s) { s.el.hidden = false; applyBuilds(s, stepsOf(s)); });
    var after = function () {
      window.removeEventListener("afterprint", after);
      document.documentElement.classList.remove("sl-printing");
      if (!D) return;
      D.slides.forEach(function (s, k) { if (k !== D.i) s.el.hidden = true; });
      applyBuilds(current(), D.b);
    };
    window.addEventListener("afterprint", after);
    setTimeout(function () { window.print(); setTimeout(function () { if (document.documentElement.classList.contains("sl-printing") && !window.matchMedia("print").matches) after(); }, 1500); }, 50);
  }

  /* ---------------------------------------------------------------- help */
  function toggleHelp() {
    var h = D.root.querySelector(".sl-help");
    D.help = !D.help;
    if (D.help) {
      var rows = [["→  Space  PgDn", "Next (the next step of a slide first)"], ["←  PgUp", "Previous"], ["Home  End", "First or last slide"],
        ["12 Enter", "Go to slide 12"], ["O", "All slides, by section"], ["S", "Speaker view: notes, timer and the next slide"],
        ["B  W", "Black or white screen"], ["L", "Laser pointer"], ["T", "Theme: the library's own, light, dark"], ["F", "Full screen"],
        ["Ctrl+P", "Print, or save as PDF"], ["Esc", "Back to the book, at this place"]];
      h.innerHTML = '<div class="sl-help-in"><h2>Presenting</h2><dl>' + rows.map(function (r) {
        return "<dt>" + r[0].split("  ").map(function (x) { return "<kbd>" + esc(x) + "</kbd>"; }).join(" ") + "</dt><dd>" + esc(r[1]) + "</dd>";
      }).join("") + '</dl><p>Swipe or click the right of the slide for the next, the left for the previous. Inside an interactive figure the keys belong to the figure: click outside it to take them back.</p>' +
        '<button type="button" class="sl-btn sl-help-close" data-act="help" aria-label="Close">' + ICON.close + "</button></div>";
      h.hidden = false;
      try { h.querySelector(".sl-help-close").focus(); } catch (e) { /* ignore */ }
    } else { h.hidden = true; try { D.root.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }

  /* ---------------------------------------------------------------- overview */
  function buildChips() {
    var c = D.root.querySelector(".sl-chips");
    if (!c) return;
    c.innerHTML = D.deck.sections.map(function (s) {
      if (s.mode === "reading" || s.mode === "summary") return "";
      var k = -1;
      D.slides.forEach(function (x, j) { if (k < 0 && x.sec === D.deck.sections.indexOf(s)) k = j; });
      return k < 0 ? "" : '<button type="button" class="sl-chip" data-act="go" data-i="' + k + '">' + (s.num ? '<b>' + esc(s.num) + "</b> " : "") + s.html + "</button>";
    }).join("");
  }
  function thumb(s, k) {
    var b = el("button", "sl-thumb" + (k === D.i ? " is-current" : ""));
    b.type = "button";
    b.setAttribute("data-act", "go");
    b.setAttribute("data-i", String(k));
    b.setAttribute("aria-label", "Slide " + (k + 1) + (s.name ? ": " + s.name : ""));
    var box = el("span", "sl-thumb-box");
    var c = s.el.cloneNode(true);
    c.hidden = false;
    c.classList.remove("is-current", "sl-enter");
    c.classList.add("sl-clone");
    c.removeAttribute("role"); c.removeAttribute("aria-label"); c.removeAttribute("aria-roledescription");
    rm(c, "iframe, video");
    each(c.querySelectorAll(".sl-build, .sl-mark"), function (x) { x.classList.add("is-on"); });
    each(c.querySelectorAll(".viz-card"), function (x) { x.hidden = false; });
    box.appendChild(c);
    b.appendChild(box);
    b.appendChild(el("span", "sl-thumb-n", String(k + 1)));
    return b;
  }
  function toggleOverview(on) {
    var o = D.root.querySelector(".sl-over");
    if (!o) return;
    on = on === undefined ? !D.overview : on;
    if (on === !!D.overview) return;
    D.overview = on;
    if (on) {
      D.slides.forEach(function (s) { fit(s); });
      var g = o.querySelector(".sl-grid");
      g.innerHTML = "";
      var lastSec = -2;
      D.slides.forEach(function (s, k) {
        if (s.sec !== lastSec && s.sec >= 0 && s.kind === "section") {
          var sec = D.deck.sections[s.sec];
          g.appendChild(el("p", "sl-grid-h", (sec.num ? "<b>" + esc(sec.num) + "</b> " : "") + sec.html));
        }
        lastSec = s.sec;
        g.appendChild(thumb(s, k));
      });
      o.hidden = false;
      var cur = g.querySelector(".sl-thumb.is-current");
      if (cur) { cur.scrollIntoView({ block: "center" }); try { cur.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    } else {
      o.hidden = true;
      o.querySelector(".sl-grid").innerHTML = "";
      try { D.root.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
  }
  function overviewMove(k) {
    var items = [].slice.call(D.root.querySelectorAll(".sl-thumb"));
    if (!items.length) return;
    var i = items.indexOf(document.activeElement);
    if (i < 0) i = D.i;
    var cols = 1, top0 = items[0].offsetTop;
    for (var j = 1; j < items.length && items[j].offsetTop === top0; j++) cols++;
    if (k === "ArrowRight") i++;
    else if (k === "ArrowLeft") i--;
    else if (k === "ArrowDown") i += cols;
    else if (k === "ArrowUp") i -= cols;
    else if (k === "Home") i = 0;
    else if (k === "End") i = items.length - 1;
    i = clamp(i, 0, items.length - 1);
    items[i].focus();
    items[i].scrollIntoView({ block: "nearest" });
  }

  /* ---------------------------------------------------------------- closing and returning to the book */
  function findBlock(container, ref) {
    if (!container || !ref) return null;
    var kids = container.children, i;
    function ok(n) { return n && n.tagName === ref.tag && norm(n.textContent).slice(0, 60) === ref.text; }
    if (ok(kids[ref.i])) return kids[ref.i];
    for (i = 0; i < kids.length; i++) if (ok(kids[i])) return kids[i];
    if (ref.id) { var h = container.querySelector('[id="' + ref.id.replace(/"/g, '\\"') + '"]'); if (h) return h; }
    return null;
  }
  function refOfSlide(s) {
    if (!D.deck || !s || s.bi == null || s.bi < 0) return null;
    var blocks = D.deck.blocksRef;
    return blocks ? blocks(s.bi) : null;
  }
  function close(opts) {
    if (!D) return;
    opts = opts || {};
    var d = D, s = current(), ref = null;
    if (d.deck && s && s.kind !== "title" && s.kind !== "agenda" && s.bi != null && s.bi >= 0 && s.bi < 1e8) ref = d.deck.refAt ? d.deck.refAt(s.bi) : null;
    if (s && s.kind === "closing") ref = { end: true };
    send({ t: "bye" });
    if (d.chan) { try { d.chan.close(); } catch (e) { /* ignore */ } }
    clearInterval(d.clockT);
    inert(false);
    D = null;
    if (d.root.parentNode) d.root.parentNode.removeChild(d.root);
    document.documentElement.classList.remove("sl-open", "sl-printing");
    if (d.fsOurs && fsElement()) { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) { /* ignore */ } }
    if (d.speaker) { try { window.close(); } catch (e) { /* ignore */ } return; }
    if (d.opts.quiet) return;                     // opened by a script (a check of the decks): nothing to return to
    var from = d.opts.from, url = d.url, here = location.href.split("#")[0].split("?")[0];
    var R = window.bjpReader, RS = R && R.state;
    function back() {
      if (from === "reader" && RS && RS.open) {
        if (RS.url && RS.url.split("#")[0] === url) placeReader(ref);
        else {
          try { sessionStorage.setItem("bjp.reader.open", "1"); } catch (e) { /* ignore */ }
          location.assign(url + (ref && ref.id ? "#" + ref.id : ""));
          return;
        }
        var fl = RS.root && RS.root.querySelector(".rd-flow");
        try { if (fl) fl.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
        return;
      }
      if (url !== here) { location.assign(url + (ref && ref.id ? "#" + ref.id : "")); return; }
      if (/[?&]slides=/.test(location.search)) { try { history.replaceState(history.state, "", here + location.hash); } catch (e) { /* ignore */ } }
      placePage(ref);
      if (d.prevFocus && d.prevFocus.focus && d.prevFocus.isConnected) { try { d.prevFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    }
    if (d.pushed && !opts.fromPop) {
      ignorePop = back;
      try { history.back(); } catch (e) { ignorePop = false; back(); }
    } else back();
  }
  function placeReader(ref) {
    var R = window.bjpReader, S = R && R.state;
    if (!S || !ref) return;
    var flow = S.root && S.root.querySelector(".rd-flow");
    if (ref.end) { R.goto(S.n - 1); return; }
    var t = findBlock(flow, ref);
    if (!t || !S.stride) return;
    var r = t.getClientRects();
    if (!r.length) return;
    var fr = flow.getBoundingClientRect();
    R.goto(Math.floor((r[0].left - fr.left + 2) / S.stride));
  }
  function placePage(ref) {
    if (!ref) return;
    var art = document.querySelector("article.md-content__inner");
    if (ref.end) { window.scrollTo(0, document.documentElement.scrollHeight); return; }
    var t = findBlock(art, ref);
    if (!t) return;
    var y = t.getBoundingClientRect().top + (window.scrollY || 0) - 76;
    window.scrollTo(0, Math.max(0, y));
  }
  function onPop() {
    if (ignorePop) { var f = ignorePop; ignorePop = false; if (typeof f === "function") setTimeout(f, 0); return true; }
    if (D && !D.speaker) { close({ fromPop: true }); return true; }
    return false;
  }

  /* ---------------------------------------------------------------- speaker view */
  function send(m) { if (D && D.chan) { m.sid = D.sid; try { D.chan.postMessage(m); } catch (e) { /* ignore */ } } }
  function onChannel(e) {
    var m = e.data || {};
    if (!D || m.sid !== D.sid) return;
    if (!D.speaker) {
      if (m.t === "hello") send({ t: "state", url: D.url, i: D.i, b: D.b, n: D.slides ? D.slides.length : 0, blank: !!D.blank, theme: themeName() });
      else if (m.t === "next") nextStep();
      else if (m.t === "prev") prevStep();
      else if (m.t === "go") go(m.i, m.b || 0);
      else if (m.t === "blank") toggleBlank("black");
      return;
    }
    if (m.t === "state") {
      D.remote = m;
      D.root.querySelector(".sl-sp-state").textContent = m.blank ? "The screen is blank" : "";
      if (m.theme) applyTheme(D.root, m.theme);
      if (m.url && m.url !== D.url && !D.loading) {
        D.root.querySelector(".sl-loading").hidden = false;
        load({ url: m.url }).then(function () { if (D) { D.root.querySelector(".sl-loading").hidden = true; spRender(); } });
        return;
      }
      if (!D.loading) spRender();
      if (!D.timerStarted) { D.timerStarted = true; D.t0 = Date.now(); D.running = true; }
    } else if (m.t === "theme") applyTheme(D.root, m.theme);
    else if (m.t === "bye") {
      D.root.querySelector(".sl-sp-state").textContent = "The presentation was closed";
    }
  }
  function openSpeaker() {
    if (!window.BroadcastChannel || !D.chan) { toast("The speaker view needs a newer browser."); return; }
    var u = D.url + "#slides-speaker-" + D.sid;
    var w = null;
    try { w = window.open(u, "bjp-speaker-" + D.sid, "popup=yes,width=1200,height=760"); } catch (e) { w = null; }
    if (!w) toast("Allow pop-up windows for this site to open the speaker view.");
  }
  function startSpeaker() {
    D.t0 = Date.now(); D.running = false; D.elapsed = 0;
    D.notesSize = parseFloat(sget(KEY_NOTES)) || 1;
    D.clockT = setInterval(spClock, 500);
    spClock();
    window.addEventListener("beforeunload", function () { /* nothing to keep */ });
  }
  function spClock() {
    if (!D) return;
    var now = new Date(), ms = D.running ? D.elapsed + (Date.now() - D.t0) : D.elapsed;
    var sec = Math.floor(ms / 1000), h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
    var t = (h ? h + ":" : "") + ("0" + m).slice(-2) + ":" + ("0" + s).slice(-2);
    D.root.querySelector(".sl-sp-timer").textContent = t;
    D.root.querySelector(".sl-sp-clock").textContent = ("0" + now.getHours()).slice(-2) + ":" + ("0" + now.getMinutes()).slice(-2);
  }
  function spTimer(act) {
    if (act === "reset") { D.elapsed = 0; D.t0 = Date.now(); D.timerStarted = true; D.running = true; }
    else if (D.running) { D.elapsed += Date.now() - D.t0; D.running = false; }
    else { D.t0 = Date.now(); D.running = true; D.timerStarted = true; }
    var b = D.root.querySelector('[data-act="timer"]');
    if (b) { b.innerHTML = D.running ? ICON.pause : ICON.play; b.setAttribute("aria-label", D.running ? "Pause the timer" : "Start the timer"); }
    spClock();
  }
  function spClone(s, b) {
    fit(s);
    var c = s.el.cloneNode(true);
    c.hidden = false;
    c.classList.add("sl-clone", "is-current");
    c.removeAttribute("role"); c.removeAttribute("aria-label");
    rm(c, "iframe, video");
    each(c.querySelectorAll(".viz-card"), function (x) { x.hidden = false; });
    each(c.querySelectorAll(".sl-build, .sl-mark"), function (x) { x.classList.toggle("is-on", (parseInt(x.getAttribute("data-step"), 10) || 0) <= b); });
    var st = c.querySelector("figure.fig-steps");
    if (st) {
      st.classList.add("steps-js");
      each(st.querySelectorAll(".steps-frame"), function (f, k) { f.classList.toggle("is-on", k === b); });
    }
    var stage = el("div", "sl-stage sl-mini");
    stage.appendChild(c);
    return stage;
  }
  function spRender() {
    if (!D || !D.slides) return;
    var m = D.remote || { i: 0, b: 0 };
    var i = clamp(m.i || 0, 0, D.slides.length - 1), s = D.slides[i], b = clamp(m.b || 0, 0, stepsOf(s));
    D.i = i; D.b = b;
    var cur = D.root.querySelector(".sl-sp-cur .sl-sp-frame"), nx = D.root.querySelector(".sl-sp-next .sl-sp-frame");
    cur.innerHTML = ""; nx.innerHTML = "";
    cur.appendChild(spClone(s, b));
    var lab = D.root.querySelector(".sl-sp-next .sl-sp-lab");
    if (b < stepsOf(s)) { nx.appendChild(spClone(s, b + 1)); lab.textContent = "Next: step " + (b + 2) + " of " + (stepsOf(s) + 1) + " on this slide"; }
    else if (D.slides[i + 1]) { nx.appendChild(spClone(D.slides[i + 1], 0)); lab.textContent = "Next"; }
    else lab.textContent = "The last slide";
    D.root.querySelector(".sl-sp-count").textContent = "Slide " + (i + 1) + " of " + D.slides.length;
    var notes = D.root.querySelector(".sl-sp-text");
    notes.style.fontSize = (D.notesSize * 100) + "%";
    notes.innerHTML = s.notes ? (/^\s*</.test(s.notes) ? s.notes : "<p>" + s.notes + "</p>") : ('<p class="sl-sp-none">' + (s.name ? esc(s.name) : "No notes for this slide") + "</p>");
    tameLinks(notes);
    if (window.bjpMath && window.bjpMath.pending([notes]).length) window.bjpMath.typeset([notes]);
    document.title = "Speaker view · " + (i + 1) + "/" + D.slides.length + " · " + D.deck.head.text;
    spLayout();
  }
  function spLayout() {
    if (!D) return;
    each(D.root.querySelectorAll(".sl-sp-frame"), function (f) {
      var st = f.querySelector(".sl-stage");
      if (!st) return;
      var s = Math.min(f.clientWidth / W, f.clientHeight / H);
      st.style.transform = "translate(" + Math.round((f.clientWidth - W * s) / 2) + "px," + Math.round((f.clientHeight - H * s) / 2) + "px) scale(" + s + ")";
    });
  }
  function spAct(act) {
    if (act === "next" || act === "prev") send({ t: act });
    else if (act === "blank") send({ t: "blank" });
    else if (act === "timer" || act === "reset") spTimer(act);
    else if (act === "smaller" || act === "larger") {
      D.notesSize = clamp(D.notesSize + (act === "larger" ? 0.15 : -0.15), 0.7, 2.2);
      sset(KEY_NOTES, String(D.notesSize));
      D.root.querySelector(".sl-sp-text").style.fontSize = (D.notesSize * 100) + "%";
    }
  }
  function spKey(e) {
    var k = e.key, map = { ArrowRight: "next", ArrowDown: "next", PageDown: "next", " ": "next", ArrowLeft: "prev", ArrowUp: "prev", PageUp: "prev", b: "blank", B: "blank", ".": "blank" };
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var act = map[k];
    if (k === " " && e.shiftKey) act = "prev";
    if (act) { e.preventDefault(); e.stopPropagation(); spAct(act); }
    else if (k === "Escape") { e.preventDefault(); try { window.close(); } catch (x) { /* ignore */ } }
  }

  /* ================================================================ start */
  // the speaker view's buttons, through the same click handler
  var baseAct = onAct;
  onAct = function (act, btn) { if (D && D.speaker) spAct(act); else baseAct(act, btn); };

  window.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", function () { if (D) { layout(); } });
  document.addEventListener("fullscreenchange", onFsChange);
  document.addEventListener("webkitfullscreenchange", onFsChange);

  /* the source block of a slide, to return to it: kept as a reference made when the deck is made */
  var makeDeck0 = makeDeck;
  makeDeck = function (src, info) {
    prepareArt(src.art);
    var kids = [].filter.call(src.art.childNodes, function (n) { return n.nodeType === 1 || (n.nodeType === 8 && /^\s*\/?\s*slide\b/i.test(n.nodeValue)); });
    var elems = [].filter.call(src.art.children, function () { return true; });
    var M = makeDeck0(src, info);
    M.refAt = function (bi) {
      var n = kids[bi];
      if (!n) return null;
      while (n && n.nodeType !== 1) n = n.nextSibling;
      if (!n) return null;
      var i = elems.indexOf(n), id = "";
      for (var k = i; k >= 0 && !id; k--) if (/^H[1-6]$/.test(elems[k].tagName) && elems[k].id) id = elems[k].id;
      return { i: i, tag: n.tagName, text: norm(n.textContent).slice(0, 60), id: id };
    };
    return M;
  };

  window.bjpSlidesDeck = {
    open: open,
    close: function () { close(); },
    isOpen: function () { return !!D; },
    go: function (i, b) { if (D && !D.speaker) go(i, b || 0); },
    state: function () { return D ? { sid: D.sid, i: D.i, b: D.b, n: D.slides ? D.slides.length : 0, url: D.url, loading: !!D.loading } : null; },
    /* every slide fitted: [{i, kind, title, size, zoom, over}] (for checking decks) */
    audit: function () {
      if (!D || !D.slides) return null;
      return D.slides.map(function (s, k) {
        fit(s);
        var b = s.el.querySelector(".sl-body"), z = b && b.firstElementChild ? parseFloat(b.firstElementChild.style.zoom) || 1 : 1, over = false;
        if (b) { s.el.hidden = false; s.el.classList.add("sl-measure"); over = overflows(b); s.el.classList.remove("sl-measure"); s.el.hidden = k !== D.i; }
        return { i: k + 1, kind: s.kind, title: s.name, size: b ? parseFloat(b.style.getPropertyValue("--sl-fs")) || 1 : 1, zoom: z, over: over };
      });
    },
    onPop: onPop
  };
})();
