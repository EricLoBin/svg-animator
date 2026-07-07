import { actions } from "./context.js";
import { dom, state } from "./state.js";
import { normalizeExportSettings } from "./project.js";
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

export function switchLeftTab(tab) {
  const showLayers = tab === "layers";

  dom.filesTabBtn.classList.toggle("active", !showLayers);
  dom.layersTabBtn.classList.toggle("active", showLayers);
  dom.filesTabPanel.classList.toggle("active", !showLayers);
  dom.layersTabPanel.classList.toggle("active", showLayers);

  updateLeftPanelBadge();
}

export function updateLeftPanelBadge() {
  const showingLayers = dom.layersTabPanel.classList.contains("active");
  dom.leftPanelBadge.textContent = String(showingLayers ? state.layers.length : state.svgFiles.length);
}

export function renderFileList() {
  const filter = dom.fileFilter.value.trim().toLowerCase();
  const files = state.svgFiles.filter(entry =>
    !filter || entry.path.toLowerCase().includes(filter)
  );

  updateLeftPanelBadge();

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
  updateLeftPanelBadge();

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

export function openProperties() {
  if (!state.activeProject) return;
  syncPropertiesFormFromProject();
  dom.propertiesDialog.hidden = false;
  dom.propertiesFpsInput.focus();
}

export function closeProperties() {
  dom.propertiesDialog.hidden = true;
}

export function syncPropertiesFormFromProject() {
  if (!state.activeProject) return;

  const exportSettings = normalizeExportSettings(state.activeProject.export);
  const proportionalSize = getProportionalExportSize(exportSettings.width, "width");
  dom.propertiesFpsInput.value = String(state.activeProject.fps || 24);
  dom.propertiesDurationInput.value = String(state.activeProject.durationFrames || 120);
  dom.exportWidthInput.value = String(proportionalSize.width);
  dom.exportHeightInput.value = String(proportionalSize.height);
  dom.exportTypeSelect.value = exportSettings.type;
  updateExportTypeNote();
}

export function updateExportTypeNote() {
  const width = Math.max(1, Math.round(Number(dom.exportWidthInput.value || 512)));
  const height = Math.max(1, Math.round(Number(dom.exportHeightInput.value || 512)));

  if (dom.exportTypeSelect.value === "spritesheet") {
    dom.exportTypeNote.textContent = `Spritesheet export will use ${width}x${height}px cells, matching the SVG aspect ratio.`;
  } else {
    dom.exportTypeNote.textContent = `APNG export will render frames at ${width}x${height}px, matching the SVG aspect ratio.`;
  }
}

export function onExportWidthInput() {
  const size = getProportionalExportSize(dom.exportWidthInput.value, "width");
  dom.exportWidthInput.value = String(size.width);
  dom.exportHeightInput.value = String(size.height);
  updateExportTypeNote();
}

export function onExportHeightInput() {
  const size = getProportionalExportSize(dom.exportHeightInput.value, "height");
  dom.exportWidthInput.value = String(size.width);
  dom.exportHeightInput.value = String(size.height);
  updateExportTypeNote();
}

export function getProportionalExportSize(value, changedDimension) {
  const ratio = getSvgAspectRatio();
  const dimension = clampExportDimension(value);

  if (changedDimension === "height") {
    return {
      width: clampExportDimension(dimension * ratio),
      height: dimension
    };
  }

  return {
    width: dimension,
    height: clampExportDimension(dimension / ratio)
  };
}

export function getSvgAspectRatio() {
  const width = Number(state.svgRoot?.dataset.canvasWidth || 0);
  const height = Number(state.svgRoot?.dataset.canvasHeight || 0);

  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return width / height;
  }

  return 1;
}

function clampExportDimension(value) {
  const n = Math.round(Number(value || 1));
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(16384, n));
}

export function applyProperties() {
  if (!state.activeProject) return;

  const fps = Math.max(1, Math.min(120, Math.round(Number(dom.propertiesFpsInput.value || 24))));
  const durationFrames = Math.max(1, Math.min(10000, Math.round(Number(dom.propertiesDurationInput.value || 120))));
  const proportionalSize = getProportionalExportSize(dom.exportWidthInput.value, "width");
  const exportSettings = normalizeExportSettings({
    width: proportionalSize.width,
    height: proportionalSize.height,
    type: dom.exportTypeSelect.value
  });

  state.activeProject.fps = fps;
  state.activeProject.durationFrames = durationFrames;
  state.activeProject.export = exportSettings;
  state.currentFrame = actions.clampFrame(state.currentFrame);

  actions.applyProjectSettingsToUi();
  actions.markDirty(true);
  actions.renderFrame(state.currentFrame);
  closeProperties();
  toast("Project properties updated.");
}

export function updateAllUi() {
  renderFileList();
  renderLayerList();
  updateInspector();
  actions.renderTimeline();

  const hasProject = Boolean(state.activeProject);
  dom.saveBtn.disabled = !hasProject || state.manualMode;
  dom.downloadBtn.disabled = !hasProject;
  dom.propertiesBtn.disabled = !hasProject;
  dom.exportSpritesheetBtn.disabled = !hasProject;
  dom.playBtn.disabled = !hasProject;
  dom.pauseBtn.disabled = !hasProject;
}
