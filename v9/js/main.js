// ─── V9: Image-based product viewer ─────────────────────────────
// No Three.js — pure DOM image swapping driven by scroll.

// ─── Frame grid ─────────────────────────────────────────────────
const STEP_DEG = 15;
const TOTAL_FRAMES = 25; // 360/15 + 1
const FRAMES = Array.from({ length: TOTAL_FRAMES }, (_, i) => {
  const deg = (i * STEP_DEG) % 360;
  const majorIndex = (deg % 45 === 0) ? (deg / 45) % 8 : -1;
  return { index: i, deg, majorIndex };
});

// ─── Hotspot definitions (2D anchor positions) ──────────────────
const STOPS = [
  {
    angle: 0, label: 'front',
    hotspots: [
      { anchor: { x: 0.50, y: 0.28 }, panelSide: 'right', tag: '01', title: 'Front Panel', desc: 'Precision-machined aluminium face with minimal design language.' },
      { anchor: { x: 0.50, y: 0.72 }, panelSide: 'left', tag: '02', title: 'Ventilation', desc: 'Optimized airflow channels for silent, efficient cooling.' },
    ],
  },
  {
    angle: 45, label: 'front-right',
    hotspots: [
      { anchor: { x: 0.55, y: 0.30 }, panelSide: 'right', tag: '03', title: 'Edge Profile', desc: 'Chamfered edges at precise 45\u00b0 angles. CNC-finished surface.' },
      { anchor: { x: 0.55, y: 0.72 }, panelSide: 'right', tag: '04', title: 'Build Quality', desc: 'Unibody aluminium construction. No visible fasteners.' },
    ],
  },
  {
    angle: 90, label: 'right',
    hotspots: [
      { anchor: { x: 0.52, y: 0.35 }, panelSide: 'right', tag: '05', title: 'Side Panel', desc: 'Removable side panel for easy component access.' },
      { anchor: { x: 0.52, y: 0.65 }, panelSide: 'right', tag: '06', title: 'Expansion', desc: 'Full-length GPU support with dedicated airflow path.' },
    ],
  },
  {
    angle: 135, label: 'rear-right',
    hotspots: [
      { anchor: { x: 0.52, y: 0.25 }, panelSide: 'right', tag: '07', title: 'Exhaust', desc: 'Rear exhaust system with integrated cable routing.' },
    ],
  },
  {
    angle: 180, label: 'rear',
    hotspots: [
      { anchor: { x: 0.48, y: 0.30 }, panelSide: 'left', tag: '08', title: 'I/O Panel', desc: 'Full connectivity \u2014 USB-C, USB-A, DisplayPort, HDMI, Ethernet.' },
      { anchor: { x: 0.55, y: 0.80 }, panelSide: 'right', tag: '09', title: 'Power Supply', desc: 'Integrated SFX PSU with modular cabling.' },
    ],
  },
  {
    angle: 225, label: 'rear-left',
    hotspots: [
      { anchor: { x: 0.48, y: 0.35 }, panelSide: 'left', tag: '10', title: 'Cable Management', desc: 'Internal channels route cables cleanly behind the motherboard tray.' },
    ],
  },
  {
    angle: 270, label: 'left',
    hotspots: [
      { anchor: { x: 0.48, y: 0.30 }, panelSide: 'left', tag: '11', title: 'Left Panel', desc: 'Solid aluminium side. Clean, unbroken surface.' },
      { anchor: { x: 0.48, y: 0.68 }, panelSide: 'left', tag: '12', title: 'Acoustic Dampening', desc: 'Layered isolation pads minimize vibration and noise.' },
    ],
  },
  {
    angle: 315, label: 'front-left',
    hotspots: [
      { anchor: { x: 0.45, y: 0.25 }, panelSide: 'left', tag: '13', title: 'Design Language', desc: 'Scandinavian-inspired minimalism meets high-performance computing.' },
      { anchor: { x: 0.45, y: 0.72 }, panelSide: 'left', tag: '14', title: 'Footprint', desc: 'Compact ITX form factor \u2014 fits any desk, powers any workflow.' },
    ],
  },
];

// ─── Init ───────────────────────────────────────────────────────
function init() {
  const frameContainer = document.getElementById('frame-container');
  const overlay = document.getElementById('loading-overlay');
  const progressBar = document.getElementById('loading-progress');
  const progressText = document.getElementById('loading-text');
  const calloutSvg = document.getElementById('callout-svg');
  const hotspotContainer = document.getElementById('hotspot-container');
  const scrollThumb = document.getElementById('scroll-thumb');
  const stopDotsContainer = document.getElementById('stop-dots');
  const scrollTrack = document.querySelector('.scroll-track');

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
      // Show first frame
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
    img.addEventListener('error', onImageLoaded); // count errors too so loading completes
    frameContainer.appendChild(img);
    frameImages.push(img);
  }

  // ─── Scroll indicator dots ─────────────────────────────────────
  const trackHeight = 200;
  STOPS.forEach((stop, i) => {
    const dot = document.createElement('div');
    dot.className = 'stop-dot';
    dot.style.top = `${(i / (STOPS.length - 1)) * trackHeight}px`;
    stopDotsContainer.appendChild(dot);
  });
  const stopDotElements = stopDotsContainer.querySelectorAll('.stop-dot');

  // ─── Hotspot DOM ───────────────────────────────────────────────
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

  // ─── Scroll mapping ───────────────────────────────────────────
  let currentFrameIndex = 0;

  function getFrameIndexFromScroll() {
    const scrollMax = document.documentElement.scrollHeight - window.innerHeight;
    if (scrollMax <= 0) return 0;
    const progress = window.scrollY / scrollMax;
    const idx = Math.round(progress * (TOTAL_FRAMES - 1));
    return Math.max(0, Math.min(TOTAL_FRAMES - 1, idx));
  }

  function getScrollProgress() {
    const scrollMax = document.documentElement.scrollHeight - window.innerHeight;
    return scrollMax > 0 ? window.scrollY / scrollMax : 0;
  }

  // ─── Update active frame ──────────────────────────────────────
  function updateFrame(index) {
    if (index === currentFrameIndex && frameImages[index].classList.contains('active')) return;
    frameImages.forEach((img, i) => {
      if (i === index) {
        img.classList.add('active');
      } else {
        img.classList.remove('active');
      }
    });
    currentFrameIndex = index;
  }

  // ─── Update hotspots ──────────────────────────────────────────
  const MARGIN_LEFT = 60;
  const MARGIN_RIGHT = 60;

  function updateHotspots() {
    while (calloutSvg.firstChild) calloutSvg.removeChild(calloutSvg.firstChild);

    const frame = FRAMES[currentFrameIndex];
    const isMajorStop = frame.majorIndex >= 0;

    const nearestMajor = Math.round(currentFrameIndex / 3) % 8;
    stopDotElements.forEach((dot, i) => {
      dot.classList.toggle('active', i === nearestMajor && isMajorStop);
    });

    if (!isMajorStop) {
      hotspotElements.forEach(({ panel }) => {
        panel.classList.remove('visible');
        panel.style.opacity = 0;
      });
      return;
    }

    const activeStopAngle = STOPS[frame.majorIndex].angle;

    // First pass: compute panel positions
    const placements = [];
    hotspotElements.forEach(({ panel, hotspot, stopAngle }) => {
      const isActive = Math.abs(stopAngle - activeStopAngle) < 0.01;
      if (!isActive) {
        panel.classList.remove('visible');
        panel.style.opacity = 0;
        placements.push(null);
        return;
      }

      // Convert normalized anchor to screen pixels
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
    placements.forEach((p, i) => {
      if (p) activeBySide[p.hotspot.panelSide].push({ placement: p, index: i });
    });
    for (const side of ['left', 'right']) {
      const items = activeBySide[side];
      if (items.length < 2) continue;
      items.sort((a, b) => a.placement.panelY - b.placement.panelY);
      for (let i = 1; i < items.length; i++) {
        const prev = items[i - 1].placement;
        const prevHeight = prev.panel.offsetHeight || 80;
        const minTop = prev.panelY + prevHeight + MIN_GAP;
        if (items[i].placement.panelY < minTop) {
          items[i].placement.panelY = minTop;
        }
      }
    }

    // Second pass: position panels and draw callout lines
    placements.forEach((p) => {
      if (!p) return;
      const { panel, hotspot, screen, panelX, panelY } = p;

      panel.style.opacity = 1;
      panel.classList.add('visible');
      panel.style.left = `${panelX}px`;
      panel.style.top = `${panelY}px`;

      // Measure title for line target
      const titleEl = panel.querySelector('.hotspot-title');
      const titleRect = titleEl ? titleEl.getBoundingClientRect() : null;
      const titleWidth = titleRect ? titleRect.width : 120;
      const titleMidY = titleRect ? (titleRect.top + titleRect.bottom) / 2 : panelY + 20;

      // Line connects anchor -> title edge (with small gap)
      const LINE_GAP = 8;
      let titleEdgeX;
      if (hotspot.panelSide === 'right') {
        titleEdgeX = panelX - LINE_GAP;
      } else {
        titleEdgeX = panelX + titleWidth + LINE_GAP;
      }

      // Anchor dot
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', screen.x);
      circle.setAttribute('cy', screen.y);
      circle.setAttribute('r', 3);
      calloutSvg.appendChild(circle);

      // Horizontal line from anchor to title edge X
      const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line1.setAttribute('x1', screen.x);
      line1.setAttribute('y1', screen.y);
      line1.setAttribute('x2', titleEdgeX);
      line1.setAttribute('y2', screen.y);
      calloutSvg.appendChild(line1);

      // Vertical segment to meet the title midpoint
      if (Math.abs(screen.y - titleMidY) > 2) {
        const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line2.setAttribute('x1', titleEdgeX);
        line2.setAttribute('y1', screen.y);
        line2.setAttribute('x2', titleEdgeX);
        line2.setAttribute('y2', titleMidY);
        calloutSvg.appendChild(line2);
      }
    });
  }

  // ─── Scroll handler (rAF-throttled) ────────────────────────────
  let ticking = false;

  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(() => {
        const idx = getFrameIndexFromScroll();
        updateFrame(idx);

        const progress = getScrollProgress();
        const trackH = scrollTrack.getBoundingClientRect().height;
        scrollThumb.style.top = `${progress * (trackH - 25)}px`;

        updateHotspots();
        ticking = false;
      });
      ticking = true;
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => {
    updateHotspots();
  });
}

init();
