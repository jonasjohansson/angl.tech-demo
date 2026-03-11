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
// Theatre.js is loaded via browser-bundles as a global (window.Theatre)
const theatreCore = window.Theatre.core;
const theatreStudio = window.Theatre.studio;

// ─── Theatre.js config ──────────────────────────────────────────
const SEQUENCE_LENGTH = 10;

// ─── Fallback camera interpolation (if Theatre.js state fails) ─
const FALLBACK_KEYFRAMES = [
  { t: 0.0, azimuth: 0,   elevation: 1.2, distance: 6.0, zoom: 5.5 },
  { t: 0.5, azimuth: 180, elevation: 0.5, distance: 4.5, zoom: 3.0 },
  { t: 1.0, azimuth: 360, elevation: 0.05, distance: 3.5, zoom: 1.8 },
];

function lerpKeyframes(keyframes, t) {
  t = Math.max(0, Math.min(1, t));
  // Find the two surrounding keyframes
  let a = keyframes[0], b = keyframes[keyframes.length - 1];
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (t >= keyframes[i].t && t <= keyframes[i + 1].t) {
      a = keyframes[i];
      b = keyframes[i + 1];
      break;
    }
  }
  const segT = (b.t === a.t) ? 0 : (t - a.t) / (b.t - a.t);
  // Smooth step
  const s = segT * segT * (3 - 2 * segT);
  return {
    azimuth: a.azimuth + (b.azimuth - a.azimuth) * s,
    elevation: a.elevation + (b.elevation - a.elevation) * s,
    distance: a.distance + (b.distance - a.distance) * s,
    zoom: a.zoom + (b.zoom - a.zoom) * s,
  };
}

// ─── Polyhaven texture base ─────────────────────────────────────
const PH_TEX = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/';
function texUrl(name, type) {
  return `${PH_TEX}${name}/${name}_${type}_1k.jpg`;
}

// ─── HDRI environments ──────────────────────────────────────────
const HDRI_LIST = [
  { name: 'Studio',    url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr' },
  { name: 'Courtyard', url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/courtyard_1k.hdr' },
  { name: 'Warehouse', url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/industrial_workshop_foundry_1k.hdr' },
  { name: 'Sunset',    url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_48d_partly_cloudy_puresky_1k.hdr' },
  { name: 'Night',     url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/moonless_golf_1k.hdr' },
  { name: 'Overcast',  url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloppenheim_02_puresky_1k.hdr' },
  { name: 'Interior',  url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/brown_photostudio_02_1k.hdr' },
  { name: 'Dawn',      url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/solitude_night_1k.hdr' },
];

// ─── 8 Contexts — one per stop ──────────────────────────────────
const CONTEXTS = [
  {
    name: 'Scandinavian',
    floorTex: 'oak_veneer_01', floorRepeat: [4, 2],
    floorColor: '#c8a87c', floorRoughness: 0.65, floorMetalness: 0.0, floorClearcoat: 0.15, floorClearcoatRoughness: 0.4,
    panelColor: '#222222', panelMetalness: 0.85, panelRoughness: 0.4,
    bgTop: '#f0ebe3', bgMid: '#ddd5c8', bgBottom: '#c8bfb0',
    ambientIntensity: 0.4, ambientColor: '#ffffff',
    keyIntensity: 2.2, keyColor: '#fff5e6',
    fillIntensity: 0.0, fillColor: '#8899bb',
    rimIntensity: 0.0, rimColor: '#ffddaa',
    envIntensity: 0.8, envRotation: 0, exposure: 1.1,
  },
  {
    name: 'Marble',
    floorTex: 'marble_01', floorRepeat: [4, 2],
    floorColor: '#f2f2f8', floorRoughness: 0.08, floorMetalness: 0.0, floorClearcoat: 0.7, floorClearcoatRoughness: 0.15,
    panelColor: '#cccccc', panelMetalness: 0.95, panelRoughness: 0.3,
    bgTop: '#e8eaef', bgMid: '#d0d4dc', bgBottom: '#b8bcc8',
    ambientIntensity: 0.35, ambientColor: '#ffffff',
    keyIntensity: 1.8, keyColor: '#ffffff',
    fillIntensity: 0.0, fillColor: '#99aacc',
    rimIntensity: 0.0, rimColor: '#ddeeff',
    envIntensity: 1.0, envRotation: Math.PI * 0.3, exposure: 1.05,
  },
  {
    name: 'Minimal',
    floorTex: 'concrete_wall_003', floorRepeat: [4, 2],
    floorColor: '#c0c0c0', floorRoughness: 0.95, floorMetalness: 0.0, floorClearcoat: 0.0, floorClearcoatRoughness: 0.4,
    panelColor: '#999999', panelMetalness: 0.8, panelRoughness: 0.5,
    bgTop: '#d8d8d8', bgMid: '#c0c0c0', bgBottom: '#a8a8a8',
    ambientIntensity: 0.5, ambientColor: '#ffffff',
    keyIntensity: 1.8, keyColor: '#ffffff',
    fillIntensity: 0.0, fillColor: '#bbccdd',
    rimIntensity: 0.0, rimColor: '#ddddee',
    envIntensity: 0.6, envRotation: Math.PI * 0.6, exposure: 1.1,
  },
  {
    name: 'Walnut',
    floorTex: 'walnut_veneer', floorRepeat: [4, 2],
    floorColor: '#5a3a22', floorRoughness: 0.5, floorMetalness: 0.0, floorClearcoat: 0.4, floorClearcoatRoughness: 0.4,
    panelColor: '#b89860', panelMetalness: 0.8, panelRoughness: 0.4,
    bgTop: '#e8e0d4', bgMid: '#d0c4b0', bgBottom: '#b8a890',
    ambientIntensity: 0.35, ambientColor: '#ffffff',
    keyIntensity: 2.0, keyColor: '#fff0dd',
    fillIntensity: 0.0, fillColor: '#bbaa88',
    rimIntensity: 0.0, rimColor: '#eeddbb',
    envIntensity: 0.7, envRotation: Math.PI * 0.9, exposure: 1.05,
  },
  {
    name: 'Steel',
    floorTex: 'metal_plate', floorRepeat: [4, 2],
    floorColor: '#b0b0b8', floorRoughness: 0.3, floorMetalness: 0.9, floorClearcoat: 0.1, floorClearcoatRoughness: 0.4,
    panelColor: '#888890', panelMetalness: 0.92, panelRoughness: 0.3,
    bgTop: '#e8e8ec', bgMid: '#d0d0d8', bgBottom: '#b0b0bc',
    ambientIntensity: 0.35, ambientColor: '#ffffff',
    keyIntensity: 2.0, keyColor: '#ffffff',
    fillIntensity: 0.0, fillColor: '#99aabb',
    rimIntensity: 0.0, rimColor: '#ccddee',
    envIntensity: 0.9, envRotation: Math.PI * 1.2, exposure: 1.15,
  },
  {
    name: 'Noir',
    floorTex: 'dark_wood', floorRepeat: [4, 2],
    floorColor: '#0e0e0e', floorRoughness: 0.05, floorMetalness: 0.0, floorClearcoat: 0.95, floorClearcoatRoughness: 0.1,
    panelColor: '#c8a050', panelMetalness: 0.95, panelRoughness: 0.2,
    bgTop: '#1a1a1a', bgMid: '#111111', bgBottom: '#080808',
    ambientIntensity: 0.15, ambientColor: '#ffffff',
    keyIntensity: 2.8, keyColor: '#fff0dd',
    fillIntensity: 0.0, fillColor: '#333333',
    rimIntensity: 0.0, rimColor: '#ddaa44',
    envIntensity: 0.5, envRotation: Math.PI * 0.5, exposure: 1.3,
  },
  {
    name: 'Sage',
    floorTex: 'marble_01', floorRepeat: [4, 2],
    floorColor: '#f0efea', floorRoughness: 0.2, floorMetalness: 0.0, floorClearcoat: 0.5, floorClearcoatRoughness: 0.25,
    panelColor: '#cc7744', panelMetalness: 0.88, panelRoughness: 0.35,
    bgTop: '#d8ddd4', bgMid: '#c0c8b8', bgBottom: '#a8b0a0',
    ambientIntensity: 0.4, ambientColor: '#ffffff',
    keyIntensity: 1.8, keyColor: '#ffffff',
    fillIntensity: 0.0, fillColor: '#99aa88',
    rimIntensity: 0.0, rimColor: '#ffcc99',
    envIntensity: 0.8, envRotation: Math.PI * 1.8, exposure: 1.1,
  },
  {
    name: 'Gallery',
    floorTex: 'dark_wood', floorRepeat: [4, 2],
    floorColor: '#7a6a55', floorRoughness: 0.55, floorMetalness: 0.0, floorClearcoat: 0.3, floorClearcoatRoughness: 0.4,
    panelColor: '#887755', panelMetalness: 0.7, panelRoughness: 0.5,
    bgTop: '#e0dcd5', bgMid: '#c8c0b5', bgBottom: '#b0a898',
    ambientIntensity: 0.35, ambientColor: '#ffffff',
    keyIntensity: 1.8, keyColor: '#fff8ee',
    fillIntensity: 0.0, fillColor: '#bbaa88',
    rimIntensity: 0.0, rimColor: '#ddccaa',
    envIntensity: 0.7, envRotation: Math.PI * 1.1, exposure: 1.05,
  },
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

// ─── Theatre.js setup ───────────────────────────────────────────
const useStudio = new URLSearchParams(window.location.search).has('studio');

async function initTheatre() {
  let project, sheet, cameraObj;
  let theatreReady = false;
  let hasKeyframes = false;

  try {
    // Studio is already initialized in index.html (before main.js loads)
    if (useStudio && theatreStudio) {
      document.getElementById('theatre-hint')?.classList.add('hidden');
    }

    // Create project (no saved state — start fresh, studio persists edits in localStorage)
    project = theatreCore.getProject('ANGL V15');
    sheet = project.sheet('Camera');

    // Define camera object with property ranges
    // Default values match the start of our fallback keyframes
    cameraObj = sheet.object('Camera', {
      azimuth: theatreCore.types.number(0, { range: [-720, 720] }),
      elevation: theatreCore.types.number(1.2, { range: [-0.5, 2.0] }),
      distance: theatreCore.types.number(6.0, { range: [1.0, 12.0] }),
      zoom: theatreCore.types.number(5.5, { range: [0.5, 10.0] }),
    });

    // Wait for project to be ready
    await project.ready;

    theatreReady = true;
  } catch (err) {
    console.warn('Theatre.js init failed, using fallback interpolation:', err);
  }

  return { project, sheet, cameraObj, theatreReady, hasKeyframes };
}

async function init() {
  const canvas = document.getElementById('viewer-canvas');
  const overlay = document.getElementById('loading-overlay');
  const progressBar = document.getElementById('loading-progress');
  const progressText = document.getElementById('loading-text');
  const calloutSvg = document.getElementById('callout-svg');
  const hotspotContainer = document.getElementById('hotspot-container');
  const envLabel = document.getElementById('env-label');

  // ─── Theatre.js ─────────────────────────────────────────────────
  progressText.textContent = 'loading theatre.js...';
  const theatre = await initTheatre();

  // Current camera values — driven by scroll keyframes, overridden by Theatre.js if keyframes exist
  const cameraValues = { azimuth: 0, elevation: 1.2, distance: 6.0, zoom: 5.5 };

  // Track whether Theatre.js has active keyframes (user added them in studio)
  let theatreHasKeyframes = false;

  if (theatre.theatreReady && theatre.cameraObj) {
    // Listen for Theatre.js value changes — these fire when sequence has keyframes
    theatre.cameraObj.onValuesChange((values) => {
      // Only use Theatre.js values if the studio is active and user has set keyframes
      // We detect this by checking if values differ from defaults when sequence position changes
      if (theatreHasKeyframes) {
        cameraValues.azimuth = values.azimuth;
        cameraValues.elevation = values.elevation;
        cameraValues.distance = values.distance;
        cameraValues.zoom = values.zoom;
      }
    });
  }

  // ─── Renderer ──────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: false, powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // ─── Scene ─────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.environmentIntensity = 0.8;

  function buildBackground(top, mid, bottom) {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 1024;
    const cx = c.getContext('2d');
    const g = cx.createLinearGradient(0, 0, 0, 1024);
    g.addColorStop(0, top);
    g.addColorStop(0.5, mid);
    g.addColorStop(1, bottom);
    cx.fillStyle = g;
    cx.fillRect(0, 0, 1024, 1024);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  scene.background = buildBackground('#f0ebe3', '#ddd5c8', '#c8bfb0');

  // ─── Camera ────────────────────────────────────────────────────
  const aspect = window.innerWidth / window.innerHeight;
  let frustumSize = 5.5;
  const camera = new THREE.OrthographicCamera(
    -frustumSize * aspect / 2, frustumSize * aspect / 2,
    frustumSize / 2, -frustumSize / 2, 0.01, 100
  );

  // ─── Lights ────────────────────────────────────────────────────
  const ambient = new THREE.AmbientLight('#ffffff', 0.4);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight('#fff5e6', 2.2);
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

  const fillLight = new THREE.PointLight('#8899bb', 0.8, 20, 1.5);
  fillLight.position.set(-3, 2, -1);
  scene.add(fillLight);

  const rimLight = new THREE.SpotLight('#ffddaa', 1.2, 30, Math.PI / 5, 0.6);
  rimLight.position.set(-1, 3, -3);
  rimLight.target.position.set(0, 0.3, 0);
  scene.add(rimLight);
  scene.add(rimLight.target);

  const bounceLight = new THREE.PointLight('#334466', 0.3, 8, 2);
  bounceLight.position.set(0, -0.5, 0);
  scene.add(bounceLight);

  // ─── Ground: textured physical material ────────────────────────
  const groundMat = new THREE.MeshPhysicalMaterial({
    color: 0xc8a87c,
    metalness: 0.0,
    roughness: 0.65,
    envMapIntensity: 1.5,
    clearcoat: 0.15,
    clearcoatRoughness: 0.4,
  });
  const groundPlane = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), groundMat);
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.position.y = -0.001;
  groundPlane.receiveShadow = true;
  scene.add(groundPlane);

  // Shadow overlay
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.ShadowMaterial({ opacity: 0.4 })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.002;
  shadowPlane.receiveShadow = true;
  scene.add(shadowPlane);

  // ─── Load model ────────────────────────────────────────────────
  progressText.textContent = 'loading model...';
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);

  let panelMeshes = [];

  const model = await new Promise((resolve, reject) => {
    gltfLoader.load(
      '../models/ANGL-ASM-MAIN_REV-G_FULL.glb',
      (gltf) => {
        const m = gltf.scene;
        m.rotation.x = -Math.PI / 2;
        const box = new THREE.Box3().setFromObject(m);
        const size = box.getSize(new THREE.Vector3());
        m.scale.setScalar(1.0 / Math.max(size.x, size.y, size.z));
        const scaledBox = new THREE.Box3().setFromObject(m);
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        m.position.x -= scaledCenter.x;
        m.position.z -= scaledCenter.z;
        m.position.y -= scaledBox.min.y;

        m.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.name && child.name.includes('Solid2')) {
              panelMeshes.push(child);
            }
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

  progressBar.style.width = '20%';

  // ─── Preload HDRIs ─────────────────────────────────────────────
  const rgbeLoader = new RGBELoader();
  const hdriTextures = [];
  for (let i = 0; i < HDRI_LIST.length; i++) {
    progressText.textContent = `loading hdri ${i + 1}/${HDRI_LIST.length}...`;
    const tex = await new Promise((resolve, reject) => {
      rgbeLoader.load(HDRI_LIST[i].url, (t) => {
        t.mapping = THREE.EquirectangularReflectionMapping;
        resolve(t);
      }, undefined, reject);
    });
    hdriTextures.push(tex);
    progressBar.style.width = `${20 + (40 * (i + 1) / HDRI_LIST.length)}%`;
  }
  scene.environment = hdriTextures[0];

  // ─── Preload floor textures ────────────────────────────────────
  const texLoader = new THREE.TextureLoader();
  const floorTextures = {};

  const uniqueFloorTexNames = [...new Set(CONTEXTS.map(c => c.floorTex))];
  for (let i = 0; i < uniqueFloorTexNames.length; i++) {
    const name = uniqueFloorTexNames[i];
    progressText.textContent = `loading texture ${i + 1}/${uniqueFloorTexNames.length}...`;

    const diff = await new Promise((resolve) => {
      texLoader.load(texUrl(name, 'diff'), resolve, undefined, () => resolve(null));
    });
    const norm = await new Promise((resolve) => {
      texLoader.load(texUrl(name, 'nor_gl'), resolve, undefined, () => resolve(null));
    });

    if (diff) {
      diff.colorSpace = THREE.SRGBColorSpace;
      diff.wrapS = diff.wrapT = THREE.RepeatWrapping;
    }
    if (norm) {
      norm.wrapS = norm.wrapT = THREE.RepeatWrapping;
    }

    floorTextures[name] = { diff, norm };
    progressBar.style.width = `${60 + (40 * (i + 1) / uniqueFloorTexNames.length)}%`;
  }

  // ─── Context application ───────────────────────────────────────
  let currentContextIndex = -1;

  function applyContext(index) {
    if (index === currentContextIndex) return;
    currentContextIndex = index;
    const ctx = CONTEXTS[index];

    // Floor texture
    const ft = floorTextures[ctx.floorTex];
    if (ft) {
      if (ft.diff) {
        ft.diff.repeat.set(ctx.floorRepeat[0], ctx.floorRepeat[1]);
        groundMat.map = ft.diff;
      } else {
        groundMat.map = null;
      }
      if (ft.norm) {
        ft.norm.repeat.set(ctx.floorRepeat[0], ctx.floorRepeat[1]);
        groundMat.normalMap = ft.norm;
        groundMat.normalScale.set(0.8, 0.8);
      } else {
        groundMat.normalMap = null;
      }
    }
    groundMat.color.set(ctx.floorColor);
    groundMat.roughness = ctx.floorRoughness;
    groundMat.metalness = ctx.floorMetalness;
    groundMat.clearcoat = ctx.floorClearcoat;
    groundMat.clearcoatRoughness = ctx.floorClearcoatRoughness;
    groundMat.needsUpdate = true;

    // PC panel color
    const panelCol = new THREE.Color(ctx.panelColor);
    panelMeshes.forEach((obj) => {
      obj.traverse((c) => {
        if (c.isMesh && c.material) {
          c.material.color.copy(panelCol);
          c.material.metalness = ctx.panelMetalness;
          c.material.roughness = ctx.panelRoughness;
          c.material.needsUpdate = true;
        }
      });
    });

    // Background
    scene.background = buildBackground(ctx.bgTop, ctx.bgMid, ctx.bgBottom);

    // Lighting
    ambient.intensity = ctx.ambientIntensity;
    ambient.color.set(ctx.ambientColor);
    keyLight.intensity = ctx.keyIntensity;
    keyLight.color.set(ctx.keyColor);
    fillLight.intensity = ctx.fillIntensity;
    fillLight.color.set(ctx.fillColor);
    rimLight.intensity = ctx.rimIntensity;
    rimLight.color.set(ctx.rimColor);

    // Environment
    scene.environment = hdriTextures[index];
    scene.environmentIntensity = ctx.envIntensity;
    scene.environmentRotation = new THREE.Euler(0, ctx.envRotation, 0);
    renderer.toneMappingExposure = ctx.exposure;

    // Label
    if (envLabel) envLabel.textContent = ctx.name.toLowerCase();
  }

  // Apply initial context
  applyContext(0);

  // ─── Camera orbit ──────────────────────────────────────────────
  const modelBox = new THREE.Box3().setFromObject(model);
  const modelCenter = modelBox.getCenter(new THREE.Vector3());
  const orbitTarget = new THREE.Vector3(0, modelCenter.y, 0);

  function updateCamera() {
    const azimuth = THREE.MathUtils.degToRad(cameraValues.azimuth);
    const el = cameraValues.elevation;
    const r = cameraValues.distance;
    const zoom = cameraValues.zoom;

    camera.position.x = orbitTarget.x + r * Math.sin(azimuth) * Math.cos(el);
    camera.position.y = orbitTarget.y + r * Math.sin(el);
    camera.position.z = orbitTarget.z + r * Math.cos(azimuth) * Math.cos(el);
    camera.lookAt(orbitTarget);

    // Update ortho frustum if zoom changed
    if (Math.abs(zoom - frustumSize) > 0.001) {
      frustumSize = zoom;
      const a = window.innerWidth / window.innerHeight;
      camera.left = -frustumSize * a / 2;
      camera.right = frustumSize * a / 2;
      camera.top = frustumSize / 2;
      camera.bottom = -frustumSize / 2;
      camera.updateProjectionMatrix();
    }
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
  composer.addPass(new SMAAPass(window.innerWidth, window.innerHeight));
  composer.addPass(new OutputPass());

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

  // ─── Scroll helpers ────────────────────────────────────────────
  function getScrollProgress() {
    const scrollMax = document.documentElement.scrollHeight - window.innerHeight;
    return scrollMax > 0 ? window.scrollY / scrollMax : 0;
  }

  function project3DToScreen(point3D) {
    const v = point3D.clone().project(camera);
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  // ─── Update hotspots + context ─────────────────────────────────
  const MARGIN_LEFT = 60;
  const MARGIN_RIGHT = 60;

  function updateHotspots() {
    while (calloutSvg.firstChild) calloutSvg.removeChild(calloutSvg.firstChild);

    // Compute current azimuth from camera values
    const currentDeg = ((cameraValues.azimuth % 360) + 360) % 360;

    // Check if we're near a major stop (within ~5°)
    const SNAP_THRESHOLD = 5;
    let majorIndex = -1;
    for (let i = 0; i < 8; i++) {
      const stopDeg = i * 45;
      const diff = Math.abs(((currentDeg - stopDeg + 180) % 360) - 180);
      if (diff < SNAP_THRESHOLD) {
        majorIndex = i;
        break;
      }
    }

    const isMajorStop = majorIndex >= 0;

    // Apply context at major stops
    if (isMajorStop) {
      applyContext(majorIndex);
    }

    if (!isMajorStop) {
      hotspotElements.forEach(({ panel }) => {
        panel.classList.remove('visible');
        panel.style.opacity = 0;
      });
      return;
    }

    const activeStopAngle = STOPS[majorIndex].angle;

    // First pass: compute panel positions and resolve overlaps
    const placements = [];
    hotspotElements.forEach(({ panel, hotspot, stopAngle }) => {
      const isActive = Math.abs(stopAngle - activeStopAngle) < 0.01;
      if (!isActive) {
        panel.classList.remove('visible');
        panel.style.opacity = 0;
        placements.push(null);
        return;
      }
      const screen = project3DToScreen(hotspot.anchorLocal);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let panelX;
      if (hotspot.panelSide === 'right') {
        panelX = vw - MARGIN_RIGHT - 260;
      } else {
        panelX = MARGIN_LEFT;
      }
      const panelY = Math.max(100, Math.min(screen.y - 40, vh - 140));
      placements.push({ panel, hotspot, screen, panelX, panelY });
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

      // Line connects anchor → title edge (with small gap)
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

  // ─── Tweakpane GUI (materials, lighting, post-fx) ───────────────
  const pane = new Pane({ title: 'Settings', expanded: true });

  function forEachMaterial(fn) {
    model.traverse((c) => {
      if (c.isMesh && c.material && (c.material.isMeshStandardMaterial || c.material.isMeshPhysicalMaterial)) {
        fn(c.material);
      }
    });
  }

  const ctx0 = CONTEXTS[0];
  const PARAMS = {
    // Scene
    bgTop: ctx0.bgTop,
    bgMid: ctx0.bgMid,
    bgBottom: ctx0.bgBottom,
    // Environment
    envIntensity: ctx0.envIntensity,
    envRotation: ctx0.envRotation,
    // Lighting
    ambientIntensity: ctx0.ambientIntensity,
    ambientColor: ctx0.ambientColor,
    keyIntensity: ctx0.keyIntensity,
    keyColor: ctx0.keyColor,
    fillIntensity: ctx0.fillIntensity,
    fillColor: ctx0.fillColor,
    rimIntensity: ctx0.rimIntensity,
    rimColor: ctx0.rimColor,
    // Material (PC body)
    metalness: 0.52,
    roughness: 0.48,
    envMapIntensity: 2.2,
    // Panel color
    panelColor: ctx0.panelColor,
    panelMetalness: ctx0.panelMetalness,
    panelRoughness: ctx0.panelRoughness,
    // Ground
    groundColor: ctx0.floorColor,
    groundRoughness: ctx0.floorRoughness,
    groundMetalness: ctx0.floorMetalness,
    groundEnvMap: 1.5,
    groundClearcoat: ctx0.floorClearcoat,
    shadowOpacity: 0.4,
    // Post-FX
    exposure: ctx0.exposure,
    grainAmount: filmPass.uniforms.uGrainAmount.value,
  };

  // Scene
  const fScene = pane.addFolder({ title: 'Scene' });
  fScene.addBinding(PARAMS, 'bgTop', { label: 'bg top' }).on('change', () => { scene.background = buildBackground(PARAMS.bgTop, PARAMS.bgMid, PARAMS.bgBottom); });
  fScene.addBinding(PARAMS, 'bgMid', { label: 'bg mid' }).on('change', () => { scene.background = buildBackground(PARAMS.bgTop, PARAMS.bgMid, PARAMS.bgBottom); });
  fScene.addBinding(PARAMS, 'bgBottom', { label: 'bg bottom' }).on('change', () => { scene.background = buildBackground(PARAMS.bgTop, PARAMS.bgMid, PARAMS.bgBottom); });

  // Environment
  const fEnv = pane.addFolder({ title: 'Environment' });
  fEnv.addBinding(PARAMS, 'envIntensity', { min: 0, max: 3, step: 0.05, label: 'intensity' }).on('change', (ev) => { scene.environmentIntensity = ev.value; });
  fEnv.addBinding(PARAMS, 'envRotation', { min: 0, max: Math.PI * 2, step: 0.05, label: 'rotation' }).on('change', (ev) => { scene.environmentRotation = new THREE.Euler(0, ev.value, 0); });

  // Lighting
  const fLight = pane.addFolder({ title: 'Lighting' });
  fLight.addBinding(PARAMS, 'ambientIntensity', { min: 0, max: 2, step: 0.05, label: 'ambient' }).on('change', (ev) => { ambient.intensity = ev.value; });
  fLight.addBinding(PARAMS, 'ambientColor', { label: 'ambient color' }).on('change', (ev) => { ambient.color.set(ev.value); });
  fLight.addBinding(PARAMS, 'keyIntensity', { min: 0, max: 8, step: 0.1, label: 'key' }).on('change', (ev) => { keyLight.intensity = ev.value; });
  fLight.addBinding(PARAMS, 'keyColor', { label: 'key color' }).on('change', (ev) => { keyLight.color.set(ev.value); });
  fLight.addBinding(PARAMS, 'fillIntensity', { min: 0, max: 3, step: 0.1, label: 'fill' }).on('change', (ev) => { fillLight.intensity = ev.value; });
  fLight.addBinding(PARAMS, 'fillColor', { label: 'fill color' }).on('change', (ev) => { fillLight.color.set(ev.value); });
  fLight.addBinding(PARAMS, 'rimIntensity', { min: 0, max: 4, step: 0.1, label: 'rim' }).on('change', (ev) => { rimLight.intensity = ev.value; });
  fLight.addBinding(PARAMS, 'rimColor', { label: 'rim color' }).on('change', (ev) => { rimLight.color.set(ev.value); });

  // Material (PC body)
  const fMat = pane.addFolder({ title: 'Material' });
  fMat.addBinding(PARAMS, 'metalness', { min: 0, max: 1, step: 0.01 }).on('change', (ev) => { forEachMaterial((m) => { m.metalness = ev.value; m.needsUpdate = true; }); });
  fMat.addBinding(PARAMS, 'roughness', { min: 0, max: 1, step: 0.01 }).on('change', (ev) => { forEachMaterial((m) => { m.roughness = ev.value; m.needsUpdate = true; }); });
  fMat.addBinding(PARAMS, 'envMapIntensity', { min: 0, max: 5, step: 0.1, label: 'env map' }).on('change', (ev) => { forEachMaterial((m) => { m.envMapIntensity = ev.value; m.needsUpdate = true; }); });

  // Panel color
  const fPanel = pane.addFolder({ title: 'Panel Color' });
  fPanel.addBinding(PARAMS, 'panelColor', { label: 'color' }).on('change', (ev) => {
    const col = new THREE.Color(ev.value);
    panelMeshes.forEach((obj) => { obj.traverse((c) => { if (c.isMesh && c.material) { c.material.color.copy(col); c.material.needsUpdate = true; } }); });
  });
  fPanel.addBinding(PARAMS, 'panelMetalness', { min: 0, max: 1, step: 0.01, label: 'metalness' }).on('change', (ev) => {
    panelMeshes.forEach((obj) => { obj.traverse((c) => { if (c.isMesh && c.material) { c.material.metalness = ev.value; c.material.needsUpdate = true; } }); });
  });
  fPanel.addBinding(PARAMS, 'panelRoughness', { min: 0, max: 1, step: 0.01, label: 'roughness' }).on('change', (ev) => {
    panelMeshes.forEach((obj) => { obj.traverse((c) => { if (c.isMesh && c.material) { c.material.roughness = ev.value; c.material.needsUpdate = true; } }); });
  });

  // Ground
  const fGround = pane.addFolder({ title: 'Ground' });
  fGround.addBinding(PARAMS, 'groundColor', { label: 'color' }).on('change', (ev) => { groundMat.color.set(ev.value); });
  fGround.addBinding(PARAMS, 'groundRoughness', { min: 0, max: 1, step: 0.01, label: 'roughness' }).on('change', (ev) => { groundMat.roughness = ev.value; });
  fGround.addBinding(PARAMS, 'groundMetalness', { min: 0, max: 1, step: 0.01, label: 'metalness' }).on('change', (ev) => { groundMat.metalness = ev.value; });
  fGround.addBinding(PARAMS, 'groundEnvMap', { min: 0, max: 5, step: 0.1, label: 'env reflection' }).on('change', (ev) => { groundMat.envMapIntensity = ev.value; });
  fGround.addBinding(PARAMS, 'groundClearcoat', { min: 0, max: 1, step: 0.01, label: 'clearcoat' }).on('change', (ev) => { groundMat.clearcoat = ev.value; });
  fGround.addBinding(PARAMS, 'shadowOpacity', { min: 0, max: 1, step: 0.05, label: 'shadow' }).on('change', (ev) => { shadowPlane.material.opacity = ev.value; });

  // Post-FX
  const fFx = pane.addFolder({ title: 'Post-FX' });
  fFx.addBinding(PARAMS, 'exposure', { min: 0.5, max: 4, step: 0.05 }).on('change', (ev) => { renderer.toneMappingExposure = ev.value; });
  fFx.addBinding(PARAMS, 'grainAmount', { min: 0, max: 0.06, step: 0.001, label: 'grain' }).on('change', (ev) => { filmPass.uniforms.uGrainAmount.value = ev.value; });

  // ─── Theatre.js override toggle (press T to toggle) ─────────────
  if (useStudio) {
    window.addEventListener('keydown', (e) => {
      if (e.key === 't' || e.key === 'T') {
        theatreHasKeyframes = !theatreHasKeyframes;
        console.log(`Theatre.js keyframe override: ${theatreHasKeyframes ? 'ON' : 'OFF'}`);
      }
    });
  }

  // ─── Fade out loader ───────────────────────────────────────────
  progressText.textContent = 'ready';
  overlay.classList.add('loaded');
  setTimeout(() => { overlay.style.display = 'none'; }, 600);

  // ─── Render loop ───────────────────────────────────────────────
  function animate() {
    requestAnimationFrame(animate);
    filmPass.uniforms.uTime.value = performance.now() * 0.001;

    const progress = getScrollProgress();

    // Always drive camera from multi-keyframe interpolation
    if (!theatreHasKeyframes) {
      const vals = lerpKeyframes(FALLBACK_KEYFRAMES, progress);
      cameraValues.azimuth = vals.azimuth;
      cameraValues.elevation = vals.elevation;
      cameraValues.distance = vals.distance;
      cameraValues.zoom = vals.zoom;
    }

    // Also drive Theatre.js sequence position (for studio visualization + override)
    if (theatre.theatreReady && theatre.sheet) {
      theatre.sheet.sequence.position = progress * SEQUENCE_LENGTH;
    }

    updateCamera();
    updateHotspots();
    composer.render();
  }
  animate();
}

init().catch((err) => {
  console.error('V15 init failed:', err);
  const text = document.getElementById('loading-text');
  if (text) text.textContent = 'failed to load — ' + err.message;
});
