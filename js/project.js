import { actions } from "./context.js";
import { state } from "./state.js";
import { escapeCss, jsonNameForSvg, normalizeTransform, nowIso } from "./utils.js";

export const DEFAULT_EXPORT_SETTINGS = {
  width: 512,
  height: 512,
  type: "apng"
};

export function normalizeExportSettings(settings = {}) {
  const type = settings.type === "spritesheet" ? "spritesheet" : "apng";
  const width = Math.max(1, Math.round(Number(settings.width || DEFAULT_EXPORT_SETTINGS.width)));
  const height = Math.max(1, Math.round(Number(settings.height || DEFAULT_EXPORT_SETTINGS.height)));

  return { width, height, type };
}

export function createEmptyProject(svgName, svgPath = svgName) {
  return {
    version: 1,
    app: "single-file-svg-animation-editor",
    svgFile: svgName,
    svgPath,
    fps: 24,
    durationFrames: 120,
    export: normalizeExportSettings(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    layers: [],
    elements: {}
  };
}

export function normalizeProject(project, svgName, svgPath) {
  if (!project || typeof project !== "object") {
    return createEmptyProject(svgName, svgPath);
  }

  project.version = project.version || 1;
  project.app = project.app || "single-file-svg-animation-editor";
  project.svgFile = project.svgFile || svgName;
  project.svgPath = project.svgPath || svgPath || svgName;
  project.fps = Number(project.fps || 24);
  project.durationFrames = Number(project.durationFrames || 120);
  project.export = normalizeExportSettings(project.export);
  project.createdAt = project.createdAt || nowIso();
  project.updatedAt = project.updatedAt || nowIso();
  project.layers = Array.isArray(project.layers) ? project.layers : [];
  project.elements = project.elements || {};

  for (const [id, anim] of Object.entries(project.elements)) {
    anim.id = anim.id || id;
    anim.name = anim.name || id;
    anim.selector = anim.selector || `#${escapeCss(id)}`;
    anim.keyframes = Array.isArray(anim.keyframes) ? anim.keyframes : [];
    anim.keyframes = anim.keyframes.map(k => {
      const merged = normalizeTransform({
        ...(k.transform || {}),
        pivotX: k.pivotX ?? (k.pivot && k.pivot.x),
        pivotY: k.pivotY ?? (k.pivot && k.pivot.y)
      });
      return {
        frame: Number(k.frame || 0),
        transform: {
          x: merged.x,
          y: merged.y,
          rotation: merged.rotation,
          scale: merged.scale
        },
        pivot: {
          x: merged.pivotX,
          y: merged.pivotY
        },
        easing: k.easing || "linear"
      };
    }).sort((a, b) => a.frame - b.frame);
  }

  return project;
}

export async function saveProject() {
  if (!state.activeProject || !state.activeSvgEntry) return;

  actions.syncLayerCatalogToProject();
  state.activeProject.updatedAt = nowIso();

  if (!state.activeSvgEntry.parentHandle) {
    downloadProject();
    actions.toast("No folder permission available, so the JSON was downloaded instead.");
    return;
  }

  try {
    const jsonName = jsonNameForSvg(state.activeSvgEntry.name);
    const jsonHandle = await state.activeSvgEntry.parentHandle.getFileHandle(jsonName, { create: true });
    const writable = await jsonHandle.createWritable();
    await writable.write(JSON.stringify(state.activeProject, null, 2));
    await writable.close();

    state.activeSvgEntry.jsonHandle = jsonHandle;
    state.activeSvgEntry.hasJson = true;
    actions.markDirty(false);
    actions.renderFileList();
    actions.toast(`Saved ${jsonName} beside ${state.activeSvgEntry.name}.`);
  } catch (err) {
    console.error(err);
    actions.toast("Could not save JSON beside SVG: " + err.message);
  }
}

export function downloadProject() {
  if (!state.activeProject || !state.activeSvgEntry) return;

  actions.syncLayerCatalogToProject();
  state.activeProject.updatedAt = nowIso();

  const blob = new Blob([JSON.stringify(state.activeProject, null, 2)], {
    type: "application/json"
  });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = jsonNameForSvg(state.activeSvgEntry.name);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
