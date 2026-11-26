const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const { runInNewContext } = require('node:vm');

test('the red calibration guide only appears when explicitly enabled', () => {
  const script = readFileSync(join(__dirname, '../src/surface.js'), 'utf8');
  const classes = new Set();
  const dialogue = {
    classList: { toggle() {} },
    style: { setProperty() {} },
  };
  const harness = {};
  const nodes = { dialogue, harness, counter: { addEventListener() {} } };
  const window = {};
  runInNewContext(script, {
    window,
    document: {
      body: {
        classList: {
          toggle(name, force = !classes.has(name)) {
            if (force) classes.add(name);
            else classes.delete(name);
          },
        },
      },
      getElementById: (id) => nodes[id],
      querySelector: () => ({}),
      addEventListener() {},
    },
  });

  const settings = { text: '「台詞」', profile: { modifier: 'shift' }, harness: false };
  window.setDialogue(settings);
  assert.equal(classes.has('debug'), false);
  window.setDialogue({ ...settings, debug: true });
  assert.equal(classes.has('debug'), true);
  window.setDialogue(settings);
  assert.equal(classes.has('debug'), false);
});

test('leaving the dialogue cancels pending scans and release dismisses the popup', () => {
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
    setTimeout: (callback) => {
      const id = ++timerId;
      callbacks.set(id, () => {
        callbacks.delete(id);
        callback();
      });
      return id;
    },
    clearTimeout: (id) => callbacks.delete(id),
  });

  window.setLookupPoint({ point: { x: 400, y: 500 }, active: true });
  window.setLookupPoint({ point: { x: 410, y: 500 }, active: true });
  assert.equal(callbacks.size, 1);
  for (const callback of callbacks.values()) callback();
  assert.deepEqual(messages, [{ type: 'gsm-yomitan-control', action: 'lookup-point', x: 410, y: 500 }]);

  window.setLookupPoint({ point: { x: 420, y: 500 }, active: true });
  window.setLookupPoint({ point: null, active: true });
  assert.equal(callbacks.size, 0);
  assert.equal(messages.length, 1);

  window.setLookupPoint({ point: { x: 430, y: 500 }, active: true });
  window.setLookupPoint({ point: null, active: false });
  assert.equal(callbacks.size, 0);
  assert.deepEqual(messages[1], { type: 'gsm-yomitan-control', action: 'hide-popup' });
});
