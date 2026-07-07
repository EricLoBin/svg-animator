import { actions } from "./context.js";
import { dom, state } from "./state.js";
import { createEmptyProject, normalizeProject } from "./project.js";
import { jsonNameForSvg } from "./utils.js";

export async function openFolder() {
  if (!window.showDirectoryPicker) {
    actions.toast("Folder access is not supported in this browser. Use Chrome or Edge, or open one SVG manually.");
    return;
  }

  try {
    actions.stopPlayback();
    const root = await window.showDirectoryPicker({ mode: "readwrite" });
    state.rootDirectoryHandle = root;
    state.manualMode = false;
    state.svgFiles = [];
    actions.setStatus("Scanning folder for SVG files...");

    await scanDirectory(root, "", state.svgFiles);

    state.svgFiles.sort((a, b) => a.path.localeCompare(b.path));
    actions.renderFileList();

    if (state.svgFiles.length === 1) {
      await loadSvgEntry(state.svgFiles[0]);
    } else if (state.svgFiles.length > 1) {
      clearProject();
      actions.renderFileList();
      actions.switchLeftTab("files");
      actions.setStatus(`Found ${state.svgFiles.length} SVG files. Select one to begin.`);
    } else {
      clearProject();
      actions.toast("No SVG files found in that folder.");
    }
  } catch (err) {
    if (err && err.name !== "AbortError") {
      console.error(err);
      actions.toast("Could not open folder: " + err.message);
    }
  }
}

export async function scanDirectory(dirHandle, path, out) {
  for await (const [name, handle] of dirHandle.entries()) {
    const nextPath = path ? `${path}/${name}` : name;

    if (handle.kind === "directory") {
      await scanDirectory(handle, nextPath, out);
    } else if (handle.kind === "file" && /\.svg$/i.test(name)) {
      out.push({
        name,
        path: nextPath,
        fileHandle: handle,
        parentHandle: dirHandle,
        jsonHandle: null,
        hasJson: false,
        project: null,
        svgText: null
      });
    }
  }
}

export async function openManualSvg(file) {
  if (!file) return;

  actions.stopPlayback();
  state.manualMode = true;
  state.rootDirectoryHandle = null;
  const svgText = await file.text();
  const entry = {
    name: file.name,
    path: file.name,
    fileHandle: null,
    parentHandle: null,
    jsonHandle: null,
    hasJson: false,
    project: createEmptyProject(file.name, file.name),
    svgText
  };

  state.svgFiles = [entry];
  actions.renderFileList();
  await loadSvgEntry(entry);
  actions.toast("Manual SVG loaded. Use Open JSON to load an existing project, and Download JSON to save.");
}

export async function openManualJson(file) {
  if (!file || !state.activeProject) {
    actions.toast("Load an SVG before opening a JSON project.");
    return;
  }

  try {
    const project = normalizeProject(JSON.parse(await file.text()), state.activeSvgEntry.name, state.activeSvgEntry.path);
    state.activeSvgEntry.project = project;
    state.activeProject = project;
    actions.applyProjectSettingsToUi();
    actions.renderFrame(actions.clampFrame(state.currentFrame));
    actions.updateAllUi();
    actions.markDirty(false);
    actions.toast("JSON project loaded.");
  } catch (err) {
    console.error(err);
    actions.toast("Could not load JSON: " + err.message);
  }
}

export async function tryLoadMatchingJson(entry) {
  entry.hasJson = false;
  entry.jsonHandle = null;

  if (!entry.parentHandle) return entry.project || createEmptyProject(entry.name, entry.path);

  const jsonName = jsonNameForSvg(entry.name);

  try {
    const jsonHandle = await entry.parentHandle.getFileHandle(jsonName);
    const jsonFile = await jsonHandle.getFile();
    const project = JSON.parse(await jsonFile.text());
    entry.jsonHandle = jsonHandle;
    entry.hasJson = true;
    return normalizeProject(project, entry.name, entry.path);
  } catch (_err) {
    return createEmptyProject(entry.name, entry.path);
  }
}

export async function loadSvgEntry(entry) {
  try {
    actions.stopPlayback();
    state.activeSvgEntry = entry;
    state.selectedElementId = null;
    state.currentTransforms = {};
    state.pickingPivot = false;
    dom.svgHost.classList.remove("pivot-mode");

    actions.setStatus("Loading " + entry.path + "...");

    if (!entry.svgText) {
      const file = await entry.fileHandle.getFile();
      entry.svgText = await file.text();
    }

    if (!entry.project) {
      entry.project = await tryLoadMatchingJson(entry);
    } else {
      entry.project = normalizeProject(entry.project, entry.name, entry.path);
    }

    state.activeProject = entry.project;
    actions.applyProjectSettingsToUi();

    actions.loadSvgIntoPreview(entry.svgText);
    actions.extractLayers();
    actions.syncLayerCatalogToProject();
    state.currentFrame = actions.clampFrame(state.currentFrame);
    actions.renderFrame(state.currentFrame);
    actions.updateAllUi();
    actions.switchLeftTab("layers");
    actions.markDirty(false);

    actions.setStatus(`Loaded ${entry.path}${entry.hasJson ? " with matching JSON." : "."}`);
  } catch (err) {
    console.error(err);
    actions.toast("Could not load SVG: " + err.message);
  }
}

export function clearProject() {
  state.activeSvgEntry = null;
  state.activeProject = null;
  state.svgRoot = null;
  state.layers = [];
  state.selectedElementId = null;
  state.currentTransforms = {};
  dom.svgHost.innerHTML = `<div class="empty-state"><strong>Animation space</strong><br />Load an SVG to see and edit the animation here.</div>`;
  actions.updateAllUi();
}
