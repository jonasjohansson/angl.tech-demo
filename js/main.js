import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = defaults.postprocessing.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.physicallyCorrectLights = true;

  // --- Scene ---
  const scene = new THREE.Scene();

  // --- Camera ---
  const camera = new THREE.PerspectiveCamera(
    defaults.camera.fov,
    window.innerWidth / window.innerHeight,
    0.01,
    100
  );
  camera.position.set(
    defaults.camera.position.x,
    defaults.camera.position.y,
    defaults.camera.position.z
  );

  // --- Environment (HDR) — premium studio HDRI ---
  progressText.textContent = 'loading environment...';
  const hdrUrl = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/lebombo_2k.hdr';
  const envMap = await new RGBELoader().setDataType(THREE.FloatType).loadAsync(hdrUrl);
  envMap.mapping = THREE.EquirectangularReflectionMapping;

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  const envTexture = pmremGenerator.fromEquirectangular(envMap).texture;
  scene.environment = envTexture;
  scene.background = envTexture;
  scene.environmentIntensity = defaults.lighting.envIntensity;
  scene.backgroundIntensity = 0.25;
  scene.backgroundBlurriness = 0;
  pmremGenerator.dispose();
  envMap.dispose();

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
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(4096, 4096);
  keyLight.shadow.camera.near = 0.1;
  keyLight.shadow.camera.far = 15;
  keyLight.shadow.camera.left = -3;
  keyLight.shadow.camera.right = 3;
  keyLight.shadow.camera.top = 3;
  keyLight.shadow.camera.bottom = -3;
  keyLight.shadow.bias = -0.0003;
  keyLight.shadow.normalBias = 0.02;
  keyLight.shadow.radius = 3;
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

  const grid = new THREE.GridHelper(5, 20, 0x333333, 0x222222);
  grid.visible = defaults.scene.showGrid;
  scene.add(grid);

  // --- Model loader ---
  const MODEL_PATHS = {
    optimized: './models/ANGL-ASM-MAIN_REV-G_FULL_optimized.glb',
    full: './models/ANGL-ASM-MAIN_REV-G_FULL.glb',
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

  progressBar.style.width = '100%';
  progressText.textContent = 'initializing...';

  // --- Controls ---
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.autoRotate = defaults.camera.autoRotate;
  controls.autoRotateSpeed = defaults.camera.autoRotateSpeed;
  controls.minDistance = 0.05;
  controls.maxDistance = 20;
  controls.enablePan = true;
  const modelBox = new THREE.Box3().setFromObject(model);
  const modelCenter = modelBox.getCenter(new THREE.Vector3());
  controls.target.set(0, modelCenter.y, 0);
  controls.update();

  // --- Post-processing ---
  const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
    type: THREE.HalfFloatType,
    samples: 4,
  });
  const composer = new EffectComposer(renderer, renderTarget);
  composer.addPass(new RenderPass(scene, camera));

  // SSAO — subtle ambient occlusion for depth in crevices
  const ssaoPass = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
  ssaoPass.kernelRadius = 0.3;
  ssaoPass.minDistance = 0.0005;
  ssaoPass.maxDistance = 0.05;
  ssaoPass.intensity = 1.0;
  ssaoPass.enabled = false;
  composer.addPass(ssaoPass);

  // Bloom — off by default but available
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    defaults.postprocessing.bloomStrength,
    defaults.postprocessing.bloomRadius,
    defaults.postprocessing.bloomThreshold
  );
  bloomPass.enabled = defaults.postprocessing.bloom;
  composer.addPass(bloomPass);

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
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    ssaoPass.setSize(w, h);
  });

  // --- GUI ---
  createGUI({
    renderer, scene, camera, controls, model,
    lights: { ambient, keyLight, fillLight, rimLight, bounceLight },
    groundPlane, grid, bloomPass, smaaPass, ssaoPass,
    loadModel,
  });

  // --- Fade out loader ---
  overlay.classList.add('loaded');
  setTimeout(() => { overlay.style.display = 'none'; }, 600);

  // --- Render loop ---
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    composer.render();
  }
  animate();
}

init().catch((err) => {
  console.error('Viewer init failed:', err);
  const text = document.getElementById('loading-text');
  if (text) text.textContent = 'failed to load — ' + err.message;
});
