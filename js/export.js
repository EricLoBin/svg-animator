import { actions } from "./context.js";
import { state } from "./state.js";
import { normalizeExportSettings } from "./project.js";
import { pngNameForSvg } from "./utils.js";

export async function exportSpritesheet() {
  if (!state.activeProject || !state.activeSvgEntry || !state.svgRoot) return;

  if (!state.activeSvgEntry.parentHandle) {
    actions.toast("Open a folder first so the spritesheet can be saved beside the SVG.");
    return;
  }

  const originalFrame = state.currentFrame;
  const exportSettings = normalizeExportSettings(state.activeProject.export);
  const frameCount = Math.max(1, Math.round(Number(state.activeProject.durationFrames || 1)));
  const columns = Math.ceil(Math.sqrt(frameCount));
  const rows = Math.ceil(frameCount / columns);
  const canvas = document.createElement("canvas");

  canvas.width = columns * exportSettings.width;
  canvas.height = rows * exportSettings.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    actions.toast("Could not create a canvas for spritesheet export.");
    return;
  }

  actions.stopPlayback();
  actions.setStatus(`Exporting ${frameCount} spritesheet frames...`);

  try {
    for (let frame = 0; frame < frameCount; frame++) {
      actions.renderFrame(frame);
      const image = await svgFrameToImage();
      const cellX = (frame % columns) * exportSettings.width;
      const cellY = Math.floor(frame / columns) * exportSettings.height;

      drawImageIntoCell(ctx, image, cellX, cellY, exportSettings.width, exportSettings.height);
    }

    const blob = await canvasToPngBlob(canvas);
    const pngName = pngNameForSvg(state.activeSvgEntry.name);
    const pngHandle = await state.activeSvgEntry.parentHandle.getFileHandle(pngName, { create: true });
    const writable = await pngHandle.createWritable();

    await writable.write(blob);
    await writable.close();

    actions.toast(`Exported ${pngName}.`);
    actions.setStatus(`Exported ${pngName} beside ${state.activeSvgEntry.name}.`);
  } catch (err) {
    console.error(err);
    actions.toast("Could not export spritesheet: " + err.message);
    actions.setStatus("Spritesheet export failed.");
  } finally {
    actions.renderFrame(originalFrame);
  }
}

async function svgFrameToImage() {
  const svgText = serializeCurrentSvgFrame();
  const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;

    if (image.decode) {
      await image.decode();
    } else {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error("The SVG frame could not be loaded as an image."));
      });
    }

    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function serializeCurrentSvgFrame() {
  const clone = state.svgRoot.cloneNode(true);
  const width = Math.max(1, Math.round(Number(state.svgRoot.dataset.canvasWidth || 300)));
  const height = Math.max(1, Math.round(Number(state.svgRoot.dataset.canvasHeight || 150)));

  clone.setAttribute("xmlns", clone.getAttribute("xmlns") || "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));

  if (!clone.getAttribute("viewBox")) {
    clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }

  clone.querySelectorAll(".anim-hover, .anim-selected").forEach(el => {
    el.classList.remove("anim-hover", "anim-selected");
  });

  return new XMLSerializer().serializeToString(clone);
}

function drawImageIntoCell(ctx, image, x, y, cellWidth, cellHeight) {
  const sourceWidth = image.naturalWidth || image.width || cellWidth;
  const sourceHeight = image.naturalHeight || image.height || cellHeight;
  const scale = Math.min(cellWidth / sourceWidth, cellHeight / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const drawX = x + (cellWidth - drawWidth) / 2;
  const drawY = y + (cellHeight - drawHeight) / 2;

  ctx.clearRect(x, y, cellWidth, cellHeight);
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(blob => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error("The spritesheet canvas could not be converted to PNG."));
      }, "image/png");
    } catch (err) {
      reject(new Error("The spritesheet could not be saved. The SVG may reference external images that the browser blocks during canvas export."));
    }
  });
}
