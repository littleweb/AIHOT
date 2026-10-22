// Native back navigation for static pages; appearance uses the upstream browser components.
(() => {
  // A same-site arrival can return to its exact list/page; a direct visit uses the anchor's parent.
  for (const link of document.querySelectorAll('a[data-static-back]')) {
    link.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      let sameSite = false;
      try { sameSite = new URL(document.referrer).origin === location.origin; } catch { /* Direct visits have no referrer. */ }
      if (sameSite && history.length > 1) { event.preventDefault(); history.back(); }
    });
  }
})();
