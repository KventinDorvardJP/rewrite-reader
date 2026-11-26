# AGENTS.md — Rewrite+ Yomitan Overlay

## 1. Mission

Build a lightweight Windows companion application that enables Yomitan dictionary lookups directly over the original Japanese dialogue rendered by **Rewrite+ (Japanese PC edition, SiglusEngine)**.

The user already has a working LunaTranslator HOOK + Yomitan workflow. The purpose of this project is to eliminate the separate visible text window, not to reproduce it.

Target experience:

1. The user reads Rewrite+ normally.
2. The user encounters an unfamiliar Japanese word.
3. The user holds Shift and hovers over the word in the original game dialogue.
4. A Yomitan dictionary popup appears near that word.
5. The user releases Shift and continues playing normally.

The game's visible text, artwork, interface and normal input behavior must remain unchanged.

## 2. Target environment

- Windows desktop (verify OS version and DPI settings locally).
- Japanese PC edition of Rewrite+, running on SiglusEngine.
- Native game canvas: 1280 × 720; distinguish this from the actual displayed client size.
- User's in-game font: ＭＳ ゴシック (MS Gothic); verify the actual rendering settings.
- Existing LunaTranslator and Yomitan installations.
- Intel Core i7 (13th generation), RTX 4050 Laptop GPU, 32 GB RAM.

Start in windowed mode. Do not assume that exclusive fullscreen supports an external overlay. Do not hardcode the coordinates of a particular screenshot or window position.

## 3. Non-negotiable scope

- Build for Rewrite+ first. Generalization to other visual novels is explicitly deferred until the user finishes Rewrite+ and requests it.
- Preserve the original game installation, executable, resources and save files. Do not patch files on disk.
- Prefer established text acquisition methods and documented APIs over new engine reverse engineering.
- Do not use OCR as the primary method of acquiring dialogue. A diagnostic or explicitly approved fallback may be evaluated separately.
- Do not build a separate visible dialogue reader as the final product.
- Do not replace the original game text with an independently rendered visible copy.
- Do not reimplement SiglusEngine or Yomitan's dictionary engine.
- Do not add AI translation, cloud services, unrelated mining features, or asset upscaling.
- Do not disable or weaken security controls. Do not alter unrelated applications or system settings without explicit approval.
- Keep processing local where practical; do not transmit game text or dictionary data to external services.
- Respect third-party licenses. Document dependencies and any reused code.

## 4. Technical direction

Treat the following architecture as a starting hypothesis, not a mandated implementation. Choose the simplest verified approach and record significant deviations.

### 4.1 Dialogue acquisition

Investigate LunaTranslator's existing HOOK workflow and established text-hook libraries. Prefer consuming an available local text output or supported integration over duplicating injection code when feasible. If an independent hook is needed, isolate it behind a small adapter and limit it to the intended game process.

- Obtain the active Japanese dialogue, preserving punctuation and meaningful line breaks.
- Distinguish speaker names, stale output, repeated hook events and unrelated strings from the active dialogue.
- Handle scene transitions, loading saves, window closure and changing dialogue.
- Avoid displaying stale lookup targets when no dialogue is visible.
- Determine whether hook output contains the full sentence before the typewriter effect finishes. Do not silently claim synchronization with visible characters unless verified.

### 4.2 Transparent text and positioning

Use a transparent overlay over the game's client area, with invisible but hit-testable text or equivalent character geometry.

For an HTML-based implementation, test transparent text (`color: transparent`) rather than removing it from layout with `display: none` or `visibility: hidden`. Keep the text as a coherent string or provide equivalent text ranges so dictionary matching can extend across adjacent characters.

- Start with calibrated font metrics, text origin, character advance, line height, margins and wrapping rules.
- Match game coordinates to physical screen coordinates, including DPI scaling, window borders, resizing, letterboxing and aspect ratio.
- Prefer deterministic layout for the initial fixed Rewrite+ dialogue style.
- Do not assume that using MS Gothic guarantees identical spacing between SiglusEngine and the browser renderer.
- If simple layout cannot meet the acceptance criteria, document the mismatch and evaluate more precise engine-derived layout data before escalating complexity.

### 4.3 Yomitan integration

Investigate the current implementations and documentation of:

- LunaTranslator: https://github.com/HIllya51/LunaTranslator
- Yomitan: https://github.com/yomidevs/yomitan
- Yomitan API: https://github.com/yomidevs/yomitan-api
- GameSentenceMiner: https://github.com/bpwhelan/GameSentenceMiner
- YomiNinja: https://github.com/matt-m-o/YomiNinja

These are research leads, not pre-verified dependencies. Check their current availability, APIs, licensing and actual capabilities before selecting an implementation.

Prefer reuse of Yomitan's actual dictionary matching, deinflection, dictionaries, settings and native popup where feasible. Evaluate an extension-capable browser environment, an existing overlay implementation, or a local Yomitan API with a compatible popup if necessary.

- Verify extension support and popup behavior in the selected environment; do not assume that a generic WebView supports browser extensions or their required APIs.
- Do not assume the local API can invoke the native popup or share an existing browser profile automatically.
- If a separate dictionary import or a custom popup is required, explain the trade-off to the user before committing to it. Do not silently replace the intended experience.
- Let Yomitan handle Japanese word matching and deinflection rather than building a separate tokenizer or dictionary engine.
- Position the popup near the hovered character; keep it within the visible screen area.

### 4.4 Input and lifecycle

- Normal mode: overlay is click-through; game controls behave normally.
- Lookup mode: holding Shift enables hover lookup over the dialogue area.
- Releasing Shift returns to normal input behavior and closes or dismisses the lookup according to the configured behavior.
- Avoid unnecessary focus theft, stuck modifier states and interception outside the dialogue area.
- Verify Shift behavior against the game's existing bindings, including skip functions. If conflicts exist, offer a configurable alternative rather than silently changing game behavior.
- Track the game window's position, size, minimize/restore and foreground state. Hide the overlay when appropriate.
- Stop hooks, overlays and helper processes cleanly when the companion or game closes.

## 5. Calibration and diagnostics

Provide a debug mode that makes otherwise invisible overlay text visible in a contrasting color (e.g. translucent red), with optional character bounding boxes.

Allow adjustment and persistence of:

- Dialogue origin and text region.
- Font family, size, character advance and line height.
- Wrapping width and relevant offsets.
- Coordinate scaling and letterbox offsets where necessary.

Save a local Rewrite+ calibration profile. Provide a reset option.

Include useful, local diagnostic logging for text acquisition, layout, window tracking, modifier state and dictionary failures. Avoid excessive polling or logging full dialogue by default; opt-in verbose diagnostics are acceptable.

## 6. Development sequence

### Phase 0 — Investigation

Inspect the workspace and existing local installations as available. Identify reusable components. Verify technical assumptions using source code and documentation. Summarize the proposed stack, the principal risks and what remains unknown. Then proceed with the smallest safe proof of concept; do not stop at a speculative architecture document.

### Phase 1 — Static overlay and dictionary proof of concept

Use this manually supplied test line:

```text
「うまいけど、いつか飽きるなこりゃ」
```

- Display a transparent overlay over a Rewrite+ window (or a clearly identified test harness if the game is unavailable).
- Align the text using a visible calibration/debug mode.
- Hover over 飽きる while holding Shift and demonstrate a correct Yomitan-backed lookup.
- Demonstrate normal mouse interaction when Shift is released.
- Verify the popup appears above the original game text rather than inside a separate visible dialogue window.

Do not spend time developing live hooks until the overlay and dictionary interaction are shown to be viable. A test harness is not proof of successful live-game integration.

### Phase 2 — Live dialogue acquisition

Connect the verified text acquisition method to the overlay. Replace manually supplied text automatically as the game progresses. Handle repeated, stale and multiline dialogue. Establish a reproducible end-to-end test.

### Phase 3 — Usable Rewrite+ MVP

Improve calibration, window tracking, input behavior, performance, startup/shutdown and error recovery. Add a simple configuration interface or documented configuration file. Provide instructions for installing, running, calibrating and troubleshooting the application.

### Phase 4 — Real gameplay refinement

Use feedback from the user's ongoing Rewrite+ playthrough to address concrete issues. Do not expand scope without user approval.

Backlog screens, choices, complex furigana, unusual text layouts, exclusive fullscreen and support for other engines are deferred unless necessary for the agreed MVP or explicitly requested.

## 7. MVP acceptance criteria

The MVP is accepted only when the following are verified or clearly reported as outstanding:

- [ ] Works with the user's Japanese PC edition of Rewrite+.
- [ ] Captures active dialogue automatically without OCR as the primary method.
- [ ] Invisible interactive text aligns with the original dialogue sufficiently for reliable character targeting.
- [ ] Single-line and ordinary multiline dialogue work, including wrapping.
- [ ] Shift + hover retrieves the correct Japanese dictionary entry.
- [ ] The lookup appears near the word over the game, without requiring a separate visible reader.
- [ ] Original artwork, text rendering and interface remain visibly unchanged.
- [ ] Normal clicks and keyboard input work when lookup mode is inactive.
- [ ] Overlay follows the window when moved or resized and hides appropriately when minimized or inactive.
- [ ] Calibration is usable, persistent and reversible.
- [ ] The application handles missing dialogue, missing dictionary integration and game shutdown gracefully.
- [ ] CPU/GPU usage and lookup latency are measured during representative use and are acceptable to the user.
- [ ] No original game files or saves have been modified.
- [ ] Setup, launch, calibration, limitations and troubleshooting are documented.

## 8. Engineering and verification rules

- Work incrementally. Prefer a small maintainable implementation to speculative abstractions.
- Inspect existing files before editing. Preserve unrelated work and user changes.
- Use automated tests for coordinate transforms, text synchronization, layout calculations and state transitions where practical.
- Preserve meaningful tests. Never remove, weaken or redefine a failing test merely to obtain a passing result.
- Passing automated tests do not establish visual alignment, native popup behavior, live-game compatibility or input reliability. Verify these manually or report them as unverified.
- Do not claim to have run the game, observed the popup or measured performance unless actually done. If the environment prevents GUI testing, provide precise manual test steps and mark the limitation.
- Keep a README with setup and usage instructions and a short decision log for significant architectural choices.
- In completion reports, distinguish implemented behavior, automated verification, manual verification, known limitations and the next smallest useful task.
- Ask for user input only when a material decision, missing prerequisite or permission prevents safe progress. Otherwise proceed using the simplest reversible option.

## 9. Definition of success

The user should be able to read Rewrite+ in its original presentation, hold Shift over an unfamiliar Japanese word, receive a useful Yomitan lookup, and continue reading without switching to a separate text window.

Everything else is secondary. Universal VN support is a future project, not an MVP requirement.
