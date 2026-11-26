const assert = require('node:assert/strict');
const test = require('node:test');
const { runInNewContext } = require('node:vm');
const { observePopupContent } = require('../src/yomitan-popup.cjs');

test('popup stays hidden until an entry or a Yomitan notice is ready to paint', () => {
  const entries = { childElementCount: 0 };
  const noResults = { hidden: true };
  const states = [];
  let changed;
  let frame;
  runInNewContext(`(${observePopupContent})()`, {
    document: { getElementById: (id) => ({ 'dictionary-entries': entries, 'no-results': noResults }[id]) },
    window: { parent: { postMessage: ({ ready }) => states.push(ready) } },
    MutationObserver: class {
      constructor(callback) { changed = callback; }
      observe() {}
    },
    requestAnimationFrame: (callback) => { frame = callback; },
    cancelAnimationFrame: () => { frame = undefined; },
  });

  assert.deepEqual(states, [false]);
  entries.childElementCount = 1;
  changed();
  assert.deepEqual(states, [false]);
  frame();
  assert.deepEqual(states, [false, true]);

  entries.childElementCount = 0;
  changed();
  assert.deepEqual(states, [false, true, false]);
  noResults.hidden = false;
  changed();
  frame();
  assert.deepEqual(states, [false, true, false, true]);
});
