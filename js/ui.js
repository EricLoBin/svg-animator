import { actions } from "./context.js";
import { dom, state } from "./state.js";
import { escapeHtml, roundForInput } from "./utils.js";

export function toast(message, ms = 2600) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.classList.remove("show"), ms);
}

export function setStatus(message) {
  dom.status.textContent = message;
}

export function markDirty(value = true) {
  state.dirty = value;
  dom.dirtyBadge.textContent = value ? "unsaved" : "clean";
  dom.dirtyBadge.className = "badge " + (value ? "warn" : "");
}

export function renderFileList() {
  const filter = dom.fileFilter.value.trim().toLowerCase();
  const files = state.svgFiles.filter(entry =>
    !filter || entry.path.toLowerCase().includes(filter)
  );

  dom.fileCount.textContent = String(state.svgFiles.length);

  if (!files.length) {
    dom.fileList.innerHTML = `<div class="empty-state">No SVG files match the filter.</div>`;
    return;
  }

  dom.fileList.innerHTML = "";

  for (const entry of files) {
    const row = document.createElement("div");
    row.className = "row" + (entry === state.activeSvgEntry ? " active" : "");
    row.innerHTML = `
      <div class="title">${escapeHtml(entry.name)}
        ${entry.hasJson ? `<span class="badge good">json</span>` : `<span class="badge">new</span>`}
      </div>
      <div class="sub">${escapeHtml(entry.path)}</div>
    `;
    row.addEventListener("click", () => actions.loadSvgEntry(entry));
    dom.fileList.appendChild(row);
  }
}

export function renderLayerList() {
  if (!state.layers.length) {
    dom.layerList.innerHTML = `<div class="hint">No layers yet.</div>`;
    return;
  }

  dom.layerList.innerHTML = "";

  for (const layer of state.layers) {
    const row = document.createElement("div");
    row.className = "row" + (layer.id === state.selectedElementId ? " active" : "");
    row.style.paddingLeft = `${9 + Math.min(layer.depth, 8) * 12}px`;
    row.innerHTML = `
      <div class="title">${escapeHtml(layer.name)}</div>
      <div class="sub">${escapeHtml(layer.tag)} · #${escapeHtml(layer.id)}</div>
    `;

    row.addEventListener("mouseenter", () => actions.setHover(layer.id, true));
    row.addEventListener("mouseleave", () => actions.setHover(layer.id, false));
    row.addEventListener("click", () => actions.selectElement(layer.id));

    dom.layerList.appendChild(row);
  }
}

export function updateInspector() {
  const selected = state.selectedElementId;
  const has = Boolean(selected && actions.getSvgElement(selected));
  const inputs = [dom.xInput, dom.yInput, dom.rotationInput, dom.scaleInput, dom.pivotXInput, dom.pivotYInput];

  for (const input of inputs) input.disabled = !has;
  dom.centerPivotBtn.disabled = !has;
  dom.pickPivotBtn.disabled = !has;
  dom.resetTransformBtn.disabled = !has;
  dom.addKeyBtn.disabled = !has;
  dom.deleteKeyBtn.disabled = !has || !actions.hasKeyframeAtCurrentFrame();
  dom.prevKeyBtn.disabled = !has;
  dom.nextKeyBtn.disabled = !has;

  if (!has) {
    dom.selectionSummary.innerHTML = `Select a layer or click an SVG element.`;
    return;
  }

  const layer = state.layers.find(l => l.id === selected);
  const t = state.currentTransforms[selected] || actions.defaultTransformForElement(selected);

  dom.selectionSummary.innerHTML = `
    <div class="selected-name">${escapeHtml(layer?.name || selected)}</div>
    <div class="hint">#${escapeHtml(selected)} · ${escapeHtml(layer?.tag || "element")}</div>
  `;

  setInputValue(dom.xInput, t.x);
  setInputValue(dom.yInput, t.y);
  setInputValue(dom.rotationInput, t.rotation);
  setInputValue(dom.scaleInput, t.scale);
  setInputValue(dom.pivotXInput, t.pivotX);
  setInputValue(dom.pivotYInput, t.pivotY);

  dom.addKeyBtn.textContent = actions.hasKeyframeAtCurrentFrame() ? "Update Keyframe" : "Add Keyframe";
}

export function setInputValue(input, value) {
  if (document.activeElement === input) return;
  input.value = roundForInput(value);
}

export function updateAllUi() {
  renderFileList();
  renderLayerList();
  updateInspector();
  actions.renderTimeline();

  const hasProject = Boolean(state.activeProject);
  dom.saveBtn.disabled = !hasProject || state.manualMode;
  dom.downloadBtn.disabled = !hasProject;
  dom.playBtn.disabled = !hasProject;
  dom.pauseBtn.disabled = !hasProject;
}
