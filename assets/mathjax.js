/* Load MathJax only on pages that contain mathematics; re-typeset after instant navigation.
   The reader uses window.bjpMath to typeset the chapters it fetches itself. */
(function () {
  var MJ_URL = "https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-mml-chtml.js";
  var loadPromise = null;

  function hasMath(root) {
    return (root || document).querySelector(".arithmatex, .math") !== null;
  }

  /* Resolve with window.MathJax once it is loaded and ready; resolve with null if it cannot be loaded. */
  function ensure() {
    if (loadPromise) return loadPromise;
    loadPromise = new Promise(function (resolve) {
      if (window.MathJax && window.MathJax.typesetPromise) {
        resolve(window.MathJax);
        return;
      }
      window.MathJax = {
        tex: {
          inlineMath: [["\\(", "\\)"]],
          displayMath: [["\\[", "\\]"]],
          processEscapes: true,
          processEnvironments: true,
          tags: "none"
        },
        options: {
          ignoreHtmlClass: ".*|",
          processHtmlClass: "arithmatex|math"
        },
        startup: {
          typeset: false,          // the page is typeset by typesetPage below (not while the reader shows the chapter)
          pageReady: function () {
            return window.MathJax.startup.defaultPageReady().then(function () { resolve(window.MathJax); });
          }
        }
      };
      var s = document.createElement("script");
      s.src = MJ_URL;
      s.async = true;
      s.onerror = function () { loadPromise = null; resolve(null); };
      document.head.appendChild(s);
    });
    return loadPromise;
  }

  /* Elements of the given roots (default: the document) whose mathematics is not typeset yet. MathJax must
     never be run again over typeset output: it would find the MathML of the screen-reader copy and typeset
     it a second time. */
  function pending(roots) {
    var out = [];
    (roots || [document]).forEach(function (root) {
      var list = root.querySelectorAll(".arithmatex, .math");
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (e.querySelector("mjx-container") || e.closest("mjx-container")) continue;
        if (e.parentElement && e.parentElement.closest(".arithmatex, .math")) continue;
        out.push(e);
      }
    });
    return out;
  }

  /* Typeset the mathematics inside the given elements (default: the whole document). */
  var queue = Promise.resolve();
  function typeset(roots) {
    return ensure().then(function (MJ) {
      if (!MJ) return null;
      queue = queue.then(function () {
        var todo = pending(roots);
        if (!todo.length) return null;
        try { return MJ.typesetPromise(todo); } catch (e) { return null; }
      }).catch(function () { return null; });
      return queue;
    });
  }

  /* Typeset the given mathematics elements themselves (top-level .arithmatex/.math elements not yet typeset), in the
     order given: the reader typesets the pages on screen first and the rest of a chapter a little at a time. */
  function typesetEls(els) {
    return ensure().then(function (MJ) {
      if (!MJ) return null;
      queue = queue.then(function () {
        var todo = (els || []).filter(function (e) { return e.isConnected && !e.querySelector("mjx-container") && !e.closest("mjx-container"); });
        if (!todo.length) return null;
        try { return MJ.typesetPromise(todo); } catch (e) { return null; }
      }).catch(function () { return null; });
      return queue;
    });
  }

  /* The page's own mathematics. While the reader shows the chapter (assets/reader.js), the page under it is not typeset:
     the reader typesets its own copy, the pages on screen first. The page is typeset when the reader closes. MathJax
     itself is fetched at once, so that it is ready for the reader. */
  var pageWaiting = false;
  function reading() { return document.documentElement.classList.contains("bjp-reading"); }
  function typesetPage() {
    if (!hasMath()) return;
    ensure();
    setTimeout(function () {
      if (reading()) { pageWaiting = true; return; }
      typeset([document.querySelector("article.md-content__inner") || document]);
    }, 0);
  }
  document.addEventListener("bjp:reader-close", function () {
    if (!pageWaiting) return;
    pageWaiting = false;
    typeset([document.querySelector("article.md-content__inner") || document]);
  });

  window.bjpMath = { ensure: ensure, typeset: typeset, typesetEls: typesetEls, hasMath: hasMath, pending: pending };

  if (window.document$ && window.document$.subscribe) {
    window.document$.subscribe(typesetPage);
  } else {
    document.addEventListener("DOMContentLoaded", typesetPage);
  }
})();
