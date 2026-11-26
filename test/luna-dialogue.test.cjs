const assert = require('node:assert/strict');
const test = require('node:test');
const { connectLunaDialogue, normalizeDialogue } = require('../src/luna-dialogue.cjs');

test('normalizes line endings while preserving dialogue punctuation and spacing', () => {
  assert.equal(normalizeDialogue('\uFEFF「そうだね。\r\n　また明日」'), '「そうだね。\n　また明日」');
  assert.equal(normalizeDialogue('【小鳥】\r\n「そうだね」'), '「そうだね」');
  assert.equal(normalizeDialogue('【心の声】これは本文だ。'), '【心の声】これは本文だ。');
  assert.equal(normalizeDialogue('　\r\n'), '');
  assert.equal(normalizeDialogue(new Uint8Array()), null);
});

test('restores the game-width ellipsis from processed ASCII dot groups', () => {
  assert.equal(normalizeDialogue('「...待っててね」'), '「…待っててね」');
  assert.equal(normalizeDialogue('「……帰ろう......」'), '「……帰ろう……」');
  assert.equal(normalizeDialogue('「....あと2.5分」'), '「....あと2.5分」');
});

test('the client receives local text, clears on disconnect, and resumes with a new connection', async (t) => {
  const messages = [];
  const sockets = [];
  let connectedAgain;
  const nextConnection = new Promise((resolve) => { connectedAgain = resolve; });
  class Socket extends EventTarget {
    readyState = 0;

    constructor(url) {
      super();
      this.url = url;
      sockets.push(this);
      if (sockets.length === 2) connectedAgain(this);
    }

    message(data) {
      this.dispatchEvent(new MessageEvent('message', { data }));
    }

    close() {
      this.readyState = 3;
      this.dispatchEvent(new Event('close'));
    }
  }

  const stop = connectLunaDialogue(2333, { onText: (text) => messages.push(text), log() {}, Socket, retryDelay: 1 });
  t.after(stop);
  const [first] = sockets;
  assert.equal(first.url, 'ws://127.0.0.1:2333/api/ws/text/origin');
  assert.deepEqual(messages, []);
  first.message('「一行目」');
  first.close();
  first.message('古い接続');
  const second = await nextConnection;
  second.message('「二行目\r\nつづき」');
  second.message('最後はブレードで叩くように破壊した(うまく切断できなかった)。');
  second.message('「3回!? 次は...」');
  stop();
  second.message('終了後');
  assert.deepEqual(messages, [
    '「一行目」', '', '「二行目\nつづき」',
    '最後はブレードで叩くように破壊した（うまく切断できなかった）。',
    '「３回！？　次は…」',
  ]);
  assert.equal(second.readyState, 3);
});
