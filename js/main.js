import { registerActions } from "./context.js";
import { dom, state } from "./state.js";
import * as files from "./files.js";
import * as exporter from "./export.js";
import * as project from "./project.js";
import * as svg from "./svg.js";
import * as timeline from "./timeline.js";
import * as ui from "./ui.js";

registerActions({
  ...files,
  ...exporter,
  ...project,
  ...svg,
  ...timeline,
  ...ui
});

function handleKeyboard(event) {
  if (event.key === "Escape" && !dom.propertiesDialog.hidden) {
    ui.closeProperties();
    return;
  }

  if (event.target && ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;

  if (event.code === "Space") {
    event.preventDefault();
    state.playing ? timeline.stopPlayback() : timeline.play();
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    timeline.setFrame(state.currentFrame - 1);
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    timeline.setFrame(state.currentFrame + 1);
  }
}

function bindEvents() {
  dom.openFolderBtn.addEventListener("click", files.openFolder);
  dom.openSvgBtn.addEventListener("click", () => dom.svgFileInput.click());
  dom.openJsonBtn.addEventListener("click", () => dom.jsonFileInput.click());
  dom.svgFileInput.addEventListener("change", e => files.openManualSvg(e.target.files[0]));
  dom.jsonFileInput.addEventListener("change", e => files.openManualJson(e.target.files[0]));
  dom.saveBtn.addEventListener("click", project.saveProject);
  dom.downloadBtn.addEventListener("click", project.downloadProject);
  dom.propertiesBtn.addEventListener("click", ui.openProperties);
  dom.exportSpritesheetBtn.addEventListener("click", exporter.exportSpritesheet);
  dom.playBtn.addEventListener("click", timeline.play);
  dom.pauseBtn.addEventListener("click", timeline.stopPlayback);
  dom.fileFilter.addEventListener("input", ui.renderFileList);
  dom.filesTabBtn.addEventListener("click", () => ui.switchLeftTab("files"));
  dom.layersTabBtn.addEventListener("click", () => ui.switchLeftTab("layers"));

  [dom.xInput, dom.yInput, dom.rotationInput, dom.scaleInput, dom.pivotXInput, dom.pivotYInput]
    .forEach(input => input.addEventListener("input", svg.onInspectorInput));

  dom.centerPivotBtn.addEventListener("click", svg.centerPivot);
  dom.pickPivotBtn.addEventListener("click", svg.togglePickPivot);
  dom.resetTransformBtn.addEventListener("click", svg.resetSelectedTransform);
  dom.addKeyBtn.addEventListener("click", timeline.addOrUpdateKeyframe);
  dom.deleteKeyBtn.addEventListener("click", timeline.deleteKeyframe);

  dom.fpsInput.addEventListener("input", timeline.onTimelineSettingsChange);
  dom.durationInput.addEventListener("input", timeline.onTimelineSettingsChange);
  dom.closePropertiesBtn.addEventListener("click", ui.closeProperties);
  dom.cancelPropertiesBtn.addEventListener("click", ui.closeProperties);
  dom.applyPropertiesBtn.addEventListener("click", ui.applyProperties);
  dom.exportTypeSelect.addEventListener("change", ui.updateExportTypeNote);
  dom.exportWidthInput.addEventListener("input", ui.onExportWidthInput);
  dom.exportHeightInput.addEventListener("input", ui.onExportHeightInput);
  dom.propertiesDialog.addEventListener("click", event => {
    if (event.target === dom.propertiesDialog) ui.closeProperties();
  });
  dom.frameInput.addEventListener("input", () => timeline.setFrame(dom.frameInput.value));
  dom.frameSlider.addEventListener("input", () => timeline.setFrame(dom.frameSlider.value));
  dom.goStartBtn.addEventListener("click", () => timeline.setFrame(0));
  dom.prevKeyBtn.addEventListener("click", () => timeline.gotoAdjacentKey(-1));
  dom.nextKeyBtn.addEventListener("click", () => timeline.gotoAdjacentKey(1));

  window.addEventListener("resize", () => timeline.renderTimeline());
  window.addEventListener("keydown", handleKeyboard);

  window.addEventListener("beforeunload", event => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

function init() {
  bindEvents();
  ui.updateAllUi();

  if (!window.showDirectoryPicker) {
    ui.setStatus("Folder access is unavailable in this browser. Use Open SVG + Open JSON fallback.");
  }
}

init();
