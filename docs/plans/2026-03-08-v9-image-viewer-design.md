# V9 — Image-Based Product Viewer

## Summary

Replace V8's Three.js 3D renderer with pre-rendered images from Blender. Same scroll-driven rotation, same hotspot callout system, no WebGL dependency.

## Rendering (Blender)

- 25 PNG frames at 15° intervals (0°–360°)
- Orthographic camera, elevation ~31.5°, framed to match V8
- Current Blender scene lighting and background
- Resolution: 1920×1080
- Output: `v9/images/frame-00.png` through `frame-24.png`

## Frontend

- **Scroll container**: 2500vh (25 frames × 100vh), same as V8
- **Image display**: Single `<img>` element, swap src on scroll (or preloaded img stack with visibility toggling)
- **Hotspots**: 14 callouts from V8, anchors defined as 2D screen coordinates per major stop
- **Callout lines**: SVG overlay connecting anchor dots to text panels
- **Overlap prevention**: Same algorithm as V8 (min 16px vertical gap)
- **Scroll indicator**: 8 dots on right side
- **Film grain**: CSS-based effect
- **No Three.js, no WebGL**

## Hotspot Positioning

Since there's no 3D engine to project world→screen, hotspot anchors are defined as normalized (0-1) x/y coordinates per major stop. These are mapped to viewport pixels at runtime. Hotspots only visible at their major stop (frames 0,3,6,9,12,15,18,21,24).

## File Structure

```
v9/
├── index.html
├── style.css
├── js/
│   └── main.js
└── images/
    ├── frame-00.png
    ├── frame-01.png
    └── ... (25 frames)
```

## Decisions

- 25 frames (not 8 or 72) — matches V8 smoothness
- Single consistent look from Blender (not 8 material contexts)
- Rendered background included (not transparent)
- 1920×1080 resolution
- Keep full hotspot/callout system
