/* Pustakālaya: web edition. Quizzes, typed answers and practice tables (Book Format, section 14).
 *
 *   quiz blocks       tools/quizblocks.py writes every question of a ```quiz block as an exercise box with its folded
 *                     answer and the question as JSON (data-q). Here each becomes a live question: a text box (typed
 *                     answers and blanks inside a sentence), choices, matching lists, words to put in order, a word to
 *                     spot, a phrase to say, a passage to hear. Check, instant feedback, Show answer, Try again, and the
 *                     quiz's score; answers and the best score are kept in the browser (localStorage "pk.quiz.<id>").
 *   typed answers     an exercise whose folded answer is short (a word, a number, a phrase of up to four words) gets a
 *                     "Type your answer" box above its answer, checked on demand, when the answer box has the class
 *                     "typed", or for every exercise of a book of the kind "course" (an answer box with the class
 *                     "untyped" never). The folded answer stays.
 *   practice tables   a table inside <div class="pk-drill"> gets a Practice switch: the cells after the first column are
 *                     hidden and become text boxes to fill from memory.
 *
 * Matching forgives case, punctuation and a small slip in a long word, and accepts an answer typed without its accents,
 * saying which accent was missing. Everything works on the chapter page, in the paginated reader (typing never turns a
 * page; the reader lays the pages out again when a question grows) and in slides, with the keyboard and screen readers.
 */
(function () {
  "use strict";
  if (window.pkQuiz) return;
  var doc = document;

  var UI = {
    en: { check: "Check", show: "Show answer", retry: "Try again", right: "Correct!", wrong: "Not quite.", answer: "Answer:",
      accent: "Correct, but mind the accents:", typo: "Accepted. The exact spelling is", score: "Score", best: "best", reset: "Start again",
      type: "Type your answer", typeHint: "Type your answer, then check it against the answer below.", compare: "Not quite: open the answer and compare.",
      blank: "Blank", choose: "Choose", play: "Play", slow: "Slow", speak: "Speak", saidIt: "I said it", heard: "You said:",
      noMic: "This browser cannot check speech: listen, say it aloud, then mark it.", clearer: "Try once more, a little clearer.",
      micErr: "The microphone did not start. Check the browser's microphone permission.", listening: "Listening…", clear: "Clear",
      listenHint: "Listen first: the text stays hidden until you answer.", noVoice: "No voice for this language on this device: read the text instead.",
      practice: "Practice", practiceOn: "Hide the forms and fill them in", done: "Done", order: "Correct order:", correct: "Correct:",
      transcript: "Transcript:", all: "All questions answered:", great: "excellent!", okay: "good: review once more.", again: "reread the chapter and try again.",
      cell: "Fill in", missed: "missed" },
    hi: { check: "जाँचो", show: "उत्तर दिखाओ", retry: "फिर से", right: "सही!", wrong: "पूरा सही नहीं।", answer: "उत्तर:",
      accent: "सही, पर एक्सेंट पर ध्यान दो:", typo: "मान लिया। सही वर्तनी है", score: "स्कोर", best: "सबसे अच्छा", reset: "फिर से शुरू करो",
      type: "अपना उत्तर लिखो", typeHint: "अपना उत्तर लिखो, फिर नीचे दिए उत्तर से मिलाओ।", compare: "पूरा सही नहीं: उत्तर खोलकर मिलाओ।",
      blank: "खाली जगह", choose: "चुनो", play: "सुनो", slow: "धीरे", speak: "बोलो", saidIt: "मैंने बोल दिया", heard: "तुमने कहा:",
      noMic: "यह ब्राउज़र बोली जाँच नहीं सकता: सुनो, ज़ोर से बोलो, फिर निशान लगाओ।", clearer: "एक बार और, थोड़ा साफ़ बोलो।",
      micErr: "माइक्रोफ़ोन शुरू नहीं हुआ। ब्राउज़र में माइक्रोफ़ोन की अनुमति देखो।", listening: "सुन रहा है…", clear: "साफ़ करो",
      listenHint: "पहले सुनो: उत्तर देने तक पाठ छिपा रहेगा।", noVoice: "इस डिवाइस पर इस भाषा की आवाज़ नहीं है: पाठ पढ़ लो।",
      practice: "प्रैक्टिस", practiceOn: "रूप छिपाओ और खुद भरो", done: "पूरा", order: "सही क्रम:", correct: "सही:",
      transcript: "पाठ:", all: "सब प्रश्न हो गए:", great: "बहुत बढ़िया!", okay: "अच्छा: एक बार और दोहराओ।", again: "अध्याय दोबारा पढ़ो और फिर कोशिश करो।",
      cell: "भरो", missed: "छूट गया" }
  };
  function langUI(node) {
    var l = "en";
    var f = node && node.closest && node.closest(".rd-flow[lang]");
    if (f) l = f.getAttribute("lang"); else l = doc.documentElement.lang || "en";
    var T = UI[String(l).slice(0, 2)] || UI.en;
    var q = node && node.closest && node.closest("[data-ui]");
    if (q) {
      try { var o = JSON.parse(q.getAttribute("data-ui")); var c = {}; for (var k in T) c[k] = T[k]; for (k in o) c[k] = o[k]; return c; } catch (e) { /* ignore */ }
    }
    return T;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function el(tag, cls, html) { var e = doc.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function sget(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function sset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  function alts(a) { return Array.isArray(a) ? a.map(String) : a == null ? [] : [String(a)]; }

  /* ----------------------------------------------------------------- matching */
  function norm(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/[‘’ʼ`´]/g, "'").replace(/[‐-―]/g, "-").normalize("NFC")
      .replace(/[^\p{L}\p{N}\p{M}'\s-]/gu, " ").replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim();
  }
  function bare(s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe").replace(/æ/g, "ae"); }
  function hasMarks(s) { return s.normalize("NFD") !== s.normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function lev(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var prev = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      var cur = [i];
      for (j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  /* {ok, kind: "exact" | "accent" | "typo" | "", best}: best is the form to show (the accented one when there is one) */
  function grade(given, answers) {
    var g = norm(given), list = alts(answers), gb = bare(g), i, n;
    if (!g) return { ok: false, kind: "", best: list[0] || "" };
    var accented = function (b) { for (var k = 0; k < list.length; k++) if (bare(norm(list[k])) === b && hasMarks(norm(list[k]))) return list[k]; return null; };
    for (i = 0; i < list.length; i++) {
      n = norm(list[i]);
      if (n === g) {
        var acc = !hasMarks(g) ? accented(gb) : null;
        return acc && norm(acc) !== g ? { ok: true, kind: "accent", best: acc } : { ok: true, kind: "exact", best: list[i] };
      }
    }
    for (i = 0; i < list.length; i++) {
      n = norm(list[i]);
      if (bare(n) === gb) return { ok: true, kind: "accent", best: accented(gb) || list[i] };
    }
    for (i = 0; i < list.length; i++) {
      n = bare(norm(list[i]));
      if (n.length >= 5 && lev(n, gb) <= Math.max(1, Math.floor(n.length * 0.08))) return { ok: true, kind: "typo", best: list[i] };
    }
    return { ok: false, kind: "", best: list[0] || "" };
  }
  function similarity(a, b) {
    a = bare(norm(a)); b = bare(norm(b));
    if (!a || !b) return 0;
    return Math.max(0, Math.round((1 - lev(a, b) / Math.max(a.length, b.length)) * 100));
  }
  function shuffle(arr, seed) {
    var a = arr.slice(), s = seed || 1;
    for (var i = a.length - 1; i > 0; i--) {
      s = (s * 1103515245 + 12345) % 2147483647;
      var j = s % (i + 1), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function sameOrder(a, b) { return a.join("\u0001") === b.join("\u0001"); }

  /* ------------------------------------------------------------- the reader */
  var relayT = 0;
  function grew(node) {
    if (!node || !node.closest || !node.closest(".rd-flow")) return;
    clearTimeout(relayT);
    relayT = setTimeout(function () { if (window.bjpReader && window.bjpReader.relayout) window.bjpReader.relayout(); }, 60);
  }
  function speak() { return window.pkSpeak || null; }

  /* ================================================================ quizzes */
  function itemsOf(qz) { return [].slice.call(qz.querySelectorAll(".pk-q[data-q]")); }
  function dataOf(it) { try { return JSON.parse(it.getAttribute("data-q")); } catch (e) { return null; } }
  function quizOf(it) { return it.closest(".pk-quiz"); }
  function keyOf(qz) { return "pk.quiz." + (qz.getAttribute("data-quiz") || "x"); }
  function langOf(it, q) { return (q && q.lang) || (quizOf(it) && quizOf(it).getAttribute("data-lang")) || "en"; }
  function indexOf(it) { return itemsOf(quizOf(it)).indexOf(it); }
  function answerBox(it) { var n = it.nextElementSibling; return n && n.tagName === "DETAILS" && n.classList.contains("pk-q-ans") ? n : null; }

  function setupQuiz(qz) {
    if (qz.classList.contains("is-live") && qz.querySelector(".pk-quiz-score")) { restore(qz, true); return; }
    qz.classList.add("is-live");
    var T = langUI(qz);
    var bar = el("div", "pk-quiz-score");
    bar.innerHTML = '<span class="pk-qs-text" aria-live="polite"></span><span class="pk-qs-meter" aria-hidden="true"><i></i></span>' +
      '<button type="button" class="pk-qs-reset">' + esc(T.reset) + "</button>";
    var title = qz.querySelector(".pk-quiz-title");
    if (title) title.parentNode.insertBefore(bar, title.nextSibling); else qz.insertBefore(bar, qz.firstChild);
    itemsOf(qz).forEach(function (it, i) { build(it, i, T); });
    restore(qz, false);
  }

  function build(it, idx, T) {
    var q = dataOf(it);
    if (!q || it.querySelector(".pk-q-ui")) return;
    var ui = el("div", "pk-q-ui");
    var t = q.type, html = "", lang = langOf(it, q);
    var canSay = speak() && speak().hasVoice(lang);
    var player = function (text) {
      return '<div class="pk-q-player"><button type="button" class="pk-q-play" data-text="' + esc(text) + '">▶ ' + esc(T.play) + "</button>" +
        '<button type="button" class="pk-q-play is-slow" data-slow="1" data-text="' + esc(text) + '">🐢 ' + esc(T.slow) + "</button></div>";
    };
    if (t === "choice" || t === "listen") {
      if (t === "listen") {
        if (canSay) { html += player(q.audio) + '<p class="pk-q-note">' + esc(T.listenHint) + "</p>"; it.classList.add("hide-audio"); }
        else html += '<p class="pk-q-note">' + esc(T.noVoice) + "</p>";
      }
      var lis = it.querySelectorAll(".pk-q-opts > li");
      html += '<div class="pk-q-choices" role="group" aria-label="' + esc(T.choose) + '">' + q.options.map(function (o, i) {
        return '<button type="button" class="pk-q-opt" data-v="' + esc(o) + '"><span class="k" aria-hidden="true">' + "ABCDEFGH".charAt(i) + "</span>" +
          '<span class="t">' + (lis[i] ? lis[i].innerHTML : esc(o)) + "</span></button>";
      }).join("") + "</div>";
    } else if (t === "text") {
      html += '<input type="text" class="pk-q-in" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="' + esc(T.type) + '" placeholder="' + esc(T.type) + '">';
    } else if (t === "blanks") {
      var bs = it.querySelectorAll(".pk-blank");
      for (var b = 0; b < bs.length; b++) {
        var w = Math.max(4, Math.min(22, Math.max.apply(null, alts((q.answer || [])[b]).map(function (x) { return x.length; }).concat([3])) + 2));
        var inp = el("input", "pk-q-in pk-q-blank");
        inp.type = "text";
        inp.setAttribute("autocomplete", "off");
        inp.setAttribute("autocapitalize", "off");
        inp.setAttribute("spellcheck", "false");
        inp.setAttribute("aria-label", T.blank + (bs.length > 1 ? " " + (b + 1) : ""));
        inp.setAttribute("data-i", String(b));
        inp.style.width = w + "ch";
        bs[b].innerHTML = "";
        bs[b].appendChild(inp);
        bs[b].classList.add("is-live");
      }
    } else if (t === "match") {
      var rights = shuffle(q.pairs.map(function (p) { return p[1]; }), idx + 11);
      html += '<div class="pk-q-matchlist">' + q.pairs.map(function (p, i) {
        return '<label class="pk-q-mrow"><span class="l">' + esc(p[0]) + '</span><select class="pk-q-sel" data-i="' + i + '"><option value="">' + esc(T.choose) + "…</option>" +
          rights.map(function (r) { return '<option value="' + esc(r) + '">' + esc(r) + "</option>"; }).join("") + "</select></label>";
      }).join("") + "</div>";
    } else if (t === "order") {
      var ans = alts(q.answer)[0], toks = q.tokens || ans.split(/\s+/), sh = shuffle(toks, idx + 3);
      if (sameOrder(sh, toks)) sh = shuffle(toks, idx + 17);
      html += '<div class="pk-q-slot" aria-live="polite"></div><div class="pk-q-tray">' + sh.map(function (w) {
        return '<button type="button" class="pk-q-tok">' + esc(w) + "</button>";
      }).join("") + "</div>";
    } else if (t === "spot") {
      html += '<div class="pk-q-spot">' + String(q.sentence).split(/\s+/).map(function (w) {
        return '<button type="button" class="pk-q-word" data-w="' + esc(w.replace(/[.,?!;:«»"“”]/g, "")) + '">' + esc(w) + "</button>";
      }).join(" ") + "</div>";
    } else if (t === "say") {
      html += '<p class="pk-q-heard" aria-live="polite"></p>';
    } else if (t === "dictation") {
      if (canSay) { html += player(q.audio); it.classList.add("hide-audio"); }
      else html += '<p class="pk-q-note">' + esc(T.noVoice) + "</p>";
      html += '<textarea class="pk-q-in pk-q-dict" rows="2" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="' + esc(T.type) + '" placeholder="' + esc(T.type) + '"></textarea><p class="pk-q-diff" hidden></p>';
    }
    html += '<p class="pk-q-fb" role="status" aria-live="polite"></p><div class="pk-q-actions">';
    if (t === "text" || t === "blanks" || t === "match" || t === "order" || t === "dictation") html += '<button type="button" class="pk-q-btn pk-q-check">' + esc(T.check) + "</button>";
    if (t === "order") html += '<button type="button" class="pk-q-btn ghost pk-q-clear">' + esc(T.clear) + "</button>";
    if (t === "say") {
      if (speak() && speak().canListen) html += '<button type="button" class="pk-q-btn pk-q-speak">🎤 ' + esc(T.speak) + "</button>";
      html += '<button type="button" class="pk-q-btn ghost pk-q-said">' + esc(T.saidIt) + " ✓</button>";
    }
    html += '<button type="button" class="pk-q-btn ghost pk-q-show">' + esc(T.show) + '</button><button type="button" class="pk-q-btn ghost pk-q-retry" hidden>' + esc(T.retry) + "</button></div>";
    if (t === "say" && !(speak() && speak().canListen)) html = html.replace('<p class="pk-q-fb"', '<p class="pk-q-note">' + esc(T.noMic) + '</p><p class="pk-q-fb"');
    ui.innerHTML = html;
    it.appendChild(ui);
    it.classList.add("is-live", "t-" + t);
  }

  /* the value of a question as it is kept: a string, or a list of strings */
  function valueOf(it, q) {
    if (q.type === "text" || q.type === "dictation") { var i = it.querySelector(".pk-q-in"); return i ? i.value : ""; }
    if (q.type === "blanks") return [].map.call(it.querySelectorAll(".pk-q-blank"), function (x) { return x.value; });
    if (q.type === "match") return [].map.call(it.querySelectorAll(".pk-q-sel"), function (x) { return x.value; });
    if (q.type === "order") return [].map.call(it.querySelectorAll(".pk-q-slot .pk-q-tok"), function (x) { return x.textContent; });
    return "";
  }
  function setValue(it, q, v) {
    if (v == null) return;
    if (q.type === "text" || q.type === "dictation") { var i = it.querySelector(".pk-q-in"); if (i) i.value = v; }
    else if (q.type === "blanks") [].forEach.call(it.querySelectorAll(".pk-q-blank"), function (x, k) { x.value = (v || [])[k] || ""; });
    else if (q.type === "match") [].forEach.call(it.querySelectorAll(".pk-q-sel"), function (x, k) { x.value = (v || [])[k] || ""; });
    else if (q.type === "order") (v || []).forEach(function (w) {
      var tray = it.querySelectorAll(".pk-q-tray .pk-q-tok:not(:disabled)");
      for (var k = 0; k < tray.length; k++) if (tray[k].textContent === w) { pickToken(it, tray[k]); break; }
    });
  }

  function feedback(it, ok, html) {
    var fb = it.querySelector(".pk-q-fb");
    if (!fb) return;
    fb.className = "pk-q-fb " + (ok === true ? "ok" : ok === false ? "no" : "");
    fb.innerHTML = html;
  }
  function why(it) {
    var w = answerBox(it) && answerBox(it).querySelector(".pk-q-why");
    return w ? " " + w.innerHTML : "";
  }
  function noteFor(r, T) {
    if (r.kind === "accent") return esc(T.accent) + " <strong>" + esc(r.best) + "</strong>.";
    if (r.kind === "typo") return esc(T.typo) + " <strong>" + esc(r.best) + "</strong>.";
    return "";
  }

  /* checks a question; silent: when the page is restoring what was kept (no focus moves, no speech) */
  function check(it, value, silent) {
    var q = dataOf(it), T = langUI(it), t = q.type, ok = false, msg = "", r;
    if (it.classList.contains("is-done")) return;
    if (t === "choice" || t === "listen") {
      ok = alts(q.answer).indexOf(value) >= 0;
      [].forEach.call(it.querySelectorAll(".pk-q-opt"), function (b) {
        b.disabled = true;
        var v = b.getAttribute("data-v");
        if (alts(q.answer).indexOf(v) >= 0) b.classList.add("is-right");
        if (v === value) { b.classList.add("is-picked"); b.setAttribute("aria-pressed", "true"); if (!ok) b.classList.add("is-wrong"); }
      });
      msg = ok ? esc(T.right) : esc(T.wrong) + " " + esc(T.answer) + " <strong>" + esc(alts(q.answer)[0]) + "</strong>.";
      if (t === "listen") { it.classList.remove("hide-audio"); msg += " " + esc(T.transcript) + " “" + esc(q.audio) + "”"; }
    } else if (t === "text") {
      value = value != null ? value : valueOf(it, q);
      if (!norm(value)) return;
      r = grade(value, q.answer);
      ok = r.ok;
      msg = ok ? (noteFor(r, T) || esc(T.right)) : esc(T.wrong) + " " + esc(T.answer) + " <strong>" + esc(alts(q.answer)[0]) + "</strong>.";
      mark(it.querySelector(".pk-q-in"), ok);
    } else if (t === "blanks") {
      value = value || valueOf(it, q);
      if (!value.some(function (x) { return norm(x); })) return;
      var notes = "", all = true;
      [].forEach.call(it.querySelectorAll(".pk-q-blank"), function (inp, k) {
        var rr = grade(value[k], (q.answer || [])[k]);
        mark(inp, rr.ok);
        if (!rr.ok) all = false; else if (rr.kind) notes += (notes ? " " : "") + noteFor(rr, T);
      });
      ok = all;
      msg = ok ? (notes || esc(T.right)) : esc(T.wrong) + " " + esc(T.answer) + " <strong>" + (q.answer || []).map(function (a) { return esc(alts(a)[0]); }).join(" · ") + "</strong>.";
    } else if (t === "match") {
      value = value || valueOf(it, q);
      if (!value.some(function (x) { return x; })) return;
      ok = true;
      [].forEach.call(it.querySelectorAll(".pk-q-sel"), function (s, k) {
        var good = value[k] === q.pairs[k][1];
        mark(s, good);
        if (!good) ok = false;
      });
      msg = ok ? esc(T.right) : esc(T.wrong) + " " + q.pairs.map(function (p) { return "<strong>" + esc(p[0]) + "</strong> — " + esc(p[1]); }).join("; ");
    } else if (t === "order") {
      value = value || valueOf(it, q);
      if (!value.length) return;
      var a = alts(q.answer);
      ok = grade(value.join(" "), a).ok;
      msg = ok ? esc(T.right) : esc(T.wrong) + " " + esc(T.order) + " <strong>" + esc(a[0]) + "</strong>.";
      it.querySelector(".pk-q-slot").classList.add(ok ? "is-right" : "is-wrong");
      [].forEach.call(it.querySelectorAll(".pk-q-tok"), function (b) { b.disabled = true; });
    } else if (t === "spot") {
      ok = grade(value, q.answer).ok && norm(value) === norm(alts(q.answer)[0]) || alts(q.answer).some(function (x) { return norm(x) === norm(value); });
      [].forEach.call(it.querySelectorAll(".pk-q-word"), function (b) {
        b.disabled = true;
        var w = b.getAttribute("data-w");
        if (alts(q.answer).some(function (x) { return norm(x) === norm(w); })) b.classList.add("is-right");
        if (w === value && !ok) b.classList.add("is-wrong");
      });
      msg = (ok ? esc(T.right) : esc(T.wrong)) + (q.correction ? " " + esc(T.correct) + " “" + esc(q.correction) + "”." : "");
    } else if (t === "say") {
      if (value === "__self__") { ok = true; msg = esc(T.right); }
      else {
        var target = alts(q.answer)[0], pct = similarity(value, target);
        ok = pct >= 80 || grade(value, q.answer).ok;
        msg = (ok ? "✓ " : "↻ ") + pct + "% · " + esc(T.heard) + " “" + esc(value) + "”" + (ok ? "" : " " + esc(T.clearer));
      }
    } else if (t === "dictation") {
      value = value != null ? value : valueOf(it, q);
      if (!norm(value)) return;
      var target2 = alts(q.answer).length ? alts(q.answer)[0] : q.audio;
      var pc = similarity(value, target2);
      ok = pc >= 92 || grade(value, alts(q.answer).length ? q.answer : [q.audio]).ok;
      var got = bare(norm(value)).split(" "), used = {};
      var diff = it.querySelector(".pk-q-diff");
      diff.innerHTML = String(target2).split(/\s+/).map(function (w) {
        var n = bare(norm(w)), hit = -1;
        for (var k = 0; k < got.length; k++) if (!used[k] && (got[k] === n || (n.length > 3 && lev(got[k], n) <= 1))) { hit = k; break; }
        if (hit >= 0) used[hit] = 1;
        return '<span class="' + (hit >= 0 ? "dw-ok" : "dw-miss") + '"' + (hit >= 0 ? "" : ' title="' + esc(T.missed) + '"') + ">" + esc(w) + "</span>";
      }).join(" ");
      diff.hidden = false;
      it.classList.remove("hide-audio");
      msg = (ok ? esc(T.right) : esc(T.wrong)) + " " + pc + "%";
      mark(it.querySelector(".pk-q-in"), ok);
    }
    finish(it, ok ? "ok" : "no", msg + (silent && ok ? "" : why(it)), value, silent);
  }
  function mark(input, ok) { if (input) { input.classList.remove("is-right", "is-wrong"); input.classList.add(ok ? "is-right" : "is-wrong"); input.setAttribute("aria-invalid", ok ? "false" : "true"); } }

  function finish(it, state, msg, value, silent) {
    it.classList.add("is-done", state === "ok" ? "is-right" : state === "shown" ? "is-shown" : "is-wrong");
    feedback(it, state === "ok" ? true : state === "shown" ? null : false, msg);
    [].forEach.call(it.querySelectorAll(".pk-q-in, .pk-q-sel"), function (x) { x.readOnly = true; if (x.tagName === "SELECT") x.disabled = true; });
    var c = it.querySelector(".pk-q-check"); if (c) c.hidden = true;
    var cl = it.querySelector(".pk-q-clear"); if (cl) cl.hidden = true;
    var sp = it.querySelector(".pk-q-speak"); if (sp) sp.hidden = true;
    var sd = it.querySelector(".pk-q-said"); if (sd) sd.hidden = true;
    var sh = it.querySelector(".pk-q-show"); if (sh) sh.hidden = state === "shown";
    var rt = it.querySelector(".pk-q-retry"); if (rt) rt.hidden = false;
    var qz = quizOf(it);
    if (!silent) {
      var st = sget(keyOf(qz)) || {};
      st.items = st.items || {};
      st.items[indexOf(it)] = { v: value == null ? null : value, s: state };
      sset(keyOf(qz), st);
      if (rt && it.contains(doc.activeElement) && doc.activeElement.disabled !== false) { /* keep the focus */ }
    }
    score(qz, !silent);
    grew(it);
  }

  function reset(it, silent) {
    var q = dataOf(it), T = langUI(it);
    it.classList.remove("is-done", "is-right", "is-wrong", "is-shown");
    if (q && (q.type === "listen" || q.type === "dictation") && it.querySelector(".pk-q-play")) it.classList.add("hide-audio");
    feedback(it, null, "");
    [].forEach.call(it.querySelectorAll(".pk-q-in, .pk-q-sel"), function (x) {
      x.readOnly = false; x.disabled = false; x.value = ""; x.classList.remove("is-right", "is-wrong"); x.removeAttribute("aria-invalid");
    });
    [].forEach.call(it.querySelectorAll(".pk-q-opt, .pk-q-word, .pk-q-tray .pk-q-tok"), function (b) {
      b.disabled = false; b.classList.remove("is-right", "is-wrong", "is-picked"); b.removeAttribute("aria-pressed");
    });
    var slot = it.querySelector(".pk-q-slot");
    if (slot) { slot.innerHTML = ""; slot.classList.remove("is-right", "is-wrong"); }
    var diff = it.querySelector(".pk-q-diff"); if (diff) { diff.hidden = true; diff.innerHTML = ""; }
    var heard = it.querySelector(".pk-q-heard"); if (heard) heard.textContent = "";
    ["pk-q-check", "pk-q-clear", "pk-q-speak", "pk-q-said", "pk-q-show"].forEach(function (c) { var b = it.querySelector("." + c); if (b) b.hidden = false; });
    var rt = it.querySelector(".pk-q-retry"); if (rt) rt.hidden = true;
    var box = answerBox(it); if (box) box.open = false;
    if (!silent) {
      var qz = quizOf(it), st = sget(keyOf(qz)) || {};
      if (st.items) delete st.items[indexOf(it)];
      sset(keyOf(qz), st);
      score(qz, false);
      var first = it.querySelector(".pk-q-in, .pk-q-sel, .pk-q-opt, .pk-q-tok, .pk-q-word, .pk-q-speak, .pk-q-said");
      if (first) try { first.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      grew(it);
    }
    return T;
  }

  function showAnswer(it, silent) {
    var q = dataOf(it), T = langUI(it);
    var box = answerBox(it);
    if (box) box.open = true;
    if (it.classList.contains("is-done")) { grew(it); return; }
    if (q.type === "choice" || q.type === "listen") {
      [].forEach.call(it.querySelectorAll(".pk-q-opt"), function (b) { b.disabled = true; if (alts(q.answer).indexOf(b.getAttribute("data-v")) >= 0) b.classList.add("is-right"); });
      it.classList.remove("hide-audio");
    } else if (q.type === "spot") {
      [].forEach.call(it.querySelectorAll(".pk-q-word"), function (b) { b.disabled = true; if (alts(q.answer).some(function (x) { return norm(x) === norm(b.getAttribute("data-w")); })) b.classList.add("is-right"); });
    } else if (q.type === "dictation") it.classList.remove("hide-audio");
    finish(it, "shown", esc(T.answer) + " " + (box ? "" : esc(alts(q.answer)[0] || "")), null, silent);
  }

  function score(qz, celebrate) {
    if (!qz) return;
    var its = itemsOf(qz), n = its.length, right = 0, done = 0;
    its.forEach(function (it) { if (it.classList.contains("is-done")) done++; if (it.classList.contains("is-right")) right++; });
    var T = langUI(qz), st = sget(keyOf(qz)) || {};
    var pct = Math.round(right / Math.max(1, n) * 100);
    if (done === n && n && celebrate) {
      if (st.best == null || pct > st.best) { st.best = pct; sset(keyOf(qz), st); }
    }
    var text = esc(T.score) + " <strong>" + right + " / " + n + "</strong>" + (st.best != null ? " · " + esc(T.best) + " " + st.best + "%" : "");
    if (done === n && n) text = esc(T.all) + " <strong>" + right + " / " + n + "</strong> · " + (pct >= 80 ? esc(T.great) : pct >= 50 ? esc(T.okay) : esc(T.again)) + (st.best != null ? " · " + esc(T.best) + " " + st.best + "%" : "");
    var bar = qz.querySelector(".pk-quiz-score");
    if (!bar) return;
    bar.querySelector(".pk-qs-text").innerHTML = text;
    bar.querySelector(".pk-qs-meter i").style.width = (done ? Math.round(done / n * 100) : 0) + "%";
    bar.querySelector(".pk-qs-meter").style.setProperty("--ok", pct + "%");
  }

  function restore(qz, rebuilt) {
    var st = sget(keyOf(qz)) || {};
    var its = itemsOf(qz);
    if (rebuilt) its.forEach(function (it) { reset(it, true); });
    its.forEach(function (it, i) {
      var s = st.items && st.items[i];
      if (!s) return;
      var q = dataOf(it);
      if (!q) return;
      if (s.s === "shown") { showAnswer(it, true); var box = answerBox(it); if (box) box.open = false; return; }
      if (q.type === "say") { check(it, s.v || "__self__", true); return; }
      if (q.type === "choice" || q.type === "listen" || q.type === "spot") { check(it, s.v, true); return; }
      setValue(it, q, s.v);
      check(it, s.v, true);
    });
    score(qz, false);
  }

  function pickToken(it, b) {
    var slot = it.querySelector(".pk-q-slot");
    var c = el("button", "pk-q-tok in-slot");
    c.type = "button";
    c.textContent = b.textContent;
    b.disabled = true;
    c._from = b;
    slot.appendChild(c);
  }

  /* ========================================================= typed answers */
  var EX_RE = /^(exercise|question|practice|quiz|try it|try this|check yourself|self[- ]check|q\.?\s*\d|प्रश्न|अभ्यास)/i;
  var ANS_RE = /^(answers?|solutions?|jawaab|jawab|उत्तर|हल)\b/i;
  var BOOK = null;
  function bookKind() {
    if (BOOK !== null) return BOOK;
    BOOK = "";
    try {
      var list = JSON.parse((doc.getElementById("bjp-books") || {}).textContent || "[]");
      var p = decodeURIComponent(location.pathname);
      list.forEach(function (b) { if (b.kind && p.indexOf("/" + b.path + "/") >= 0) BOOK = b.kind; });
    } catch (e) { /* no list */ }
    return BOOK;
  }
  function shortAnswer(box) {
    var body = [].filter.call(box.children, function (c) { return c.tagName !== "SUMMARY"; });
    var first = body[0];
    if (!first || first.tagName !== "P") return null;
    var strong = first.querySelector("strong, b");
    var t = (strong && strong.textContent.trim().length ? strong.textContent : first.textContent).replace(/\s+/g, " ").trim();
    if (strong && first.textContent.replace(/\s+/g, " ").trim().length > t.length + 140) return null;
    t = t.replace(/[.;:!]+$/, "").replace(/^["“'(]+|["”')]+$/g, "").trim();
    if (!t || t.length > 48 || /[=<>$\\]/.test(t) || first.querySelector("code, .arithmatex, mjx-container, img")) return null;
    var list = t.split(/\s+\/\s+|\s+or\s+|\s+या\s+|\s*;\s*/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (!list.length || list.some(function (x) { return x.split(/\s+/).length > 4; })) return null;
    return list;
  }
  function setupTyped(root) {
    var kind = bookKind();
    var boxes = (root.querySelectorAll ? root : doc).querySelectorAll("details");
    [].forEach.call(boxes, function (box) {
      if (box.classList.contains("pk-q-ans") || box.classList.contains("untyped") || box.hasAttribute("data-pk-typed")) return;
      var sum = box.querySelector(":scope > summary");
      if (!sum || !ANS_RE.test(sum.textContent.trim())) return;
      var ex = box.previousElementSibling;
      if (!ex || !ex.classList.contains("admonition") || ex.classList.contains("pk-q")) return;
      var tt = ex.querySelector(":scope > .admonition-title");
      if (!tt || !EX_RE.test(tt.textContent.trim())) return;
      if (!(box.classList.contains("typed") || kind === "course")) return;
      if (ex.querySelector(".pk-typed")) { box.setAttribute("data-pk-typed", "1"); return; }
      var list = shortAnswer(box);
      if (!list) return;
      box.setAttribute("data-pk-typed", "1");
      var T = langUI(ex);
      var row = el("div", "pk-typed");
      row.setAttribute("data-a", JSON.stringify(list));
      row.innerHTML = '<label class="pk-typed-row"><span class="pk-typed-l">' + esc(T.type) + '</span><input type="text" class="pk-q-in pk-typed-in" autocomplete="off" autocapitalize="off" spellcheck="false"></label>' +
        '<button type="button" class="pk-q-btn pk-typed-check">' + esc(T.check) + '</button><p class="pk-q-fb" role="status" aria-live="polite"></p>';
      ex.appendChild(row);
    });
  }
  function checkTyped(row) {
    var inp = row.querySelector(".pk-typed-in"), T = langUI(row), list;
    try { list = JSON.parse(row.getAttribute("data-a")); } catch (e) { return; }
    if (!norm(inp.value)) return;
    var r = grade(inp.value, list);
    mark(inp, r.ok);
    var fb = row.querySelector(".pk-q-fb");
    fb.className = "pk-q-fb " + (r.ok ? "ok" : "no");
    fb.innerHTML = r.ok ? (noteFor(r, T) || esc(T.right)) : esc(T.compare);
    grew(row);
  }

  /* ======================================================= practice tables */
  function setupDrills(root) {
    var ds = (root.querySelectorAll ? root : doc).querySelectorAll(".pk-drill");
    [].forEach.call(ds, function (d) {
      if (d.querySelector(":scope > .pk-drill-bar")) return;
      var table = d.querySelector("table");
      if (!table) return;
      var T = langUI(d);
      var bar = el("div", "pk-drill-bar");
      bar.innerHTML = '<button type="button" class="pk-drill-toggle" aria-pressed="false">✎ ' + esc(T.practice) + '</button><span class="pk-drill-hint">' + esc(T.practiceOn) + "</span>" +
        '<button type="button" class="pk-q-btn pk-drill-check" hidden>' + esc(T.check) + '</button><button type="button" class="pk-q-btn ghost pk-drill-show" hidden>' + esc(T.show) + "</button>" +
        '<span class="pk-q-fb" role="status" aria-live="polite"></span>';
      d.insertBefore(bar, d.firstChild);
    });
  }
  /* what a practice table hides: the forms the book highlights (verbs, endings in bold), or else the cells of the
     columns of forms (not those of pronunciation, meaning or examples) */
  var SKIP_COL = /sound|pronunc|english|meaning|example|translation|उच्चारण|अर्थ|मतलब|matlab|udaharan|उदाहरण|anuvaad|अनुवाद/i;
  function cellsOf(d) {
    if (d._targets && d._targets.length && d.contains(d._targets[0])) return d._targets;
    var marks = [].filter.call(d.querySelectorAll("tbody .r-verb, tbody strong, tbody b"), function (m) {
      var t = m.textContent.trim();
      var cell = m.closest("td");
      if (cell && cell.parentNode.firstElementChild === cell && cell.textContent.trim() === t) return false;     // the person itself
      return t && t.length <= 30 && !m.closest("th") && !(m.parentNode.closest && m.parentNode.closest("tbody .r-verb, tbody strong, tbody b"));
    });
    var out = [];
    if (marks.length >= 3) out = marks;
    else {
      var heads = [].map.call(d.querySelectorAll("thead th"), function (h) { return h.textContent.trim(); });
      [].forEach.call(d.querySelectorAll("tbody tr"), function (tr) {
        [].forEach.call(tr.children, function (td, i) {
          var t = td.textContent.trim();
          if (i > 0 && td.tagName === "TD" && t && t.charAt(0) !== "[" && !SKIP_COL.test(heads[i] || "")) out.push(td);
        });
      });
    }
    d._targets = out;
    return out;
  }
  function drill(d, on) {
    var T = langUI(d), bar = d.querySelector(".pk-drill-bar");
    bar.querySelector(".pk-drill-toggle").setAttribute("aria-pressed", String(on));
    bar.querySelector(".pk-drill-check").hidden = !on;
    bar.querySelector(".pk-drill-show").hidden = !on;
    bar.querySelector(".pk-q-fb").innerHTML = "";
    d.classList.toggle("is-drilling", on);
    cellsOf(d).forEach(function (td, k) {
      if (on) {
        if (td.querySelector(".pk-drill-in")) return;
        var wrap = el("span", "pk-drill-orig");
        while (td.firstChild) wrap.appendChild(td.firstChild);
        td.appendChild(wrap);
        var inp = el("input", "pk-q-in pk-drill-in");
        inp.type = "text";
        inp.setAttribute("autocomplete", "off");
        inp.setAttribute("autocapitalize", "off");
        inp.setAttribute("spellcheck", "false");
        var cell = td.closest("td, th") || td, row = cell.parentNode, head = d.querySelectorAll("thead th")[[].indexOf.call(row.children, cell)];
        inp.setAttribute("aria-label", T.cell + ": " + (row.children[0] ? row.children[0].textContent.replace(/\s+/g, " ").trim() : "") + (head ? ", " + head.textContent.trim() : ""));
        if (td.tagName !== "TD") { inp.classList.add("is-inline"); inp.style.width = Math.max(4, wrap.textContent.trim().length + 3) + "ch"; }
        td.appendChild(inp);
      } else {
        var o = td.querySelector(".pk-drill-orig"), i2 = td.querySelector(".pk-drill-in");
        if (i2) td.removeChild(i2);
        if (o) { while (o.firstChild) td.insertBefore(o.firstChild, o); td.removeChild(o); }
        td.classList.remove("is-right", "is-wrong", "is-shown");
      }
    });
    if (on) { var f = d.querySelector(".pk-drill-in"); if (f) try { f.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    grew(d);
  }
  function cellAnswers(td) {
    var t = td.querySelector(".pk-drill-orig").textContent.replace(/\s+/g, " ").trim();
    var list = [t, t.replace(/\s*\([^)]*\)\s*/g, " ").trim()];
    t.split(/\s*\/\s*|\s*,\s*/).forEach(function (x) { if (x && t.indexOf("/") >= 0) list.push(x); });
    return list;
  }
  function checkDrill(d) {
    var T = langUI(d), right = 0, cells = cellsOf(d), notes = "";
    cells.forEach(function (td) {
      var inp = td.querySelector(".pk-drill-in");
      if (!inp) return;
      var r = grade(inp.value, cellAnswers(td));
      td.classList.remove("is-right", "is-wrong");
      if (!norm(inp.value)) return;
      td.classList.add(r.ok ? "is-right" : "is-wrong");
      mark(inp, r.ok);
      if (r.ok) { right++; if (r.kind === "accent" && notes.length < 200) notes += " <strong>" + esc(r.best) + "</strong>"; }
    });
    d.querySelector(".pk-drill-bar .pk-q-fb").innerHTML = right + " / " + cells.length + (notes ? " · " + esc(T.accent) + notes : "");
  }

  /* ================================================================ events */
  doc.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var it = t.closest(".pk-q.is-live"), b;
    if (it) {
      var q = dataOf(it);
      if ((b = t.closest(".pk-q-opt")) && !b.disabled) { check(it, b.getAttribute("data-v")); return; }
      if ((b = t.closest(".pk-q-word")) && !b.disabled) { check(it, b.getAttribute("data-w")); return; }
      if ((b = t.closest(".pk-q-tray .pk-q-tok")) && !b.disabled) { pickToken(it, b); grew(it); return; }
      if ((b = t.closest(".pk-q-slot .pk-q-tok")) && !it.classList.contains("is-done")) {
        var src = b._from || [].filter.call(it.querySelectorAll(".pk-q-tray .pk-q-tok:disabled"), function (x) { return x.textContent === b.textContent; })[0];
        if (src) src.disabled = false;
        b.parentNode.removeChild(b);
        return;
      }
      if (t.closest(".pk-q-clear")) { [].forEach.call(it.querySelectorAll(".pk-q-slot .pk-q-tok"), function (x) { x.parentNode.removeChild(x); }); [].forEach.call(it.querySelectorAll(".pk-q-tray .pk-q-tok"), function (x) { x.disabled = false; }); return; }
      if (t.closest(".pk-q-check")) { check(it); return; }
      if (t.closest(".pk-q-show")) { showAnswer(it); return; }
      if (t.closest(".pk-q-retry")) { reset(it); return; }
      if (t.closest(".pk-q-said")) { check(it, "__self__"); return; }
      if ((b = t.closest(".pk-q-play"))) {
        if (speak()) speak().say(b.getAttribute("data-text"), langOf(it, q), null, b.getAttribute("data-slow") ? speak().rate(langOf(it, q)) * speak().slow : 0);
        return;
      }
      if ((b = t.closest(".pk-q-speak"))) {
        var heard = it.querySelector(".pk-q-heard"), T = langUI(it), fin = false;
        heard.textContent = T.listening;
        b.classList.add("is-listening");
        var ok = speak() && speak().listen(langOf(it, q), function (txt, final) {
          heard.textContent = "“" + txt + "”";
          if (final && !fin) { fin = true; check(it, txt); }
        }, function (err) {
          b.classList.remove("is-listening");
          if (err && !fin && err !== "aborted") heard.textContent = err === "no-speech" ? T.clearer : T.micErr;
        });
        if (!ok) { b.classList.remove("is-listening"); heard.textContent = T.micErr; }
        return;
      }
    }
    if ((b = t.closest(".pk-qs-reset"))) {
      var qz = b.closest(".pk-quiz"), st = sget(keyOf(qz)) || {};
      st.items = {};
      sset(keyOf(qz), st);
      itemsOf(qz).forEach(function (x) { reset(x, true); });
      score(qz, false);
      grew(qz);
      return;
    }
    if ((b = t.closest(".pk-typed-check"))) { checkTyped(b.closest(".pk-typed")); return; }
    if ((b = t.closest(".pk-drill-toggle"))) { var d = b.closest(".pk-drill"); drill(d, b.getAttribute("aria-pressed") !== "true"); return; }
    if ((b = t.closest(".pk-drill-check"))) { checkDrill(b.closest(".pk-drill")); return; }
    if ((b = t.closest(".pk-drill-show"))) {
      var dd = b.closest(".pk-drill");
      cellsOf(dd).forEach(function (td) { var i = td.querySelector(".pk-drill-in"); if (i && !td.classList.contains("is-right")) { i.value = td.querySelector(".pk-drill-orig").textContent.replace(/\s+/g, " ").trim(); td.classList.add("is-shown"); } });
      return;
    }
  });
  doc.addEventListener("keydown", function (e) {
    var t = e.target;
    if (!t || !t.closest || e.key !== "Enter" || e.shiftKey || e.isComposing) return;
    var it = t.closest(".pk-q.is-live");
    if (it && t.classList.contains("pk-q-in")) {
      e.preventDefault();
      if (!it.classList.contains("is-done")) check(it);
      return;
    }
    var row = t.closest(".pk-typed");
    if (row && t.classList.contains("pk-typed-in")) { e.preventDefault(); checkTyped(row); return; }
    if (t.classList.contains("pk-drill-in")) {
      e.preventDefault();
      var all = [].slice.call(t.closest(".pk-drill").querySelectorAll(".pk-drill-in")), k = all.indexOf(t);
      if (all[k + 1]) all[k + 1].focus(); else checkDrill(t.closest(".pk-drill"));
    }
  });
  /* typing in a box never reaches the reader's or the slides' keys */
  ["keydown", "keyup", "keypress"].forEach(function (type) {
    doc.addEventListener(type, function (e) {
      var t = e.target;
      if (t && t.closest && t.matches("input, textarea, select") && t.closest(".pk-quiz, .pk-typed, .pk-drill") && e.key !== "Escape") e.stopPropagation();
    }, false);
  });

  /* ============================================================ start-up */
  function enhance(root) {
    root = root || doc;
    var qs = root.querySelectorAll ? root.querySelectorAll(".pk-quiz") : [];
    if (root.nodeType === 1 && root.classList.contains("pk-quiz")) qs = [root];
    [].forEach.call(qs, setupQuiz);
    setupTyped(root.nodeType === 1 ? root : doc);
    setupDrills(root.nodeType === 1 ? root : doc);
  }
  function start() {
    enhance(doc);
    if (!window.MutationObserver) return;
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var add = muts[i].addedNodes;
        for (var j = 0; j < add.length; j++) {
          var n = add[j];
          if (n.nodeType !== 1 || !n.querySelector) continue;
          if (n.classList.contains("pk-quiz") || n.querySelector(".pk-quiz, details, .pk-drill")) enhance(n);
        }
      }
    }).observe(doc.documentElement, { childList: true, subtree: true });
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start); else start();

  window.pkQuiz = { grade: grade, similarity: similarity, enhance: enhance };
})();
