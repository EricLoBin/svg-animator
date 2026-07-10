import { actions } from "./context.js";
import { dom, EDITABLE_SELECTOR, state } from "./state.js";
import { clone, escapeCss, normalizeOpacity, normalizeTransform, parseSvgLength, safeElementId } from "./utils.js";

export function sanitizeSvgDocument(doc) {
  doc.querySelectorAll("script, foreignObject").forEach(el => el.remove());

  const walker = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const el = walker.currentNode;
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = String(attr.value || "").trim().toLowerCase();
      if (name.startsWith("on")) el.removeAttribute(attr.name);
      if ((name === "href" || name.endsWith(":href")) && value.startsWith("javascript:")) {
        el.removeAttribute(attr.name);
      }
    }
  }

  return doc;
}

export function getSvgCanvas(svg) {
  const viewBox = svg.getAttribute("viewBox");
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) {
      return {
        x: parts[0],
        y: parts[1],
        width: parts[2],
        height: parts[3],
        source: "viewBox"
      };
    }
  }

  const width = parseSvgLength(svg.getAttribute("width"));
  const height = parseSvgLength(svg.getAttribute("height"));

  if (width && height) {
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    return {
      x: 0,
      y: 0,
      width,
      height,
      source: "width/height"
    };
  }

  return {
    x: 0,
    y: 0,
    width: 300,
    height: 150,
    source: "fallback"
  };
}

export function applyNaturalSvgPreviewSize(svg) {
  const canvas = getSvgCanvas(svg);
  const width = Math.max(1, canvas.width);
  const height = Math.max(1, canvas.height);

  svg.setAttribute("preserveAspectRatio", svg.getAttribute("preserveAspectRatio") || "xMidYMid meet");
  svg.setAttribute("overflow", "visible");
  svg.style.overflow = "visible";

  // Keep the SVG's own canvas ratio and let CSS scale it down to fit the preview.
  // This prevents cropping caused by forcing width:100%; height:100%.
  svg.style.width = `${width}px`;
  svg.style.height = `${height}px`;
  svg.style.maxWidth = "100%";
  svg.style.maxHeight = "100%";
  svg.style.aspectRatio = `${width} / ${height}`;

  return canvas;
}

export function loadSvgIntoPreview(svgText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");

  const errorNode = doc.querySelector("parsererror");
  if (errorNode) throw new Error("Invalid SVG file.");

  sanitizeSvgDocument(doc);

  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== "svg") {
    throw new Error("The file does not contain an SVG root.");
  }

  const canvas = applyNaturalSvgPreviewSize(svg);
  svg.setAttribute("tabindex", "0");

  dom.svgHost.innerHTML = "";
  const imported = document.importNode(svg, true);
  imported.dataset.canvasWidth = String(canvas.width);
  imported.dataset.canvasHeight = String(canvas.height);
  imported.dataset.canvasSource = canvas.source;
  dom.svgHost.appendChild(imported);
  state.svgRoot = imported;

  dom.svgHost.removeEventListener("click", onSvgClick);
  dom.svgHost.addEventListener("click", onSvgClick);
  state.svgRoot.addEventListener("pointerdown", onSvgPointerDown);
  window.addEventListener("pointermove", onSvgPointerMove);
  window.addEventListener("pointerup", onSvgPointerUp);
}

export function extractLayers() {
  if (!state.svgRoot) return;

  const elements = Array.from(state.svgRoot.querySelectorAll(EDITABLE_SELECTOR))
    .filter(el => !el.closest("[data-anim-ui='true']"));

  const used = new Set();
  let count = 1;

  state.layers = elements.map(el => {
    let id = el.id || el.getAttribute("data-anim-id");
    if (!id) {
      do {
        id = `auto_layer_${String(count++).padStart(3, "0")}`;
      } while (used.has(id) || state.svgRoot.getElementById?.(id));
      el.id = id;
    }
    id = safeElementId(id, `layer_${count++}`);

    if (used.has(id)) {
      let suffix = 2;
      const base = id;
      while (used.has(`${base}_${suffix}`)) suffix++;
      id = `${base}_${suffix}`;
      el.id = id;
    }

    used.add(id);
    el.setAttribute("data-anim-id", id);
    el.setAttribute("data-anim-editable", "true");

    if (!el.hasAttribute("data-base-transform")) {
      el.setAttribute("data-base-transform", el.getAttribute("transform") || "");
    }
    if (!el.hasAttribute("data-base-opacity")) {
      el.setAttribute("data-base-opacity", String(readElementOpacity(el)));
    }
    if (!el.hasAttribute("data-base-clip-path")) {
      el.setAttribute("data-base-clip-path", el.getAttribute("clip-path") || "");
    }
    if (!el.hasAttribute("data-base-style-clip-path")) {
      el.setAttribute("data-base-style-clip-path", el.style?.clipPath || "");
    }

    const depth = getDepth(el, state.svgRoot);
    const title = el.getAttribute("inkscape:label") || el.getAttribute("aria-label") || el.id || el.tagName.toLowerCase();

    return {
      id,
      name: title,
      tag: el.tagName.toLowerCase(),
      depth,
      selector: `#${escapeCss(id)}`
    };
  });

  const canvasW = Number(state.svgRoot.dataset.canvasWidth || 0);
  const canvasH = Number(state.svgRoot.dataset.canvasHeight || 0);
  const source = state.svgRoot.dataset.canvasSource || "svg";
  dom.previewInfo.textContent = `${state.layers.length} editable elements · ${Math.round(canvasW)}×${Math.round(canvasH)} canvas from ${source}`;
}

export function getDepth(el, root) {
  let depth = 0;
  let cur = el.parentElement;
  while (cur && cur !== root) {
    depth++;
    cur = cur.parentElement;
  }
  return depth;
}

export function syncLayerCatalogToProject() {
  if (!state.activeProject) return;
  state.activeProject.layers = state.layers.map(layer => ({
    id: layer.id,
    name: layer.name,
    tag: layer.tag,
    selector: layer.selector,
    depth: layer.depth
  }));

  for (const layer of state.layers) {
    if (!state.activeProject.elements[layer.id]) continue;
    state.activeProject.elements[layer.id].name = state.activeProject.elements[layer.id].name || layer.name;
    state.activeProject.elements[layer.id].selector = layer.selector;
    const maskTo = state.activeProject.elements[layer.id].maskTo;
    if (maskTo && (maskTo === layer.id || !state.layers.some(candidate => candidate.id === maskTo))) {
      delete state.activeProject.elements[layer.id].maskTo;
    }
  }
}

export function getSvgElement(id) {
  if (!state.svgRoot || !id) return null;
  return state.svgRoot.querySelector(`#${escapeCss(id)}`);
}

export function setHover(id, on) {
  const el = getSvgElement(id);
  if (!el) return;
  if (on) el.classList.add("anim-hover");
  else el.classList.remove("anim-hover");
}

export function clearSelectedClass() {
  if (!state.svgRoot) return;
  state.svgRoot.querySelectorAll(".anim-selected").forEach(el => el.classList.remove("anim-selected"));
}

export function selectElement(id) {
  if (!id || !getSvgElement(id)) return;

  clearSelectedClass();
  state.selectedElementId = id;
  const el = getSvgElement(id);
  el.classList.add("anim-selected");

  const current = state.currentTransforms[id] || defaultTransformForElement(id);
  state.currentTransforms[id] = normalizeTransform(current);

  actions.updateInspector();
  actions.renderLayerList();
  actions.renderTimeline();
  updatePivotIndicator();
}

export function deselectElement() {
  if (!state.selectedElementId) return;

  clearSelectedClass();
  state.selectedElementId = null;
  state.pickingPivot = false;
  dom.svgHost.classList.remove("pivot-mode");
  dom.pickPivotBtn.textContent = "Pick Pivot";

  actions.updateInspector();
  actions.renderLayerList();
  actions.renderTimeline();
  updatePivotIndicator();
}

export function defaultTransformForElement(id) {
  const bbox = getElementBBox(id);
  return {
    x: 0,
    y: 0,
    rotation: 0,
    scale: 1,
    opacity: readElementOpacity(id),
    pivotX: bbox ? bbox.x + bbox.width / 2 : 0,
    pivotY: bbox ? bbox.y + bbox.height / 2 : 0
  };
}

export function readElementOpacity(idOrElement) {
  const el = typeof idOrElement === "string" ? getSvgElement(idOrElement) : idOrElement;
  if (!el) return 1;

  const base = el.getAttribute("data-base-opacity");
  if (base != null) return normalizeOpacity(base);

  const inline = el.style?.opacity;
  if (inline) return normalizeOpacity(inline);

  const attr = el.getAttribute("opacity");
  if (attr != null) return normalizeOpacity(attr);

  return 1;
}

export function getElementBBox(id) {
  const el = getSvgElement(id);
  if (!el || !el.getBBox) return null;
  try {
    return el.getBBox();
  } catch (_err) {
    return null;
  }
}

export function onSvgClick(event) {
  if (!state.svgRoot || !dom.svgHost.contains(event.target)) return;

  if (state.pickingPivot && state.selectedElementId) {
    const point = screenToSvg(event.clientX, event.clientY);
    const t = state.currentTransforms[state.selectedElementId] || defaultTransformForElement(state.selectedElementId);
    t.pivotX = point.x;
    t.pivotY = point.y;
    state.currentTransforms[state.selectedElementId] = t;
    applyTransformToElement(state.selectedElementId, t);
    applyLayerMasks();
    state.pickingPivot = false;
    dom.svgHost.classList.remove("pivot-mode");
    dom.pickPivotBtn.textContent = "Pick Pivot";
    updatePivotIndicator();
    actions.updateInspector();
    actions.markDirty(true);
    actions.toast("Pivot set at clicked point.");
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  const target = event.target.closest?.("[data-anim-editable='true']");
  if (target && state.svgRoot.contains(target)) {
    selectElement(target.getAttribute("data-anim-id") || target.id);
    return;
  }

  deselectElement();
}

export function onSvgPointerDown(event) {
  if (!state.selectedElementId || state.pickingPivot) return;

  const selectedEl = getSvgElement(state.selectedElementId);
  if (!selectedEl) return;

  const target = event.target.closest?.("[data-anim-editable='true']");
  if (!target) return;

  if (target !== selectedEl && !target.contains(selectedEl) && !selectedEl.contains(target)) {
    return;
  }

  const startPoint = screenToSvg(event.clientX, event.clientY);
  const startTransform = clone(state.currentTransforms[state.selectedElementId] || defaultTransformForElement(state.selectedElementId));

  state.dragging = {
    id: state.selectedElementId,
    startPoint,
    startTransform
  };

  selectedEl.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

export function onSvgPointerMove(event) {
  if (!state.dragging) return;

  const point = screenToSvg(event.clientX, event.clientY);
  const dx = point.x - state.dragging.startPoint.x;
  const dy = point.y - state.dragging.startPoint.y;
  const t = clone(state.dragging.startTransform);

  t.x += dx;
  t.y += dy;

  state.currentTransforms[state.dragging.id] = t;
  applyTransformToElement(state.dragging.id, t);
  applyLayerMasks();
  updatePivotIndicator();
  actions.updateInspector();
  actions.markDirty(true);
}

export function onSvgPointerUp() {
  if (state.dragging) {
    state.dragging = null;
  }
}

export function screenToSvg(clientX, clientY) {
  const svg = state.svgRoot;
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

export function readInspectorTransform() {
  return normalizeTransform({
    x: parseFloat(dom.xInput.value),
    y: parseFloat(dom.yInput.value),
    rotation: parseFloat(dom.rotationInput.value),
    scale: parseFloat(dom.scaleInput.value),
    opacity: parseFloat(dom.opacityInput.value) / 100,
    pivotX: parseFloat(dom.pivotXInput.value),
    pivotY: parseFloat(dom.pivotYInput.value)
  });
}

export function onInspectorInput() {
  if (!state.selectedElementId) return;
  const t = readInspectorTransform();
  state.currentTransforms[state.selectedElementId] = t;
  applyTransformToElement(state.selectedElementId, t);
  applyLayerMasks();
  updatePivotIndicator();
  actions.updateInspector();
  actions.markDirty(true);
}

export function applyTransformToElement(id, transform) {
  const el = getSvgElement(id);
  if (!el) return;

  const t = normalizeTransform(transform);
  const base = el.getAttribute("data-base-transform") || "";

  const generated = [
    `translate(${t.x} ${t.y})`,
    `rotate(${t.rotation} ${t.pivotX} ${t.pivotY})`,
    `scale(${t.scale})`
  ].join(" ");

  el.setAttribute("transform", [base, generated].filter(Boolean).join(" "));
  el.style.opacity = String(t.opacity);
}

export function onMaskToLayerChange() {
  if (!state.selectedElementId || !state.activeProject) return;

  const targetId = dom.maskToLayerSelect.value;
  const isValidTarget = targetId && targetId !== state.selectedElementId && state.layers.some(layer => layer.id === targetId);
  const anim = actions.ensureElementAnimation(state.selectedElementId);

  if (isValidTarget) {
    anim.maskTo = targetId;
  } else {
    delete anim.maskTo;
  }

  applyLayerMasks();
  actions.markDirty(true);
  actions.updateInspector();
}

export function applyLayerMasks() {
  if (!state.svgRoot || !state.activeProject) return;

  clearGeneratedLayerMasks();

  for (const layer of state.layers) {
    const el = getSvgElement(layer.id);
    if (el) restoreBaseClipPath(el);
  }

  const masks = [];
  for (const layer of state.layers) {
    const maskTo = state.activeProject.elements[layer.id]?.maskTo;
    if (!maskTo || maskTo === layer.id) continue;

    const el = getSvgElement(layer.id);
    const maskSource = getSvgElement(maskTo);
    if (!el || !maskSource) continue;

    const clippedTransform = normalizeTransform(state.currentTransforms[layer.id] || defaultTransformForElement(layer.id));
    masks.push({ layerId: layer.id, el, maskSource, clippedTransform });
  }

  if (!masks.length) return;

  const defs = ensureLayerMaskDefs();

  for (const mask of masks) {
    const clipId = `anim-mask-${safeElementId(mask.layerId, "layer")}-to-${safeElementId(mask.maskSource.getAttribute("data-anim-id") || mask.maskSource.id, "mask")}`;
    const clipPath = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
    const maskClone = mask.maskSource.cloneNode(true);

    clipPath.setAttribute("id", clipId);
    clipPath.setAttribute("clipPathUnits", "userSpaceOnUse");
    clipPath.setAttribute("transform", `translate(${-mask.clippedTransform.x} ${-mask.clippedTransform.y}) rotate(${-mask.clippedTransform.rotation} ${mask.clippedTransform.pivotX} ${mask.clippedTransform.pivotY})`);
    sanitizeMaskClone(maskClone);
    clipPath.appendChild(maskClone);
    defs.appendChild(clipPath);

    mask.el.setAttribute("clip-path", `url(#${clipId})`);
    mask.el.style.clipPath = `url(#${clipId})`;
  }
}

export function clearGeneratedLayerMasks() {
  if (!state.svgRoot) return;
  state.svgRoot.querySelectorAll("defs[data-anim-mask-root='true']").forEach(el => el.remove());
}

export function ensureLayerMaskDefs() {
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  defs.setAttribute("data-anim-mask-root", "true");
  state.svgRoot.appendChild(defs);
  return defs;
}

export function sanitizeMaskClone(root) {
  const elements = [root, ...root.querySelectorAll("*")];

  for (const el of elements) {
    el.removeAttribute("id");
    el.removeAttribute("data-anim-id");
    el.removeAttribute("data-anim-editable");
    el.removeAttribute("data-base-transform");
    el.removeAttribute("data-base-opacity");
    el.removeAttribute("data-base-clip-path");
    el.removeAttribute("data-base-style-clip-path");
    el.removeAttribute("clip-path");
    el.classList.remove("anim-hover", "anim-selected");
    if (el.style) el.style.clipPath = "";
  }
}

export function restoreBaseClipPath(el) {
  const baseAttr = el.getAttribute("data-base-clip-path") || "";
  const baseStyle = el.getAttribute("data-base-style-clip-path") || "";

  if (baseAttr) el.setAttribute("clip-path", baseAttr);
  else el.removeAttribute("clip-path");

  if (el.style) el.style.clipPath = baseStyle;
}

export function centerPivot() {
  if (!state.selectedElementId) return;
  const bbox = getElementBBox(state.selectedElementId);
  if (!bbox) {
    actions.toast("Could not calculate the selected element bounds.");
    return;
  }

  const t = state.currentTransforms[state.selectedElementId] || defaultTransformForElement(state.selectedElementId);
  t.pivotX = bbox.x + bbox.width / 2;
  t.pivotY = bbox.y + bbox.height / 2;
  state.currentTransforms[state.selectedElementId] = t;
  applyTransformToElement(state.selectedElementId, t);
  applyLayerMasks();
  updatePivotIndicator();
  actions.updateInspector();
  actions.markDirty(true);
}

export function togglePickPivot() {
  if (!state.selectedElementId) return;
  state.pickingPivot = !state.pickingPivot;
  dom.svgHost.classList.toggle("pivot-mode", state.pickingPivot);
  dom.pickPivotBtn.textContent = state.pickingPivot ? "Cancel Pivot" : "Pick Pivot";
  actions.toast(state.pickingPivot ? "Click in the preview to set the rotation center." : "Pivot picking cancelled.");
}

export function resetSelectedTransform() {
  if (!state.selectedElementId) return;
  const t = defaultTransformForElement(state.selectedElementId);
  const anim = state.activeProject?.elements[state.selectedElementId];

  if (anim) {
    delete anim.maskTo;
  }

  state.currentTransforms[state.selectedElementId] = t;
  applyTransformToElement(state.selectedElementId, t);
  applyLayerMasks();
  updatePivotIndicator();
  actions.updateInspector();
  actions.markDirty(true);
}

export function updatePivotIndicator() {
  const group = ensurePivotIndicator();
  const selected = state.selectedElementId;
  const hasSelection = Boolean(selected && getSvgElement(selected));

  if (!group || !hasSelection) {
    if (group) group.setAttribute("display", "none");
    return;
  }

  const transform = normalizeTransform(state.currentTransforms[selected] || defaultTransformForElement(selected));
  group.setAttribute("display", "inline");
  group.setAttribute("transform", `translate(${transform.pivotX} ${transform.pivotY})`);
}

export function ensurePivotIndicator() {
  if (!state.svgRoot) return null;

  let group = state.svgRoot.querySelector("[data-anim-ui='pivot-indicator']");
  if (group) return group;

  const ns = "http://www.w3.org/2000/svg";
  group = document.createElementNS(ns, "g");
  group.setAttribute("data-anim-ui", "pivot-indicator");
  group.setAttribute("class", "pivot-indicator");
  group.setAttribute("display", "none");

  const ring = document.createElementNS(ns, "circle");
  ring.setAttribute("r", "7");

  const horizontal = document.createElementNS(ns, "line");
  horizontal.setAttribute("x1", "-11");
  horizontal.setAttribute("x2", "11");
  horizontal.setAttribute("y1", "0");
  horizontal.setAttribute("y2", "0");

  const vertical = document.createElementNS(ns, "line");
  vertical.setAttribute("x1", "0");
  vertical.setAttribute("x2", "0");
  vertical.setAttribute("y1", "-11");
  vertical.setAttribute("y2", "11");

  group.append(ring, horizontal, vertical);
  state.svgRoot.appendChild(group);

  return group;
}
