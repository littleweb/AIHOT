// Bind the upstream theme controls in the static edition without loading the application/API.
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
  const key = 'aihot-theme';
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const groups = [...document.querySelectorAll('[role="radiogroup"][aria-label="外观"]')];
  let preference = null;
  const read = () => { try { const value = localStorage.getItem(key); return value === 'dark' || value === 'light' ? value : null; } catch { return null; } };
  const apply = () => {
    const theme = preference || (media.matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      meta.content = preference ? (theme === 'dark' ? '#13191c' : '#faf9f6') : (meta.media.includes('dark') ? '#13191c' : '#faf9f6');
    }
    for (const group of groups) {
      const buttons = [...group.querySelectorAll('[data-theme-choice]')];
      const choice = preference || 'system';
      for (const button of buttons) {
        const selected = button.dataset.themeChoice === choice;
        button.setAttribute('aria-checked', String(selected));
        button.classList.toggle('text-ink', selected);
        button.classList.toggle('text-ink-4', !selected);
        button.classList.toggle('hover:text-ink-2', !selected);
      }
      const thumb = group.querySelector(':scope > span[aria-hidden="true"]');
      if (thumb) thumb.style.transform = `translateX(${buttons.findIndex(button => button.dataset.themeChoice === choice) * 100}%)`;
    }
  };
  preference = read();
  for (const button of document.querySelectorAll('[data-theme-choice]')) {
    button.addEventListener('click', () => {
      preference = button.dataset.themeChoice === 'system' ? null : button.dataset.themeChoice;
      try { if (preference) localStorage.setItem(key, preference); else localStorage.removeItem(key); } catch { /* The choice still works in this tab when storage is unavailable. */ }
      apply();
    });
  }
  media.addEventListener('change', () => { if (!preference) apply(); });
  window.addEventListener('storage', event => { if (event.key === key || event.key === null) { preference = read(); apply(); } });
  apply();
})();
