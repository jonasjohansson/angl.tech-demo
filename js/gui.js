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
  const { renderer, scene, camera, model, lights, groundPlane, grid, bloomPass, smaaPass, ssaoPass, bokehPass, filmPass, flarePass, loadModel, setView, switchCamera, viewNames, wipeDirections, setWipeDirection, sway } = ctx;

  let currentModel = model;
  const gui = new GUI({ title: 'ANGL Viewer' });

  const settings = {
    model: 'full',
    wireframe: false,
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
    bloom: bloomPass.enabled,
    bloomStrength: bloomPass.strength,
    bloomRadius: bloomPass.radius,
    bloomThreshold: bloomPass.threshold,
    smaa: smaaPass.enabled,
    ssao: ssaoPass.enabled,
    ssaoIntensity: ssaoPass.intensity,
    ssaoRadius: ssaoPass.kernelRadius,
    // DoF
    dof: bokehPass.enabled,
    dofFocus: bokehPass.uniforms.focus.value,
    dofAperture: bokehPass.uniforms.aperture.value,
    dofMaxBlur: bokehPass.uniforms.maxblur.value,
    // Contact shadows
    contactShadows: renderer.shadowMap.enabled,
    // Film effects
    vignette: filmPass.uniforms.uVignette.value > 0.5,
    vignetteAmount: filmPass.uniforms.uVignetteAmount.value,
    grain: filmPass.uniforms.uGrain.value > 0.5,
    grainAmount: filmPass.uniforms.uGrainAmount.value,
    chromaticAberration: filmPass.uniforms.uCA.value > 0.5,
    chromaticAberrationAmount: filmPass.uniforms.uCAAmount.value,
    // Color grading
    colorGrading: filmPass.uniforms.uColorGrading.value > 0.5,
    midSaturation: filmPass.uniforms.uMidSaturation.value,
    shadowWarmth: filmPass.uniforms.uShadowWarmth.value,
    highlightWarmth: filmPass.uniforms.uHighlightWarmth.value,
    // Lens distortion
    lensDistortion: filmPass.uniforms.uLensDistortion.value > 0.5,
    lensDistortionAmount: filmPass.uniforms.uLensDistortionAmount.value,
    // Anamorphic flare
    anamorphicFlare: flarePass.uniforms.uEnabled.value > 0.5,
    flareThreshold: flarePass.uniforms.uThreshold.value,
    flareStrength: flarePass.uniforms.uStrength.value,
    // Camera sway
    cameraSway: sway.enabled,
  };

  // --- Display ---
  const display = gui.addFolder('Display');
  display.add(settings, 'model', ['optimized', 'full']).name('Model quality').onChange(async (v) => {
    currentModel = await loadModel(v);
  });
  display.add(settings, 'wireframe').onChange(v => {
    currentModel.traverse(c => { if (c.isMesh) c.material.wireframe = v; });
  });
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

  // --- Depth of Field ---
  const dofFolder = gui.addFolder('Depth of Field');
  dofFolder.add(settings, 'dof').name('Enable').onChange(v => { bokehPass.enabled = v; });
  dofFolder.add(settings, 'dofFocus', 0.1, 10, 0.1).name('Focus distance').onChange(v => { bokehPass.uniforms.focus.value = v; });
  dofFolder.add(settings, 'dofAperture', 0, 0.01, 0.0001).name('Aperture').onChange(v => { bokehPass.uniforms.aperture.value = v; });
  dofFolder.add(settings, 'dofMaxBlur', 0, 0.02, 0.0005).name('Max blur').onChange(v => { bokehPass.uniforms.maxblur.value = v; });
  dofFolder.close();

  // --- Contact Shadows ---
  post.add(settings, 'contactShadows').name('Contact shadows').onChange(v => {
    renderer.shadowMap.enabled = v;
    lights.keyLight.castShadow = v;
    renderer.shadowMap.needsUpdate = true;
  });

  // --- Film Effects ---
  const film = gui.addFolder('Film');
  film.add(settings, 'vignette').name('Vignette').onChange(v => { filmPass.uniforms.uVignette.value = v ? 1 : 0; });
  film.add(settings, 'vignetteAmount', 0, 1, 0.01).name('Vignette amount').onChange(v => { filmPass.uniforms.uVignetteAmount.value = v; });
  film.add(settings, 'grain').name('Film grain').onChange(v => { filmPass.uniforms.uGrain.value = v ? 1 : 0; });
  film.add(settings, 'grainAmount', 0, 0.2, 0.005).name('Grain amount').onChange(v => { filmPass.uniforms.uGrainAmount.value = v; });
  film.add(settings, 'chromaticAberration').name('Chromatic aberration').onChange(v => { filmPass.uniforms.uCA.value = v ? 1 : 0; });
  film.add(settings, 'chromaticAberrationAmount', 0, 0.01, 0.0001).name('CA amount').onChange(v => { filmPass.uniforms.uCAAmount.value = v; });
  film.add(settings, 'lensDistortion').name('Lens distortion').onChange(v => { filmPass.uniforms.uLensDistortion.value = v ? 1 : 0; });
  film.add(settings, 'lensDistortionAmount', 0, 0.15, 0.005).name('Distortion amount').onChange(v => { filmPass.uniforms.uLensDistortionAmount.value = v; });
  film.close();

  // --- Color Grading ---
  const grading = gui.addFolder('Color Grading');
  grading.add(settings, 'colorGrading').name('Enable').onChange(v => { filmPass.uniforms.uColorGrading.value = v ? 1 : 0; });
  grading.add(settings, 'midSaturation', 0, 1.5, 0.01).name('Mid saturation').onChange(v => { filmPass.uniforms.uMidSaturation.value = v; });
  grading.add(settings, 'shadowWarmth', 0, 0.5, 0.01).name('Shadow warmth').onChange(v => { filmPass.uniforms.uShadowWarmth.value = v; });
  grading.add(settings, 'highlightWarmth', 0, 0.5, 0.01).name('Highlight warmth').onChange(v => { filmPass.uniforms.uHighlightWarmth.value = v; });
  grading.close();

  // --- Anamorphic Flare ---
  const flare = gui.addFolder('Anamorphic Flare');
  flare.add(settings, 'anamorphicFlare').name('Enable').onChange(v => { flarePass.uniforms.uEnabled.value = v ? 1 : 0; });
  flare.add(settings, 'flareThreshold', 0.5, 1.0, 0.01).name('Threshold').onChange(v => { flarePass.uniforms.uThreshold.value = v; });
  flare.add(settings, 'flareStrength', 0, 0.5, 0.01).name('Strength').onChange(v => { flarePass.uniforms.uStrength.value = v; });
  flare.close();

  // --- Camera Sway ---
  post.add(settings, 'cameraSway').name('Camera sway').onChange(v => { sway.enabled = v; });

  // --- Transitions ---
  if (wipeDirections && setWipeDirection) {
    const trans = gui.addFolder('Transitions');
    const transSettings = { wipe: 'Right → Left' };
    trans.add(transSettings, 'wipe', Object.keys(wipeDirections)).name('Wipe direction').onChange(v => {
      setWipeDirection(wipeDirections[v]);
    });
    trans.close();
  }

  // --- Camera ---
  const cam = gui.addFolder('Camera');
  const camSettings = {
    projection: 'Orthographic',
    view: 'Front',
  };
  cam.add(camSettings, 'projection', ['Perspective', 'Orthographic']).name('Projection').onChange(v => {
    switchCamera(v);
  });
  cam.add(camSettings, 'view', viewNames).name('View').onChange(v => {
    setView(v);
  });

  // Close folders by default for compact look
  display.close();
  mat.close();
  light.close();
  post.close();
  dofFolder.close();
  film.close();
  grading.close();
  flare.close();
  cam.close();

  return gui;
}
