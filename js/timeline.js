import { actions } from "./context.js";
import { dom, state } from "./state.js";
import { escapeCss, normalizeTransform, roundForInput } from "./utils.js";

export function ensureElementAnimation(id) {
  const layer = state.layers.find(l => l.id === id);
  if (!state.activeProject.elements[id]) {
    state.activeProject.elements[id] = {
      id,
      name: layer?.name || id,
      selector: layer?.selector || `#${escapeCss(id)}`,
      keyframes: []
    };
  }
  return state.activeProject.elements[id];
}

export function addOrUpdateKeyframe() {
  if (!state.selectedElementId || !state.activeProject) return;

  const id = state.selectedElementId;
  const t = normalizeTransform(state.currentTransforms[id] || actions.readInspectorTransform());
  const anim = ensureElementAnimation(id);
  const frame = clampFrame(state.currentFrame);
  const existing = anim.keyframes.find(k => Number(k.frame) === frame);

  const key = {
    frame,
    transform: {
      x: t.x,
      y: t.y,
      rotation: t.rotation,
      scale: t.scale,
      opacity: t.opacity
    },
    pivot: {
      x: t.pivotX,
      y: t.pivotY
    },
    easing: "linear"
  };

  if (existing) {
    Object.assign(existing, key);
  } else {
    anim.keyframes.push(key);
  }

  anim.keyframes.sort((a, b) => a.frame - b.frame);
  actions.markDirty(true);
  actions.updateAllUi();
  actions.toast(`${existing ? "Updated" : "Added"} keyframe at frame ${frame}.`);
}

export function deleteKeyframe() {
  if (!state.selectedElementId || !state.activeProject) return;

  const anim = state.activeProject.elements[state.selectedElementId];
  if (!anim) return;

  const before = anim.keyframes.length;
  anim.keyframes = anim.keyframes.filter(k => Number(k.frame) !== state.currentFrame);

  if (anim.keyframes.length !== before) {
    actions.markDirty(true);
    renderFrame(state.currentFrame);
    actions.updateAllUi();
    actions.toast("Keyframe deleted.");
  }
}

export function hasKeyframeAtCurrentFrame() {
  if (!state.selectedElementId || !state.activeProject) return false;
  const anim = state.activeProject.elements[state.selectedElementId];
  return Boolean(anim && anim.keyframes.some(k => Number(k.frame) === state.currentFrame));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function interpolate(k1, k2, frame) {
  const span = k2.frame - k1.frame;
  const pct = span === 0 ? 0 : (frame - k1.frame) / span;
  const opacity1 = Number.isFinite(Number(k1.transform.opacity)) ? Number(k1.transform.opacity) : 1;
  const opacity2 = Number.isFinite(Number(k2.transform.opacity)) ? Number(k2.transform.opacity) : opacity1;

  return {
    x: lerp(k1.transform.x, k2.transform.x, pct),
    y: lerp(k1.transform.y, k2.transform.y, pct),
    rotation: lerp(k1.transform.rotation, k2.transform.rotation, pct),
    scale: lerp(k1.transform.scale, k2.transform.scale, pct),
    opacity: lerp(opacity1, opacity2, pct),
    pivotX: lerp(k1.pivot.x, k2.pivot.x, pct),
    pivotY: lerp(k1.pivot.y, k2.pivot.y, pct)
  };
}

export function transformFromKeyframe(k) {
  return normalizeTransform({
    x: k.transform.x,
    y: k.transform.y,
    rotation: k.transform.rotation,
    scale: k.transform.scale,
    opacity: k.transform.opacity,
    pivotX: k.pivot.x,
    pivotY: k.pivot.y
  });
}

export function getTransformAtFrame(keyframes, frame, fallback) {
  const keys = [...keyframes].sort((a, b) => a.frame - b.frame);
  if (!keys.length) return fallback;

  if (frame <= keys[0].frame) return transformFromKeyframe(keys[0]);
  if (frame >= keys[keys.length - 1].frame) return transformFromKeyframe(keys[keys.length - 1]);

  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (frame >= a.frame && frame <= b.frame) {
      return interpolate(a, b, frame);
    }
  }

  return fallback;
}

export function renderFrame(frame) {
  if (!state.activeProject || !state.svgRoot) return;

  state.currentFrame = clampFrame(frame);

  for (const layer of state.layers) {
    const anim = state.activeProject.elements[layer.id];
    const fallback = state.currentTransforms[layer.id] || actions.defaultTransformForElement(layer.id);
    const t = anim ? getTransformAtFrame(anim.keyframes, state.currentFrame, fallback) : fallback;

    state.currentTransforms[layer.id] = normalizeTransform(t);
    actions.applyTransformToElement(layer.id, t);
  }

  actions.applyLayerMasks();
  updateFrameUi();
  actions.updateInspector();
  actions.updatePivotIndicator();
  renderTimeline();
}

export function clampFrame(frame) {
  const duration = getDurationFrames();
  const n = Number(frame);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(duration - 1, Math.round(n)));
}

export function getFps() {
  return Math.max(1, Math.round(Number(state.activeProject?.fps || 24)));
}

export function getDurationFrames() {
  return Math.max(1, Math.round(Number(state.activeProject?.durationFrames || 120)));
}

export function setFrame(frame) {
  renderFrame(clampFrame(frame));
}

export function updateFrameUi() {
  const duration = getDurationFrames();

  dom.frameInput.disabled = !state.activeProject;
  dom.frameSlider.disabled = !state.activeProject;
  dom.goStartBtn.disabled = !state.activeProject;
  dom.playBtn.disabled = !state.activeProject;
  dom.pauseBtn.disabled = !state.activeProject;

  dom.frameInput.max = String(duration - 1);
  dom.frameInput.value = String(state.currentFrame);

  dom.frameSlider.max = String(duration - 1);
  dom.frameSlider.value = String(state.currentFrame);

  const pct = duration <= 1 ? 0 : state.currentFrame / (duration - 1);
  const left = 12 + pct * (dom.timelineTrackWrap.clientWidth - 24);
  dom.playhead.style.left = `${left}px`;
}

export function renderTimeline() {
  const duration = getDurationFrames();
  dom.timelineMarkers.innerHTML = "";
  dom.timelineTicks.innerHTML = "";

  const width = Math.max(1, dom.timelineTrackWrap.clientWidth - 24);
  const selected = state.selectedElementId;
  const anim = selected && state.activeProject ? state.activeProject.elements[selected] : null;
  const keyframes = anim ? anim.keyframes : [];

  for (const key of keyframes) {
    const pct = duration <= 1 ? 0 : key.frame / (duration - 1);
    const marker = document.createElement("button");
    marker.className = "marker";
    marker.title = `Frame ${key.frame}`;
    marker.style.left = `${12 + pct * width}px`;
    marker.addEventListener("click", () => setFrame(key.frame));
    dom.timelineMarkers.appendChild(marker);
  }

  const tickCount = Math.min(10, Math.max(2, Math.floor(width / 95)));
  for (let i = 0; i <= tickCount; i++) {
    const pct = i / tickCount;
    const frame = Math.round(pct * (duration - 1));
    const label = document.createElement("div");
    label.className = "tick-label";
    label.style.left = `${12 + pct * width}px`;
    label.textContent = frame;
    dom.timelineTicks.appendChild(label);
  }

  renderKeyframeList();
  updateFrameUi();
}

export function renderKeyframeList() {
  if (!state.selectedElementId || !state.activeProject) {
    dom.keyframeList.innerHTML = `<div class="hint">Select a layer to show keyframes.</div>`;
    return;
  }

  const anim = state.activeProject.elements[state.selectedElementId];
  const keys = anim ? anim.keyframes : [];

  if (!keys.length) {
    dom.keyframeList.innerHTML = `<div class="hint">No keyframes for this layer yet.</div>`;
    return;
  }

  dom.keyframeList.innerHTML = "";

  for (const key of keys) {
    const row = document.createElement("div");
    row.className = "row" + (key.frame === state.currentFrame ? " active" : "");
    row.innerHTML = `
      <div class="title">Frame ${key.frame}</div>
      <div class="sub">x ${roundForInput(key.transform.x)}, y ${roundForInput(key.transform.y)}, rot ${roundForInput(key.transform.rotation)}°, op ${roundForInput(key.transform.opacity * 100)}%</div>
    `;
    row.addEventListener("click", () => setFrame(key.frame));
    dom.keyframeList.appendChild(row);
  }
}

export function gotoAdjacentKey(direction) {
  if (!state.selectedElementId || !state.activeProject) return;

  const anim = state.activeProject.elements[state.selectedElementId];
  const keys = anim ? anim.keyframes.map(k => k.frame).sort((a, b) => a - b) : [];
  if (!keys.length) return;

  let target = null;
  if (direction < 0) {
    target = [...keys].reverse().find(f => f < state.currentFrame);
    if (target == null) target = keys[keys.length - 1];
  } else {
    target = keys.find(f => f > state.currentFrame);
    if (target == null) target = keys[0];
  }

  setFrame(target);
}

export function applyProjectSettingsToUi() {
  if (!state.activeProject) return;
  dom.frameSlider.max = String(state.activeProject.durationFrames - 1);
  dom.frameInput.max = String(state.activeProject.durationFrames - 1);
  actions.syncPropertiesFormFromProject();
}

export function play() {
  if (!state.activeProject || state.playing) return;

  state.playing = true;
  state.playStartTime = performance.now();
  state.playStartFrame = state.currentFrame;
  requestAnimationFrame(tick);
}

export function stopPlayback() {
  state.playing = false;
}

export function tick(now) {
  if (!state.playing || !state.activeProject) return;

  const elapsed = (now - state.playStartTime) / 1000;
  const advanced = Math.floor(elapsed * getFps());
  const duration = getDurationFrames();

  state.currentFrame = (state.playStartFrame + advanced) % duration;
  renderFrame(state.currentFrame);

  requestAnimationFrame(tick);
}
