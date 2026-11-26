const canvas = { width: 1280, height: 720 };

const defaults = {
  x: 160, y: 526, width: 960, height: 140,
  font: 'MS Gothic', fontSize: 28, characterAdvance: 28, lineHeight: 42,
  fit: 'contain', offsetX: 0, offsetY: 0, modifier: 'shift',
};

const modifiers = { shift: 0x10, control: 0x11, alt: 0x12 };

function calibration(overrides = {}) {
  if (overrides === null || typeof overrides !== 'object' || Array.isArray(overrides)) {
    throw new Error('Calibration must be a JSON object.');
  }
  const profile = { ...defaults, ...overrides };
  for (const key of ['x', 'y', 'width', 'height', 'fontSize', 'characterAdvance', 'lineHeight', 'offsetX', 'offsetY']) {
    if (!Number.isFinite(profile[key])) throw new Error(`Calibration ${key} must be a number.`);
  }
  for (const key of ['width', 'height', 'fontSize', 'characterAdvance', 'lineHeight']) {
    if (profile[key] <= 0) throw new Error(`Calibration ${key} must be positive.`);
  }
  if (typeof profile.font !== 'string' || !profile.font.trim()) throw new Error('Calibration font must be a font family.');
  if (!['contain', 'stretch'].includes(profile.fit)) throw new Error('Calibration fit must be contain or stretch.');
  if (!Object.hasOwn(modifiers, profile.modifier)) throw new Error('Calibration modifier must be shift, control, or alt.');
  return profile;
}

function canvasTransform(client, profile) {
  let scaleX = client.width / canvas.width;
  let scaleY = client.height / canvas.height;
  if (profile.fit === 'contain') scaleX = scaleY = Math.min(scaleX, scaleY);
  return {
    scaleX, scaleY,
    x: (client.width - canvas.width * scaleX) / 2 + profile.offsetX * scaleX,
    y: (client.height - canvas.height * scaleY) / 2 + profile.offsetY * scaleY,
  };
}

function dialoguePoint(snapshot, dipClient, profile) {
  const cursorX = (snapshot.CursorX - snapshot.X) * dipClient.width / snapshot.Width;
  const cursorY = (snapshot.CursorY - snapshot.Y) * dipClient.height / snapshot.Height;
  const transform = canvasTransform(dipClient, profile);
  const x = (cursorX - transform.x) / transform.scaleX - profile.x;
  const y = (cursorY - transform.y) / transform.scaleY - profile.y;
  if (cursorX < 0 || cursorX >= dipClient.width || cursorY < 0 || cursorY >= dipClient.height ||
      x < 0 || x >= profile.width || y < 0 || y >= profile.height) return null;
  return { x: cursorX, y: cursorY };
}

module.exports = { modifiers, calibration, canvasTransform, dialoguePoint };
