Here’s a solid plan for a **single HTML file SVG animation editor**. The browser can open folders using `window.showDirectoryPicker()`, but this is mainly Chromium-based browser territory; Firefox does not support it currently, so target Chrome/Edge for the “open folder and save JSON beside SVG” workflow. ([MDN Web Docs][1])

## 1. App layout

Use one HTML file with embedded CSS and JavaScript.

```text
+------------------------------------------------------+
| Toolbar                                               |
| [Open Folder] [Save Project] [Play] [Pause] [Export] |
+----------------------+-------------------------------+
| SVG file list         | Animation preview             |
| - icon.svg            |                               |
| - character.svg       |        <svg preview>          |
| - logo.svg            |                               |
+----------------------+-------------------------------+
| Layer / element list  | Inspector                     |
| - head                | selected element controls     |
| - arm_left            | x, y, rotation, origin x/y    |
| - arm_right           | add/update keyframe           |
+----------------------+-------------------------------+
| Timeline                                             |
| [0]---[10]---[20]---[30]---[40]---[50]---[60]       |
| keyframes per selected SVG element                   |
+------------------------------------------------------+
```

Main panels:

| Panel        | Purpose                                                       |
| ------------ | ------------------------------------------------------------- |
| File browser | Shows all `.svg` files found recursively in the chosen folder |
| Preview      | Renders the selected SVG and animation                        |
| Layer list   | Shows editable SVG elements                                   |
| Inspector    | Lets user edit translate, rotation, and rotation center       |
| Timeline     | Lets user seek frames and add/update/delete keyframes         |

## 2. Folder behavior

When the user clicks **Open Folder**:

1. Call `showDirectoryPicker()`.
2. Recursively walk through the folder and subfolders.
3. Find every `.svg`.
4. For each SVG, look for a `.json` with the same base name in the same folder.

Example:

```text
/assets/character.svg
/assets/character.json

/assets/icons/spaceship.svg
/assets/icons/spaceship.json
```

If the JSON exists, load it as the animation project.
If it does not exist, create a new empty project in memory and save later as:

```text
same-folder/same-name.json
```

Browser-side file handles can be obtained from the File System Access API after the user chooses a directory. MDN documents this workflow through file and directory picker methods like `showDirectoryPicker()`. ([MDN Web Docs][2])

## 3. JSON project format

Use a project file that stores enough information to reopen the animation exactly.

```json
{
  "version": 1,
  "svgFile": "character.svg",
  "fps": 24,
  "durationFrames": 120,
  "elements": {
    "arm_left": {
      "selector": "#arm_left",
      "name": "Left Arm",
      "pivot": {
        "x": 120,
        "y": 80
      },
      "keyframes": [
        {
          "frame": 0,
          "transform": {
            "x": 0,
            "y": 0,
            "rotation": 0,
            "scaleX": 1,
            "scaleY": 1
          },
          "easing": "linear"
        },
        {
          "frame": 24,
          "transform": {
            "x": 15,
            "y": -4,
            "rotation": 35,
            "scaleX": 1,
            "scaleY": 1
          },
          "easing": "linear"
        }
      ]
    }
  }
}
```

I would store animation state separately from the SVG file. Do **not** rewrite the SVG unless the user explicitly exports a baked version.

## 4. SVG element selection strategy

When loading an SVG:

1. Parse the SVG text using `DOMParser`.
2. Inject the SVG into the preview panel.
3. Find editable elements:

   ```js
   svg.querySelectorAll("g, path, rect, circle, ellipse, polygon, polyline, line, text, image")
   ```
4. Ensure every editable element has a stable ID.

   * If it already has `id`, use it.
   * If not, assign one like:

     ```text
     auto_layer_001
     auto_layer_002
     ```
5. Build the layer list from those elements.

Layer hover behavior:

```js
layerRow.addEventListener("mouseenter", () => highlightSvgElement(elementId));
layerRow.addEventListener("mouseleave", () => clearHighlight(elementId));
```

A simple highlight can be done by adding a temporary outline style:

```css
.svg-highlight {
  filter: drop-shadow(0 0 4px #00aaff);
  outline: 1px solid #00aaff;
}
```

For SVG elements, it is often better to add a temporary clone or overlay bounding box instead of relying on CSS `outline`.

## 5. Transform model

For each editable SVG element, keep a transform state:

```js
{
  x: 0,
  y: 0,
  rotation: 0,
  pivotX: 0,
  pivotY: 0,
  scaleX: 1,
  scaleY: 1
}
```

Apply transforms as SVG transform attributes:

```js
function applyTransform(el, t, pivot) {
  el.setAttribute(
    "transform",
    `
      translate(${t.x} ${t.y})
      rotate(${t.rotation} ${pivot.x} ${pivot.y})
      scale(${t.scaleX} ${t.scaleY})
    `
  );
}
```

For rotation around a chosen center, SVG supports rotation syntax like:

```text
rotate(angle cx cy)
```

This is more predictable than relying only on CSS `transform-origin`, because SVG `transform-origin` still has limited availability in some browsers. ([MDN Web Docs][3])

For pointer interactions, use `getScreenCTM()` to convert mouse coordinates into SVG coordinates. MDN describes `getScreenCTM()` as the matrix from the SVG element’s coordinate system to the SVG viewport coordinate system. ([MDN Web Docs][4])

Example coordinate conversion:

```js
function screenToSvg(svg, clientX, clientY) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}
```

## 6. Timeline model

The timeline should represent frames, not seconds.

```js
const timeline = {
  fps: 24,
  currentFrame: 0,
  durationFrames: 120
};
```

Controls:

```text
[Play] [Pause] [Current frame input] [Add keyframe] [Delete keyframe]
```

For each selected element, show its keyframes as markers on the timeline.

```text
Frame: 0          24          48          72          96
       |----------|-----------|-----------|-----------|
arm    ●                      ●                       ●
```

When the user moves the playhead:

1. Find the selected element’s previous and next keyframes.
2. Interpolate transform values.
3. Apply the interpolated transform to the SVG element.

Basic interpolation:

```js
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function interpolateTransform(k1, k2, frame) {
  const span = k2.frame - k1.frame;
  const t = span === 0 ? 0 : (frame - k1.frame) / span;

  return {
    x: lerp(k1.transform.x, k2.transform.x, t),
    y: lerp(k1.transform.y, k2.transform.y, t),
    rotation: lerp(k1.transform.rotation, k2.transform.rotation, t),
    scaleX: lerp(k1.transform.scaleX, k2.transform.scaleX, t),
    scaleY: lerp(k1.transform.scaleY, k2.transform.scaleY, t)
  };
}
```

## 7. Keyframe behavior

When the user clicks **Add Keyframe**:

```js
function addOrUpdateKeyframe(project, elementId, frame, transform) {
  const elementAnim = project.elements[elementId] ??= {
    selector: `#${elementId}`,
    name: elementId,
    pivot: { x: 0, y: 0 },
    keyframes: []
  };

  const existing = elementAnim.keyframes.find(k => k.frame === frame);

  if (existing) {
    existing.transform = structuredClone(transform);
  } else {
    elementAnim.keyframes.push({
      frame,
      transform: structuredClone(transform),
      easing: "linear"
    });

    elementAnim.keyframes.sort((a, b) => a.frame - b.frame);
  }
}
```

Recommended UX:

* If there is no keyframe at the current frame, button says **Add Keyframe**.
* If there is already a keyframe, button says **Update Keyframe**.
* Modified-but-unsaved values should show a small dirty indicator.

## 8. Preview playback

Use `requestAnimationFrame()`.

```js
let playing = false;
let startTime = 0;
let startFrame = 0;

function play() {
  playing = true;
  startTime = performance.now();
  startFrame = timeline.currentFrame;
  requestAnimationFrame(tick);
}

function tick(now) {
  if (!playing) return;

  const elapsedSeconds = (now - startTime) / 1000;
  const advancedFrames = Math.floor(elapsedSeconds * project.fps);

  timeline.currentFrame =
    (startFrame + advancedFrames) % project.durationFrames;

  renderFrame(timeline.currentFrame);
  requestAnimationFrame(tick);
}
```

## 9. Rendering a frame

```js
function renderFrame(frame) {
  for (const [elementId, anim] of Object.entries(project.elements)) {
    const el = previewSvg.querySelector(anim.selector);
    if (!el || anim.keyframes.length === 0) continue;

    const transform = getTransformAtFrame(anim.keyframes, frame);
    applyTransform(el, transform, anim.pivot);
  }

  updateTimelineUI(frame);
}
```

`getTransformAtFrame()` should:

1. Return exact keyframe transform if one exists.
2. Return first transform if frame is before the first keyframe.
3. Return last transform if frame is after the last keyframe.
4. Otherwise interpolate between surrounding keyframes.

## 10. Saving JSON

The save button should write the project JSON beside the SVG.

```js
async function saveProject(svgEntry, project) {
  const jsonName = svgEntry.name.replace(/\.svg$/i, ".json");

  const jsonHandle = await svgEntry.parentHandle.getFileHandle(jsonName, {
    create: true
  });

  const writable = await jsonHandle.createWritable();

  await writable.write(JSON.stringify(project, null, 2));
  await writable.close();
}
```

The `svgEntry` object should store:

```js
{
  name: "character.svg",
  path: "assets/character.svg",
  fileHandle,
  parentHandle,
  jsonHandle,
  project
}
```

## 11. Internal state structure

```js
const app = {
  rootDirectoryHandle: null,
  svgFiles: [],
  activeSvgEntry: null,
  previewSvg: null,
  selectedElementId: null,

  timeline: {
    currentFrame: 0,
    durationFrames: 120,
    fps: 24,
    playing: false
  }
};
```

## 12. Minimum single-file implementation modules

Even inside one HTML file, organize the JavaScript into sections:

```html
<script>
/* =====================================================
   State
===================================================== */

/* =====================================================
   File system: open folder, scan SVGs, load/save JSON
===================================================== */

/* =====================================================
   SVG loading and layer extraction
===================================================== */

/* =====================================================
   Selection, hover highlight, inspector controls
===================================================== */

/* =====================================================
   Transform math and coordinate conversion
===================================================== */

/* =====================================================
   Timeline, keyframes, interpolation, playback
===================================================== */

/* =====================================================
   UI rendering
===================================================== */
</script>
```

## 13. Important browser limitations

The folder-opening and direct save-next-to-SVG workflow needs the File System Access API. It is available in Chrome and Edge, but not Firefox according to MDN’s compatibility table for `showDirectoryPicker()`. ([MDN Web Docs][1])

For non-Chromium fallback, you would need a weaker workflow:

```text
Upload SVG files manually
↓
Edit animation
↓
Download JSON manually
```

But for your requested “open a folder, search subfolders, and save JSON next to SVG” behavior, Chrome/Edge is the right target.

## 14. Development order

Build it in this order:

1. Static layout with preview, layer list, inspector, and timeline.
2. Load one SVG from a file input.
3. Extract SVG elements into a layer list.
4. Hover layer row highlights matching SVG element.
5. Click layer row selects element.
6. Inspector edits `x`, `y`, `rotation`, `pivotX`, `pivotY`.
7. Add/update keyframe at current frame.
8. Seek timeline and interpolate transforms.
9. Play/pause animation.
10. Replace file input with `Open Folder`.
11. Recursively scan subfolders for SVG files.
12. Load matching JSON if present.
13. Save project JSON beside SVG.
14. Add export options later.

The core idea is: **keep the SVG as the artwork, keep the JSON as the animation project, and render animation by applying generated `transform` attributes at the current frame.**

[1]: https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker?utm_source=chatgpt.com "Window: showDirectoryPicker() method - Web APIs | MDN"
[2]: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API?utm_source=chatgpt.com "File System API - MDN Web Docs"
[3]: https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/transform-origin?utm_source=chatgpt.com "transform-origin - SVG - MDN Web Docs"
[4]: https://developer.mozilla.org/en-US/docs/Web/API/SVGGraphicsElement/getScreenCTM?utm_source=chatgpt.com "SVGGraphicsElement: getScreenCTM() method - Web APIs"
