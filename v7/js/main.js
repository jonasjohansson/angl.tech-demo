import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pane } from 'tweakpane';

// ─── HDRI environments per stop ──────────────────────────────────
// 8 different Polyhaven HDRIs — one per major stop
const HDRI_LIST = [
  { name: 'Studio',       url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr' },
  { name: 'Courtyard',    url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/courtyard_1k.hdr' },
  { name: 'Warehouse',    url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/industrial_workshop_foundry_1k.hdr' },
  { name: 'Sunset',       url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_48d_partly_cloudy_puresky_1k.hdr' },
  { name: 'Night',        url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/moonless_golf_1k.hdr' },
  { name: 'Overcast',     url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloppenheim_02_puresky_1k.hdr' },
  { name: 'Interior',     url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/brown_photostudio_02_1k.hdr' },
  { name: 'Dawn',         url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/solitude_night_1k.hdr' },
];

// ─── Hotspot definitions ─────────────────────────────────────────
const STOPS = [
  {
    angle: 0, label: 'front',
    hotspots: [
      { anchorLocal: new THREE.Vector3(0, 0.35, 0.25), panelSide: 'right', tag: '01', title: 'Front Panel', desc: 'Precision-machined aluminium face with minimal design language.' },
      { anchorLocal: new THREE.Vector3(0, 0.05, 0.25), panelSide: 'left', tag: '02', title: 'Ventilation', desc: 'Optimized airflow channels for silent, efficient cooling.' },
    ],
  },
  {
    angle: Math.PI / 4, label: 'front-right',
    hotspots: [
      { anchorLocal: new THREE.Vector3(0.2, 0.3, 0.2), panelSide: 'right', tag: '03', title: 'Edge Profile', desc: 'Chamfered edges at precise 45° angles. CNC-finished surface.' },
      { anchorLocal: new THREE.Vector3(0.2, 0.05, 0.15), panelSide: 'right', tag: '04', title: 'Build Quality', desc: 'Unibody aluminium construction. No visible fasteners.' },
    ],
  },
  {
    angle: Math.PI / 2, label: 'right',
    hotspots: [
      { anchorLocal: new THREE.Vector3(0.28, 0.25, 0), panelSide: 'right', tag: '05', title: 'Side Panel', desc: 'Removable side panel for easy component access.' },
      { anchorLocal: new THREE.Vector3(0.28, 0.05, -0.1), panelSide: 'right', tag: '06', title: 'Expansion', desc: 'Full-length GPU support with dedicated airflow path.' },
    ],
  },
  {
    angle: (3 * Math.PI) / 4, label: 'rear-right',
    hotspots: [
      { anchorLocal: new THREE.Vector3(0.15, 0.35, -0.2), panelSide: 'right', tag: '07', title: 'Exhaust', desc: 'Rear exhaust system with integrated cable routing.' },
    ],
  },
  {
    angle: Math.PI, label: 'rear',
    hotspots: [
      { anchorLocal: new THREE.Vector3(0, 0.3, -0.28), panelSide: 'left', tag: '08', title: 'I/O Panel', desc: 'Full connectivity — USB-C, USB-A, DisplayPort, HDMI, Ethernet.' },
      { anchorLocal: new THREE.Vector3(0, 0.05, -0.28), panelSide: 'right', tag: '09', title: 'Power Supply', desc: 'Integrated SFX PSU with modular cabling.' },
    ],
  },
  {
    angle: (5 * Math.PI) / 4, label: 'rear-left',
    hotspots: [
      { anchorLocal: new THREE.Vector3(-0.15, 0.25, -0.2), panelSide: 'left', tag: '10', title: 'Cable Management', desc: 'Internal channels route cables cleanly behind the motherboard tray.' },
    ],
  },
  {
    angle: (3 * Math.PI) / 2, label: 'left',
    hotspots: [
      { anchorLocal: new THREE.Vector3(-0.28, 0.3, 0), panelSide: 'left', tag: '11', title: 'Left Panel', desc: 'Solid aluminium side. Clean, unbroken surface.' },
      { anchorLocal: new THREE.Vector3(-0.28, 0.08, 0.1), panelSide: 'left', tag: '12', title: 'Acoustic Dampening', desc: 'Layered isolation pads minimize vibration and noise.' },
    ],
  },
  {
    angle: (7 * Math.PI) / 4, label: 'front-left',
    hotspots: [
      { anchorLocal: new THREE.Vector3(-0.15, 0.35, 0.2), panelSide: 'left', tag: '13', title: 'Design Language', desc: 'Scandinavian-inspired minimalism meets high-performance computing.' },
      { anchorLocal: new THREE.Vector3(-0.1, 0.05, 0.2), panelSide: 'left', tag: '14', title: 'Footprint', desc: 'Compact ITX form factor — fits any desk, powers any workflow.' },
    ],
  },
];

// ─── Frame grid ─────────────────────────────────────────────────
const STEP_DEG = 15;
const TOTAL_FRAMES = 360 / STEP_DEG + 1; // 25 — last frame returns to front
const FRAMES = Array.from({ length: TOTAL_FRAMES }, (_, i) => {
  const deg = (i * STEP_DEG) % 360;
  const rad = THREE.MathUtils.degToRad(deg);
  const majorIndex = (deg % 45 === 0) ? (deg / 45) % 8 : -1;
  return { index: i, deg, rad, majorIndex };
});

async function init() {
  const canvas = document.getElementById('viewer-canvas');
  const overlay = document.getElementById('loading-overlay');
  const progressBar = document.getElementById('loading-progress');
  const progressText = document.getElementById('loading-text');
  const calloutSvg = document.getElementById('callout-svg');
  const hotspotContainer = document.getElementById('hotspot-container');
  const scrollThumb = document.getElementById('scroll-thumb');
  const stopDotsContainer = document.getElementById('stop-dots');
  const scrollTrack = document.querySelector('.scroll-track');
  const envLabel = document.getElementById('env-label');

  // ─── Renderer ──────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: false, powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 2.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // ─── Scene ─────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.environmentIntensity = 0.8;

  // Gradient background
  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = 1024; bgCanvas.height = 1024;
  const ctx = bgCanvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 1024);
  grad.addColorStop(0, '#2a2a30');
  grad.addColorStop(0.4, '#181820');
  grad.addColorStop(0.7, '#101016');
  grad.addColorStop(1, '#0a0a0e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 1024);
  const bgTex = new THREE.CanvasTexture(bgCanvas);
  bgTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = bgTex;

  // ─── Camera ────────────────────────────────────────────────────
  const aspect = window.innerWidth / window.innerHeight;
  let frustumSize = 3.2;
  const camera = new THREE.OrthographicCamera(
    -frustumSize * aspect / 2, frustumSize * aspect / 2,
    frustumSize / 2, -frustumSize / 2, 0.01, 100
  );

  // ─── Lights ────────────────────────────────────────────────────
  const ambient = new THREE.AmbientLight('#ffffff', 0.15);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight('#fff0e0', 3.5);
  keyLight.position.set(3, 4, 2);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 12;
  keyLight.shadow.camera.left = -1.5;
  keyLight.shadow.camera.right = 1.5;
  keyLight.shadow.camera.top = 2;
  keyLight.shadow.camera.bottom = -1;
  keyLight.shadow.bias = -0.0003;
  keyLight.shadow.normalBias = 0.04;
  keyLight.shadow.radius = 3;
  scene.add(keyLight);

  const fillLight = new THREE.PointLight('#8899bb', 0.0, 20, 1.5);
  fillLight.position.set(-3, 2, -1);
  scene.add(fillLight);

  const rimLight = new THREE.SpotLight('#29343f', 0.0, 30, Math.PI / 5, 0.6);
  rimLight.position.set(-1, 3, -3);
  rimLight.target.position.set(0, 0.3, 0);
  scene.add(rimLight);
  scene.add(rimLight.target);

  const bounceLight = new THREE.PointLight('#334466', 0.3, 8, 2);
  bounceLight.position.set(0, -0.5, 0);
  scene.add(bounceLight);

  // Ground shadow plane
  const groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.ShadowMaterial({ opacity: 0.95 })
  );
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.position.y = 0.001;
  groundPlane.receiveShadow = true;
  scene.add(groundPlane);

  // ─── Load model ────────────────────────────────────────────────
  progressText.textContent = 'loading model...';
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);

  const model = await new Promise((resolve, reject) => {
    gltfLoader.load(
      '../models/ANGL-ASM-MAIN_REV-G_FULL.glb',
      (gltf) => {
        const m = gltf.scene;
        m.rotation.x = -Math.PI / 2;
        const box = new THREE.Box3().setFromObject(m);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        m.scale.setScalar(1.0 / maxDim);
        const scaledBox = new THREE.Box3().setFromObject(m);
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        m.position.x -= scaledCenter.x;
        m.position.z -= scaledCenter.z;
        m.position.y -= scaledBox.min.y;
        m.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.material && (child.material.isMeshStandardMaterial || child.material.isMeshPhysicalMaterial)) {
              child.material.metalness = 0.52;
              child.material.roughness = 0.48;
              child.material.envMapIntensity = 2.2;
            }
          }
        });
        scene.add(m);
        dracoLoader.dispose();
        resolve(m);
      },
      undefined,
      (err) => { dracoLoader.dispose(); reject(err); }
    );
  });

  progressBar.style.width = '30%';

  // ─── Preload all HDRIs ─────────────────────────────────────────
  const rgbeLoader = new RGBELoader();
  const hdriTextures = [];
  for (let i = 0; i < HDRI_LIST.length; i++) {
    const hdri = HDRI_LIST[i];
    progressText.textContent = `loading environment ${i + 1}/${HDRI_LIST.length}...`;
    const tex = await new Promise((resolve, reject) => {
      rgbeLoader.load(hdri.url, (t) => {
        t.mapping = THREE.EquirectangularReflectionMapping;
        resolve(t);
      }, undefined, reject);
    });
    hdriTextures.push(tex);
    progressBar.style.width = `${30 + (70 * (i + 1) / HDRI_LIST.length)}%`;
  }

  // Set initial environment
  let currentEnvIndex = 0;
  scene.environment = hdriTextures[0];
  if (envLabel) envLabel.textContent = HDRI_LIST[0].name.toLowerCase();

  function setEnvironment(index) {
    if (index === currentEnvIndex) return;
    currentEnvIndex = index;
    scene.environment = hdriTextures[index];
    if (envLabel) envLabel.textContent = HDRI_LIST[index].name.toLowerCase();
  }

  // ─── Camera orbit ──────────────────────────────────────────────
  const modelBox = new THREE.Box3().setFromObject(model);
  const modelCenter = modelBox.getCenter(new THREE.Vector3());
  const orbitTarget = new THREE.Vector3(0, modelCenter.y, 0);
  const orbitRadiusRef = { value: 4.0 };
  const orbitElevationRef = { value: 0.55 };

  let currentFrameIndex = 0;

  function updateCamera() {
    const azimuth = FRAMES[currentFrameIndex].rad;
    const r = orbitRadiusRef.value;
    const el = orbitElevationRef.value;
    camera.position.x = orbitTarget.x + r * Math.sin(azimuth) * Math.cos(el);
    camera.position.y = orbitTarget.y + r * Math.sin(el);
    camera.position.z = orbitTarget.z + r * Math.cos(azimuth) * Math.cos(el);
    camera.lookAt(orbitTarget);
  }

  // ─── Post-processing ──────────────────────────────────────────
  const FilmShader = {
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uGrainAmount: { value: 0.008 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float uGrainAmount;
      varying vec2 vUv;
      float hash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      void main() {
        vec3 col = texture2D(tDiffuse, vUv).rgb;
        float n = hash(vUv * 1000.0 + uTime * 100.0) - 0.5;
        col += n * uGrainAmount;
        float d = distance(vUv, vec2(0.5));
        col *= smoothstep(0.9, 0.3, d * 1.2);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  };

  const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
    type: THREE.HalfFloatType, samples: 4,
  });
  const composer = new EffectComposer(renderer, renderTarget);
  composer.addPass(new RenderPass(scene, camera));
  const filmPass = new ShaderPass(FilmShader);
  composer.addPass(filmPass);
  const smaaPass = new SMAAPass(window.innerWidth, window.innerHeight);
  composer.addPass(smaaPass);
  composer.addPass(new OutputPass());

  // ─── Scroll indicator dots ─────────────────────────────────────
  const trackHeight = 200;
  STOPS.forEach((stop, i) => {
    const dot = document.createElement('div');
    dot.className = 'stop-dot';
    dot.style.top = `${(i / (STOPS.length - 1)) * trackHeight}px`;
    dot.dataset.index = i;
    stopDotsContainer.appendChild(dot);
  });
  const stopDotElements = stopDotsContainer.querySelectorAll('.stop-dot');

  // ─── Build hotspot DOM ─────────────────────────────────────────
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

  // ─── Scroll → frame mapping ────────────────────────────────────
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

  // ─── Project 3D → 2D ──────────────────────────────────────────
  function project3DToScreen(point3D) {
    const v = point3D.clone().project(camera);
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  // ─── Update hotspots + callout lines + environment ─────────────
  const MARGIN_LEFT = 60;
  const MARGIN_RIGHT = 60;

  function updateHotspots() {
    while (calloutSvg.firstChild) calloutSvg.removeChild(calloutSvg.firstChild);

    const frame = FRAMES[currentFrameIndex];
    const isMajorStop = frame.majorIndex >= 0;

    // Swap HDRI at each major stop
    if (isMajorStop) {
      setEnvironment(frame.majorIndex);
    }

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

    hotspotElements.forEach(({ panel, hotspot, stopAngle }) => {
      const isActive = Math.abs(stopAngle - activeStopAngle) < 0.01;
      if (!isActive) {
        panel.classList.remove('visible');
        panel.style.opacity = 0;
        return;
      }

      panel.style.opacity = 1;
      panel.classList.add('visible');

      const screen = project3DToScreen(hotspot.anchorLocal);
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let panelX, lineEndX;
      if (hotspot.panelSide === 'right') {
        panelX = vw - MARGIN_RIGHT - 240;
        lineEndX = panelX - 8;
      } else {
        panelX = MARGIN_LEFT;
        lineEndX = panelX + 240 + 8;
      }

      const panelY = Math.max(100, Math.min(screen.y - 16, vh - 120));
      panel.style.left = `${panelX}px`;
      panel.style.top = `${panelY}px`;

      const elbowX = lineEndX;
      const elbowY = panelY + 14;

      const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line1.setAttribute('x1', screen.x);
      line1.setAttribute('y1', screen.y);
      line1.setAttribute('x2', elbowX);
      line1.setAttribute('y2', screen.y);
      calloutSvg.appendChild(line1);

      if (Math.abs(screen.y - elbowY) > 2) {
        const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line2.setAttribute('x1', elbowX);
        line2.setAttribute('y1', screen.y);
        line2.setAttribute('x2', elbowX);
        line2.setAttribute('y2', elbowY);
        calloutSvg.appendChild(line2);
      }

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', screen.x);
      circle.setAttribute('cy', screen.y);
      circle.setAttribute('r', 3);
      calloutSvg.appendChild(circle);
    });
  }

  // ─── Resize ────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const a = w / h;
    camera.left = -frustumSize * a / 2;
    camera.right = frustumSize * a / 2;
    camera.top = frustumSize / 2;
    camera.bottom = -frustumSize / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  });

  // ─── Tweakpane GUI ─────────────────────────────────────────────
  const pane = new Pane({ title: 'Settings', expanded: true });

  const PARAMS = {
    frustum: frustumSize,
    elevation: orbitElevationRef.value,
    orbitRadius: orbitRadiusRef.value,
    ambientIntensity: ambient.intensity,
    keyIntensity: keyLight.intensity,
    fillIntensity: fillLight.intensity,
    rimIntensity: rimLight.intensity,
    envIntensity: scene.environmentIntensity,
    metalness: 0.52,
    roughness: 0.48,
    envMapIntensity: 2.2,
    exposure: renderer.toneMappingExposure,
    grainAmount: filmPass.uniforms.uGrainAmount.value,
    shadowOpacity: 0.95,
    envRotation: 0,
  };

  function forEachMaterial(fn) {
    model.traverse((c) => {
      if (c.isMesh && c.material && (c.material.isMeshStandardMaterial || c.material.isMeshPhysicalMaterial)) {
        fn(c.material);
      }
    });
  }

  // Camera
  const fCam = pane.addFolder({ title: 'Camera' });
  fCam.addBinding(PARAMS, 'frustum', { min: 1.5, max: 6, step: 0.1, label: 'zoom (frustum)' }).on('change', (ev) => {
    frustumSize = ev.value;
    const a = window.innerWidth / window.innerHeight;
    camera.left = -frustumSize * a / 2;
    camera.right = frustumSize * a / 2;
    camera.top = frustumSize / 2;
    camera.bottom = -frustumSize / 2;
    camera.updateProjectionMatrix();
  });
  fCam.addBinding(PARAMS, 'elevation', { min: 0, max: 1.2, step: 0.01 }).on('change', (ev) => {
    orbitElevationRef.value = ev.value;
  });
  fCam.addBinding(PARAMS, 'orbitRadius', { min: 1.5, max: 8, step: 0.1, label: 'distance' }).on('change', (ev) => {
    orbitRadiusRef.value = ev.value;
  });

  // Scene
  const fScene = pane.addFolder({ title: 'Scene' });
  PARAMS.bgTop = '#2a2a30';
  PARAMS.bgMid = '#181820';
  PARAMS.bgBottom = '#0a0a0e';

  function rebuildBackground() {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 1024;
    const cx = c.getContext('2d');
    const g = cx.createLinearGradient(0, 0, 0, 1024);
    g.addColorStop(0, PARAMS.bgTop);
    g.addColorStop(0.5, PARAMS.bgMid);
    g.addColorStop(1, PARAMS.bgBottom);
    cx.fillStyle = g;
    cx.fillRect(0, 0, 1024, 1024);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
  }

  fScene.addBinding(PARAMS, 'bgTop', { label: 'bg top' }).on('change', rebuildBackground);
  fScene.addBinding(PARAMS, 'bgMid', { label: 'bg mid' }).on('change', rebuildBackground);
  fScene.addBinding(PARAMS, 'bgBottom', { label: 'bg bottom' }).on('change', rebuildBackground);

  // Environment
  const fEnv = pane.addFolder({ title: 'Environment' });
  fEnv.addBinding(PARAMS, 'envIntensity', { min: 0, max: 3, step: 0.05, label: 'intensity' }).on('change', (ev) => {
    scene.environmentIntensity = ev.value;
  });
  fEnv.addBinding(PARAMS, 'envRotation', { min: 0, max: Math.PI * 2, step: 0.05, label: 'rotation' }).on('change', (ev) => {
    scene.environmentRotation = new THREE.Euler(0, ev.value, 0);
  });

  // Lighting
  const fLight = pane.addFolder({ title: 'Lighting' });
  PARAMS.ambientColor = '#ffffff';
  PARAMS.keyColor = '#fff0e0';
  PARAMS.fillColor = '#8899bb';
  PARAMS.rimColor = '#29343f';

  fLight.addBinding(PARAMS, 'ambientIntensity', { min: 0, max: 2, step: 0.05, label: 'ambient' }).on('change', (ev) => { ambient.intensity = ev.value; });
  fLight.addBinding(PARAMS, 'ambientColor', { label: 'ambient color' }).on('change', (ev) => { ambient.color.set(ev.value); });
  fLight.addBinding(PARAMS, 'keyIntensity', { min: 0, max: 8, step: 0.1, label: 'key' }).on('change', (ev) => { keyLight.intensity = ev.value; });
  fLight.addBinding(PARAMS, 'keyColor', { label: 'key color' }).on('change', (ev) => { keyLight.color.set(ev.value); });
  fLight.addBinding(PARAMS, 'fillIntensity', { min: 0, max: 3, step: 0.1, label: 'fill' }).on('change', (ev) => { fillLight.intensity = ev.value; });
  fLight.addBinding(PARAMS, 'fillColor', { label: 'fill color' }).on('change', (ev) => { fillLight.color.set(ev.value); });
  fLight.addBinding(PARAMS, 'rimIntensity', { min: 0, max: 4, step: 0.1, label: 'rim' }).on('change', (ev) => { rimLight.intensity = ev.value; });
  fLight.addBinding(PARAMS, 'rimColor', { label: 'rim color' }).on('change', (ev) => { rimLight.color.set(ev.value); });

  // Material
  const fMat = pane.addFolder({ title: 'Material' });
  fMat.addBinding(PARAMS, 'metalness', { min: 0, max: 1, step: 0.01 }).on('change', (ev) => { forEachMaterial((m) => { m.metalness = ev.value; m.needsUpdate = true; }); });
  fMat.addBinding(PARAMS, 'roughness', { min: 0, max: 1, step: 0.01 }).on('change', (ev) => { forEachMaterial((m) => { m.roughness = ev.value; m.needsUpdate = true; }); });
  fMat.addBinding(PARAMS, 'envMapIntensity', { min: 0, max: 5, step: 0.1, label: 'env map' }).on('change', (ev) => { forEachMaterial((m) => { m.envMapIntensity = ev.value; m.needsUpdate = true; }); });

  // Post-FX
  const fFx = pane.addFolder({ title: 'Post-FX' });
  fFx.addBinding(PARAMS, 'exposure', { min: 0.5, max: 4, step: 0.05 }).on('change', (ev) => { renderer.toneMappingExposure = ev.value; });
  fFx.addBinding(PARAMS, 'grainAmount', { min: 0, max: 0.06, step: 0.001, label: 'grain' }).on('change', (ev) => { filmPass.uniforms.uGrainAmount.value = ev.value; });

  // Ground
  const fGround = pane.addFolder({ title: 'Ground' });
  fGround.addBinding(PARAMS, 'shadowOpacity', { min: 0, max: 1, step: 0.05, label: 'shadow opacity' }).on('change', (ev) => { groundPlane.material.opacity = ev.value; });

  // ─── Fade out loader ───────────────────────────────────────────
  progressText.textContent = 'ready';
  overlay.classList.add('loaded');
  setTimeout(() => { overlay.style.display = 'none'; }, 600);

  // ─── Render loop ───────────────────────────────────────────────
  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now() * 0.001;
    filmPass.uniforms.uTime.value = now;

    currentFrameIndex = getFrameIndexFromScroll();

    const progress = getScrollProgress();
    const trackH = scrollTrack.getBoundingClientRect().height;
    scrollThumb.style.top = `${progress * (trackH - 25)}px`;

    updateCamera();
    updateHotspots();
    composer.render();
  }
  animate();
}

init().catch((err) => {
  console.error('V7 init failed:', err);
  const text = document.getElementById('loading-text');
  if (text) text.textContent = 'failed to load — ' + err.message;
});
