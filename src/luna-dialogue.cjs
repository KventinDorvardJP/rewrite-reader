function normalizeDialogue(message) {
  if (typeof message !== 'string') return null;
  const text = message.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
    // LunaTranslator can expand Rewrite+'s ellipsis glyph into three ASCII dots.
    .replace(/\.{3,}/g, (dots) => dots.length % 3 === 0 ? '…'.repeat(dots.length / 3) : dots);
  if (!text.trim()) return '';

  // A bracketed speaker on its own line is outside the calibrated dialogue box.
  return text.replace(/^[ \t　]*【[^【】\n]+】[ \t　]*\n(?=[ \t　]*[「『])/u, '');
}

function connectLunaDialogue(port, { onText, log, Socket = WebSocket, retryDelay = 1500 }) {
  const url = `ws://127.0.0.1:${port}/api/ws/text/origin`;
  let socket;
  let retry;
  let timeout;
  let stopped = false;
  let waiting = false;

  function connect() {
    const current = new Socket(url);
    socket = current;

    function disconnected() {
      if (socket !== current || stopped) return;
      socket = undefined;
      clearTimeout(timeout);
      if (current.readyState < 2) current.close();
      onText('');
      if (!waiting) log('Waiting for LunaTranslator’s local text feed.');
      waiting = true;
      retry = setTimeout(connect, retryDelay);
    }

    timeout = setTimeout(disconnected, 4000);
    current.addEventListener('open', () => {
      if (socket !== current || stopped) return;
      clearTimeout(timeout);
      waiting = false;
      log('Connected to LunaTranslator. Advance to the next line to begin.');
    });
    current.addEventListener('message', ({ data }) => {
      if (socket !== current || stopped) return;
      const text = normalizeDialogue(data);
      // Luna normalizes the hook text to NFKC, including fullwidth symbols and
      // spaces. Restore their game cells for the fixed-pitch Rewrite+ layout.
      if (text !== null) {
        onText(text.replace(/[\x20-\x7e]/g, (glyph) =>
          glyph === ' ' ? '\u3000' : String.fromCharCode(glyph.charCodeAt(0) + 0xFEE0)));
      }
    });
    current.addEventListener('error', disconnected);
    current.addEventListener('close', disconnected);
  }

  connect();
  return () => {
    stopped = true;
    clearTimeout(retry);
    clearTimeout(timeout);
    if (socket?.readyState < 2) socket.close();
  };
}

module.exports = { connectLunaDialogue, normalizeDialogue };
