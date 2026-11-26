const dialogue = document.getElementById('dialogue');
const canvas = document.getElementById('canvas');

window.setDialogueText = (text) => {
  dialogue.textContent = text;
  dialogue.classList.toggle('quoted', /^[「『]/u.test(text));
};

window.setDialogue = ({ text, profile, debug = false, harness }) => {
  window.setDialogueText(text);
  Object.assign(dialogue.style, {
    left: `${profile.x}px`, top: `${profile.y}px`,
    width: `${profile.width}px`, height: `${profile.height}px`,
    fontFamily: JSON.stringify(profile.font), fontSize: `${profile.fontSize}px`,
    letterSpacing: `${profile.characterAdvance - profile.fontSize}px`,
    lineHeight: `${profile.lineHeight}px`,
  });
  dialogue.style.setProperty('--character-advance', `${profile.characterAdvance}px`);
  document.body.classList.toggle('harness', harness);
  document.body.classList.toggle('debug', debug);
  document.getElementById('harness').hidden = !harness;
  const key = profile.modifier[0].toUpperCase() + profile.modifier.slice(1);
  document.querySelector('#harness p').textContent = `Hold ${key} and hover over 飽. Release the key, then click the counter.`;
};

window.setCanvasTransform = ({ x, y, scaleX, scaleY }) => {
  canvas.style.transform = `translate(${x}px, ${y}px) scale(${scaleX}, ${scaleY})`;
};

let hoverTimer;
window.setLookupPoint = ({ point, active }) => {
  clearTimeout(hoverTimer);
  // The local GSM Yomitan build accepts viewport coordinates while the HWND stays click-through.
  const type = 'gsm-yomitan-control';
  if (!active) {
    window.postMessage({ type, action: 'hide-popup' }, '*');
    return;
  }
  if (!point) return;

  hoverTimer = setTimeout(() => {
    if (document.elementFromPoint(point.x, point.y) === dialogue) {
      window.postMessage({ type, action: 'lookup-point', ...point }, '*');
    }
  }, 45);
};

if (window.publishPopupBounds) {
  const findPopup = () => document.querySelector('iframe.yomitan-popup');
  window.addEventListener('message', ({ source, origin, data }) => {
    if (data?.type !== 'rewrite-yomitan-content' || !origin.startsWith('chrome-extension://')) return;
    const popup = findPopup();
    if (!popup || source !== popup.contentWindow) return;
    popup.toggleAttribute('data-rewrite-popup-ready', data.ready === true);
  });

  let lastBounds;
  const publish = () => {
    const popup = findPopup();
    let bounds = null;
    if (popup?.hasAttribute('data-rewrite-popup-ready') && getComputedStyle(popup).visibility === 'visible') {
      const { left, top, right, bottom } = popup.getBoundingClientRect();
      bounds = { left, top, right, bottom, width: innerWidth, height: innerHeight };
    }
    const key = JSON.stringify(bounds);
    if (key === lastBounds) return;
    lastBounds = key;
    window.publishPopupBounds(bounds);
  };
  new MutationObserver(publish).observe(document.body, {
    subtree: true, childList: true, attributes: true,
    attributeFilter: ['style', 'class', 'hidden', 'data-rewrite-popup-ready'],
  });
  window.addEventListener('resize', publish);
}

const counter = document.getElementById('counter');
let count = 0;
function countInput() { counter.textContent = `Input received: ${++count}`; }
counter.addEventListener('click', countInput);
document.addEventListener('keydown', (event) => {
  if (event.code === 'Space' && event.target !== counter && !event.repeat) countInput();
});
