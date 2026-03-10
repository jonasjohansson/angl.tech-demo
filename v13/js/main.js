// ─── V13: Isometric camera (zoomed out, 1:1) + IKEA-style mobile hotspots ──
// V12 camera + V11 step-based navigation + mobile clickable dots
import { Pane } from 'tweakpane';

// ─── Frame grid ─────────────────────────────────────────────────
const STEP_DEG = 15;
const UNIQUE_FRAMES = 24;
const TOTAL_FRAMES = UNIQUE_FRAMES;
const FRAMES = Array.from({ length: UNIQUE_FRAMES }, (_, i) => {
  const deg = (i * STEP_DEG) % 360;
  const majorIndex = (deg % 45 === 0) ? (deg / 45) % 8 : -1;
  return { index: i, deg, majorIndex };
});

// ─── Hotspot definitions ────────────────────────────────────────
// Anchors adjusted per stop for descending camera arc:
// Frame 0 (78°): PC centered ~y 0.28–0.62
// Frame 9 (68°): PC shifts up ~y 0.20–0.55
// Frame 18 (53°): PC higher ~y 0.15–0.52
// Frame 21 (50°): PC highest ~y 0.14–0.50
const STOPS = [
  {
    angle: 0, label: 'front', frameIndex: 0,
    hotspots: [
      { anchor: { x: 0.50, y: 0.30 }, panelSide: 'right', tag: '01', title: 'Front Panel', desc: 'Precision-machined aluminium face with minimal design language.' },
      { anchor: { x: 0.50, y: 0.58 }, panelSide: 'left', tag: '02', title: 'Ventilation', desc: 'Optimized airflow channels for silent, efficient cooling.' },
    ],
  },
  {
    angle: 45, label: 'front-right', frameIndex: 3,
    hotspots: [
      { anchor: { x: 0.55, y: 0.28 }, panelSide: 'right', tag: '03', title: 'Edge Profile', desc: 'Chamfered edges at precise 45\u00b0 angles. CNC-finished surface.' },
      { anchor: { x: 0.55, y: 0.56 }, panelSide: 'right', tag: '04', title: 'Build Quality', desc: 'Unibody aluminium construction. No visible fasteners.' },
    ],
  },
  {
    angle: 90, label: 'right', frameIndex: 6,
    hotspots: [
      { anchor: { x: 0.52, y: 0.26 }, panelSide: 'right', tag: '05', title: 'Side Panel', desc: 'Removable side panel for easy component access.' },
      { anchor: { x: 0.52, y: 0.54 }, panelSide: 'right', tag: '06', title: 'Expansion', desc: 'Full-length GPU support with dedicated airflow path.' },
    ],
  },
  {
    angle: 135, label: 'rear-right', frameIndex: 9,
    hotspots: [
      { anchor: { x: 0.52, y: 0.22 }, panelSide: 'right', tag: '07', title: 'Exhaust', desc: 'Rear exhaust system with integrated cable routing.' },
    ],
  },
  {
    angle: 180, label: 'rear', frameIndex: 12,
    hotspots: [
      { anchor: { x: 0.48, y: 0.22 }, panelSide: 'left', tag: '08', title: 'I/O Panel', desc: 'Full connectivity \u2014 USB-C, USB-A, DisplayPort, HDMI, Ethernet.' },
      { anchor: { x: 0.55, y: 0.52 }, panelSide: 'right', tag: '09', title: 'Power Supply', desc: 'Integrated SFX PSU with modular cabling.' },
    ],
  },
  {
    angle: 225, label: 'rear-left', frameIndex: 15,
    hotspots: [
      { anchor: { x: 0.48, y: 0.24 }, panelSide: 'left', tag: '10', title: 'Cable Management', desc: 'Internal channels route cables cleanly behind the motherboard tray.' },
    ],
  },
  {
    angle: 270, label: 'left', frameIndex: 18,
    hotspots: [
      { anchor: { x: 0.48, y: 0.18 }, panelSide: 'left', tag: '11', title: 'Left Panel', desc: 'Solid aluminium side. Clean, unbroken surface.' },
      { anchor: { x: 0.48, y: 0.48 }, panelSide: 'left', tag: '12', title: 'Acoustic Dampening', desc: 'Layered isolation pads minimize vibration and noise.' },
    ],
  },
  {
    angle: 315, label: 'front-left', frameIndex: 21,
    hotspots: [
      { anchor: { x: 0.45, y: 0.16 }, panelSide: 'left', tag: '13', title: 'Design Language', desc: 'Scandinavian-inspired minimalism meets high-performance computing.' },
      { anchor: { x: 0.45, y: 0.48 }, panelSide: 'left', tag: '14', title: 'Footprint', desc: 'Compact ITX form factor \u2014 fits any desk, powers any workflow.' },
    ],
  },
];

// ─── Responsive helpers ─────────────────────────────────────────
function isMobile() {
  return window.innerWidth <= 768;
}


// ─── Init ───────────────────────────────────────────────────────
function init() {
  const frameContainer = document.getElementById('frame-container');
  const overlay = document.getElementById('loading-overlay');
  const progressBar = document.getElementById('loading-progress');
  const progressText = document.getElementById('loading-text');
  const calloutSvg = document.getElementById('callout-svg');
  const hotspotContainer = document.getElementById('hotspot-container');
  const hotspotDotsContainer = document.getElementById('hotspot-dots');
  const mobileCard = document.getElementById('mobile-card');
  const mobileCardTag = document.getElementById('mobile-card-tag');
  const mobileCardTitle = document.getElementById('mobile-card-title');
  const mobileCardDesc = document.getElementById('mobile-card-desc');
  const mobileCardClose = document.getElementById('mobile-card-close');

  // ─── Preload images ────────────────────────────────────────────
  const frameImages = [];
  let loadedCount = 0;

  function onImageLoaded() {
    loadedCount++;
    const pct = (loadedCount / TOTAL_FRAMES) * 100;
    progressBar.style.width = `${pct}%`;
    progressText.textContent = `loading ${loadedCount}/${TOTAL_FRAMES}...`;

    if (loadedCount === TOTAL_FRAMES) {
      progressText.textContent = 'ready';
      overlay.classList.add('loaded');
      setTimeout(() => { overlay.style.display = 'none'; }, 600);
      frameImages[0].classList.add('active');
    }
  }

  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const img = document.createElement('img');
    img.className = 'frame-img';
    img.src = `./images/frame-${String(i).padStart(2, '0')}.webp`;
    img.alt = `ANGL PC frame ${i}`;
    img.draggable = false;
    img.addEventListener('load', onImageLoaded);
    img.addEventListener('error', onImageLoaded);
    frameContainer.appendChild(img);
    frameImages.push(img);
  }

  // ─── Desktop hotspot panels ───────────────────────────────────
  const hotspotElements = [];
  STOPS.forEach((stop) => {
    stop.hotspots.forEach((hs) => {
      const panel = document.createElement('div');
      panel.className = 'hotspot-panel';
      panel.innerHTML = `
        <div class="hotspot-label">${hs.tag}</div>
        <div class="hotspot-title">${hs.title}</div>
        <div class="hotspot-desc">${hs.desc}</div>
      `;
      hotspotContainer.appendChild(panel);
      hotspotElements.push({ panel, hotspot: hs, stopAngle: stop.angle });
    });
  });

  // ─── Mobile hotspot dots ──────────────────────────────────────
  const dotElements = [];
  STOPS.forEach((stop) => {
    stop.hotspots.forEach((hs) => {
      const dot = document.createElement('button');
      dot.className = 'hotspot-dot';
      dot.setAttribute('aria-label', hs.title);
      dot.innerHTML = `
        <span class="hotspot-dot-pulse"></span>
        <span class="hotspot-dot-inner"></span>
      `;
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        showMobileCard(hs, dot);
      });
      hotspotDotsContainer.appendChild(dot);
      dotElements.push({ dot, hotspot: hs, stopAngle: stop.angle });
    });
  });

  // ─── Mobile card logic ────────────────────────────────────────
  let activeCardDot = null;

  function showMobileCard(hs, dotEl) {
    // Toggle off if tapping same dot
    if (activeCardDot === dotEl) {
      hideMobileCard();
      return;
    }

    mobileCardTag.textContent = hs.tag;
    mobileCardTitle.textContent = hs.title;
    mobileCardDesc.textContent = hs.desc;

    // Position card above the dot
    const dotRect = dotEl.getBoundingClientRect();
    const cardWidth = 260;
    let cardX = dotRect.left + dotRect.width / 2 - cardWidth / 2;
    // Keep within viewport
    cardX = Math.max(12, Math.min(cardX, window.innerWidth - cardWidth - 12));
    let cardY = dotRect.top - 12; // above the dot

    mobileCard.style.left = `${cardX}px`;
    mobileCard.style.width = `${cardWidth}px`;
    // Temporarily show to measure height
    mobileCard.style.display = 'block';
    mobileCard.style.opacity = '0';
    const cardHeight = mobileCard.offsetHeight;
    cardY = cardY - cardHeight;
    // If card would go above viewport, place below dot
    if (cardY < 12) {
      cardY = dotRect.bottom + 12;
    }
    mobileCard.style.top = `${cardY}px`;

    // Animate in
    requestAnimationFrame(() => {
      mobileCard.classList.add('visible');
    });

    // Mark active dot
    if (activeCardDot) activeCardDot.classList.remove('active');
    dotEl.classList.add('active');
    activeCardDot = dotEl;
  }

  function hideMobileCard() {
    mobileCard.classList.remove('visible');
    mobileCard.style.display = 'none';
    if (activeCardDot) {
      activeCardDot.classList.remove('active');
      activeCardDot = null;
    }
  }

  mobileCardClose.addEventListener('click', (e) => {
    e.stopPropagation();
    hideMobileCard();
  });

  // Tap outside card to dismiss
  window.addEventListener('click', () => {
    hideMobileCard();
  });

  // ─── State ───────────────────────────────────────────────────
  let currentFrameIndex = 0;
  let currentStopIndex = 0;
  let isAnimating = false;

  // ─── Update active frame ──────────────────────────────────────
  function updateFrame(index) {
    if (index === currentFrameIndex && frameImages[index].classList.contains('active')) return;
    frameImages.forEach((img, i) => {
      img.classList.toggle('active', i === index);
    });
    currentFrameIndex = index;
  }

  // ─── Update desktop hotspots ──────────────────────────────────
  const MARGIN_LEFT = 60;
  const MARGIN_RIGHT = 60;

  function updateDesktopHotspots() {
    while (calloutSvg.firstChild) calloutSvg.removeChild(calloutSvg.firstChild);

    const frame = FRAMES[currentFrameIndex];
    const isMajorStop = frame.majorIndex >= 0;

    if (!isMajorStop) {
      hotspotElements.forEach(({ panel }) => {
        panel.classList.remove('visible');
        panel.style.opacity = 0;
      });
      return;
    }

    const activeStopAngle = STOPS[frame.majorIndex].angle;

    const placements = [];
    hotspotElements.forEach(({ panel, hotspot, stopAngle }) => {
      const isActive = Math.abs(stopAngle - activeStopAngle) < 0.01;
      if (!isActive) {
        panel.classList.remove('visible');
        panel.style.opacity = 0;
        placements.push(null);
        return;
      }

      const screenX = hotspot.anchor.x * window.innerWidth;
      const screenY = hotspot.anchor.y * window.innerHeight;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let panelX;
      if (hotspot.panelSide === 'right') {
        panelX = vw - MARGIN_RIGHT - 260;
      } else {
        panelX = MARGIN_LEFT;
      }
      const panelY = Math.max(100, Math.min(screenY - 40, vh - 140));
      placements.push({ panel, hotspot, screen: { x: screenX, y: screenY }, panelX, panelY });
    });

    // Resolve vertical overlaps per side
    const MIN_GAP = 16;
    const activeBySide = { left: [], right: [] };
    placements.forEach((p) => {
      if (p) activeBySide[p.hotspot.panelSide].push(p);
    });
    for (const side of ['left', 'right']) {
      const items = activeBySide[side];
      if (items.length < 2) continue;
      items.sort((a, b) => a.panelY - b.panelY);
      for (let i = 1; i < items.length; i++) {
        const prev = items[i - 1];
        const prevHeight = prev.panel.offsetHeight || 80;
        const minTop = prev.panelY + prevHeight + MIN_GAP;
        if (items[i].panelY < minTop) {
          items[i].panelY = minTop;
        }
      }
    }

    placements.forEach((p) => {
      if (!p) return;
      const { panel, hotspot, screen, panelX, panelY } = p;

      panel.style.opacity = 1;
      panel.classList.add('visible');
      panel.style.left = `${panelX}px`;
      panel.style.top = `${panelY}px`;

      const panelRect = panel.getBoundingClientRect();
      const LINE_GAP = 8;
      let lineEdgeX;
      if (hotspot.panelSide === 'right') {
        lineEdgeX = panelRect.left - LINE_GAP;
      } else {
        lineEdgeX = panelRect.right + LINE_GAP;
      }

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', screen.x);
      circle.setAttribute('cy', screen.y);
      circle.setAttribute('r', 3);
      calloutSvg.appendChild(circle);

      const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line1.setAttribute('x1', screen.x);
      line1.setAttribute('y1', screen.y);
      line1.setAttribute('x2', lineEdgeX);
      line1.setAttribute('y2', screen.y);
      calloutSvg.appendChild(line1);
    });
  }

  // ─── Update mobile dots ───────────────────────────────────────
  function updateMobileDots() {
    const frame = FRAMES[currentFrameIndex];
    const isMajorStop = frame.majorIndex >= 0;

    // Dismiss card on frame change
    hideMobileCard();

    // Frame container rect for converting normalized coords to dot positions
    const fcRect = frameContainer.getBoundingClientRect();

    dotElements.forEach(({ dot, hotspot, stopAngle }) => {
      if (!isMajorStop) {
        dot.style.display = 'none';
        return;
      }
      const activeStopAngle = STOPS[frame.majorIndex].angle;
      const isActive = Math.abs(stopAngle - activeStopAngle) < 0.01;
      if (!isActive) {
        dot.style.display = 'none';
        return;
      }

      // Position dot relative to viewport
      const dotX = hotspot.anchor.x * window.innerWidth;
      const dotY = hotspot.anchor.y * window.innerHeight;
      dot.style.left = `${dotX}px`;
      dot.style.top = `${dotY}px`;
      dot.style.display = 'block';
    });
  }

  // ─── Unified hotspot update ───────────────────────────────────
  function updateHotspots() {
    if (isMobile()) {
      updateMobileDots();
    } else {
      updateDesktopHotspots();
    }
  }

  // ─── Animate between stops (frame by frame, from V11) ─────────
  function animateToStop(targetStopIndex) {
    if (isAnimating) return;

    const targetFrame = STOPS[targetStopIndex].frameIndex;
    if (targetFrame === currentFrameIndex) {
      currentStopIndex = targetStopIndex;
      return;
    }

    isAnimating = true;

    let from = currentFrameIndex;
    let to = targetFrame;
    let forwardDist = (to - from + UNIQUE_FRAMES) % UNIQUE_FRAMES;
    let backwardDist = (from - to + UNIQUE_FRAMES) % UNIQUE_FRAMES;
    let step = forwardDist <= backwardDist ? 1 : -1;
    let stepsRemaining = Math.min(forwardDist, backwardDist);

    const FRAME_DELAY = 60;

    function tick() {
      if (stepsRemaining <= 0) {
        currentStopIndex = targetStopIndex;
        isAnimating = false;
        updateHotspots();
        return;
      }
      const nextFrame = (currentFrameIndex + step + UNIQUE_FRAMES) % UNIQUE_FRAMES;
      updateFrame(nextFrame);
      stepsRemaining--;

      if (stepsRemaining <= 0) {
        currentStopIndex = targetStopIndex;
        isAnimating = false;
        updateHotspots();
      } else {
        setTimeout(tick, FRAME_DELAY);
      }
    }

    // Hide hotspots during transition
    hotspotElements.forEach(({ panel }) => {
      panel.classList.remove('visible');
      panel.style.opacity = 0;
    });
    while (calloutSvg.firstChild) calloutSvg.removeChild(calloutSvg.firstChild);
    dotElements.forEach(({ dot }) => { dot.style.display = 'none'; });
    hideMobileCard();

    tick();
  }

  // ─── Navigation ───────────────────────────────────────────────
  function goNext() {
    const next = (currentStopIndex + 1) % STOPS.length;
    animateToStop(next);
  }

  function goPrev() {
    const prev = (currentStopIndex - 1 + STOPS.length) % STOPS.length;
    animateToStop(prev);
  }

  // ─── Wheel handler (debounced, from V11) ──────────────────────
  let wheelAccum = 0;
  const WHEEL_THRESHOLD = 150;

  window.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (isAnimating) return;

    wheelAccum += e.deltaY;
    if (Math.abs(wheelAccum) >= WHEEL_THRESHOLD) {
      if (wheelAccum > 0) goNext();
      else goPrev();
      wheelAccum = 0;
    }
  }, { passive: false });

  let wheelResetTimeout;
  window.addEventListener('wheel', () => {
    clearTimeout(wheelResetTimeout);
    wheelResetTimeout = setTimeout(() => { wheelAccum = 0; }, 200);
  }, { passive: true });

  // ─── Arrow key navigation (single frame steps) ─────────────────
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      const next = (currentFrameIndex + 1) % UNIQUE_FRAMES;
      updateFrame(next);
      updateHotspots();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = (currentFrameIndex - 1 + UNIQUE_FRAMES) % UNIQUE_FRAMES;
      updateFrame(prev);
      updateHotspots();
    }
  });

  // ─── Touch swipe support ──────────────────────────────────────
  let touchStartY = 0;
  window.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  window.addEventListener('touchend', (e) => {
    if (isAnimating) return;
    const dy = touchStartY - e.changedTouches[0].clientY;
    if (Math.abs(dy) > 40) {
      if (dy > 0) goNext();
      else goPrev();
    }
  }, { passive: true });

  // ─── Resize ────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    updateHotspots();
  });
  updateHotspots();

  // ─── Color overlay ────────────────────────────────────────────
  const colorOverlay = document.createElement('div');
  colorOverlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:2;mix-blend-mode:multiply;background:transparent;';
  frameContainer.appendChild(colorOverlay);

  // ─── Grain canvas ─────────────────────────────────────────────
  const grainCanvas = document.createElement('canvas');
  grainCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3;opacity:0;';
  frameContainer.appendChild(grainCanvas);
  const grainCtx = grainCanvas.getContext('2d');

  function resizeGrain() {
    const rect = frameContainer.getBoundingClientRect();
    grainCanvas.width = rect.width;
    grainCanvas.height = rect.height;
  }
  resizeGrain();
  window.addEventListener('resize', resizeGrain);

  function renderGrain() {
    const w = grainCanvas.width;
    const h = grainCanvas.height;
    const imageData = grainCtx.createImageData(w, h);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const v = Math.random() * 255;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
    grainCtx.putImageData(imageData, 0, 0);
    requestAnimationFrame(renderGrain);
  }

  // ─── Font swapper ──────────────────────────────────────────
  const FONT_OPTIONS = {
    'Inter': "'Inter', -apple-system, sans-serif",
    'PP Neue Bit': "'PP Neue Bit', monospace",
    'Several Mono': "'Several Mono', monospace",
    'Space Mono': "'Space Mono', monospace",
    'JetBrains Mono': "'JetBrains Mono', monospace",
    'IBM Plex Mono': "'IBM Plex Mono', monospace",
    'Roboto Mono': "'Roboto Mono', monospace",
    'Fira Code': "'Fira Code', monospace",
    'Source Code Pro': "'Source Code Pro', monospace",
    'Mondwest': "'Mondwest', sans-serif",
    'NeueBit': "'NeueBit', monospace",
    'New Science Mono': "'new-science-mono', monospace",
  };
  const FONT_KEYS = Object.keys(FONT_OPTIONS);

  function applyFont(fontName) {
    const stack = FONT_OPTIONS[fontName];
    document.querySelectorAll('.hotspot-label, .hotspot-title, .hotspot-desc, .loading-text, .mobile-card-tag, .mobile-card-title, .mobile-card-desc').forEach((el) => {
      el.style.fontFamily = stack;
    });
  }

  function applyFontSize(size) {
    document.querySelectorAll('.hotspot-title, .hotspot-desc').forEach((el) => {
      el.style.fontSize = `${size}px`;
    });
    document.querySelectorAll('.hotspot-label').forEach((el) => {
      el.style.fontSize = `${Math.round(size * 0.65)}px`;
    });
  }

  function applyLineHeight(lh) {
    document.querySelectorAll('.hotspot-label, .hotspot-title, .hotspot-desc').forEach((el) => {
      el.style.lineHeight = `${lh}`;
    });
  }

  function applyFontWeight(weight) {
    document.querySelectorAll('.hotspot-label, .hotspot-title, .hotspot-desc').forEach((el) => {
      el.style.fontWeight = weight;
    });
  }

  function applyBlendMode(mode) {
    const container = document.getElementById('hotspot-container');
    if (container) container.style.mixBlendMode = mode;
    const svg = document.getElementById('callout-svg');
    if (svg) svg.style.mixBlendMode = mode;
  }

  // ─── Tweakpane GUI ────────────────────────────────────────────
  const PARAMS = {
    font: 'New Science Mono',
    fontSize: 25,
    fontWeight: 100,
    lineHeight: 1.15,
    blendMode: 'normal',
    brightness: 1.0,
    contrast: 1.0,
    saturate: 1.0,
    exposure: 0,
    tintColor: '#ffffff',
    tintOpacity: 0,
    grain: 0,
    vignette: 0,
  };

  function applyFilters() {
    const bright = PARAMS.brightness * Math.pow(2, PARAMS.exposure);
    frameContainer.style.filter = `brightness(${bright}) contrast(${PARAMS.contrast}) saturate(${PARAMS.saturate})`;

    const r = parseInt(PARAMS.tintColor.slice(1, 3), 16);
    const g = parseInt(PARAMS.tintColor.slice(3, 5), 16);
    const b = parseInt(PARAMS.tintColor.slice(5, 7), 16);
    colorOverlay.style.background = PARAMS.tintOpacity > 0
      ? `rgba(${r},${g},${b},${PARAMS.tintOpacity})`
      : 'transparent';

    grainCanvas.style.opacity = PARAMS.grain;

    if (PARAMS.vignette > 0) {
      frameContainer.style.boxShadow = `inset 0 0 ${100 + PARAMS.vignette * 200}px ${PARAMS.vignette * 80}px rgba(0,0,0,${PARAMS.vignette})`;
    } else {
      frameContainer.style.boxShadow = 'none';
    }
  }

  const pane = new Pane({ title: 'Settings', expanded: true });

  const fType = pane.addFolder({ title: 'Typography' });
  fType.addBinding(PARAMS, 'font', { options: Object.fromEntries(FONT_KEYS.map(k => [k, k])), label: 'font' }).on('change', (ev) => { applyFont(ev.value); });
  fType.addBinding(PARAMS, 'fontSize', { min: 8, max: 48, step: 1, label: 'size' }).on('change', (ev) => { applyFontSize(ev.value); });
  fType.addBinding(PARAMS, 'fontWeight', { min: 100, max: 700, step: 100, label: 'weight' }).on('change', (ev) => { applyFontWeight(ev.value); });
  fType.addBinding(PARAMS, 'lineHeight', { min: 0.8, max: 2.5, step: 0.05, label: 'line height' }).on('change', (ev) => { applyLineHeight(ev.value); });
  fType.addBinding(PARAMS, 'blendMode', { options: { 'normal': 'normal', 'difference': 'difference' }, label: 'blend' }).on('change', (ev) => { applyBlendMode(ev.value); });
  applyFont(PARAMS.font);
  applyFontSize(PARAMS.fontSize);
  applyFontWeight(PARAMS.fontWeight);
  applyLineHeight(PARAMS.lineHeight);

  const fImage = pane.addFolder({ title: 'Image' });
  fImage.addBinding(PARAMS, 'brightness', { min: 0.5, max: 2, step: 0.01 }).on('change', applyFilters);
  fImage.addBinding(PARAMS, 'contrast', { min: 0.5, max: 2, step: 0.01 }).on('change', applyFilters);
  fImage.addBinding(PARAMS, 'saturate', { min: 0, max: 2, step: 0.01, label: 'saturation' }).on('change', applyFilters);
  fImage.addBinding(PARAMS, 'exposure', { min: -2, max: 2, step: 0.01 }).on('change', applyFilters);

  const fColor = pane.addFolder({ title: 'Color Tint' });
  fColor.addBinding(PARAMS, 'tintColor', { label: 'color' }).on('change', applyFilters);
  fColor.addBinding(PARAMS, 'tintOpacity', { min: 0, max: 1, step: 0.01, label: 'opacity' }).on('change', applyFilters);

  const fFx = pane.addFolder({ title: 'Effects' });
  fFx.addBinding(PARAMS, 'grain', { min: 0, max: 0.3, step: 0.005 }).on('change', (ev) => {
    if (ev.value > 0 && grainCanvas.style.opacity === '0') renderGrain();
    applyFilters();
  });
  fFx.addBinding(PARAMS, 'vignette', { min: 0, max: 1, step: 0.01 }).on('change', applyFilters);
}

init();
