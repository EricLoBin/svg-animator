export function baseName(name) {
  return name.replace(/\.[^.]+$/, "");
}

export function jsonNameForSvg(svgName) {
  return baseName(svgName) + ".json";
}

export function pngNameForSvg(svgName) {
  return baseName(svgName) + ".png";
}

export function nowIso() {
  return new Date().toISOString();
}

export function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function identityTransform() {
  return { x: 0, y: 0, rotation: 0, scale: 1, pivotX: 0, pivotY: 0 };
}

export function normalizeTransform(t = {}) {
  return {
    x: Number(t.x ?? 0),
    y: Number(t.y ?? 0),
    rotation: Number(t.rotation ?? 0),
    scale: Number(t.scale ?? t.scaleX ?? 1),
    pivotX: Number(t.pivotX ?? (t.pivot && t.pivot.x) ?? 0),
    pivotY: Number(t.pivotY ?? (t.pivot && t.pivot.y) ?? 0)
  };
}

export function escapeCss(id) {
  if (window.CSS && CSS.escape) return CSS.escape(id);
  return String(id).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

export function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function safeElementId(raw, fallback) {
  const cleaned = String(raw || fallback)
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "_");
  return cleaned || fallback;
}

export function parseSvgLength(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw || raw.endsWith("%")) return null;

  const match = raw.match(/^(-?\d*\.?\d+(?:e[-+]?\d+)?)(px|pt|pc|in|cm|mm)?$/i);
  if (!match) return null;

  const number = Number(match[1]);
  if (!Number.isFinite(number) || number <= 0) return null;

  const unit = (match[2] || "px").toLowerCase();
  const pxPerUnit = {
    px: 1,
    pt: 96 / 72,
    pc: 16,
    in: 96,
    cm: 96 / 2.54,
    mm: 96 / 25.4
  };

  return number * (pxPerUnit[unit] || 1);
}

export function roundForInput(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n * 1000) / 1000);
}
