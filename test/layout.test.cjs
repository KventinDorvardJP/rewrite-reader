const assert = require('node:assert/strict');
const test = require('node:test');
const { calibration, canvasTransform, dialoguePoint, popupWheelRect } = require('../src/layout.cjs');

test('a native-size client maps the Rewrite+ canvas without scaling', () => {
  assert.deepEqual(canvasTransform({ width: 1280, height: 720 }, calibration()), {
    x: 0, y: 0, scaleX: 1, scaleY: 1,
  });
});

test('contain accounts for vertical and horizontal letterboxing', () => {
  const profile = calibration();
  assert.deepEqual(canvasTransform({ width: 1280, height: 920 }, profile), {
    x: 0, y: 100, scaleX: 1, scaleY: 1,
  });
  assert.deepEqual(canvasTransform({ width: 1600, height: 720 }, profile), {
    x: 160, y: 0, scaleX: 1, scaleY: 1,
  });
});

test('stretch uses separate scale factors and applies a canvas-space offset', () => {
  const profile = calibration({ fit: 'stretch', offsetX: -10, offsetY: 20 });
  assert.deepEqual(canvasTransform({ width: 640, height: 720 }, profile), {
    x: -5, y: 20, scaleX: 0.5, scaleY: 1,
  });
});

test('a mouse in physical pixels hits the same region as the renderer on a 150% monitor', () => {
  const snapshot = { X: -1920, Y: 100, Width: 1920, Height: 1200, CursorX: -1680, CursorY: 949 };
  const client = { width: 1280, height: 800 };
  const profile = calibration();
  assert.deepEqual(dialoguePoint(snapshot, client, profile), { x: 160, y: 566 });
  assert.equal(dialoguePoint({ ...snapshot, CursorX: -1681 }, client, profile), null);
  assert.equal(dialoguePoint({ ...snapshot, CursorY: 948 }, client, profile), null);
  assert.equal(dialoguePoint({ ...snapshot, CursorX: -240 }, client, profile), null);
});

test('invalid geometry and lookup keys are rejected at startup', () => {
  assert.throws(() => calibration(null), /JSON object/);
  assert.throws(() => calibration({ lineHeight: 0 }), /positive/);
  assert.throws(() => calibration({ fontSize: '28' }), /number/);
  assert.throws(() => calibration({ modifier: 'escape' }), /modifier/);
});

test('the Rewrite+ wrap width follows the calibrated character advance unless explicitly set', () => {
  assert.equal(calibration({ characterAdvance: 30.2 }).width, 800);
  assert.equal(calibration({ characterAdvance: 30.2, width: 810 }).width, 810);
});

test('the wheel region maps to physical pixels and clips to the displayed client', () => {
  const bounds = { left: 50.1, top: -12, right: 402.9, bottom: 150, width: 400, height: 200 };
  assert.deepEqual(popupWheelRect(bounds, 500, 250), [63, 0, 500, 187]);
  assert.deepEqual(popupWheelRect({ ...bounds, left: 405 }, 500, 250), [0, 0, 0, 0]);
  assert.deepEqual(popupWheelRect({ ...bounds, width: 0 }, 500, 250), [0, 0, 0, 0]);
  assert.deepEqual(popupWheelRect(null, 500, 250), [0, 0, 0, 0]);
});
