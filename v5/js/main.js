// Views ordered as clockwise rotation, then special views
const VIEWS = [
  { src: 'img/view-4.webp', label: 'front' },
  { src: 'img/view-5.webp', label: 'front 3/4' },
  { src: 'img/view-2.webp', label: 'side' },
  { src: 'img/view-1.webp', label: 'rear 3/4' },
  { src: 'img/view-0.webp', label: 'rear' },
  { src: 'img/view-3.webp', label: 'isometric' },
  { src: 'img/view-6.webp', label: 'exploded' },
];

const TRANSITION_MS = 600;
const SLIDE_DISTANCE = 18; // percentage of viewport width

let currentIndex = 0;
let transitioning = false;
let scrollAcc = 0;
let touchStartX = 0;
let dragStartX = 0;
let dragging = false;
let dragMoved = 0;

// DOM
let sceneInner, viewLabel, viewDots, overlay, progressBar, progressText;
let images = [];

// --- Preload ---

function preloadImages(onProgress) {
  return new Promise((resolve) => {
    let loaded = 0;
    const results = [];
    VIEWS.forEach((view, i) => {
      const img = new Image();
      img.onload = img.onerror = () => {
        loaded++;
        onProgress(loaded / VIEWS.length);
        if (loaded === VIEWS.length) resolve(results);
      };
      img.src = view.src;
      img.alt = view.label;
      img.className = 'view';
      img.draggable = false;
      results[i] = img;
    });
  });
}

// --- Transitions ---
// direction: 1 = rotating right (next), -1 = rotating left (prev)
// The outgoing image slides in the OPPOSITE direction of the incoming one

function goToView(index, direction) {
  if (transitioning || index === currentIndex) return;
  transitioning = true;

  const outgoing = images[currentIndex];
  const incoming = images[index];

  // Position incoming off-screen in the direction it will enter from
  // direction=1 (next/right): incoming enters from right, outgoing exits left
  // direction=-1 (prev/left): incoming enters from left, outgoing exits right
  const enterFrom = direction > 0 ? SLIDE_DISTANCE : -SLIDE_DISTANCE;
  const exitTo = direction > 0 ? -SLIDE_DISTANCE : SLIDE_DISTANCE;

  // Set incoming to start position (no transition yet)
  incoming.style.transition = 'none';
  incoming.style.transform = `translateX(${enterFrom}%)`;
  incoming.style.opacity = '0';
  incoming.offsetHeight; // force reflow

  // Now animate both
  const ease = 'cubic-bezier(0.4, 0, 0.15, 1)';
  incoming.style.transition = `transform ${TRANSITION_MS}ms ${ease}, opacity ${TRANSITION_MS}ms ${ease}`;
  outgoing.style.transition = `transform ${TRANSITION_MS}ms ${ease}, opacity ${TRANSITION_MS}ms ${ease}`;

  // Animate incoming to center
  incoming.style.transform = 'translateX(0)';
  incoming.style.opacity = '1';

  // Animate outgoing away
  outgoing.style.transform = `translateX(${exitTo}%)`;
  outgoing.style.opacity = '0';

  updateIndicator(index);
  currentIndex = index;

  setTimeout(() => {
    // Clean up: reset outgoing to neutral hidden state
    outgoing.style.transition = 'none';
    outgoing.style.transform = '';
    outgoing.style.opacity = '0';
    transitioning = false;
  }, TRANSITION_MS);
}

function nextView() {
  const next = (currentIndex + 1) % VIEWS.length;
  goToView(next, 1);
}

function prevView() {
  const prev = (currentIndex - 1 + VIEWS.length) % VIEWS.length;
  goToView(prev, -1);
}

// --- Indicator ---

function updateIndicator(index) {
  viewLabel.textContent = VIEWS[index].label;
  viewDots.querySelectorAll('.view-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === index);
  });
}

function buildDots() {
  VIEWS.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = 'view-dot' + (i === 0 ? ' active' : '');
    dot.style.pointerEvents = 'auto';
    dot.style.cursor = 'pointer';
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      const dir = i > currentIndex ? 1 : -1;
      goToView(i, dir);
    });
    viewDots.appendChild(dot);
  });
}

// --- Interactions ---

function setupInteractions() {
  const scene = document.getElementById('scene');

  // Click to cycle
  scene.addEventListener('click', () => {
    if (dragMoved > 5) return;
    nextView();
  });

  scene.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    prevView();
  });

  // Keyboard
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') nextView();
    else if (e.key === 'ArrowLeft') prevView();
  });

  // Scroll to rotate
  window.addEventListener('wheel', (e) => {
    e.preventDefault();
    scrollAcc += e.deltaY;
    if (Math.abs(scrollAcc) > 60) {
      if (scrollAcc > 0) nextView();
      else prevView();
      scrollAcc = 0;
    }
  }, { passive: false });

  // Drag to rotate
  scene.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    dragStartX = e.clientX;
    dragMoved = 0;
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragStartX;
    dragMoved = Math.abs(dx);
    if (Math.abs(dx) > 80) {
      if (dx > 0) prevView();
      else nextView();
      dragStartX = e.clientX;
      dragMoved = 0;
    }
  });

  window.addEventListener('mouseup', () => { dragging = false; });

  // Touch swipe
  scene.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });

  scene.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 50) {
      if (dx > 0) prevView();
      else nextView();
    }
  });
}

// --- Init ---

async function init() {
  sceneInner = document.getElementById('scene-inner');
  viewLabel = document.getElementById('view-label');
  viewDots = document.getElementById('view-dots');
  overlay = document.getElementById('loading-overlay');
  progressBar = document.getElementById('loading-progress');
  progressText = document.getElementById('loading-text');

  progressText.textContent = 'loading renders...';

  images = await preloadImages((p) => {
    progressBar.style.width = `${p * 100}%`;
  });

  // Insert into DOM — first view visible, rest hidden
  images.forEach((img, i) => {
    if (i === 0) {
      img.style.opacity = '1';
      img.style.transform = 'translateX(0)';
    } else {
      img.style.opacity = '0';
    }
    sceneInner.appendChild(img);
  });

  buildDots();
  updateIndicator(0);
  setupInteractions();

  progressText.textContent = 'ready';
  overlay.classList.add('loaded');
  setTimeout(() => { overlay.style.display = 'none'; }, 800);
}

init();
