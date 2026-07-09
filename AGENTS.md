# SVG Animator Agent Guide

## Project Overview

SVG Animator is a browser-only SVG animation editor. It loads SVG files from a user-selected folder, lets the user select SVG elements as animation layers, edit transforms over a frame timeline, save animation data as sidecar JSON, and export PNG spritesheets.

The app is intentionally static: there is no build step, package manager, backend, or framework. `index.html` loads `css/styles.css` and ES modules from `js/`.

## File Map

- `index.html`: Static DOM structure for the toolbar, left browser tabs, preview, inspector, timeline, and properties modal.
- `css/styles.css`: All app styling.
- `js/main.js`: Entrypoint; imports modules, registers actions, and binds events.
- `js/state.js`: Shared mutable app state and DOM references.
- `js/context.js`: Shared action registry used to avoid tight circular imports between modules.
- `js/files.js`: Folder scanning, manual SVG/JSON loading, matching JSON loading, and active SVG switching.
- `js/project.js`: Project JSON creation, normalization, save, download, and export settings defaults.
- `js/svg.js`: SVG parsing/sanitizing, layer extraction, element selection, transform application, dragging, pivot picking, and pivot indicator UI.
- `js/timeline.js`: Keyframes, interpolation, frame rendering, timeline rendering, playback, and timeline settings.
- `js/ui.js`: File/layer list rendering, inspector rendering, tabs, toast/status/dirty UI, and properties modal behavior.
- `js/export.js`: PNG spritesheet export.
- `js/utils.js`: Small shared helpers.

## Data Model Notes

Animation data is stored separately from the SVG in a sidecar JSON file named after the SVG, for example `character.svg` and `character.json`.

Projects store:

- `fps`
- `durationFrames`
- `export.width`, `export.height`, `export.type`
- `layers`
- `elements[id].keyframes`

Keep the JSON format backward-compatible when adding fields. Normalize missing or legacy values in `project.js`.

## UI Behavior Notes

- The left panel has tabs for SVG files and layers.
- After opening a folder with multiple SVGs, wait for the user to choose an SVG. Auto-load only when exactly one SVG is found.
- After an SVG is loaded, switch to the Layers tab.
- Prefer `inkscape:label` as the layer display name, falling back to `aria-label`, then `id`, then tag name.
- The pivot indicator is SVG UI, marked with `data-anim-ui`, and should never become an editable layer or appear in exports.

## Export Notes

Spritesheet export uses all frames from `0` through `durationFrames - 1`. Every cell uses the configured export size. The output is saved beside the active SVG as `same-base-name.png` when the SVG came from folder mode.

Do not include editor-only SVG helpers such as selection, hover, or pivot UI in exported images.

## Verification

Run syntax checks after JavaScript changes:

```powershell
node --check js/main.js
node --check js/state.js
node --check js/context.js
node --check js/utils.js
node --check js/project.js
node --check js/files.js
node --check js/svg.js
node --check js/ui.js
node --check js/timeline.js
node --check js/export.js
```
