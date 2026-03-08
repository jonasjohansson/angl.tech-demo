# V9 Image-Based Product Viewer — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace V8's Three.js 3D viewer with pre-rendered Blender images while keeping the same scroll-driven rotation and hotspot callout system.

**Architecture:** 25 pre-rendered PNG frames (every 15°) displayed in a fixed viewport, swapped on scroll. Hotspot anchors defined as normalized 2D coordinates per major stop. SVG callout lines, overlap prevention, and scroll indicator ported from V8.

**Tech Stack:** Blender (rendering via MCP), vanilla HTML/CSS/JS (no Three.js)

---

### Task 1: Render 25 frames from Blender

**Files:**
- Create: `v9/images/frame-00.png` through `frame-24.png`

**Step 1: Set up orthographic camera in Blender**

Execute Blender Python script via MCP to:
- Create/configure an orthographic camera
- Match V8's framing: elevation 0.55 rad (~31.5°), radius 4.0 units relative to PC center
- Set resolution to 1920×1080
- Use orthographic scale matching V8's frustum size 3.2

**Step 2: Render 25 frames**

Execute Blender Python script that loops through 25 azimuth angles (0° to 360° in 15° steps), positions the camera, and renders each frame to `v9/images/frame-{i:02d}.png`.

**Step 3: Verify renders**

Check that all 25 images exist and look correct via viewport screenshots.

---

### Task 2: Create V9 HTML structure

**Files:**
- Create: `v9/index.html`

**Step 1: Write index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ANGL — V9</title>
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="./style.css" />
</head>
<body>
  <div id="scroll-container" class="scroll-container"></div>
  <div class="viewer-fixed">
    <div id="frame-container" class="frame-container"></div>
    <svg id="callout-svg" class="callout-svg" xmlns="http://www.w3.org/2000/svg"></svg>
    <div id="hotspot-container" class="hotspot-container"></div>
    <div id="loading-overlay" class="loading-overlay">
      <div class="loading-bar-track">
        <div id="loading-progress" class="loading-bar-fill"></div>
      </div>
      <span id="loading-text" class="loading-text">loading...</span>
    </div>
    <div id="scroll-indicator" class="scroll-indicator">
      <div class="scroll-track">
        <div id="scroll-thumb" class="scroll-thumb"></div>
      </div>
      <div id="stop-dots" class="stop-dots"></div>
    </div>
  </div>
  <script type="module" src="./js/main.js"></script>
</body>
</html>
```

---

### Task 3: Create V9 CSS

**Files:**
- Create: `v9/style.css`

Port V8's style.css with these changes:
- Replace `.viewer-canvas` with `.frame-container` (holds the `<img>` elements)
- Add `.frame-img` styles for the preloaded images (position absolute, object-fit cover, hidden by default)
- Add `.frame-img.active` to show current frame
- Remove Tweakpane styles
- Remove canvas-specific styles
- Keep all hotspot, callout, scroll indicator, loading styles identical

---

### Task 4: Create V9 main.js

**Files:**
- Create: `v9/js/main.js`

**Key differences from V8:**
- No Three.js imports
- Preload 25 images into `<img>` elements inside `#frame-container`
- Scroll mapping: same 2500vh container, maps scroll to frame index 0-24
- Show/hide images based on current frame index
- Hotspot anchors: defined as `{ x: 0-1, y: 0-1 }` normalized screen coordinates per major stop (derived from where features appear in the rendered images)
- Callout lines: same SVG approach, but using 2D anchor positions directly
- Overlap prevention: same algorithm
- Scroll indicator: same 8 dots
- Film grain: CSS filter or canvas overlay (lightweight)

**Hotspot 2D positions** will need to be fine-tuned after renders are done — define initial estimates based on V8's 3D positions projected to the orthographic view.

**Step 1: Write main.js skeleton with image preloading**

**Step 2: Add scroll-driven frame switching**

**Step 3: Add hotspot system with 2D anchors**

**Step 4: Add callout SVG lines and overlap prevention**

**Step 5: Add scroll indicator**

**Step 6: Add loading overlay with progress**

---

### Task 5: Fine-tune hotspot positions

After renders are complete, view each major stop image and adjust the normalized x/y anchor coordinates to match where the PC features actually appear in the rendered frames.

---

### Task 6: Commit V9

```bash
git add v9/
git commit -m "Add V9: image-based product viewer with Blender-rendered frames"
```
