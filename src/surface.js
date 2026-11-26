const dialogue = document.getElementById('dialogue');
const canvas = document.getElementById('canvas');

window.setDialogue = ({ text, profile, debug, harness }) => {
  dialogue.textContent = text;
  Object.assign(dialogue.style, {
    left: `${profile.x}px`, top: `${profile.y}px`,
    width: `${profile.width}px`, height: `${profile.height}px`,
    fontFamily: JSON.stringify(profile.font), fontSize: `${profile.fontSize}px`,
    letterSpacing: `${profile.characterAdvance - profile.fontSize}px`,
    lineHeight: `${profile.lineHeight}px`,
  });
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
window.setLookupPoint = (point) => {
  clearTimeout(hoverTimer);
  // The local GSM Yomitan build accepts viewport coordinates while the HWND stays click-through.
  const type = 'gsm-yomitan-control';
  if (!point) {
    window.postMessage({ type, action: 'hide-popup' }, '*');
    return;
  }

  hoverTimer = setTimeout(() => {
    if (document.elementFromPoint(point.x, point.y) === dialogue) {
      window.postMessage({ type, action: 'lookup-point', ...point }, '*');
    }
  }, 45);
};

const counter = document.getElementById('counter');
let count = 0;
function countInput() { counter.textContent = `Input received: ${++count}`; }
counter.addEventListener('click', countInput);
document.addEventListener('keydown', (event) => {
  if (event.code === 'Space' && event.target !== counter && !event.repeat) countInput();
});
