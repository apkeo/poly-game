import * as THREE from 'three';

const patchedMaterials = new WeakSet<THREE.Material>();
let hatchTexture: THREE.CanvasTexture | null = null;
let paperTexture: THREE.CanvasTexture | null = null;

function makeHatchTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(32, 25, 16, 0.22)';
  ctx.lineWidth = 2;
  for (let i = -size; i < size * 2; i += 14) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i - size, size);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(32, 25, 16, 0.12)';
  ctx.lineWidth = 1;
  for (let i = -size; i < size * 2; i += 22) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + size, size);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function makePaperTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.fillStyle = '#f5efe4';
  ctx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = 230 + Math.floor((Math.random() - 0.5) * 34);
      ctx.fillStyle = `rgb(${n}, ${n - 3}, ${n - 10})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  ctx.strokeStyle = 'rgba(115, 92, 57, 0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 28; i++) {
    const y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.quadraticCurveTo(size * 0.45, y + (Math.random() - 0.5) * 6, size, y + (Math.random() - 0.5) * 3);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function getHatchTexture(): THREE.CanvasTexture {
  if (!hatchTexture) hatchTexture = makeHatchTexture();
  return hatchTexture;
}

function getPaperTexture(): THREE.CanvasTexture {
  if (!paperTexture) paperTexture = makePaperTexture();
  return paperTexture;
}

function patchShader(shader: THREE.Shader): void {
  shader.uniforms.uHandHatchMap = { value: getHatchTexture() };
  shader.uniforms.uHandPaperMap = { value: getPaperTexture() };
  shader.uniforms.uHandHatchScale = { value: 0.0034 };
  shader.uniforms.uHandPaperScale = { value: 0.0021 };
  shader.uniforms.uHandInkStrength = { value: 0.24 };

  if (!shader.fragmentShader.includes('uHandHatchMap')) {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
uniform sampler2D uHandHatchMap;
uniform sampler2D uHandPaperMap;
uniform float uHandHatchScale;
uniform float uHandPaperScale;
uniform float uHandInkStrength;
`
    );
  }

  if (shader.fragmentShader.includes('#include <dithering_fragment>')) {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `
float handHatchA = texture2D(uHandHatchMap, gl_FragCoord.xy * uHandHatchScale).r;
float handHatchB = texture2D(uHandHatchMap, gl_FragCoord.yx * (uHandHatchScale * 1.37)).r;
float handPaper = texture2D(uHandPaperMap, gl_FragCoord.xy * uHandPaperScale).r;
float handInk = mix(1.0 - uHandInkStrength, 1.0, handHatchA * 0.7 + handHatchB * 0.3);
float handPaperLift = mix(0.93, 1.05, handPaper);
gl_FragColor.rgb *= handInk * handPaperLift;
#include <dithering_fragment>
`
    );
  }
}

export function applyHandDrawnToMaterial(material: THREE.Material | null | undefined): void {
  if (!material || patchedMaterials.has(material)) return;
  patchedMaterials.add(material);

  const baseOnBeforeCompile = material.onBeforeCompile?.bind(material);
  material.onBeforeCompile = (shader: THREE.Shader, renderer: THREE.WebGLRenderer) => {
    baseOnBeforeCompile?.(shader, renderer);
    patchShader(shader);
  };
  material.needsUpdate = true;
}

export function applyHandDrawnToObject3D(object: THREE.Object3D): void {
  object.traverse((obj) => {
    const mesh = obj as THREE.Mesh & { material?: THREE.Material | THREE.Material[] };
    if (!mesh.material) return;
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((m) => applyHandDrawnToMaterial(m));
    } else {
      applyHandDrawnToMaterial(mesh.material);
    }
  });
}
