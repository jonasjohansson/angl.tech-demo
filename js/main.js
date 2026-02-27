import * as THREE from 'three';
// OrbitControls removed — using mouse-position orbit camera
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { defaults } from './config.js';
import { createGUI } from './gui.js';

async function init() {
  const canvas = document.getElementById('viewer-canvas');
  const overlay = document.getElementById('loading-overlay');
  const progressBar = document.getElementById('loading-progress');
  const progressText = document.getElementById('loading-text');

  // --- Renderer (max quality) ---
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = defaults.postprocessing.exposure;
  const shadowDefaults = defaults.shadows || { enabled: true, mapSize: 2048 };
  renderer.shadowMap.enabled = shadowDefaults.enabled;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.physicallyCorrectLights = true;

  // --- Scene ---
  const scene = new THREE.Scene();

  // --- Cameras ---
  const FRUSTUM_DEFAULT = 2.2;
  let frustumSize = FRUSTUM_DEFAULT;
  let targetFrustum = FRUSTUM_DEFAULT;
  let zoomed = false;
  const aspect = window.innerWidth / window.innerHeight;

  const orthoCamera = new THREE.OrthographicCamera(
    -frustumSize * aspect / 2, frustumSize * aspect / 2,
    frustumSize / 2, -frustumSize / 2,
    0.01, 100
  );
  orthoCamera.position.set(0, 0.3, 2.5);

  const perspCamera = new THREE.PerspectiveCamera(40, aspect, 0.01, 100);
  perspCamera.position.set(0, 0.3, 2.5);

  let camera = orthoCamera;
  let cameraType = 'Orthographic';

  function switchCamera(type) {
    cameraType = type;
    const prev = camera;
    camera = type === 'Orthographic' ? orthoCamera : perspCamera;
    camera.position.copy(prev.position);
    camera.quaternion.copy(prev.quaternion);
    // Update composer passes that reference the camera
    composer.passes.forEach((pass) => {
      if (pass.camera) pass.camera = camera;
    });
    // Toggle BokehPass ortho/persp define
    if (bokehPass) {
      const isPerspective = type === 'Perspective';
      bokehPass.materialBokeh.defines.PERSPECTIVE_CAMERA = isPerspective ? 1 : 0;
      bokehPass.materialBokeh.needsUpdate = true;
    }
  }

  // --- Environment ---
  scene.background = new THREE.Color(0xf0ebe3);
  scene.environmentIntensity = defaults.lighting.envIntensity;

  // --- Lights (3-point studio setup for premium product) ---
  const ambient = new THREE.AmbientLight(
    defaults.lighting.ambientColor,
    defaults.lighting.ambientIntensity
  );
  scene.add(ambient);

  // Key light — warm directional, high-res shadows
  const keyLight = new THREE.DirectionalLight(
    defaults.lighting.keyColor,
    defaults.lighting.keyIntensity
  );
  keyLight.position.set(
    defaults.lighting.keyPosition.x,
    defaults.lighting.keyPosition.y,
    defaults.lighting.keyPosition.z
  );
  keyLight.castShadow = shadowDefaults.enabled;
  keyLight.shadow.mapSize.width = shadowDefaults.mapSize;
  keyLight.shadow.mapSize.height = shadowDefaults.mapSize;
  keyLight.shadow.camera.near = 0.1;
  keyLight.shadow.camera.far = 20;
  keyLight.shadow.camera.left = -3;
  keyLight.shadow.camera.right = 3;
  keyLight.shadow.camera.top = 3;
  keyLight.shadow.camera.bottom = -3;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.02;
  scene.add(keyLight);

  // Fill light — cool-toned, softer
  const fillLight = new THREE.PointLight(
    defaults.lighting.fillColor,
    defaults.lighting.fillIntensity,
    20,
    1.5
  );
  fillLight.position.set(
    defaults.lighting.fillPosition.x,
    defaults.lighting.fillPosition.y,
    defaults.lighting.fillPosition.z
  );
  scene.add(fillLight);

  // Rim / back light — warm accent edge highlight
  const rimLight = new THREE.SpotLight(
    defaults.lighting.rimColor,
    defaults.lighting.rimIntensity,
    30,
    Math.PI / 5,
    0.6
  );
  rimLight.position.set(
    defaults.lighting.rimPosition.x,
    defaults.lighting.rimPosition.y,
    defaults.lighting.rimPosition.z
  );
  rimLight.target.position.set(0, 0.3, 0);
  scene.add(rimLight);
  scene.add(rimLight.target);

  // Bottom bounce — subtle upward fill to lift shadows under the case
  const bounceLight = new THREE.PointLight('#334466', 0.3, 8, 2);
  bounceLight.position.set(0, -0.5, 0);
  scene.add(bounceLight);

  // --- Ground plane with contact shadow ---
  const groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.ShadowMaterial({ opacity: defaults.ground.shadowOpacity })
  );
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.position.y = 0;
  groundPlane.receiveShadow = true;
  groundPlane.visible = defaults.ground.visible;
  scene.add(groundPlane);

  const grid = null; // grid removed

  // --- Wall-mounted shelf ---
  const shelfGroup = new THREE.Group();

  // Wood plank
  const plankGeo = new THREE.BoxGeometry(3.5, 0.04, 1.6);
  const woodMat = new THREE.MeshPhysicalMaterial({
    color: 0xc8a87c,
    roughness: 0.65,
    metalness: 0.0,
    clearcoat: 0.15,
    clearcoatRoughness: 0.4,
  });
  const plank = new THREE.Mesh(plankGeo, woodMat);
  plank.position.y = -0.02; // top surface at y=0
  plank.receiveShadow = true;
  shelfGroup.add(plank);

  // Dark metal bracket material
  const bracketMat = new THREE.MeshPhysicalMaterial({
    color: 0x222222,
    roughness: 0.4,
    metalness: 0.85,
  });

  // L-shaped bracket helper: vertical arm against wall + horizontal arm under plank
  function createBracket(xPos) {
    const bracketGroup = new THREE.Group();

    // Vertical arm (against wall)
    const vertGeo = new THREE.BoxGeometry(0.04, 0.3, 0.035);
    const vert = new THREE.Mesh(vertGeo, bracketMat);
    vert.position.set(0, -0.19, -0.38);
    vert.castShadow = true;
    bracketGroup.add(vert);

    // Horizontal arm (under plank)
    const horizGeo = new THREE.BoxGeometry(0.04, 0.035, 0.7);
    const horiz = new THREE.Mesh(horizGeo, bracketMat);
    horiz.position.set(0, -0.055, -0.05);
    horiz.castShadow = true;
    bracketGroup.add(horiz);

    // Small diagonal brace for realism
    const braceLen = 0.28;
    const braceGeo = new THREE.BoxGeometry(0.03, 0.025, braceLen);
    const brace = new THREE.Mesh(braceGeo, bracketMat);
    brace.position.set(0, -0.14, -0.2);
    brace.rotation.x = -Math.PI / 4;
    brace.castShadow = true;
    bracketGroup.add(brace);

    bracketGroup.position.x = xPos;
    return bracketGroup;
  }

  shelfGroup.add(createBracket(-1.1));
  shelfGroup.add(createBracket(1.1));

  // Wall behind the shelf
  const wallGeo = new THREE.PlaneGeometry(20, 20);
  const wallMat = new THREE.MeshPhysicalMaterial({
    color: 0xf0ebe3,
    roughness: 0.95,
    metalness: 0.0,
  });
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.position.set(0, 5, -0.8);
  wall.receiveShadow = true;
  shelfGroup.add(wall);

  scene.add(shelfGroup);

  // --- Model loader ---
  const MODEL_PATHS = {
    optimized: './models/ANGL-ASM-MAIN_REV-G_FULL_optimized.glb',
    full: './models/ANGL-ASM-MAIN_REV-G_FULL.glb',
  };

  let currentModel = null;
  let onModelLoaded = null; // set after toggleable parts are defined

  function loadModel(key) {
    return new Promise((resolve, reject) => {
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
      const loader = new GLTFLoader();
      loader.setDRACOLoader(dracoLoader);

      loader.load(
        MODEL_PATHS[key],
        (gltf) => {
          // Remove previous model
          if (currentModel) {
            scene.remove(currentModel);
            currentModel.traverse((child) => {
              if (child.isMesh) {
                child.geometry.dispose();
                if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                else child.material.dispose();
              }
            });
          }

          const m = gltf.scene;

          // Rotate -90° on X axis (CAD orientation fix)
          m.rotation.x = -Math.PI / 2;

          // Scale to fit ~1 unit
          const box = new THREE.Box3().setFromObject(m);
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = 1.0 / maxDim;
          m.scale.setScalar(scale);

          // Center and place on ground
          const scaledBox = new THREE.Box3().setFromObject(m);
          const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
          m.position.x -= scaledCenter.x;
          m.position.z -= scaledCenter.z;
          m.position.y -= scaledBox.min.y;

          // Premium material setup + shadows
          m.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              if (child.material) {
                const mat = child.material;
                if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
                  mat.envMapIntensity = 1.2;
                  if (!mat.isMeshPhysicalMaterial) {
                    const physMat = new THREE.MeshPhysicalMaterial();
                    THREE.MeshStandardMaterial.prototype.copy.call(physMat, mat);
                    physMat.clearcoat = defaults.material.clearcoat;
                    physMat.clearcoatRoughness = defaults.material.clearcoatRoughness;
                    physMat.envMapIntensity = 1.2;
                    child.material = physMat;
                    mat.dispose();
                  } else {
                    mat.clearcoat = defaults.material.clearcoat;
                    mat.clearcoatRoughness = defaults.material.clearcoatRoughness;
                  }
                  child.material.needsUpdate = true;
                }
              }
            }
          });

          scene.add(m);
          currentModel = m;
          // Re-scan for toggleable parts after model swap
          if (onModelLoaded) onModelLoaded(m);
          dracoLoader.dispose();
          resolve(m);
        },
        undefined,
        (error) => { dracoLoader.dispose(); reject(error); }
      );
    });
  }

  progressText.textContent = 'loading model...';
  const model = await loadModel('full');

  // --- Studio HDRI environment for realistic reflections ---
  progressText.textContent = 'loading environment...';
  const envMap = await new Promise((resolve, reject) => {
    new RGBELoader().load(
      'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr',
      (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        resolve(texture);
      },
      undefined,
      reject,
    );
  });
  scene.environment = envMap;

  // Log full model hierarchy for debugging part names
  model.traverse((child) => {
    const depth = [];
    let p = child.parent;
    while (p) { depth.push(p.name || '(no name)'); p = p.parent; }
    console.log(
      child.isMesh ? 'MESH' : 'NODE',
      `"${child.name}"`,
      '| path:', depth.reverse().join(' > ')
    );
  });

  // --- Hotspot labels ---
  const HOTSPOTS = [
    { match: 'ANGL-PAR-OSH-001_REV-G', title: 'SIDE PANEL', desc: 'Aluminium enclosure' },
    { match: 'ANGL-PAR-OSH-002_REV-G', title: 'TOP PANEL', desc: 'CNC ventilation' },
    { match: 'Motherboard Mini-ATX generic', title: 'MOTHERBOARD', desc: 'ASUS Strix B850-I' },
    { match: 'RTX 5090', title: 'GPU', desc: 'RTX 5090 Inno3D iChill' },
    { match: 'SF1000_simplified', title: 'PSU', desc: 'Corsair SF1000' },
    { match: 'Noctua-200mm', title: 'FAN', desc: 'Noctua 200 mm' },
    { match: 'Alphacool radiator 200mm', title: 'RADIATOR', desc: 'Alphacool 200 mm' },
    { match: 'DDR5 module', title: 'MEMORY', desc: 'DDR5 module' },
    { match: 'SSD NVMe M2 2280 Generic', title: 'STORAGE', desc: 'NVMe M.2 2280 SSD' },
    { match: 'Power button assembly', title: 'POWER BUTTON', desc: 'Illuminated momentary' },
    { match: 'Riser_AG-P5-33VV-v.3_MOUNTED', title: 'RISER CABLE', desc: 'PCIe 5.0 x16' },
  ];

  const hotspotContainer = document.getElementById('hotspot-container');

  // Resolve each hotspot to its 3D object and create persistent DOM
  const hotspotInstances = []; // { data, object, markerEl, panelEl, open }

  function initHotspots(root) {
    // Clear old instances
    hotspotInstances.length = 0;
    hotspotContainer.innerHTML = '';

    // Log all named objects for debugging hotspot matches
    const allNames = [];
    root.traverse((c) => { if (c.name) allNames.push(c.name); });
    console.log('Hotspot candidates:', allNames);

    const chevronSVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>';

    HOTSPOTS.forEach((hs) => {
      let target = null;
      // Exact match first, then includes fallback
      root.traverse((child) => {
        if (!target && child.name === hs.match) target = child;
      });
      if (!target) {
        root.traverse((child) => {
          if (!target && child.name && child.name.includes(hs.match)) target = child;
        });
      }
      if (!target) {
        console.warn('Hotspot target not found:', hs.match);
        return;
      }
      console.log('Hotspot matched:', hs.match, '->', target.name);

      // Marker dot (always visible)
      const markerEl = document.createElement('div');
      markerEl.className = 'hotspot-marker';
      hotspotContainer.appendChild(markerEl);

      // Tag card (IKEA-style, toggled on click)
      const tagEl = document.createElement('div');
      tagEl.className = 'hotspot-tag';
      tagEl.innerHTML =
        `<div class="hotspot-tag-line"></div>` +
        `<div class="hotspot-tag-card">` +
          `<div class="hotspot-tag-body">` +
            `<span class="hotspot-tag-name">${hs.title}</span>` +
            `<span class="hotspot-tag-desc">${hs.desc}</span>` +
          `</div>` +
          `<div class="hotspot-tag-arrow">${chevronSVG}</div>` +
        `</div>`;
      hotspotContainer.appendChild(tagEl);

      // Click on marker toggles the tag
      markerEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const inst = hotspotInstances.find((h) => h.data === hs);
        if (inst) {
          inst.open = !inst.open;
          inst.tagEl.classList.toggle('visible', inst.open);
        }
      });

      hotspotInstances.push({ data: hs, object: target, markerEl, tagEl, open: false });
    });
  }

  initHotspots(model);

  // onModelLoaded chaining happens after toggleMap setup below

  function tryShowHotspot(event) {
    const px = (event.clientX / window.innerWidth) * 2 - 1;
    const py = -(event.clientY / window.innerHeight) * 2 + 1;
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(px, py), camera);

    if (!currentModel) return false;
    const allMeshes = [];
    currentModel.traverse((c) => { if (c.isMesh) allMeshes.push(c); });
    const hits = rc.intersectObjects(allMeshes, false);
    if (hits.length === 0) return false;

    // Walk up parent chain to find a hotspot match
    let hitObj = hits[0].object;
    let matched = null;
    while (hitObj) {
      const inst = hotspotInstances.find((h) => h.object === hitObj);
      if (inst) { matched = inst; break; }
      hitObj = hitObj.parent;
    }

    if (!matched) return false;

    // Toggle tag card
    matched.open = !matched.open;
    matched.tagEl.classList.toggle('visible', matched.open);
    return true;
  }

  function updateHotspotPositions() {
    const hw = window.innerWidth / 2;
    const hh = window.innerHeight / 2;
    const tmpVec = new THREE.Vector3();
    const tmpBox = new THREE.Box3();

    hotspotInstances.forEach((inst) => {
      // World center of the part
      tmpBox.setFromObject(inst.object);
      tmpBox.getCenter(tmpVec);

      const projected = tmpVec.project(camera);
      const sx = projected.x * hw + hw;
      const sy = -projected.y * hh + hh;

      // Behind camera — hide everything
      if (projected.z > 1) {
        inst.markerEl.style.opacity = '0';
        inst.tagEl.classList.remove('visible');
        return;
      }
      inst.markerEl.style.opacity = '';

      // Position marker
      inst.markerEl.style.left = sx + 'px';
      inst.markerEl.style.top = sy + 'px';

      // Position tag adjacent to marker
      const onLeft = sx > window.innerWidth / 2;
      inst.tagEl.classList.toggle('left', onLeft);
      if (onLeft) {
        inst.tagEl.style.left = 'auto';
        inst.tagEl.style.right = (window.innerWidth - sx + 14) + 'px';
      } else {
        inst.tagEl.style.left = (sx + 14) + 'px';
        inst.tagEl.style.right = 'auto';
      }
      inst.tagEl.style.top = sy + 'px';
    });
  }

  // --- Toggleable parts ---
  // Discover all Solid2-related objects and categorise them:
  //   "Solid2" (exact) and names containing ".001" → individual toggle
  //   Everything else with "Solid2" in the name → group toggle

  function buildToggleMap(root) {
    const individuals = [];
    const groupMembers = [];
    const allSolid2 = [];

    // First pass: find every object whose name contains "Solid2"
    root.traverse((child) => {
      if (child.name && child.name.includes('Solid2')) {
        allSolid2.push(child);
      }
    });

    console.log('All Solid2 objects found:', allSolid2.map((p) =>
      `${p.name} (${p.isMesh ? 'mesh' : 'node'}, children: ${p.children.length})`
    ));

    // Categorise: exact "Solid2" or contains ".001" → individual, rest → group
    // Process top-level Solid2 objects (not nested under another Solid2 object)
    // Exception: "Solid2" and "Solid2.001" are both kept even if one is parent of the other
    allSolid2.forEach((child) => {
      if (child.name === 'Solid2' || child.name.includes('.001')) {
        individuals.push(child);
      } else {
        groupMembers.push(child);
      }
    });

    console.log('Toggle individuals:', individuals.map((p) => p.name));
    console.log('Toggle group members:', groupMembers.map((p) => p.name));
    return { individuals, groupMembers };
  }

  let toggleMap = buildToggleMap(model);
  onModelLoaded = (m) => {
    toggleMap = buildToggleMap(m);
    explodeParts = buildExplodeParts(m);
    initHotspots(m);
  };

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  // Collect all meshes from a list of objects
  function collectMeshes(objects) {
    const meshes = [];
    objects.forEach((obj) => {
      obj.traverse((c) => { if (c.isMesh) meshes.push(c); });
    });
    return meshes;
  }

  // Walk up from a mesh to find which toggle target it belongs to
  function findOwner(mesh, candidates) {
    let obj = mesh;
    while (obj) {
      if (candidates.includes(obj)) return obj;
      obj = obj.parent;
    }
    return null;
  }

  // --- Hover highlight for toggleable parts ---
  let hoveredGroup = null; // currently highlighted group (array of objects)
  const highlightEmissive = new THREE.Color(0x333333);
  const defaultEmissive = new THREE.Color(0x000000);

  function setGroupEmissive(objects, color) {
    objects.forEach((obj) => {
      obj.traverse((c) => {
        if (c.isMesh && c.material) {
          c.material.emissive.copy(color);
        }
      });
    });
  }

  function getToggleGroup(mesh) {
    // Returns the array of objects that would be toggled if this mesh is clicked
    const indivOwner = findOwner(mesh, toggleMap.individuals);
    if (indivOwner) return [indivOwner];
    const groupOwner = findOwner(mesh, toggleMap.groupMembers);
    if (groupOwner) return toggleMap.groupMembers;
    return null;
  }

  renderer.domElement.addEventListener('mousemove', (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const allToggleable = [...toggleMap.individuals, ...toggleMap.groupMembers];
    const meshes = collectMeshes(allToggleable.filter((p) => p.visible));
    const hits = raycaster.intersectObjects(meshes, false);

    let newGroup = null;
    if (hits.length > 0) {
      newGroup = getToggleGroup(hits[0].object);
    }

    // Only update if the hovered group changed
    if (newGroup !== hoveredGroup) {
      if (hoveredGroup) setGroupEmissive(hoveredGroup, defaultEmissive);
      if (newGroup) setGroupEmissive(newGroup, highlightEmissive);
      hoveredGroup = newGroup;
      renderer.domElement.style.cursor = newGroup ? 'pointer' : '';
    }
  });

  // Check if a click hits a toggleable part; returns true if handled
  function tryTogglePart(event) {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const allToggleable = [...toggleMap.individuals, ...toggleMap.groupMembers];

    // Temporarily make hidden parts visible for raycasting
    const wasHidden = [];
    allToggleable.forEach((part) => {
      if (!part.visible) { wasHidden.push(part); part.visible = true; }
    });

    const meshes = collectMeshes(allToggleable);
    const hits = raycaster.intersectObjects(meshes, false);

    // Restore hidden state
    wasHidden.forEach((part) => { part.visible = false; });

    if (hits.length > 0) {
      const hitMesh = hits[0].object;

      // Check individual toggles first
      const indivOwner = findOwner(hitMesh, toggleMap.individuals);
      if (indivOwner) {
        indivOwner.visible = !indivOwner.visible;
        // Clear highlight
        if (hoveredGroup) { setGroupEmissive(hoveredGroup, defaultEmissive); hoveredGroup = null; }
        return true;
      }

      // Check group toggles
      const groupOwner = findOwner(hitMesh, toggleMap.groupMembers);
      if (groupOwner) {
        const newVis = !groupOwner.visible;
        toggleMap.groupMembers.forEach((m) => { m.visible = newVis; });
        if (hoveredGroup) { setGroupEmissive(hoveredGroup, defaultEmissive); hoveredGroup = null; }
        return true;
      }
    }
    return false;
  }

  // --- Explode view ---
  // Collect every mesh in the model, compute outward direction from center
  // Clamp direction upward so parts never explode downward into the shelf
  let exploded = false;
  let explodeT = 0; // 0 = assembled, 1 = fully exploded
  const EXPLODE_DISTANCE = 0.3;

  function buildExplodeParts(root) {
    const parts = [];
    const modelBox = new THREE.Box3().setFromObject(root);
    const modelCtr = modelBox.getCenter(new THREE.Vector3());
    const box = new THREE.Box3();

    // Go deep — every mesh is an explode unit
    root.traverse((child) => {
      if (!child.isMesh) return;

      box.setFromObject(child);
      const childCenter = box.getCenter(new THREE.Vector3());

      // Direction from model center to part center (world space)
      const dir = new THREE.Vector3().subVectors(childCenter, modelCtr);

      // Clamp: don't let parts go downward (y < 0 in world = into the shelf)
      dir.y = Math.max(dir.y, 0.05);
      dir.normalize();

      parts.push({
        object: child,
        originalPos: child.position.clone(),
        // Convert world-space direction to parent-local-space
        direction: child.parent
          ? dir.applyQuaternion(child.parent.getWorldQuaternion(new THREE.Quaternion()).invert())
          : dir,
      });
    });
    console.log('Explode parts:', parts.length);
    return parts;
  }

  let explodeParts = buildExplodeParts(model);

  function updateExplode() {
    const target = exploded ? 1 : 0;
    explodeT += (target - explodeT) * 0.08;

    explodeParts.forEach(({ object, originalPos, direction }) => {
      object.position.copy(originalPos).addScaledVector(direction, explodeT * EXPLODE_DISTANCE);
    });
  }

  progressBar.style.width = '100%';
  progressText.textContent = 'initializing...';

  // --- Camera orbit (click & keys to rotate) ---
  const modelBox = new THREE.Box3().setFromObject(model);
  const modelCenter = modelBox.getCenter(new THREE.Vector3());
  const modelSize = modelBox.getSize(new THREE.Vector3());
  const modelHeight = modelSize.y;

  // Compute zoomed frustum so object fills ~95% of screen height
  const FRUSTUM_ZOOMED_CALC = modelHeight / 0.95;

  const defaultOrbitTarget = new THREE.Vector3(0, modelCenter.y, 0);
  const zoomedOrbitTarget = new THREE.Vector3(0, modelCenter.y, 0); // center on object
  const orbitTarget = defaultOrbitTarget.clone();
  let targetOrbitY = defaultOrbitTarget.y;
  const orbitRadius = 2.5;

  let currentAzimuth = 0;
  let targetAzimuth = 0;

  function toggleZoom() {
    zoomed = !zoomed;
    targetFrustum = zoomed ? FRUSTUM_ZOOMED_CALC : FRUSTUM_DEFAULT;
    targetOrbitY = zoomed ? zoomedOrbitTarget.y : defaultOrbitTarget.y;
    console.log('Zoom:', zoomed ? 'IN' : 'OUT', 'frustum:', targetFrustum.toFixed(2), 'modelHeight:', modelHeight.toFixed(2));
  }

  function updateCamera() {
    currentAzimuth += (targetAzimuth - currentAzimuth) * 0.1;
    currentElevation += (targetElevation - currentElevation) * 0.08;

    // Smooth zoom interpolation
    frustumSize += (targetFrustum - frustumSize) * 0.08;
    orbitTarget.y += (targetOrbitY - orbitTarget.y) * 0.08;
    const a = window.innerWidth / window.innerHeight;
    orthoCamera.left = -frustumSize * a / 2;
    orthoCamera.right = frustumSize * a / 2;
    orthoCamera.top = frustumSize / 2;
    orthoCamera.bottom = -frustumSize / 2;
    orthoCamera.updateProjectionMatrix();
    // For perspective camera, map frustum to FOV
    perspCamera.fov = frustumSize * (40 / FRUSTUM_DEFAULT);
    perspCamera.updateProjectionMatrix();

    camera.position.x = orbitTarget.x + orbitRadius * Math.sin(currentAzimuth) * Math.cos(currentElevation);
    camera.position.y = orbitTarget.y + orbitRadius * Math.sin(currentElevation);
    camera.position.z = orbitTarget.z + orbitRadius * Math.cos(currentAzimuth) * Math.cos(currentElevation);

    camera.lookAt(orbitTarget);
  }

  // --- View presets ---
  const viewList = ['Front', 'Right', 'Rear', 'Left', 'Isometric'];
  // ~60° instead of 90° so the wall stays visible from side views
  const viewAngles = { Front: 0, Right: -Math.PI / 3, Rear: Math.PI, Left: Math.PI / 3, Isometric: Math.PI / 4 };
  let viewIndex = 0;

  // Isometric uses a higher elevation; track target elevation for smooth lerp
  const ISO_ELEVATION = 0.55;
  const DEFAULT_ELEVATION = 0.15;
  let currentElevation = DEFAULT_ELEVATION;
  let targetElevation = DEFAULT_ELEVATION;

  function setView(name) {
    const a = viewAngles[name];
    if (a !== undefined) {
      targetAzimuth = a;
      targetElevation = name === 'Isometric' ? ISO_ELEVATION : DEFAULT_ELEVATION;
      viewIndex = viewList.indexOf(name);
    }
  }

  // Click: toggle part → cycle views (hotspots use marker dot click handlers)
  renderer.domElement.addEventListener('click', (e) => {
    if (tryTogglePart(e)) return;
    viewIndex = (viewIndex + 1) % viewList.length;
    setView(viewList[viewIndex]);
  });
  renderer.domElement.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (tryTogglePart(e)) return;
    viewIndex = (viewIndex - 1 + viewList.length) % viewList.length;
    setView(viewList[viewIndex]);
  });

  // Arrow keys to rotate, Z or ArrowUp/ArrowDown to zoom
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') {
      viewIndex = (viewIndex + 1) % viewList.length;
      setView(viewList[viewIndex]);
    } else if (e.key === 'ArrowLeft') {
      viewIndex = (viewIndex - 1 + viewList.length) % viewList.length;
      setView(viewList[viewIndex]);
    } else if (e.key === 'z' || e.key === 'Z' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      toggleZoom();
    } else if (e.key === 'e' || e.key === 'E') {
      exploded = !exploded;
      // Show all tags when exploding, hide when collapsing
      hotspotInstances.forEach((inst) => {
        inst.open = exploded;
        inst.tagEl.classList.toggle('visible', exploded);
      });
    }
  });

  // Double-click to toggle zoom
  renderer.domElement.addEventListener('dblclick', (e) => {
    e.preventDefault();
    toggleZoom();
  });

  // --- ScandinavianFilmShader (combined vignette / grain / CA / color grading) ---
  const ScandinavianFilmShader = {
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uVignette: { value: 1 },
      uVignetteAmount: { value: defaults.postprocessing.vignetteAmount },
      uGrain: { value: 1 },
      uGrainAmount: { value: defaults.postprocessing.grainAmount },
      uCA: { value: 1 },
      uCAAmount: { value: defaults.postprocessing.chromaticAberrationAmount },
      uColorGrading: { value: 1 },
      uMidSaturation: { value: defaults.postprocessing.midSaturation },
      uShadowWarmth: { value: defaults.postprocessing.shadowWarmth },
      uHighlightWarmth: { value: defaults.postprocessing.highlightWarmth },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float uVignette;
      uniform float uVignetteAmount;
      uniform float uGrain;
      uniform float uGrainAmount;
      uniform float uCA;
      uniform float uCAAmount;
      uniform float uColorGrading;
      uniform float uMidSaturation;
      uniform float uShadowWarmth;
      uniform float uHighlightWarmth;
      varying vec2 vUv;

      // Hash-based noise
      float hash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      void main() {
        vec2 uv = vUv;

        // --- Chromatic Aberration ---
        vec3 col;
        if (uCA > 0.5) {
          vec2 dir = uv - 0.5;
          float d = length(dir);
          vec2 offset = dir * d * uCAAmount;
          col.r = texture2D(tDiffuse, uv + offset).r;
          col.g = texture2D(tDiffuse, uv).g;
          col.b = texture2D(tDiffuse, uv - offset).b;
        } else {
          col = texture2D(tDiffuse, uv).rgb;
        }

        // --- Color Grading (warm shadows, desaturated mids, warm highlights) ---
        if (uColorGrading > 0.5) {
          float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
          // Desaturate midtones
          col = mix(vec3(luma), col, uMidSaturation);
          // Warm shadows (add warmth to dark areas)
          float shadowMask = 1.0 - smoothstep(0.0, 0.4, luma);
          col.r += shadowMask * uShadowWarmth;
          col.g += shadowMask * uShadowWarmth * 0.4;
          // Warm highlights
          float hiMask = smoothstep(0.6, 1.0, luma);
          col.r += hiMask * uHighlightWarmth;
          col.g += hiMask * uHighlightWarmth * 0.6;
        }

        // --- Film Grain ---
        if (uGrain > 0.5) {
          float n = hash(uv * 1000.0 + uTime * 100.0) - 0.5;
          col += n * uGrainAmount;
        }

        // --- Vignette ---
        if (uVignette > 0.5) {
          float d = distance(uv, vec2(0.5));
          float vig = smoothstep(0.7, 0.3, d * uVignetteAmount * 3.0);
          col *= mix(1.0, vig, uVignetteAmount);
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  };

  // --- Post-processing ---
  const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
    type: THREE.HalfFloatType,
    samples: 4,
  });
  const composer = new EffectComposer(renderer, renderTarget);
  composer.addPass(new RenderPass(scene, camera));

  // SSAO — subtle ambient occlusion for depth in crevices
  const ssaoPass = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
  ssaoPass.kernelRadius = 0.15;
  ssaoPass.minDistance = 0.0005;
  ssaoPass.maxDistance = 0.03;
  ssaoPass.intensity = 1.5;
  ssaoPass.enabled = false;
  composer.addPass(ssaoPass);

  // Depth of Field — BokehPass
  const bokehPass = new BokehPass(scene, camera, {
    focus: defaults.postprocessing.dofFocus,
    aperture: defaults.postprocessing.dofAperture,
    maxblur: defaults.postprocessing.dofMaxBlur,
  });
  bokehPass.enabled = defaults.postprocessing.dof;
  // Set ortho mode for default ortho camera
  bokehPass.materialBokeh.defines.PERSPECTIVE_CAMERA = cameraType === 'Perspective' ? 1 : 0;
  bokehPass.materialBokeh.needsUpdate = true;
  composer.addPass(bokehPass);

  // Bloom — subtle glow on specular highlights
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.12,  // strength — gentle
    0.4,   // radius
    0.9    // threshold — only brightest highlights
  );
  bloomPass.enabled = true;
  composer.addPass(bloomPass);

  // Scandinavian film look (vignette + grain + CA + color grading in one pass)
  const filmPass = new ShaderPass(ScandinavianFilmShader);
  filmPass.enabled = true;
  composer.addPass(filmPass);

  // SMAA anti-aliasing
  const smaaPass = new SMAAPass(window.innerWidth, window.innerHeight);
  smaaPass.enabled = defaults.postprocessing.smaa;
  composer.addPass(smaaPass);

  // Output pass for correct color space
  composer.addPass(new OutputPass());

  // --- Resize ---
  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const a = w / h;
    // Update both cameras
    orthoCamera.left = -frustumSize * a / 2;
    orthoCamera.right = frustumSize * a / 2;
    orthoCamera.top = frustumSize / 2;
    orthoCamera.bottom = -frustumSize / 2;
    orthoCamera.updateProjectionMatrix();
    perspCamera.aspect = a;
    perspCamera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    ssaoPass.setSize(w, h);
    bokehPass.renderTargetDepth.setSize(w, h);
  });

  // --- GUI ---
  const wipeDirections = {
    'Top → Down': 0, 'Bottom → Up': 1,
    'Left → Right': 2, 'Right → Left': 3,
    'Diagonal ↘': 4, 'Diagonal ↙': 5,
    'Isometric ↘': 6, 'Isometric ↙': 7,
  };
  createGUI({
    renderer, scene, camera, model,
    lights: { ambient, keyLight, fillLight, rimLight, bounceLight },
    groundPlane, grid, bloomPass, smaaPass, ssaoPass, bokehPass, filmPass,
    loadModel, setView, switchCamera,
    viewNames: viewList,
    wipeDirections,
    setWipeDirection: (v) => { wipeDirection = v; },
  });

  // --- Aesthetic contexts (scroll to switch) ---
  const C = THREE.Color, V = THREE.Vector3;
  const contexts = [
    { // 1 — Light oak shelf, warm white plaster wall, matte black brackets
      name: 'Scandinavian',
      plankTex: 'oak_veneer_01', wallTex: 'white_plaster_02',
      background: new C(0xf0ebe3),
      wall: new C(0xf0ebe3), wallRoughness: 0.95, wallMetalness: 0.0,
      plank: new C(0xc8a87c),
      plankRoughness: 0.65, plankMetalness: 0.0, plankClearcoat: 0.15,
      bracket: new C(0x222222), bracketRoughness: 0.4, bracketMetalness: 0.85,
      ambientIntensity: 0.4, ambientColor: new C(0xffffff),
      keyIntensity: 2.2, keyColor: new C(0xfff5e6), keyPos: new V(3, 4, 2),
      fillIntensity: 0.8, fillColor: new C(0x8899bb),
      rimIntensity: 1.2, rimColor: new C(0xffddaa),
      exposure: 1.1,
    },
    { // 2 — Polished white marble shelf, light grey wall, chrome brackets
      name: 'Marble',
      plankTex: 'marble_01', wallTex: 'grey_plaster_03',
      background: new C(0xe8eaef),
      wall: new C(0xe0e3e8), wallRoughness: 0.3, wallMetalness: 0.0,
      plank: new C(0xf2f2f8),
      plankRoughness: 0.08, plankMetalness: 0.0, plankClearcoat: 0.7, plankClearcoatRoughness: 0.15,
      bracket: new C(0xcccccc), bracketRoughness: 0.15, bracketMetalness: 0.95,
      ambientIntensity: 0.5, ambientColor: new C(0xeef0ff),
      keyIntensity: 1.8, keyColor: new C(0xffffff), keyPos: new V(4, 3, 3),
      fillIntensity: 0.7, fillColor: new C(0x99aacc),
      rimIntensity: 0.8, rimColor: new C(0xddeeff),
      exposure: 1.05,
    },
    { // 3 — Light concrete shelf, pale grey wall, brushed nickel brackets
      name: 'Minimal',
      plankTex: 'concrete_wall_003', wallTex: 'concrete_wall_003',
      background: new C(0xd8d8d8),
      wall: new C(0xd0d0d0), wallRoughness: 0.92, wallMetalness: 0.0,
      plank: new C(0xc0c0c0),
      plankRoughness: 0.95, plankMetalness: 0.0, plankClearcoat: 0.0,
      bracket: new C(0x999999), bracketRoughness: 0.35, bracketMetalness: 0.8,
      ambientIntensity: 0.45, ambientColor: new C(0xeeeeff),
      keyIntensity: 1.8, keyColor: new C(0xffffff), keyPos: new V(2, 5, 3),
      fillIntensity: 0.9, fillColor: new C(0xbbccdd),
      rimIntensity: 0.6, rimColor: new C(0xddddee),
      exposure: 1.1,
    },
    { // 4 — Rich walnut shelf, warm linen wall, brushed brass brackets
      name: 'Walnut',
      plankTex: 'walnut_veneer', wallTex: 'white_plaster_02',
      background: new C(0xe8e0d4),
      wall: new C(0xe4dcd0), wallRoughness: 0.88, wallMetalness: 0.0,
      plank: new C(0x5a3a22),
      plankRoughness: 0.5, plankMetalness: 0.0, plankClearcoat: 0.4,
      bracket: new C(0xb89860), bracketRoughness: 0.4, bracketMetalness: 0.8,
      ambientIntensity: 0.35, ambientColor: new C(0xfff8ee),
      keyIntensity: 2.0, keyColor: new C(0xfff0dd), keyPos: new V(3, 4, 2),
      fillIntensity: 0.6, fillColor: new C(0xbbaa88),
      rimIntensity: 1.0, rimColor: new C(0xeeddbb),
      exposure: 1.05,
    },
    { // 5 — Brushed stainless shelf, soft white wall, matching steel brackets
      name: 'Steel',
      plankTex: 'metal_plate', wallTex: 'grey_plaster_03',
      background: new C(0xe8e8ec),
      wall: new C(0xe0e0e5), wallRoughness: 0.6, wallMetalness: 0.0,
      plank: new C(0xb0b0b8),
      plankRoughness: 0.3, plankMetalness: 0.9, plankClearcoat: 0.1,
      bracket: new C(0x888890), bracketRoughness: 0.25, bracketMetalness: 0.92,
      ambientIntensity: 0.4, ambientColor: new C(0xeeeeff),
      keyIntensity: 2.0, keyColor: new C(0xffffff), keyPos: new V(3, 5, 1),
      fillIntensity: 0.6, fillColor: new C(0x99aabb),
      rimIntensity: 1.2, rimColor: new C(0xccddee),
      exposure: 1.15,
    },
    { // 6 — Warm terracotta shelf, cream stucco wall, dark bronze brackets
      name: 'Terracotta',
      plankTex: 'concrete_wall_003', wallTex: 'white_plaster_02',
      background: new C(0xece0d0),
      wall: new C(0xe8dcc8), wallRoughness: 0.9, wallMetalness: 0.0,
      plank: new C(0xc08060),
      plankRoughness: 0.85, plankMetalness: 0.0, plankClearcoat: 0.0,
      bracket: new C(0x4a3828), bracketRoughness: 0.5, bracketMetalness: 0.75,
      ambientIntensity: 0.4, ambientColor: new C(0xfff0dd),
      keyIntensity: 2.0, keyColor: new C(0xffeecc), keyPos: new V(4, 4, 2),
      fillIntensity: 0.6, fillColor: new C(0xccaa88),
      rimIntensity: 0.8, rimColor: new C(0xffddbb),
      exposure: 1.05,
    },
    { // 7 — Glossy black lacquer shelf, dark charcoal wall, gold brackets
      name: 'Noir',
      plankTex: 'dark_wood', wallTex: 'grey_plaster_03',
      background: new C(0x1a1a1a),
      wall: new C(0x151515), wallRoughness: 0.4, wallMetalness: 0.0,
      plank: new C(0x0e0e0e),
      plankRoughness: 0.05, plankMetalness: 0.0, plankClearcoat: 0.95, plankClearcoatRoughness: 0.1,
      bracket: new C(0xc8a050), bracketRoughness: 0.2, bracketMetalness: 0.95,
      ambientIntensity: 0.15, ambientColor: new C(0xffffff),
      keyIntensity: 2.8, keyColor: new C(0xfff0dd), keyPos: new V(4, 5, 1),
      fillIntensity: 0.2, fillColor: new C(0x333333),
      rimIntensity: 2.0, rimColor: new C(0xddaa44),
      exposure: 1.3,
    },
    { // 8 — White ceramic shelf, soft sage wall, copper brackets
      name: 'Sage',
      plankTex: 'marble_01', wallTex: 'white_plaster_02',
      background: new C(0xd8ddd4),
      wall: new C(0xd0d8cc), wallRoughness: 0.85, wallMetalness: 0.0,
      plank: new C(0xf0efea),
      plankRoughness: 0.2, plankMetalness: 0.0, plankClearcoat: 0.5, plankClearcoatRoughness: 0.25,
      bracket: new C(0xcc7744), bracketRoughness: 0.35, bracketMetalness: 0.88,
      ambientIntensity: 0.45, ambientColor: new C(0xf0f5ee),
      keyIntensity: 1.8, keyColor: new C(0xffffff), keyPos: new V(2, 4, 3),
      fillIntensity: 0.7, fillColor: new C(0x99aa88),
      rimIntensity: 0.9, rimColor: new C(0xffcc99),
      exposure: 1.1,
    },
    { // 9 — Light ash wood shelf, soft blush wall, rose gold brackets
      name: 'Blush',
      plankTex: 'oak_veneer_01', wallTex: 'white_plaster_02',
      background: new C(0xf0e0dd),
      wall: new C(0xecdad6), wallRoughness: 0.85, wallMetalness: 0.0,
      plank: new C(0xe0cbb5),
      plankRoughness: 0.6, plankMetalness: 0.0, plankClearcoat: 0.2,
      bracket: new C(0xcc9988), bracketRoughness: 0.3, bracketMetalness: 0.85,
      ambientIntensity: 0.45, ambientColor: new C(0xfff0ee),
      keyIntensity: 1.8, keyColor: new C(0xffeedd), keyPos: new V(3, 4, 2),
      fillIntensity: 0.7, fillColor: new C(0xddaaaa),
      rimIntensity: 0.9, rimColor: new C(0xffccbb),
      exposure: 1.1,
    },
    { // 10 — Smoked oak shelf, warm greige wall, oxidized brass brackets
      name: 'Gallery',
      plankTex: 'dark_wood', wallTex: 'grey_plaster_03',
      background: new C(0xe0dcd5),
      wall: new C(0xdad6ce), wallRoughness: 0.8, wallMetalness: 0.0,
      plank: new C(0x7a6a55),
      plankRoughness: 0.55, plankMetalness: 0.0, plankClearcoat: 0.3,
      bracket: new C(0x887755), bracketRoughness: 0.55, bracketMetalness: 0.7,
      ambientIntensity: 0.4, ambientColor: new C(0xfff5ee),
      keyIntensity: 1.8, keyColor: new C(0xfff8ee), keyPos: new V(3, 4, 2),
      fillIntensity: 0.6, fillColor: new C(0xbbaa88),
      rimIntensity: 0.8, rimColor: new C(0xddccaa),
      exposure: 1.05,
    },
  ];

  // --- Preload PBR textures from Polyhaven ---
  const textureNames = [...new Set(
    contexts.flatMap((ctx) => [ctx.plankTex, ctx.wallTex])
  )];

  progressText.textContent = 'loading textures...';

  const texLoader = new THREE.TextureLoader();
  function loadTex(url) {
    return new Promise((resolve, reject) => {
      texLoader.load(url, resolve, undefined, reject);
    });
  }

  const PLANK_REPEAT = new THREE.Vector2(4, 2);
  const WALL_REPEAT = new THREE.Vector2(12, 12);

  // Build separate texture sets for plank and wall so repeat values don't conflict
  // when the same texture name is used for both surfaces (e.g. concrete_wall_003)
  const plankTextures = {}; // { name: { diff, norm } }
  const wallTextures = {};  // { name: { diff, norm } }
  const rawCache = {};      // shared download cache

  let texLoaded = 0;
  await Promise.all(textureNames.map(async (name) => {
    const base = `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/${name}/${name}`;
    const [diff, norm] = await Promise.all([
      loadTex(`${base}_diff_1k.jpg`),
      loadTex(`${base}_nor_gl_1k.jpg`),
    ]);
    rawCache[name] = { diff, norm };
    texLoaded++;
    progressText.textContent = `loading textures... ${texLoaded}/${textureNames.length}`;
  }));

  function prepareTexSet(raw, repeat) {
    function configure(tex, isSRGB) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = isSRGB ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
      tex.repeat.copy(repeat);
      return tex;
    }
    return {
      diff: configure(raw.diff.clone(), true),
      norm: configure(raw.norm.clone(), false),
    };
  }

  textureNames.forEach((name) => {
    plankTextures[name] = prepareTexSet(rawCache[name], PLANK_REPEAT);
    wallTextures[name] = prepareTexSet(rawCache[name], WALL_REPEAT);
  });

  let contextIndex = 0;
  let targetIndex = 0;
  let wipeProgress = 0; // 0 = all old, 1 = all new

  function applyContextNow(ctx) {
    scene.background.copy(ctx.background);

    // Wall textures
    const wt = wallTextures[ctx.wallTex];
    wallMat.map = wt?.diff || null;
    wallMat.normalMap = wt?.norm || null;
    wallMat.normalScale.set(0.5, 0.5);
    wallMat.color.copy(ctx.wall);
    wallMat.roughness = ctx.wallRoughness ?? 0.95;
    wallMat.metalness = ctx.wallMetalness ?? 0.0;
    wallMat.needsUpdate = true;

    // Plank textures
    const pt = plankTextures[ctx.plankTex];
    woodMat.map = pt?.diff || null;
    woodMat.normalMap = pt?.norm || null;
    woodMat.normalScale.set(0.8, 0.8);
    woodMat.color.copy(ctx.plank);
    woodMat.roughness = ctx.plankRoughness;
    woodMat.metalness = ctx.plankMetalness ?? 0.0;
    woodMat.clearcoat = ctx.plankClearcoat ?? 0.15;
    woodMat.clearcoatRoughness = ctx.plankClearcoatRoughness ?? 0.4;
    woodMat.needsUpdate = true;

    bracketMat.color.copy(ctx.bracket);
    bracketMat.roughness = ctx.bracketRoughness ?? 0.4;
    bracketMat.metalness = ctx.bracketMetalness ?? 0.85;
    ambient.intensity = ctx.ambientIntensity;
    ambient.color.copy(ctx.ambientColor);
    keyLight.intensity = ctx.keyIntensity;
    keyLight.color.copy(ctx.keyColor);
    keyLight.position.copy(ctx.keyPos);
    fillLight.intensity = ctx.fillIntensity;
    fillLight.color.copy(ctx.fillColor);
    rimLight.intensity = ctx.rimIntensity;
    rimLight.color.copy(ctx.rimColor);
    renderer.toneMappingExposure = ctx.exposure;
  }

  // --- Curtain wipe setup ---
  const rtA = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
    type: THREE.HalfFloatType,
  });
  const rtB = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
    type: THREE.HalfFloatType,
  });

  // Wipe direction modes
  let wipeDirection = 0;

  const wipeMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tA: { value: null },
      tB: { value: null },
      progress: { value: 0 },
      direction: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tA;
      uniform sampler2D tB;
      uniform float progress;
      uniform int direction;
      varying vec2 vUv;
      void main() {
        float t;
        if (direction == 0)      t = 1.0 - vUv.y;                          // top → down
        else if (direction == 1) t = vUv.y;                                 // bottom → up
        else if (direction == 2) t = vUv.x;                                 // left → right
        else if (direction == 3) t = 1.0 - vUv.x;                          // right → left
        else if (direction == 4) t = (vUv.x + 1.0 - vUv.y) / 2.0;         // diagonal 45° TL → BR
        else if (direction == 5) t = (1.0 - vUv.x + 1.0 - vUv.y) / 2.0;   // diagonal 45° TR → BL
        else if (direction == 6) t = (vUv.x * 0.5 + (1.0 - vUv.y)) / 1.5; // iso: steep from TR corner
        else                     t = ((1.0 - vUv.x) * 0.5 + vUv.y) / 1.5; // iso reverse: from BL corner
        float mask = step(t, progress);
        gl_FragColor = mix(texture2D(tA, vUv), texture2D(tB, vUv), mask);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });

  const wipeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), wipeMaterial);
  const wipeScene = new THREE.Scene();
  wipeScene.add(wipeQuad);
  const wipeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // Scroll-driven curtain: wipeProgress is directly tied to scroll
  // Scrolling one full "page" (400px of deltaY) = one full context transition
  const SCROLL_PER_CONTEXT = 400;
  // scrollPosition tracks the continuous position: 0 = start of context 0, 1 = start of context 1, etc.
  let scrollPosition = 0;

  renderer.domElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY / SCROLL_PER_CONTEXT;
    scrollPosition = Math.max(0, Math.min(contexts.length - 1, scrollPosition + delta));
  }, { passive: false });

  // Generate dot indicators dynamically
  const dotsEl = document.getElementById('context-dots');
  if (dotsEl) {
    contexts.forEach((ctx, i) => {
      const dot = document.createElement('button');
      dot.className = 'dot' + (i === 0 ? ' active' : '');
      dot.setAttribute('aria-label', ctx.name);
      dot.addEventListener('click', () => { scrollPosition = i; });
      dotsEl.appendChild(dot);
    });
  }

  function updateDots(activeIdx) {
    if (!dotsEl) return;
    const dots = dotsEl.children;
    for (let i = 0; i < dots.length; i++) {
      dots[i].classList.toggle('active', i === activeIdx);
    }
    const label = document.getElementById('context-label');
    if (label) label.textContent = contexts[activeIdx].name;
  }

  // Update wipe render targets on resize
  window.addEventListener('resize', () => {
    rtA.setSize(window.innerWidth, window.innerHeight);
    rtB.setSize(window.innerWidth, window.innerHeight);
  });

  // --- Fade out loader ---
  overlay.classList.add('loaded');
  setTimeout(() => { overlay.style.display = 'none'; }, 600);

  // --- Render loop ---
  function animate() {
    requestAnimationFrame(animate);
    updateCamera();
    updateExplode();
    updateHotspotPositions();
    filmPass.uniforms.uTime.value = performance.now() * 0.001;

    const fromIdx = Math.floor(scrollPosition);
    const toIdx = Math.min(fromIdx + 1, contexts.length - 1);
    const t = scrollPosition - fromIdx; // 0–1 fractional between two contexts

    // Update dots to show nearest context
    updateDots(Math.round(scrollPosition));

    if (t > 0.001 && fromIdx !== toIdx) {
      // Mid-transition: render both contexts, composite with curtain
      applyContextNow(contexts[fromIdx]);
      renderer.setRenderTarget(rtA);
      renderer.render(scene, camera);

      applyContextNow(contexts[toIdx]);
      renderer.setRenderTarget(rtB);
      renderer.render(scene, camera);

      wipeMaterial.uniforms.tA.value = rtA.texture;
      wipeMaterial.uniforms.tB.value = rtB.texture;
      wipeMaterial.uniforms.progress.value = t;
      wipeMaterial.uniforms.direction.value = wipeDirection;
      renderer.setRenderTarget(null);
      renderer.render(wipeScene, wipeCamera);
    } else {
      // Settled on a context — use full post-processing
      applyContextNow(contexts[fromIdx]);
      composer.render();
    }
  }
  animate();
}

init().catch((err) => {
  console.error('Viewer init failed:', err);
  const text = document.getElementById('loading-text');
  if (text) text.textContent = 'failed to load — ' + err.message;
});
