// A native dialog keeps focus, Escape and image saving available on static hosts.
(() => {
  const dialog = document.getElementById("share-card-dialog");
  if (!(dialog instanceof HTMLDialogElement)) return;
  document.querySelectorAll("[data-share-card]").forEach(button => {
    button.addEventListener("click", () => { if (!dialog.open) dialog.showModal(); });
  });
  dialog.querySelector("[data-close-share-card]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
  });
})();
