import * as THREE from 'three';
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

  // --- Renderer ---
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
  scene.background = new THREE.Color(0xc8c3bc);
  scene.environmentIntensity = defaults.lighting.envIntensity;

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
    composer.passes.forEach((pass) => {
      if (pass.camera) pass.camera = camera;
    });
    if (bokehPass) {
      const isPerspective = type === 'Perspective';
      bokehPass.materialBokeh.defines.PERSPECTIVE_CAMERA = isPerspective ? 1 : 0;
      bokehPass.materialBokeh.needsUpdate = true;
    }
  }

  // --- Lights ---
  const ambient = new THREE.AmbientLight(
    defaults.lighting.ambientColor, defaults.lighting.ambientIntensity
  );
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(
    defaults.lighting.keyColor, defaults.lighting.keyIntensity
  );
  keyLight.position.set(
    defaults.lighting.keyPosition.x,
    defaults.lighting.keyPosition.y,
    defaults.lighting.keyPosition.z
  );
  keyLight.castShadow = shadowDefaults.enabled;
  keyLight.shadow.mapSize.width = shadowDefaults.mapSize;
  keyLight.shadow.mapSize.height = shadowDefaults.mapSize;
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

  const fillLight = new THREE.PointLight(
    defaults.lighting.fillColor, defaults.lighting.fillIntensity, 20, 1.5
  );
  fillLight.position.set(
    defaults.lighting.fillPosition.x,
    defaults.lighting.fillPosition.y,
    defaults.lighting.fillPosition.z
  );
  scene.add(fillLight);

  const rimLight = new THREE.SpotLight(
    defaults.lighting.rimColor, defaults.lighting.rimIntensity, 30, Math.PI / 5, 0.6
  );
  rimLight.position.set(
    defaults.lighting.rimPosition.x,
    defaults.lighting.rimPosition.y,
    defaults.lighting.rimPosition.z
  );
  rimLight.target.position.set(0, 0.3, 0);
  scene.add(rimLight);
  scene.add(rimLight.target);

  const bounceLight = new THREE.PointLight('#334466', 0.3, 8, 2);
  bounceLight.position.set(0, -0.5, 0);
  scene.add(bounceLight);

  // --- Ground plane (shadow only) ---
  const groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.ShadowMaterial({ opacity: 0.25 })
  );
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.position.y = 0;
  groundPlane.receiveShadow = true;
  groundPlane.visible = defaults.ground.visible;
  scene.add(groundPlane);

  // --- Model loader ---
  const MODEL_PATHS = {
    optimized: '../models/ANGL-ASM-MAIN_REV-G_FULL_optimized.glb',
    full: '../models/ANGL-ASM-MAIN_REV-G_FULL.glb',
  };

  let currentModel = null;

  function loadModel(key) {
    return new Promise((resolve, reject) => {
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
      const loader = new GLTFLoader();
      loader.setDRACOLoader(dracoLoader);

      loader.load(
        MODEL_PATHS[key],
        (gltf) => {
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
          m.rotation.x = -Math.PI / 2;

          const box = new THREE.Box3().setFromObject(m);
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = 1.0 / maxDim;
          m.scale.setScalar(scale);

          const scaledBox = new THREE.Box3().setFromObject(m);
          const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
          m.position.x -= scaledCenter.x;
          m.position.z -= scaledCenter.z;
          m.position.y -= scaledBox.min.y;

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

  // --- HDRI environment ---
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

  progressBar.style.width = '100%';
  progressText.textContent = 'initializing...';

  // --- Camera orbit ---
  const modelBox = new THREE.Box3().setFromObject(model);
  const modelCenter = modelBox.getCenter(new THREE.Vector3());
  const modelSize = modelBox.getSize(new THREE.Vector3());
  const modelHeight = modelSize.y;
  const FRUSTUM_ZOOMED_CALC = modelHeight / 0.95;

  const orbitTarget = new THREE.Vector3(0, modelCenter.y, 0);
  let targetOrbitY = orbitTarget.y;
  const orbitRadius = 2.5;

  let currentAzimuth = 0;
  let targetAzimuth = 0;

  const ISO_ELEVATION = 0.55;
  const DEFAULT_ELEVATION = 0.15;
  let currentElevation = DEFAULT_ELEVATION;
  let targetElevation = DEFAULT_ELEVATION;

  function toggleZoom() {
    zoomed = !zoomed;
    targetFrustum = zoomed ? FRUSTUM_ZOOMED_CALC : FRUSTUM_DEFAULT;
    targetOrbitY = zoomed ? modelCenter.y : modelCenter.y;
  }

  function updateCamera() {
    currentAzimuth += (targetAzimuth - currentAzimuth) * 0.1;
    currentElevation += (targetElevation - currentElevation) * 0.08;

    frustumSize += (targetFrustum - frustumSize) * 0.08;
    orbitTarget.y += (targetOrbitY - orbitTarget.y) * 0.08;
    const a = window.innerWidth / window.innerHeight;
    orthoCamera.left = -frustumSize * a / 2;
    orthoCamera.right = frustumSize * a / 2;
    orthoCamera.top = frustumSize / 2;
    orthoCamera.bottom = -frustumSize / 2;
    orthoCamera.updateProjectionMatrix();
    perspCamera.fov = frustumSize * (40 / FRUSTUM_DEFAULT);
    perspCamera.updateProjectionMatrix();

    const az = currentAzimuth + swayAzOffset;
    const el = currentElevation + swayElOffset;
    camera.position.x = orbitTarget.x + orbitRadius * Math.sin(az) * Math.cos(el);
    camera.position.y = orbitTarget.y + orbitRadius * Math.sin(el);
    camera.position.z = orbitTarget.z + orbitRadius * Math.cos(az) * Math.cos(el);
    camera.lookAt(orbitTarget);
  }

  // --- Voxel grid wireframe (3×3×3 cell grid) ---
  const VOXEL_SPACING = Math.max(modelSize.x, modelSize.y, modelSize.z);
  const cubeCenter = new THREE.Vector3(0, modelCenter.y, 0);

  // Voxel cell labels (used to distinguish text-occupied dots)
  const voxelData = [
    { g: [0, 1, 1] }, { g: [0, -1, 1] },
    { g: [1, 1, 0] }, { g: [1, -1, 0] },
    { g: [-1, 1, 0] }, { g: [-1, -1, 0] },
    { g: [0, 1, -1] }, { g: [0, -1, -1] },
    { g: [0, 1, 0] },
    { g: [1, 1, 1] }, { g: [-1, -1, 1] },
  ];
  const textOccupiedSet = new Set(voxelData.map(v => v.g.join(',')));

  function buildVoxelViz() {
    const group = new THREE.Group();
    const S = VOXEL_SPACING;

    // Cell boundaries: 4 planes per axis → 3×3×3 cells
    // Center cell from -0.5S to +0.5S wraps the PC model
    const bounds = [-1.5, -0.5, 0.5, 1.5];

    // Lines: 144 segments (3 axes × 16 lines × 3 segments)
    const lp = [];
    for (const y of bounds) {
      for (const z of bounds) {
        for (let i = 0; i < bounds.length - 1; i++)
          lp.push(bounds[i] * S, y * S, z * S,
                   bounds[i + 1] * S, y * S, z * S);
      }
    }
    for (const x of bounds) {
      for (const z of bounds) {
        for (let i = 0; i < bounds.length - 1; i++)
          lp.push(x * S, bounds[i] * S, z * S,
                   x * S, bounds[i + 1] * S, z * S);
      }
    }
    for (const x of bounds) {
      for (const y of bounds) {
        for (let i = 0; i < bounds.length - 1; i++)
          lp.push(x * S, y * S, bounds[i] * S,
                   x * S, y * S, bounds[i + 1] * S);
      }
    }

    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0,
      depthTest: false, depthWrite: false,
    });
    group.add(new THREE.LineSegments(lineGeom, lineMat));

    // Dots: 27 points at cell centers (-1, 0, 1 in each axis)
    const centers = [-1, 0, 1];
    const dp = [], ds = [], da = [];
    for (const x of centers) {
      for (const y of centers) {
        for (const z of centers) {
          dp.push(x * S, y * S, z * S);
          if (x === 0 && y === 0 && z === 0) {
            ds.push(12.0); da.push(1.0);
          } else {
            ds.push(0.0); da.push(0.0);
          }
        }
      }
    }

    const dotGeom = new THREE.BufferGeometry();
    dotGeom.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
    dotGeom.setAttribute('aSize', new THREE.Float32BufferAttribute(ds, 1));
    dotGeom.setAttribute('aOpacity', new THREE.Float32BufferAttribute(da, 1));

    const dotMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0x000000) },
        uScale: { value: window.devicePixelRatio },
        uGlobalOpacity: { value: 0 },
      },
      vertexShader: /* glsl */`
        attribute float aSize;
        attribute float aOpacity;
        varying float vOpacity;
        uniform float uScale;
        void main() {
          vOpacity = aOpacity;
          gl_PointSize = aSize * uScale;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        uniform float uGlobalOpacity;
        varying float vOpacity;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float alpha = vOpacity * uGlobalOpacity * smoothstep(0.5, 0.35, d);
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true, depthTest: false, depthWrite: false,
    });
    group.add(new THREE.Points(dotGeom, dotMat));

    group.position.copy(cubeCenter);
    group.visible = false;
    return { group, lineMat, dotMat };
  }

  const voxelVizData = buildVoxelViz();
  scene.add(voxelVizData.group);

  let voxelVizEnabled = true; // visible by default in v3
  let voxelVizOpacity = 0;

  function updateVoxelViz() {
    const target = voxelVizEnabled ? 1 : 0;
    voxelVizOpacity += (target - voxelVizOpacity) * 0.08;
    if (voxelVizOpacity < 0.001) {
      voxelVizData.group.visible = false;
      return;
    }
    voxelVizData.group.visible = true;
    voxelVizData.lineMat.opacity = 1.0 * voxelVizOpacity;
    voxelVizData.dotMat.uniforms.uGlobalOpacity.value = voxelVizOpacity;
  }

  function updateVoxelVizColors(bgColor) {
    const lum = bgColor.r * 0.299 + bgColor.g * 0.587 + bgColor.b * 0.114;
    const col = lum < 0.45 ? 0xffffff : 0x000000;
    voxelVizData.lineMat.color.setHex(col);
    voxelVizData.dotMat.uniforms.uColor.value.setHex(col);
  }

  // Set initial color based on background
  updateVoxelVizColors(scene.background);

  // --- View presets ---
  const viewList = ['Front', 'Right', 'Rear', 'Left', 'Isometric'];
  const viewAngles = { Front: 0, Right: -Math.PI / 3, Rear: Math.PI, Left: Math.PI / 3, Isometric: Math.PI / 4 };
  let viewIndex = 0;

  function setView(name) {
    const a = viewAngles[name];
    if (a !== undefined) {
      targetAzimuth = a;
      targetElevation = name === 'Isometric' ? ISO_ELEVATION : DEFAULT_ELEVATION;
      viewIndex = viewList.indexOf(name);
    }
  }

  // --- Interaction ---
  renderer.domElement.addEventListener('click', () => {
    viewIndex = (viewIndex + 1) % viewList.length;
    setView(viewList[viewIndex]);
  });
  renderer.domElement.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    viewIndex = (viewIndex - 1 + viewList.length) % viewList.length;
    setView(viewList[viewIndex]);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') {
      viewIndex = (viewIndex + 1) % viewList.length;
      setView(viewList[viewIndex]);
    } else if (e.key === 'ArrowLeft') {
      viewIndex = (viewIndex - 1 + viewList.length) % viewList.length;
      setView(viewList[viewIndex]);
    } else if (e.key === 'z' || e.key === 'Z' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      toggleZoom();
    } else if (e.key === 'v' || e.key === 'V') {
      voxelVizEnabled = !voxelVizEnabled;
    }
  });

  renderer.domElement.addEventListener('dblclick', (e) => {
    e.preventDefault();
    toggleZoom();
  });

  // --- ScandinavianFilmShader ---
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
      uLensDistortion: { value: 1 },
      uLensDistortionAmount: { value: defaults.postprocessing.lensDistortionAmount ?? 0.03 },
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
      uniform float uLensDistortion;
      uniform float uLensDistortionAmount;
      varying vec2 vUv;

      float hash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      void main() {
        vec2 uv = vUv;
        if (uLensDistortion > 0.5) {
          vec2 centered = uv - 0.5;
          float r2 = dot(centered, centered);
          uv = 0.5 + centered * (1.0 + uLensDistortionAmount * r2);
        }
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
        if (uColorGrading > 0.5) {
          float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = mix(vec3(luma), col, uMidSaturation);
          float shadowMask = 1.0 - smoothstep(0.0, 0.4, luma);
          col.r += shadowMask * uShadowWarmth;
          col.g += shadowMask * uShadowWarmth * 0.4;
          float hiMask = smoothstep(0.6, 1.0, luma);
          col.r += hiMask * uHighlightWarmth;
          col.g += hiMask * uHighlightWarmth * 0.6;
        }
        if (uGrain > 0.5) {
          float n = hash(uv * 1000.0 + uTime * 100.0) - 0.5;
          col += n * uGrainAmount;
        }
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

  const ssaoPass = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
  ssaoPass.kernelRadius = 0.12;
  ssaoPass.minDistance = 0.0003;
  ssaoPass.maxDistance = 0.025;
  ssaoPass.intensity = 1.2;
  ssaoPass.enabled = false;
  composer.addPass(ssaoPass);

  const bokehPass = new BokehPass(scene, camera, {
    focus: defaults.postprocessing.dofFocus,
    aperture: defaults.postprocessing.dofAperture,
    maxblur: defaults.postprocessing.dofMaxBlur,
  });
  bokehPass.enabled = defaults.postprocessing.dof;
  bokehPass.materialBokeh.defines.PERSPECTIVE_CAMERA = cameraType === 'Perspective' ? 1 : 0;
  bokehPass.materialBokeh.needsUpdate = true;
  composer.addPass(bokehPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.12, 0.4, 0.9
  );
  bloomPass.enabled = true;
  composer.addPass(bloomPass);

  const filmPass = new ShaderPass(ScandinavianFilmShader);
  filmPass.enabled = true;
  composer.addPass(filmPass);

  // Anamorphic lens flare
  const AnamorphicFlareShader = {
    uniforms: {
      tDiffuse: { value: null },
      uEnabled: { value: 1 },
      uThreshold: { value: defaults.postprocessing.flareThreshold ?? 0.85 },
      uStrength: { value: defaults.postprocessing.flareStrength ?? 0.15 },
      uSteps: { value: defaults.postprocessing.flareSteps ?? 12 },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
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
      uniform float uEnabled;
      uniform float uThreshold;
      uniform float uStrength;
      uniform float uSteps;
      uniform vec2 uResolution;
      varying vec2 vUv;
      void main() {
        vec4 col = texture2D(tDiffuse, vUv);
        if (uEnabled < 0.5) { gl_FragColor = col; return; }
        float texelW = 1.0 / uResolution.x;
        vec3 streak = vec3(0.0);
        float total = 0.0;
        int steps = int(uSteps);
        for (int i = -24; i <= 24; i++) {
          if (i < -steps || i > steps) continue;
          float w = 1.0 - abs(float(i)) / uSteps;
          w *= w;
          vec3 s = texture2D(tDiffuse, vUv + vec2(float(i) * texelW * 3.0, 0.0)).rgb;
          float luma = dot(s, vec3(0.2126, 0.7152, 0.0722));
          float bright = max(0.0, luma - uThreshold);
          streak += s * bright * w;
          total += w;
        }
        streak /= total;
        streak *= vec3(0.8, 0.85, 1.2);
        gl_FragColor = vec4(col.rgb + streak * uStrength, col.a);
      }
    `,
  };
  const flarePass = new ShaderPass(AnamorphicFlareShader);
  flarePass.enabled = true;
  composer.addPass(flarePass);

  const smaaPass = new SMAAPass(window.innerWidth, window.innerHeight);
  smaaPass.enabled = defaults.postprocessing.smaa;
  composer.addPass(smaaPass);

  composer.addPass(new OutputPass());

  // --- Resize ---
  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const a = w / h;
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
    flarePass.uniforms.uResolution.value.set(w, h);
  });

  // --- Camera sway ---
  const swayDefaults = defaults.cameraSway || { enabled: true, azimuthAmount: 0.008, elevationAmount: 0.003, speed: 0.4 };
  let swayEnabled = swayDefaults.enabled;
  const swayAzimuth = swayDefaults.azimuthAmount;
  const swayElevation = swayDefaults.elevationAmount;
  const swaySpeed = swayDefaults.speed;
  let swayAzOffset = 0;
  let swayElOffset = 0;

  // --- GUI ---
  createGUI({
    renderer, scene, camera, model,
    lights: { ambient, keyLight, fillLight, rimLight, bounceLight },
    groundPlane, bloomPass, smaaPass, ssaoPass, bokehPass, filmPass, flarePass,
    loadModel, setView, switchCamera,
    viewNames: viewList,
    sway: {
      get enabled() { return swayEnabled; },
      set enabled(v) { swayEnabled = v; },
    },
    voxelViz: {
      get enabled() { return voxelVizEnabled; },
      set enabled(v) { voxelVizEnabled = v; },
    },
  });

  // --- Fade out loader ---
  overlay.classList.add('loaded');
  setTimeout(() => { overlay.style.display = 'none'; }, 600);

  // --- Render loop ---
  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now() * 0.001;
    filmPass.uniforms.uTime.value = now;

    if (swayEnabled) {
      swayAzOffset = Math.sin(now * swaySpeed) * swayAzimuth;
      swayElOffset = Math.sin(now * swaySpeed * 0.7 + 1.0) * swayElevation;
    } else {
      swayAzOffset = 0;
      swayElOffset = 0;
    }

    updateCamera();
    updateVoxelViz();
    updateVoxelVizColors(scene.background);
    composer.render();
  }
  animate();
}

init().catch((err) => {
  console.error('Viewer init failed:', err);
  const text = document.getElementById('loading-text');
  if (text) text.textContent = 'failed to load — ' + err.message;
});
