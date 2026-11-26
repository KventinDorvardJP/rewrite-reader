const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const { runInNewContext } = require('node:vm');

test('pointer updates coalesce and releasing the key cancels a pending lookup', () => {
  const script = readFileSync(join(__dirname, '../src/surface.js'), 'utf8');
  const dialogue = {};
  const counter = { addEventListener() {} };
  const messages = [];
  const window = { postMessage: (message) => messages.push({ ...message }) };
  const callbacks = new Map();
  let timerId = 0;
  runInNewContext(script, {
    window,
    document: {
      getElementById: (id) => ({ dialogue, counter }[id]),
      elementFromPoint: () => dialogue,
      addEventListener() {},
    },
    setTimeout: (callback) => { callbacks.set(++timerId, callback); return timerId; },
    clearTimeout: (id) => callbacks.delete(id),
  });

  window.setLookupPoint({ x: 400, y: 500 });
  window.setLookupPoint({ x: 410, y: 500 });
  assert.equal(callbacks.size, 1);
  for (const callback of callbacks.values()) callback();
  assert.deepEqual(messages, [{ type: 'gsm-yomitan-control', action: 'lookup-point', x: 410, y: 500 }]);

  window.setLookupPoint({ x: 420, y: 500 });
  window.setLookupPoint(null);
  assert.equal(callbacks.size, 0);
  assert.deepEqual(messages[1], { type: 'gsm-yomitan-control', action: 'hide-popup' });
});
