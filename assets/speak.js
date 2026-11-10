/* Pustakālaya: web edition. Pronunciation (Book Format, section 14).
 *
 * A phrase written <span data-say lang="fr">Bonjour</span> (or data-say="the text to speak") gets a Listen button
 * after it. The button speaks the phrase with the browser's own speech synthesis (Web Speech API) in a voice of
 * the phrase's language: the voices are the device's, so it works offline. As in the books' own readers, the
 * clearest voice of the language is chosen (natural and neural voices first), French is spoken a little slower
 * than English, and a second tap plays the phrase slowly. Where speech recognition exists, a microphone button
 * lets the reader say the phrase and see how close it was. Without a voice for a language its buttons are hidden;
 * the pronunciation written in the text stays.
 *
 * The voice and the speed are chosen in "Voice and speed" at the top of a chapter that has phrases to hear, and
 * kept in the browser (localStorage "pk.speak"). Buttons are added on the chapter page, in the paginated reader
 * and in slides, whenever a phrase appears in the document.
 *
 * window.pkSpeak: say(text, lang, button, rate), stop(), hasVoice(lang), listen(lang, onText, onEnd), similarity(a, b),
 * enhance(root).
 */
(function () {
  "use strict";
  if (window.pkSpeak) return;
  var doc = document;
  var synth = "speechSynthesis" in window ? window.speechSynthesis : null;
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var KEY = "pk.speak";
  /* the voices tried for a language, best first (the books' readers used the same lists) */
  var VOICES = {
    fr: ["fr-FR", "fr-CA", "fr-BE", "fr-CH", "fr"],
    en: ["en-IN", "en-GB", "en-AU", "en-US", "en"],
    hi: ["hi-IN", "hi"],
    de: ["de-DE", "de-AT", "de-CH", "de"],
    es: ["es-ES", "es-MX", "es-US", "es"],
    sa: ["hi-IN", "hi", "mr-IN"]
  };
  /* the normal rate of speech for a language: French a little slower, so that liaisons and nasals stay audible */
  var RATE = { fr: 0.82, en: 0.9 };
  var SLOW = 0.72;
  var RECOG = { fr: "fr-FR", en: "en-IN", hi: "hi-IN" };

  var UI = {
    en: { listen: "Listen", again: "tap again: slowly", mic: "Say it and check", heard: "You said:", clearer: "Try once more, a little clearer.",
      micErr: "The microphone did not start. Check the browser's microphone permission.", micOn: "Listening…", prefs: "Voice and speed",
      voice: "Voice", auto: "Clearest (automatic)", speed: "Speed", slow: "Slow", normal: "Normal", fast: "Fast", test: "Test",
      none: "This device has no voice for this language: read the pronunciation shown in the text.", well: "Well said." },
    hi: { listen: "सुनो", again: "दोबारा टैप करो: धीरे", mic: "बोलकर जाँचो", heard: "तुमने कहा:", clearer: "एक बार और, थोड़ा साफ़ बोलो।",
      micErr: "माइक्रोफ़ोन शुरू नहीं हुआ। ब्राउज़र में माइक्रोफ़ोन की अनुमति देखो।", micOn: "सुन रहा है…", prefs: "आवाज़ और गति",
      voice: "आवाज़", auto: "सबसे साफ़ (अपने-आप)", speed: "गति", slow: "धीरे", normal: "सामान्य", fast: "तेज़", test: "सुनो",
      none: "इस डिवाइस पर इस भाषा की आवाज़ नहीं है: पाठ में लिखा उच्चारण पढ़ो।", well: "बहुत बढ़िया।" }
  };
  function ui() {
    var l = (doc.documentElement.lang || "en").slice(0, 2);
    var flow = doc.querySelector(".bjp-reader:not([hidden]) .rd-flow[lang]");
    if (flow) l = flow.getAttribute("lang").slice(0, 2);
    return UI[l] || UI.en;
  }

  function load() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
  function save(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* storage unavailable */ } }
  var prefs = load();

  function base(lang) { return String(lang || "en").toLowerCase().split(/[-_]/)[0]; }
  function list(lang) {
    var b = base(lang), l = VOICES[b] || [b];
    if (String(lang).indexOf("-") > 0 && l.indexOf(lang) < 0) l = [lang].concat(l);
    return l;
  }

  /* ------------------------------------------------------------------ voices */
  function langRank(v, langs) {
    var l = String(v.lang || "").replace("_", "-");
    for (var i = 0; i < langs.length; i++) if (l.toLowerCase().indexOf(langs[i].toLowerCase()) === 0) return langs.length - i;
    return 0;
  }
  function voiceScore(v, langs) {
    var r = langRank(v, langs);
    if (!r) return -1;
    var n = v.name, sc = r * 100;
    if (/natural|neural|online/i.test(n)) sc += 60;
    if (/premium|enhanced|siri/i.test(n)) sc += 55;
    if (/google/i.test(n)) sc += 45;
    if (/am[ée]lie|thomas|audrey|aur[ée]lie|marie|denise|henri|eloise|vivienne|remy|r[ée]my|daniel|sonia|ryan|libby|neerja|prabhat|aria|jenny|guy|samantha|karen|moira|rishi|swara|madhur|kalpana|hemant/i.test(n)) sc += 20;
    if (/compact|espeak|robot|novelty|bad news|bells|whisper|zarvox|trinoids|bubbles|cellos|organ|jester|superstar/i.test(n)) sc -= 80;
    if (!v.localService) sc += 5;
    return sc;
  }
  var known = false;
  function voicesFor(lang) {
    if (!synth) return [];
    var langs = list(lang);
    var vs = synth.getVoices() || [];
    if (vs.length) known = true;
    return vs.filter(function (v) { return langRank(v, langs) > 0; })
      .sort(function (x, y) { return voiceScore(y, langs) - voiceScore(x, langs); });
  }
  function pickVoice(lang) {
    var vs = voicesFor(lang);
    if (!vs.length) return null;
    var want = (prefs.voice || {})[base(lang)];
    if (want) for (var i = 0; i < vs.length; i++) if (vs[i].name === want) return vs[i];
    return vs[0];
  }
  function hasVoice(lang) { return !!synth && (!known || voicesFor(lang).length > 0); }

  /* Long text is cut at sentence and clause breaks: some browsers stop an utterance after about 15 seconds. */
  function chunks(text) {
    var parts = String(text).match(/[^.!?;:।]+[.!?;:।]*|[.!?;:।]+/g) || [text], out = [];
    parts.forEach(function (p) {
      p = p.trim();
      if (!p) return;
      while (p.length > 180) {
        var cut = p.lastIndexOf(",", 180);
        if (cut < 40) cut = p.lastIndexOf(" ", 180);
        if (cut < 40) cut = 180;
        out.push(p.slice(0, cut + 1).trim());
        p = p.slice(cut + 1).trim();
      }
      if (p) out.push(p);
    });
    return out;
  }

  var current = null, sayTimer = 0;
  function clearPlaying() {
    var ps = doc.querySelectorAll(".pk-say-btn.is-playing");
    for (var i = 0; i < ps.length; i++) { ps[i].classList.remove("is-playing", "is-slow"); }
  }
  function stop() {
    clearTimeout(sayTimer);
    if (synth) synth.cancel();
    clearPlaying();
    current = null;
  }
  /* rate: the rate for this phrase (default: the language's normal rate); the reader's speed multiplies it */
  function say(text, lang, btn, rate) {
    if (!synth || !text) return false;
    stop();
    var b = base(lang);
    var voice = pickVoice(lang);
    var speed = (rate || RATE[b] || 0.9) * (prefs.speed || 1);
    var parts = chunks(text);
    var token = current = {};
    if (btn) btn.classList.add("is-playing");
    if (btn && rate && rate < (RATE[b] || 0.9) * 0.9) btn.classList.add("is-slow");
    var off = function () { if (current === token) { clearPlaying(); current = null; } };
    // a short pause after cancel(): speaking at once makes some browsers swallow the first syllable
    sayTimer = setTimeout(function () {
      parts.forEach(function (part, i) {
        var u = new SpeechSynthesisUtterance(part);
        if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = list(lang)[0];
        u.rate = Math.max(0.5, Math.min(1.4, speed));
        u.pitch = 1;
        u.volume = 1;
        if (i === parts.length - 1) { u.addEventListener("end", off); u.addEventListener("error", off); }
        synth.speak(u);
      });
      if (synth.paused) synth.resume();
    }, 80);
    return true;
  }

  /* ------------------------------------------------------------- recognition */
  function similarity(a, b) {
    a = norm(a); b = norm(b);
    if (!a || !b) return 0;
    return Math.max(0, Math.round((1 - lev(a, b) / Math.max(a.length, b.length)) * 100));
  }
  function norm(s) {
    return String(s || "").toLowerCase().replace(/[‘’]/g, "'").normalize("NFC").replace(/[^\p{L}\p{N}'\s]/gu, " ").replace(/\s+/g, " ").trim();
  }
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
  var rec = null;
  /* listen(lang, onText(text, final), onEnd(error)): one utterance of the reader; false when not possible */
  function listen(lang, onText, onEnd) {
    if (!SR) return false;
    try { if (rec) rec.abort(); } catch (e) { /* ignore */ }
    stop();
    var r = rec = new SR();
    r.lang = RECOG[base(lang)] || list(lang)[0];
    r.interimResults = true;
    r.maxAlternatives = 1;
    var err = null;
    r.onresult = function (ev) {
      var t = "";
      for (var i = ev.resultIndex; i < ev.results.length; i++) t += ev.results[i][0].transcript;
      onText(t.trim(), ev.results[ev.results.length - 1].isFinal);
    };
    r.onerror = function (ev) { err = ev.error || "error"; };
    r.onend = function () { if (rec === r) rec = null; if (onEnd) onEnd(err); };
    try { r.start(); } catch (e) { if (onEnd) onEnd("busy"); return false; }
    return true;
  }

  /* ------------------------------------------------------------------ toasts */
  var toastEl = null, toastT = 0;
  function toast(html, ms) {
    if (!toastEl) {
      toastEl = doc.createElement("div");
      toastEl.className = "pk-say-toast";
      toastEl.setAttribute("role", "status");
      doc.body.appendChild(toastEl);
    }
    toastEl.innerHTML = html;
    toastEl.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove("show"); }, ms || 2600);
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function micCheck(btn) {
    var target = btn.getAttribute("data-text") || "", lang = btn.getAttribute("data-lang") || "en", T = ui();
    btn.classList.add("is-listening");
    toast("🎤 " + esc(T.micOn), 9000);
    var done = false;
    var ok = listen(lang, function (heard, fin) {
      if (!fin || done) return;
      done = true;
      var pct = similarity(heard, target), good = pct >= 80;
      toast('<b class="' + (good ? "ok" : "no") + '">' + (good ? "✓ " : "↻ ") + pct + "%</b> " + esc(T.heard) + " “" + esc(heard) + "”" +
        (good ? "" : "<br><span>" + esc(T.clearer) + "</span>"), 4200);
    }, function (err) {
      btn.classList.remove("is-listening");
      if (err && !done && err !== "no-speech" && err !== "aborted") toast(esc(T.micErr));
    });
    if (!ok) { btn.classList.remove("is-listening"); toast(esc(T.micErr)); }
  }

  /* ------------------------------------------------------------------ buttons */
  var ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor" stroke="none"/>' +
    '<path class="w1" d="M15.2 9.2a4 4 0 010 5.6"/><path class="w2" d="M17.8 6.6a7.6 7.6 0 010 10.8"/></svg>';
  var MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3.5" width="6" height="11" rx="3" fill="currentColor" stroke="none"/><path d="M6 11.5a6 6 0 0012 0M12 17.5v3"/></svg>';
  function langOf(n) {
    var l = n.getAttribute("lang");
    if (l) return l;
    var p = n.closest("[data-lang]");
    if (p) return p.getAttribute("data-lang");
    p = n.closest("[lang]");
    return p ? p.getAttribute("lang") : "en";
  }
  function textOf(n) {
    var t = n.getAttribute("data-say");
    if (t) return t;
    var c = n.cloneNode(true), x = c.querySelectorAll(".pk-say-btn, .pk-mic-btn, .ipa");
    for (var i = 0; i < x.length; i++) x[i].parentNode.removeChild(x[i]);
    return c.textContent.replace(/\s+/g, " ").trim();
  }
  function inReader(n) { return !!(n.closest && n.closest(".rd-flow")); }

  function enhance(root) {
    root = root || doc;
    var spans = root.querySelectorAll ? root.querySelectorAll("[data-say]") : [];
    if (root.nodeType === 1 && root.hasAttribute("data-say")) spans = [root].concat([].slice.call(spans));
    var T = ui();
    for (var i = 0; i < spans.length; i++) {
      var s = spans[i];
      if (s.classList.contains("pk-say-btn") || s.classList.contains("pk-mic-btn")) continue;
      var nx = s.nextElementSibling;
      if (nx && nx.classList.contains("pk-say-btn")) continue;          // cloned with its button already
      var text = textOf(s), lang = langOf(s);
      if (!text) continue;
      s.classList.add("pk-say");
      var b = doc.createElement("button");
      b.type = "button";
      b.className = "pk-say-btn";
      b.setAttribute("data-lang", base(lang));
      b.setAttribute("aria-label", T.listen + ": " + text.slice(0, 80));
      b.title = T.listen + " (" + T.again + ")";
      b.innerHTML = ICON;
      s.parentNode.insertBefore(b, s.nextSibling);
      if (SR && !s.closest(".pk-quiz") && text.split(/\s+/).length <= 22) {
        var m = doc.createElement("button");
        m.type = "button";
        m.className = "pk-mic-btn";
        m.setAttribute("data-lang", base(lang));
        m.setAttribute("data-text", text);
        m.setAttribute("aria-label", T.mic + ": " + text.slice(0, 80));
        m.title = T.mic;
        m.innerHTML = MIC;
        b.parentNode.insertBefore(m, b.nextSibling);
      }
    }
    if (root === doc || root.nodeType === 1) prefsBar(root);
    markVoices();
  }

  /* languages without a voice: their buttons are hidden (html.pk-novoice-fr ...) */
  function markVoices() {
    if (!synth) { doc.documentElement.classList.add("pk-nospeech"); return; }
    if (!known && !(synth.getVoices() || []).length) return;
    known = true;
    var seen = {}, bs = doc.querySelectorAll(".pk-say-btn[data-lang]");
    for (var i = 0; i < bs.length; i++) seen[bs[i].getAttribute("data-lang")] = 1;
    Object.keys(seen).forEach(function (l) { doc.documentElement.classList.toggle("pk-novoice-" + l, !voicesFor(l).length); });
  }

  /* "Voice and speed": on a chapter page with phrases to hear, above the chapter (outside the article, so that the
     reader and the slides, which take the article, leave it out) */
  function prefsBar(root) {
    var art = doc.querySelector("article.md-content__inner");
    if (!art || art.parentNode.querySelector(".pk-say-prefs") || !art.querySelector(".pk-say-btn") || !synth) return;
    var langs = {}, bs = art.querySelectorAll(".pk-say-btn[data-lang]");
    for (var i = 0; i < bs.length; i++) langs[bs[i].getAttribute("data-lang")] = 1;
    var T = ui(), d = doc.createElement("details");
    d.className = "pk-say-prefs";
    var html = "<summary>" + ICON + "<span>" + esc(T.prefs) + "</span></summary><div class=\"pk-say-prefs-body\">";
    Object.keys(langs).forEach(function (l) {
      html += '<label class="pk-sp-row"><span>' + esc(T.voice) + (Object.keys(langs).length > 1 ? " (" + l + ")" : "") + '</span>' +
        '<select data-pk-voice="' + l + '"><option value="">' + esc(T.auto) + "</option></select>" +
        '<button type="button" class="pk-sp-test" data-pk-test="' + l + '">' + esc(T.test) + "</button></label>" +
        '<p class="pk-sp-none" data-pk-none="' + l + '" hidden>' + esc(T.none) + "</p>";
    });
    html += '<div class="pk-sp-row" role="group" aria-label="' + esc(T.speed) + '"><span>' + esc(T.speed) + "</span>" +
      [["0.75", T.slow], ["1", T.normal], ["1.2", T.fast]].map(function (o) {
        return '<button type="button" class="pk-sp-speed" data-pk-speed="' + o[0] + '" aria-pressed="' + (String(prefs.speed || 1) === o[0]) + '">' + esc(o[1]) + "</button>";
      }).join("") + "</div></div>";
    d.innerHTML = html;
    art.parentNode.insertBefore(d, art);
    fillVoices();
  }
  function fillVoices() {
    var sels = doc.querySelectorAll("select[data-pk-voice]");
    for (var i = 0; i < sels.length; i++) {
      var sel = sels[i], l = sel.getAttribute("data-pk-voice"), vs = voicesFor(l), want = (prefs.voice || {})[l] || "";
      var keep = sel.options[0];
      sel.innerHTML = "";
      sel.appendChild(keep);
      vs.forEach(function (v) {
        var o = doc.createElement("option");
        o.value = v.name;
        o.textContent = v.name.replace(/^(Microsoft|Google)\s+/, "").replace(/\s+Online \(Natural\)/, " (natural)") + " · " + v.lang;
        if (v.name === want) o.selected = true;
        sel.appendChild(o);
      });
      var none = doc.querySelector('[data-pk-none="' + l + '"]');
      if (none) none.hidden = !known || vs.length > 0;
    }
  }

  /* ------------------------------------------------------------------- events */
  var lastBtn = null, lastAt = 0;
  doc.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var b = t.closest(".pk-say-btn");
    if (b) {
      e.preventDefault();
      e.stopPropagation();
      var s = b.previousElementSibling;
      if (!s || !s.hasAttribute("data-say")) return;
      var text = textOf(s), lang = langOf(s);
      var r = parseFloat(s.getAttribute("data-rate")) || 0;
      // a second tap on the same button, while it speaks or just after: slowly
      var slow = lastBtn === b && (b.classList.contains("is-playing") || Date.now() - lastAt < 4000) && !b.classList.contains("is-slow");
      lastBtn = b;
      lastAt = Date.now();
      say(text, lang, b, slow ? (RATE[base(lang)] || 0.9) * SLOW : r || 0);
      return;
    }
    var node = t.closest(".pk-cmap .cm-node[data-to]");          // the chapter map: a section of the drawing
    if (node) {
      var to = doc.getElementById(node.getAttribute("data-to"));
      if (to && !inReader(node)) { e.preventDefault(); to.scrollIntoView({ behavior: "smooth", block: "start" }); try { history.replaceState(history.state, "", "#" + to.id); } catch (x) { /* ignore */ } }
      return;
    }
    var m = t.closest(".pk-mic-btn");
    if (m) { e.preventDefault(); e.stopPropagation(); micCheck(m); return; }
    var tb = t.closest("[data-pk-test]");
    if (tb) { var l = tb.getAttribute("data-pk-test"); var ex = doc.querySelector('.pk-say[lang^="' + l + '"]'); say(ex ? textOf(ex) : "Bonjour", l, null); return; }
    var sp = t.closest("[data-pk-speed]");
    if (sp) {
      prefs.speed = parseFloat(sp.getAttribute("data-pk-speed")) || 1;
      save(prefs);
      var all = doc.querySelectorAll("[data-pk-speed]");
      for (var i = 0; i < all.length; i++) all[i].setAttribute("aria-pressed", String(all[i] === sp));
      return;
    }
    // on a chapter page (not in the reader, where a tap turns the page): a tapped word of a phrase is spoken alone
    var ph = t.closest(".pk-say");
    if (ph && !inReader(ph) && !t.closest("a, button, input, select, textarea") && synth) {
      var w = wordAt(e.clientX, e.clientY, ph);
      if (w) say(w, langOf(ph), null, (RATE[base(langOf(ph))] || 0.9) * 0.85);
    }
  }, true);
  doc.addEventListener("change", function (e) {
    var sel = e.target;
    if (!sel || !sel.matches || !sel.matches("select[data-pk-voice]")) return;
    prefs.voice = prefs.voice || {};
    prefs.voice[sel.getAttribute("data-pk-voice")] = sel.value;
    save(prefs);
  });
  function wordAt(x, y, host) {
    var range = null;
    if (doc.caretRangeFromPoint) range = doc.caretRangeFromPoint(x, y);
    else if (doc.caretPositionFromPoint) {
      var pos = doc.caretPositionFromPoint(x, y);
      if (pos) { range = doc.createRange(); range.setStart(pos.offsetNode, pos.offset); }
    }
    if (!range || range.startContainer.nodeType !== 3 || !host.contains(range.startContainer)) return "";
    var t = range.startContainer.nodeValue, i = range.startOffset, a = i, b = i;
    var isW = function (c) { return /[\p{L}\p{N}'’-]/u.test(c); };
    while (a > 0 && isW(t[a - 1])) a--;
    while (b < t.length && isW(t[b])) b++;
    return t.slice(a, b).replace(/^['’-]+|['’-]+$/g, "");
  }

  if (synth) {
    synth.addEventListener ? synth.addEventListener("voiceschanged", function () { markVoices(); fillVoices(); }) : (synth.onvoiceschanged = function () { markVoices(); fillVoices(); });
    setTimeout(function () { known = true; markVoices(); fillVoices(); }, 2500);     // a browser that never says
  }

  /* phrases added later (the reader's pages, slides, instant navigation) get their buttons too */
  function start() {
    enhance(doc);
    if (!window.MutationObserver) return;
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var add = muts[i].addedNodes;
        for (var j = 0; j < add.length; j++) {
          var n = add[j];
          if (n.nodeType === 1 && !n.classList.contains("pk-say-btn") && !n.classList.contains("pk-mic-btn") &&
              (n.hasAttribute("data-say") || (n.querySelector && n.querySelector("[data-say]")))) enhance(n);
        }
      }
    }).observe(doc.documentElement, { childList: true, subtree: true });
  }
  window.addEventListener("pagehide", stop);
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start); else start();

  window.pkSpeak = { say: say, stop: stop, hasVoice: hasVoice, listen: listen, canListen: !!SR, similarity: similarity, enhance: enhance,
    rate: function (lang) { return (RATE[base(lang)] || 0.9); }, slow: SLOW, ui: ui };
})();
