/* Pustakālaya: web edition. Pronunciation (Book Format, section 14).
 *
 * A phrase written <span data-say lang="fr">Bonjour</span> (or data-say="the text to speak") gets a speaker button
 * after it. The button plays a recording of the phrase in a native voice (assets/audio/<lang>/<sha1-12>.mp3, made
 * offline by tools/tts.py), so that it sounds the same, and well, on every phone and browser. A second tap plays the
 * phrase slowly (playbackRate 0.75, the pitch kept). The device's own voice (Web Speech API) is used only when the
 * reader chooses "Device voice" in "Voice and speed", or for a phrase that has no recording. The speaker is hidden only
 * when there is neither a recording nor a device voice for the language.
 *
 * A microphone button (say it, and see how close it was) is shown only inside speaking exercises: an exercise box
 * titled "Say it" / "Speak" / "Say" and the quiz's say questions (quiz.js). A "Play all" button above a list of
 * phrases (a dialogue, a word list, a table) plays them one after another.
 *
 * Recordings are kept in the browser (Cache Storage "pk-audio-v1") as they are played, and the books that are kept
 * for offline reading may carry theirs (library.json). The voice and the speed are chosen in "Voice and speed" at the
 * top of a chapter that has phrases to hear, and kept in the browser (localStorage "pk.speak"). Buttons are added on
 * the chapter page, in the paginated reader and in slides, whenever a phrase appears in the document.
 *
 * window.pkSpeak: say(text, lang, button, rate, onend), stop(), hasVoice(lang), listen(lang, onText, onEnd),
 * similarity(a, b), enhance(root), key(text) (the hash of a phrase), hasFile(text, lang).
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
  var SLOW = 0.75;            // the second tap: slower (recordings: playbackRate, the pitch kept)
  var RECOG = { fr: "fr-FR", en: "en-IN", hi: "hi-IN" };

  var UI = {
    en: { listen: "Listen", again: "tap again: slowly", mic: "Say it and check", heard: "You said:", clearer: "Try once more, a little clearer.",
      micErr: "The microphone did not start. Check the browser's microphone permission.", micOn: "Listening…", prefs: "Voice and speed",
      voice: "Voice", auto: "Clearest (automatic)", speed: "Speed", slow: "Slow", normal: "Normal", fast: "Fast", test: "Test",
      none: "This device has no voice for this language: read the pronunciation shown in the text.", well: "Well said.",
      recorded: "Recorded voice (native, the same everywhere)", deviceAuto: "Device voice (automatic)", playall: "Play all", stopall: "Stop" },
    hi: { listen: "सुनो", again: "दोबारा टैप करो: धीरे", mic: "बोलकर जाँचो", heard: "तुमने कहा:", clearer: "एक बार और, थोड़ा साफ़ बोलो।",
      micErr: "माइक्रोफ़ोन शुरू नहीं हुआ। ब्राउज़र में माइक्रोफ़ोन की अनुमति देखो।", micOn: "सुन रहा है…", prefs: "आवाज़ और गति",
      voice: "आवाज़", auto: "सबसे साफ़ (अपने-आप)", speed: "गति", slow: "धीरे", normal: "सामान्य", fast: "तेज़", test: "सुनो",
      none: "इस डिवाइस पर इस भाषा की आवाज़ नहीं है: पाठ में लिखा उच्चारण पढ़ो।", well: "बहुत बढ़िया।",
      recorded: "रिकॉर्ड की हुई आवाज़ (हर जगह एक-सी)", deviceAuto: "डिवाइस की आवाज़ (अपने-आप)", playall: "सब सुनो", stopall: "रोको" }
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

  /* ------------------------------------------------------------ recordings */
  var scriptSrc = (function () {
    var cs = doc.currentScript;
    if (cs && cs.src) return cs.src;
    var ss = doc.getElementsByTagName("script");
    for (var i = ss.length - 1; i >= 0; i--) if (/speak(\.min)?\.js(\?|$)/.test(ss[i].src || "")) return ss[i].src;
    return "";
  })();
  var AUDIO = scriptSrc ? scriptSrc.replace(/speak(\.min)?\.js.*$/, "audio/") : "";     // <site>/assets/audio/
  var CACHE = "pk-audio-v1";
  var index = null, counts = {}, total = 0, waiters = [], loading = false;

  /* SHA-1 of a string (UTF-8), synchronous: the name of a recording is the first 12 hex digits of the hash of its text */
  function sha1(str) {
    var b = unescape(encodeURIComponent(str)), n = b.length, w = [], i, j;
    for (i = 0; i < n; i++) w[i >> 2] |= b.charCodeAt(i) << (24 - (i % 4) * 8);
    w[n >> 2] |= 0x80 << (24 - (n % 4) * 8);
    w[(((n + 8) >> 6) + 1) * 16 - 1] = n * 8;
    var h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0, rol = function (x, c) { return (x << c) | (x >>> (32 - c)); };
    for (i = 0; i < w.length; i += 16) {
      var a = h0, bb = h1, c = h2, d = h3, e = h4, x = [];
      for (j = 0; j < 80; j++) {
        x[j] = j < 16 ? (w[i + j] | 0) : rol(x[j - 3] ^ x[j - 8] ^ x[j - 14] ^ x[j - 16], 1);
        var f, k;
        if (j < 20) { f = (bb & c) | (~bb & d); k = 0x5a827999; }
        else if (j < 40) { f = bb ^ c ^ d; k = 0x6ed9eba1; }
        else if (j < 60) { f = (bb & c) | (bb & d) | (c & d); k = 0x8f1bbcdc; }
        else { f = bb ^ c ^ d; k = 0xca62c1d6; }
        var t = (rol(a, 5) + f + e + k + x[j]) | 0;
        e = d; d = c; c = rol(bb, 30); bb = a; a = t;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + bb) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
    }
    return [h0, h1, h2, h3, h4].map(function (v) { return ("00000000" + (v >>> 0).toString(16)).slice(-8); }).join("");
  }
  /* the text of a phrase as tools/tts.py names it: NFC, one space between words, no Listen marks */
  function phrase(t) { return String(t || "").normalize("NFC").replace(/\u{1F50A}/gu, "").replace(/\s+/g, " ").trim(); }
  function key(t) { return sha1(phrase(t)).slice(0, 12); }
  function loadIndex(cb) {
    if (index) { if (cb) cb(); return; }
    if (cb) waiters.push(cb);
    if (loading) return;
    loading = true;
    var done = function (j) {
      index = {};
      if (j) Object.keys(j).forEach(function (l) {
        var o = {};
        (j[l] || []).forEach(function (h) { o[h] = 1; });
        index[l] = o;
        counts[l] = (j[l] || []).length;
        total += counts[l];
      });
      var w = waiters;
      waiters = [];
      w.forEach(function (f) { try { f(); } catch (e) { /* ignore */ } });
      markVoices();
      fillVoices();
    };
    if (!AUDIO || !window.fetch) { done(null); return; }
    fetch(AUDIO + "index.json").then(function (r) { return r.ok ? r.json() : null; }).then(done, function () { done(null); });
  }
  function fileUrl(text, lang) {
    if (!index) return "";
    var l = base(lang), h = key(text);
    return index[l] && index[l][h] ? AUDIO + l + "/" + h + ".mp3" : "";
  }
  function hasFiles(lang) { return !!index && (counts[base(lang)] || 0) > 0; }
  function hasFile(text, lang) { return !!fileUrl(text, lang); }

  var player = null;
  function getPlayer() { if (!player) { player = new Audio(); player.preload = "auto"; } return player; }
  function remember(url) {      // the recording is kept in the browser, so that it plays offline the next time
    try { if (window.caches) caches.open(CACHE).then(function (c) { return c.match(url).then(function (m) { return m || c.add(url); }); }).catch(function () { /* ignore */ }); } catch (e) { /* ignore */ }
  }
  function saved(url) {
    if (!window.caches) return Promise.resolve("");
    return caches.open(CACHE).then(function (c) { return c.match(url); })
      .then(function (r) { return r ? r.blob().then(function (b) { return URL.createObjectURL(b); }) : ""; }).catch(function () { return ""; });
  }
  /* plays a recording; fallback() when it cannot be played (the device's voice then speaks) */
  function playFile(url, rate, token, off, fallback) {
    var p = getPlayer(), over = false, retried = false;
    var fin = function (ok) { if (over) return; over = true; p.onended = p.onerror = p.onplaying = null; off(ok); };
    var fail = function () {
      if (over) return;
      if (!retried) {
        retried = true;
        saved(url).then(function (u) {
          if (over || !u || current !== token) { if (!over) { over = true; p.onended = p.onerror = null; fallback(); } return; }
          p.src = u;
          p.defaultPlaybackRate = p.playbackRate = rate;
          var pr = p.play();
          if (pr && pr.catch) pr.catch(function () { fin(false); });
        });
      } else { over = true; p.onended = p.onerror = null; fallback(); }
    };
    p.onended = function () { fin(true); };
    p.onerror = fail;
    p.onplaying = function () { remember(url); };
    try {
      p.pause();
      p.src = url;
      p.defaultPlaybackRate = p.playbackRate = Math.max(0.5, Math.min(2, rate));
      p.preservesPitch = p.mozPreservesPitch = p.webkitPreservesPitch = true;
      var pr = p.play();
      if (pr && pr.catch) pr.catch(function (e) { if (e && e.name === "AbortError") return; if (e && e.name === "NotAllowedError") { fin(false); return; } fail(); });
    } catch (e) { fail(); }
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
  /* a recording or a device voice: true while the list of recordings is not read yet (the buttons are not hidden early) */
  function hasVoice(lang) {
    if (!index) return !!synth || !!AUDIO;
    return hasFiles(lang) || (!!synth && (!known || voicesFor(lang).length > 0));
  }

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

  var current = null, sayTimer = 0, allBtn = null;
  function clearPlaying() {
    var ps = doc.querySelectorAll(".pk-say-btn.is-playing");
    for (var i = 0; i < ps.length; i++) { ps[i].classList.remove("is-playing", "is-slow"); }
  }
  function endAll() {
    if (!allBtn) return;
    allBtn.classList.remove("is-on");
    var l = allBtn.querySelector("span");
    if (l) l.textContent = ui().playall;
    allBtn = null;
  }
  /* keep: true from inside "Play all", which goes on with the next phrase */
  function stop(keep) {
    clearTimeout(sayTimer);
    if (synth) synth.cancel();
    if (player) { player.onended = player.onerror = player.onplaying = null; try { player.pause(); } catch (e) { /* ignore */ } }
    clearPlaying();
    current = null;
    if (!keep) endAll();
  }
  /* the device's own voice */
  function speakDevice(text, lang, rate, off) {
    if (!synth) return false;
    var b = base(lang);
    var voice = pickVoice(lang);
    var speed = (rate || RATE[b] || 0.9) * (prefs.speed || 1);
    var parts = chunks(text);
    // a short pause after cancel(): speaking at once makes some browsers swallow the first syllable
    sayTimer = setTimeout(function () {
      parts.forEach(function (part, i) {
        var u = new SpeechSynthesisUtterance(part);
        if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = list(lang)[0];
        u.rate = Math.max(0.5, Math.min(1.4, speed));
        u.pitch = 1;
        u.volume = 1;
        if (i === parts.length - 1) { u.addEventListener("end", function () { off(true); }); u.addEventListener("error", function () { off(false); }); }
        synth.speak(u);
      });
      if (synth.paused) synth.resume();
    }, 80);
    return true;
  }
  /* rate: the rate for this phrase (default: the language's normal rate); the reader's speed multiplies it.
     The recording of the phrase plays when there is one, unless the reader chose a device voice. */
  function say(text, lang, btn, rate, onend, keep) {
    if (!text) return false;
    stop(keep);
    var b = base(lang), normal = RATE[b] || 0.9, token = current = {};
    if (btn) btn.classList.add("is-playing");
    if (btn && rate && rate < normal * 0.9) btn.classList.add("is-slow");
    var off = function (ok) {
      if (current !== token) return;
      clearPlaying();
      current = null;
      if (ok !== false && onend) onend();
    };
    var device = function () { if (current === token && !speakDevice(text, lang, rate, off)) off(false); };
    if ((prefs.voice || {})[b]) { device(); return true; }
    var go = function () {
      if (current !== token) return;
      var url = fileUrl(text, lang);
      if (url) playFile(url, (rate ? rate / normal : 1) * (prefs.speed || 1), token, off, device); else device();
    };
    if (index) go(); else loadIndex(go);
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

  /* a microphone only inside speaking exercises: a box titled "Say it" / "Speak" (the quiz's say questions have their own) */
  function inSpeaking(n) {
    var ad = n.closest(".admonition");
    if (ad) {
      var t = ad.querySelector(".admonition-title");
      if (t && /^\s*(say it|say|speak|speaking|speaking practi[sc]e|practi[sc]e aloud|बोलो|बोलकर)\s*[:.!]?\s*$/i.test(t.textContent)) return true;
    }
    return !!n.closest("[data-mic]");
  }
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
      if (SR && !s.closest(".pk-quiz") && inSpeaking(s) && text.split(/\s+/).length <= 22) {
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
    playAllBars(root);
    quizHear(root);
    if (root.querySelector && root.querySelector("[data-say], .pk-quiz, .pk-play-all")) loadIndex();   // only pages with something to hear ask for the recordings' list
    markVoices();
  }

  /* a quiz question that has been checked: a speaker beside its feedback plays the model sentence (answer, or the question with
     its blanks filled), when there is a recording of it. The text is built as tools/tts.py builds it. */
  function first(a) { while (Array.isArray(a)) a = a.length ? a[0] : ""; return a == null ? "" : String(a); }
  function modelText(q) {
    var t = q.type, a = q.answer;
    if (t === "say" || t === "speak" || t === "order" || t === "reorder") return typeof a === "string" ? a : "";
    if (t === "text") return first(a);
    if (t === "blanks" || t === "fill" || t === "choice" || t === "mcq") {
      var qs = String(q.q || ""), n = qs.split("___").length - 1;
      if (!n) return t === "blanks" ? "" : first(a);
      var arr = n === 1 ? [a] : (Array.isArray(a) ? a : [a]), i = 0;
      return qs.replace(/___/g, function () { return first(arr[i++]); });
    }
    return "";
  }
  function quizHear(root) {
    if (!index) return;
    var scope = root && root.querySelectorAll ? root : doc, its = scope.querySelectorAll(".pk-q.is-done[data-q]"), T = ui();
    for (var i = 0; i < its.length; i++) {
      var it = its[i];
      if (it.querySelector(".pk-q-hear")) continue;
      var q; try { q = JSON.parse(it.getAttribute("data-q")); } catch (e) { continue; }
      var qz = it.closest(".pk-quiz"), lang = (q.lang || (qz && qz.getAttribute("data-lang")) || "en"), text = modelText(q);
      if (!text || !fileUrl(text, lang)) continue;
      var b = doc.createElement("button");
      b.type = "button";
      b.className = "pk-say-btn pk-q-hear";
      b.setAttribute("data-lang", base(lang));
      b.setAttribute("data-text", text);
      b.setAttribute("aria-label", T.listen + ": " + text.slice(0, 80));
      b.title = T.listen + " (" + T.again + ")";
      b.innerHTML = ICON;
      var fb = it.querySelector(".pk-q-fb");
      if (fb) fb.appendChild(b); else (it.querySelector(".pk-q-ui") || it).appendChild(b);
    }
  }
  var hearT = 0;
  function laterHear() { clearTimeout(hearT); hearT = setTimeout(function () { quizHear(doc); }, 120); }

  /* "Play all": above a list of phrases (a dialogue, a word list) or a table with phrases in its cells */
  function phraseSpans(c) {
    var all = c.querySelectorAll(".pk-say"), out = [];
    for (var i = 0; i < all.length; i++) if (all[i].closest("ul, ol, table") === c && !all[i].closest(".pk-quiz")) out.push(all[i]);
    return out;
  }
  function playAllBars(root) {
    var scope = root && root.querySelectorAll ? root : doc, cs = scope.querySelectorAll("ul, ol, table");
    var T = ui();
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      if (c.hasAttribute("data-pk-pa") || c.closest(".pk-quiz, .pk-q, .pk-cmap, .pk-say-prefs")) continue;
      var items = phraseSpans(c);
      if (items.length < (c.tagName === "TABLE" ? 4 : 3) || items.length > 90) continue;
      var rows = c.tagName === "TABLE" ? c.querySelectorAll("tr").length : c.children.length;
      if (items.length < rows * 0.6) continue;
      c.setAttribute("data-pk-pa", "1");
      var b = doc.createElement("button");
      b.type = "button";
      b.className = "pk-playall";
      b.setAttribute("data-lang", base(langOf(items[0])));
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5l12 7-12 7z" fill="currentColor" stroke="none"/></svg><span>' + esc(T.playall) + "</span>";
      b._for = c;
      var anchor = c.tagName === "TABLE" && c.parentNode && /scrollwrap|table-wrap|md-typeset__table/.test(c.parentNode.className || "") ? c.parentNode : c;
      anchor.parentNode.insertBefore(b, anchor);
    }
  }
  function playAll(pb) {
    if (pb === allBtn) { stop(); return; }
    stop();
    var items = phraseSpans(pb._for), i = 0, T = ui();
    allBtn = pb;
    pb.classList.add("is-on");
    pb.querySelector("span").textContent = T.stopall;
    var run = function () {
      if (allBtn !== pb) return;
      if (i >= items.length) { stop(); return; }
      var s = items[i++], nb = s.nextElementSibling;
      var r = parseFloat(s.getAttribute("data-rate")) || 0;
      say(textOf(s), langOf(s), nb && nb.classList.contains("pk-say-btn") ? nb : null, r, function () { setTimeout(run, 380); }, true);
    };
    run();
  }

  /* languages without a recording or a voice: their buttons are hidden (html.pk-novoice-fr ...) */
  function markVoices() {
    if (!index) return;
    var root = doc.documentElement;
    if (!synth && !total) { root.classList.add("pk-nospeech"); return; }
    root.classList.remove("pk-nospeech");
    var devKnown = !synth || known || (synth.getVoices() || []).length > 0;
    if (synth && devKnown) known = true;
    var seen = {}, bs = doc.querySelectorAll(".pk-say-btn[data-lang], .pk-playall[data-lang]");
    for (var i = 0; i < bs.length; i++) seen[bs[i].getAttribute("data-lang")] = 1;
    Object.keys(seen).forEach(function (l) {
      var hide = !hasFiles(l) && (!synth || (devKnown && !voicesFor(l).length));
      root.classList.toggle("pk-novoice-" + l, hide);
    });
  }

  /* "Voice and speed": on a chapter page with phrases to hear, above the chapter (outside the article, so that the
     reader and the slides, which take the article, leave it out) */
  function prefsBar(root) {
    var art = doc.querySelector("article.md-content__inner");
    if (!art || art.parentNode.querySelector(".pk-say-prefs") || !art.querySelector(".pk-say-btn") || (!synth && !AUDIO)) return;
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
      var keep = sel.options[0], T = ui();
      keep.textContent = hasFiles(l) ? T.recorded : T.auto;
      sel.innerHTML = "";
      sel.appendChild(keep);
      if (hasFiles(l)) {
        var dv = doc.createElement("option");
        dv.value = "*";
        dv.textContent = T.deviceAuto;
        if (want === "*") dv.selected = true;
        sel.appendChild(dv);
      }
      vs.forEach(function (v) {
        var o = doc.createElement("option");
        o.value = v.name;
        o.textContent = v.name.replace(/^(Microsoft|Google)\s+/, "").replace(/\s+Online \(Natural\)/, " (natural)") + " · " + v.lang;
        if (v.name === want) o.selected = true;
        sel.appendChild(o);
      });
      var none = doc.querySelector('[data-pk-none="' + l + '"]');
      if (none) none.hidden = !known || vs.length > 0 || hasFiles(l);
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
      var s = b.previousElementSibling, own = b.hasAttribute("data-text");
      if (!own && (!s || !s.hasAttribute("data-say"))) return;
      var text = own ? b.getAttribute("data-text") : textOf(s), lang = own ? b.getAttribute("data-lang") : langOf(s);
      var r = own ? 0 : parseFloat(s.getAttribute("data-rate")) || 0;
      // a second tap on the same button, while it speaks or just after: slowly
      var slow = lastBtn === b && (b.classList.contains("is-playing") || Date.now() - lastAt < 4000) && !b.classList.contains("is-slow");
      lastBtn = b;
      lastAt = Date.now();
      say(text, lang, b, slow ? (RATE[base(lang)] || 0.9) * SLOW : r || 0);
      return;
    }
    var pa = t.closest(".pk-playall");
    if (pa) { e.preventDefault(); e.stopPropagation(); playAll(pa); return; }
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
    if (ph && !inReader(ph) && !t.closest("a, button, input, select, textarea") && (synth || index)) {
      var w = wordAt(e.clientX, e.clientY, ph);
      if (w && (synth || fileUrl(w, langOf(ph)))) say(w, langOf(ph), null, (RATE[base(langOf(ph))] || 0.9) * 0.85);
    }
  }, true);
  doc.addEventListener("click", laterHear);
  doc.addEventListener("keyup", function (e) { if (e.key === "Enter") laterHear(); });
  doc.addEventListener("change", laterHear);
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
    setTimeout(function () { quizHear(doc); }, 900);
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
  window.addEventListener("pagehide", function () { stop(); });
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start); else start();

  window.pkSpeak = { say: say, stop: function () { stop(); }, key: key, hasFile: hasFile, hasVoice: hasVoice, listen: listen, canListen: !!SR, similarity: similarity, enhance: enhance,
    rate: function (lang) { return (RATE[base(lang)] || 0.9); }, slow: SLOW, ui: ui };
})();
