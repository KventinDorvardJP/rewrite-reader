const { app, BrowserWindow, screen, session, webFrameMain } = require('electron');
const { spawn } = require('node:child_process');
const { existsSync, mkdirSync, readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { createInterface } = require('node:readline');
const { parseArgs } = require('node:util');
const { calibration, canvasTransform, dialoguePoint, modifiers, popupWheelRect } = require('./layout.cjs');
const { connectLunaDialogue } = require('./luna-dialogue.cjs');
const { observePopupContent } = require('./yomitan-popup.cjs');

const root = resolve(__dirname, '..');
const profileDir = join(root, '.local', 'profile');
const surface = join(__dirname, 'surface.html');
const sample = '「うまいけど、いつか飽きるなこりゃ」';
const frameHeaderBytes = 32;
let tracker;

function log(message) { console.log(`[Rewrite+] ${message}`); }
function fail(error) {
  console.error(`[Rewrite+] ${error.message ?? error}`);
  tracker?.kill();
  app.exit(1);
}

function readCalibration(path) {
  return calibration(existsSync(path) ? JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')) : {});
}

function rendererCall(window, name, argument) {
  return window.webContents.executeJavaScript(`${name}(${JSON.stringify(argument)})`);
}

function createWindow(options = {}) {
  const window = new BrowserWindow({
    show: false,
    autoHideMenuBar: true,
    ...options,
    webPreferences: { sandbox: true, contextIsolation: true, ...options.webPreferences },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  return window;
}

async function createHarness(profile) {
  const harness = createWindow({
    title: 'Rewrite+ overlay test harness', width: 1050, height: 700, useContentSize: true,
  });
  await harness.loadFile(surface);
  harness.setTitle('Rewrite+ overlay test harness');
  await rendererCall(harness, 'setDialogue', { text: sample, profile, harness: true, debug: false });
  const updateLayout = () => {
    const [width, height] = harness.getContentSize();
    void rendererCall(harness, 'setCanvasTransform', canvasTransform({ width, height }, profile)).catch((error) => {
      if (!harness.isDestroyed()) fail(error);
    });
  };
  updateLayout();
  harness.on('resize', updateLayout);
  harness.show();
  return harness.getNativeWindowHandle().readBigUInt64LE().toString();
}

function trackOverlay({ overlay, target, profile, debug, executable, popupUrl, lunaPort }) {
  let dialogue = lunaPort ? '' : sample;
  let dialogueRevision = 0;
  let applyingDialogue = false;
  let latest;
  let ready = false;
  let lastPoint = null;
  let lookupActive = false;
  let previousBounds;
  let previousDpi;
  let presentation;
  let popupBounds;
  let repaintAfterDrain = false;
  let stopLuna;

  function present(state) {
    if (!state && presentation) {
      presentation = undefined;
      overlay.webContents.stopPainting();
      tracker.stdin.write(Buffer.alloc(frameHeaderBytes));
    } else if (state) {
      if (!presentation) overlay.webContents.startPainting();
      const previous = presentation;
      presentation = state;
      if (!previous || state.X !== previous.X || state.Y !== previous.Y ||
          state.Width !== previous.Width || state.Height !== previous.Height) overlay.webContents.invalidate();
    }
  }

  function updateLookup(point, held) {
    // Keep the popup available across the gap between the dialogue and the result.
    const active = held && (lookupActive || point !== null);
    const changed = active !== lookupActive;
    if (!changed && point?.x === lastPoint?.x && point?.y === lastPoint?.y) return;
    if (changed) {
      log(active ? 'Lookup active over the dialogue region.' : 'Lookup dismissed.');
    }
    lookupActive = active;
    if (!lookupActive) popupBounds = null;
    lastPoint = point;
    void rendererCall(overlay, 'setLookupPoint', { point, active }).catch((error) => {
      if (!overlay.isDestroyed()) fail(error);
    });
  }

  function update() {
    if (!ready || !latest) return;
    const state = latest;
    if (previousDpi !== state.Dpi) {
      const topLeft = screen.screenToDipPoint({ x: state.X, y: state.Y });
      const displayScale = Math.round(screen.getDisplayNearestPoint(topLeft).scaleFactor * 100);
      log(`Target reports ${state.Dpi} DPI, display scale ${displayScale}%, physical client ${state.Width} × ${state.Height}.`);
      previousDpi = state.Dpi;
    }
    if (!state.Foreground || !state.Visible || !state.Width || !state.Height || !dialogue || applyingDialogue) {
      updateLookup(null, false);
      present(null);
      return;
    }

    const bounds = screen.screenToDipRect(null, {
      x: state.X, y: state.Y, width: state.Width, height: state.Height,
    });
    if (!previousBounds || Object.keys(bounds).some((key) => bounds[key] !== previousBounds[key])) {
      overlay.setBounds(bounds);
      previousBounds = bounds;
      void rendererCall(overlay, 'setCanvasTransform', canvasTransform(bounds, profile)).catch((error) => {
        if (!overlay.isDestroyed() && ready) fail(error);
      });
    }
    const point = state.Held ? dialoguePoint(state, bounds, profile) : null;
    updateLookup(point, state.Held);
    present(debug || lookupActive ? state : null);
  }

  function replaceDialogue(text) {
    if (text === dialogue) return;
    dialogue = text;
    if (!ready) return;
    const revision = ++dialogueRevision;
    applyingDialogue = true;
    update();
    void rendererCall(overlay, 'setDialogueText', text).then(() => {
      if (overlay.isDestroyed() || revision !== dialogueRevision) return;
      applyingDialogue = false;
      if (debug && text) log(`LunaTranslator dialogue updated (${text.split('\n').length} lines, ${text.length} characters).`);
      update();
    }).catch((error) => {
      if (!overlay.isDestroyed()) fail(error);
    });
  }

  function scrollPopup({ WheelDelta, ScrollLines }) {
    if (!lookupActive || !popupBounds || !Number.isInteger(WheelDelta) || !Number.isInteger(ScrollLines)) return;
    const popup = overlay.webContents.mainFrame.frames.find((frame) => frame.url.split('?')[0] === popupUrl);
    if (!popup) return;
    void popup.executeJavaScript(`(() => {
      const content = document.getElementById('content-scroll');
      if (!content) return;
      const lines = ${ScrollLines};
      const step = lines === -1 ? content.clientHeight : lines * 16;
      content.scrollBy({ top: ${-WheelDelta / 120} * step, behavior: 'instant' });
    })()`).catch((error) => {
      if (lookupActive && !popup.detached) log(`Popup scroll: ${error.message}`);
    });
  }

  overlay.webContents.ipc.on('yomitan-popup-bounds', (event, bounds) => {
    if (event.senderFrame !== overlay.webContents.mainFrame) return;
    popupBounds = lookupActive ? bounds : null;
    if (lookupActive && presentation) overlay.webContents.invalidate();
  });

  overlay.webContents.on('did-frame-finish-load', (_event, mainFrame, processId, routingId) => {
    if (mainFrame) return;
    const frame = webFrameMain.fromId(processId, routingId);
    if (frame?.url.split('?')[0] !== popupUrl) return;
    void frame.executeJavaScript(`(${observePopupContent})()`).catch((error) => {
      if (!frame.detached && !overlay.isDestroyed()) log(`Popup content: ${error.message}`);
    });
  });

  overlay.webContents.once('did-finish-load', async () => {
    try {
      await rendererCall(overlay, 'setDialogue', { text: dialogue, profile, debug, harness: false });
      ready = true;
      update();
      if (lunaPort) stopLuna = connectLunaDialogue(lunaPort, { onText: replaceDialogue, log });
    } catch (error) {
      if (!overlay.isDestroyed()) fail(error);
    }
  });
  const trackerArgs = [target, String(modifiers[profile.modifier]), '--popup-wheel'];
  if (lunaPort) trackerArgs.push('--live-dialogue');
  tracker = spawn(executable, trackerArgs, { windowsHide: true });
  tracker.stdin.on('error', (error) => { if (error.code !== 'EPIPE') fail(error); });
  tracker.stdin.on('drain', () => {
    if (presentation && repaintAfterDrain && !overlay.isDestroyed()) overlay.webContents.invalidate();
    repaintAfterDrain = false;
  });
  tracker.stderr.pipe(process.stderr);
  tracker.on('error', fail);
  tracker.on('close', (code) => {
    tracker = null;
    if (code === 0) {
      log('Target window closed.');
      app.quit();
    } else if (code !== null) {
      fail('Window tracker stopped. Rebuild it with npm.cmd run build:tracker. For game mode, open windowed Rewrite+ before launching.');
    }
  });
  createInterface({ input: tracker.stdout }).on('line', (line) => {
    try {
      const message = JSON.parse(line);
      if (Object.hasOwn(message, 'WheelDelta')) {
        scrollPopup(message);
      } else if (message.DialogueCleared === true) {
        if (lunaPort) replaceDialogue('');
      } else {
        latest = message;
        update();
      }
    } catch (error) { fail(error); }
  });
  overlay.webContents.setFrameRate(12);
  overlay.webContents.stopPainting();
  overlay.webContents.on('paint', (_event, _dirty, image) => {
    if (image.isEmpty() || !presentation || !tracker) return;
    if (tracker.stdin.writableNeedDrain) {
      repaintAfterDrain = true;
      return;
    }
    const { X, Y, Width, Height } = presentation;
    const size = image.getSize(1);
    const frame = size.width === Width && size.height === Height ? image : image.resize({ width: Width, height: Height });
    const pixels = frame.toBitmap({ scaleFactor: 1 });
    if (pixels.length !== Width * Height * 4) {
      return fail(`Unexpected native overlay frame size ${pixels.length} for ${Width} × ${Height}. ` +
        `Source is ${JSON.stringify(size)} at ${image.getScaleFactors().join(', ')}.`);
    }
    const region = popupWheelRect(lookupActive ? popupBounds : null, Width, Height);
    const header = Buffer.alloc(frameHeaderBytes);
    for (const [index, value] of [X, Y, Width, Height, ...region].entries()) header.writeInt32LE(value, index * 4);
    tracker.stdin.write(header);
    tracker.stdin.write(pixels);
  });
  overlay.once('closed', () => stopLuna?.());
  overlay.loadFile(surface).catch(fail);
}

async function main() {
  app.setName('Rewrite+ Overlay');
  app.commandLine.appendSwitch('disable-background-networking');
  // The software path supplies CPU bitmaps for the Windows layered overlay.
  app.disableHardwareAcceleration();
  const { values: options } = parseArgs({ args: process.argv.slice(2), options: {
    game: { type: 'boolean' }, live: { type: 'boolean' }, 'luna-port': { type: 'string' },
    calibrate: { type: 'boolean' }, settings: { type: 'boolean' },
    calibration: { type: 'string' }, help: { type: 'boolean' },
  } });
  if (options.help) {
    log('npm start -- [--calibrate] [--calibration PATH] [--game | --live [--luna-port PORT] | --settings]');
    app.quit();
    return;
  }
  const gameMode = options.game || options.live;
  if (options.settings && gameMode) throw new Error('Choose either settings or game mode.');
  const lunaPort = options.live ? Number(options['luna-port'] ?? 2333) : undefined;
  if (options['luna-port'] && !options.live) throw new Error('--luna-port requires --live.');
  if (options.live && (!Number.isInteger(lunaPort) || lunaPort < 1 || lunaPort > 65535)) {
    throw new Error('--luna-port must be an integer between 1 and 65535.');
  }

  mkdirSync(profileDir, { recursive: true });
  app.setPath('userData', profileDir);
  if (!app.requestSingleInstanceLock()) throw new Error('Close the other Rewrite+ Overlay window before starting another session.');
  await app.whenReady();

  const extensionPath = join(root, '.local', 'gsm', 'GSM_Overlay', 'yomitan');
  if (!existsSync(join(extensionPath, 'manifest.json'))) {
    throw new Error('Missing the Electron-compatible Yomitan bundle. See Setup in the README.');
  }
  const overlaySession = session.fromPartition('persist:rewrite-overlay');
  // The overlay handles local files and the local extension. Downloads can be done in a regular browser.
  overlaySession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => {
    callback({ cancel: true });
  });
  const extension = await overlaySession.extensions.loadExtension(extensionPath, { allowFileAccess: true });
  log(`Loaded ${extension.name} ${extension.version} in the companion profile.`);

  if (options.settings) {
    const settings = createWindow({ width: 1000, height: 750, webPreferences: { session: overlaySession } });
    await settings.loadURL(new URL('settings.html', extension.url).href);
    settings.show();
    return;
  }

  const executable = join(root, 'native', 'bin', 'Release', 'net10.0-windows', 'Tracker.exe');
  if (!existsSync(executable)) throw new Error('Missing window tracker. Run npm run build:tracker.');
  const profile = readCalibration(resolve(options.calibration ?? join(root, 'calibration.json')));
  const target = gameMode ? 'game' : await createHarness(profile);
  const overlay = createWindow({
    frame: false, transparent: true, focusable: false, backgroundColor: '#00000000',
    webPreferences: { session: overlaySession, preload: join(__dirname, 'overlay-preload.cjs'), backgroundThrottling: false, offscreen: true },
  });
  overlay.setTitle('Rewrite+ transparent overlay');
  overlay.webContents.on('console-message', (event) => {
    if (event.level === 'error') log(`Renderer: ${event.message}`);
  });
  if (lunaPort) log(`Game mode with LunaTranslator on 127.0.0.1:${lunaPort}.`);
  else log(gameMode ? 'Game mode with the fixed Phase 1 test line.' : 'Test harness with the fixed Phase 1 test line.');
  trackOverlay({ overlay, target, profile, debug: options.calibrate, executable, lunaPort,
    popupUrl: new URL('popup.html', extension.url).href });
}

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => tracker?.kill());
main().catch(fail);
