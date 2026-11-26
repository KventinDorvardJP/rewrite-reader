// Runs in the bundled Yomitan popup frame. Only readiness leaves the frame.
function observePopupContent() {
  const entries = document.getElementById('dictionary-entries');
  if (!entries) return;
  const notices = ['no-results', 'no-dictionaries', 'error-extension-unloaded']
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  let previous;
  let paint;

  function hasContent() {
    return entries.childElementCount > 0 || notices.some((notice) => !notice.hidden);
  }

  function publish(ready) {
    if (ready === previous) return;
    previous = ready;
    window.parent.postMessage({ type: 'rewrite-yomitan-content', ready }, '*');
  }

  function update() {
    cancelAnimationFrame(paint);
    if (!hasContent()) {
      publish(false);
      return;
    }
    paint = requestAnimationFrame(() => publish(hasContent()));
  }

  const observer = new MutationObserver(update);
  observer.observe(entries, { childList: true });
  for (const notice of notices) observer.observe(notice, { attributes: true, attributeFilter: ['hidden'] });
  update();
}

module.exports = { observePopupContent };
