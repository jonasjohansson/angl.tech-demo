import * as THREE from 'three';
import GUI from 'lil-gui';
import { defaults } from './config.js';

const TONE_MAPPINGS = {
  ACESFilmic: THREE.ACESFilmicToneMapping,
  Linear: THREE.LinearToneMapping,
  Reinhard: THREE.ReinhardToneMapping,
  Cineon: THREE.CineonToneMapping,
  AgX: THREE.AgXToneMapping,
  Neutral: THREE.NeutralToneMapping,
};

function updateMaterials(model, params) {
  if (!model) return;
  model.traverse((child) => {
    if (child.isMesh && child.material) {
      const mat = child.material;
      if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
        mat.metalness = params.metalness;
        mat.roughness = params.roughness;
        if (mat.isMeshPhysicalMaterial) {
          mat.clearcoat = params.clearcoat;
          mat.clearcoatRoughness = params.clearcoatRoughness;
        }
        mat.needsUpdate = true;
      }
    }
  });
}

export function createGUI(ctx) {
  const { renderer, scene, camera, controls, model, lights, groundPlane, grid, bloomPass, smaaPass, ssaoPass, loadModel } = ctx;

  let currentModel = model;
  const gui = new GUI({ title: 'ANGL Viewer' });

  const settings = {
    model: 'full',
    autoRotate: defaults.camera.autoRotate,
    wireframe: false,
    grid: defaults.scene.showGrid,
    ground: defaults.ground.visible,
    roughness: defaults.material.roughness,
    metalness: defaults.material.metalness,
    clearcoat: defaults.material.clearcoat,
    clearcoatRoughness: defaults.material.clearcoatRoughness,
    toneMapping: 'ACESFilmic',
    exposure: defaults.postprocessing.exposure,
    envIntensity: defaults.lighting.envIntensity,
    ambientIntensity: defaults.lighting.ambientIntensity,
    directIntensity: defaults.lighting.keyIntensity,
    fillIntensity: defaults.lighting.fillIntensity,
    rimIntensity: defaults.lighting.rimIntensity,
    bloom: defaults.postprocessing.bloom,
    bloomStrength: defaults.postprocessing.bloomStrength,
    bloomRadius: defaults.postprocessing.bloomRadius,
    bloomThreshold: defaults.postprocessing.bloomThreshold,
    smaa: defaults.postprocessing.smaa,
    ssao: false,
    ssaoIntensity: 1.0,
    ssaoRadius: 0.3,
  };

  // --- Display ---
  const display = gui.addFolder('Display');
  display.add(settings, 'model', ['optimized', 'full']).name('Model quality').onChange(async (v) => {
    currentModel = await loadModel(v);
  });
  display.add(settings, 'autoRotate').onChange(v => { controls.autoRotate = v; });
  display.add(settings, 'wireframe').onChange(v => {
    currentModel.traverse(c => { if (c.isMesh) c.material.wireframe = v; });
  });
  display.add(settings, 'grid').onChange(v => { grid.visible = v; });
  display.add(settings, 'ground').onChange(v => { groundPlane.visible = v; });

  // --- Material ---
  const mat = gui.addFolder('Material');
  mat.add(settings, 'roughness', 0, 1, 0.01).onChange(() => { updateMaterials(currentModel, settings); });
  mat.add(settings, 'metalness', 0, 1, 0.01).onChange(() => { updateMaterials(currentModel, settings); });
  mat.add(settings, 'clearcoat', 0, 1, 0.01).onChange(() => { updateMaterials(currentModel, settings); });
  mat.add(settings, 'clearcoatRoughness', 0, 1, 0.01).onChange(() => { updateMaterials(currentModel, settings); });

  // --- Lighting ---
  const light = gui.addFolder('Lighting');
  light.add(settings, 'toneMapping', Object.keys(TONE_MAPPINGS)).onChange(v => {
    renderer.toneMapping = TONE_MAPPINGS[v];
  });
  light.add(settings, 'exposure', 0.1, 3, 0.05).onChange(v => {
    renderer.toneMappingExposure = v;
  });
  light.add(settings, 'envIntensity', 0, 2, 0.05).onChange(v => {
    scene.environmentIntensity = v;
  });
  light.add(settings, 'ambientIntensity', 0, 3, 0.05).onChange(v => {
    lights.ambient.intensity = v;
  });
  light.add(settings, 'directIntensity', 0, 5, 0.1).onChange(v => {
    lights.keyLight.intensity = v;
  });
  light.add(settings, 'fillIntensity', 0, 3, 0.05).onChange(v => {
    lights.fillLight.intensity = v;
  });
  light.add(settings, 'rimIntensity', 0, 3, 0.05).onChange(v => {
    lights.rimLight.intensity = v;
  });

  // --- Post-processing ---
  const post = gui.addFolder('Post-processing');
  post.add(settings, 'ssao').name('SSAO').onChange(v => { ssaoPass.enabled = v; });
  post.add(settings, 'ssaoIntensity', 0, 3, 0.05).name('AO intensity').onChange(v => { ssaoPass.intensity = v; });
  post.add(settings, 'ssaoRadius', 0.01, 1, 0.01).name('AO radius').onChange(v => { ssaoPass.kernelRadius = v; });
  post.add(settings, 'bloom').onChange(v => { bloomPass.enabled = v; });
  post.add(settings, 'bloomStrength', 0, 1, 0.01).onChange(v => { bloomPass.strength = v; });
  post.add(settings, 'bloomRadius', 0, 1, 0.01).onChange(v => { bloomPass.radius = v; });
  post.add(settings, 'bloomThreshold', 0, 1.5, 0.01).onChange(v => { bloomPass.threshold = v; });
  post.add(settings, 'smaa').name('SMAA').onChange(v => { smaaPass.enabled = v; });

  // Close folders by default for compact look
  display.close();
  mat.close();
  light.close();
  post.close();

  return gui;
}
