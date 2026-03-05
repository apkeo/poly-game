import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { apiUrl, apiBaseUrl } from '../config/api';
import { applyHandDrawnToMaterial, applyHandDrawnToObject3D } from './handDrawnStyle';

export interface AnimationOption {
  id: string;
  name: string;
  url: string;
}

export interface ModelViewerOptions {
  modelUrl: string;
  animationUrls?: AnimationOption[];
}

let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let characterRoot: THREE.Group;
let mixer: THREE.AnimationMixer;
let clock: THREE.Clock;
let currentAction: THREE.AnimationAction | null = null;
let animationClips: { name: string; clip: THREE.AnimationClip }[] = [];
let rafId: number;
let onAnimationsLoaded: ((names: string[]) => void) | null = null;

const WALK_SPEED = 2.2;
const RUN_SPEED = 5;
const CAMERA_RADIUS = 3.4;
const CAMERA_HEIGHT = 1.2;
const CAMERA_LERP = 0.12;
const MOUSE_SENSITIVITY = 0.004;
const PITCH_MIN = -1.1;
const PITCH_MAX = 1.1;

const ANIM_WALKING = 'Walking';
const ANIM_WALKING2 = 'Walking 2';
const ANIM_WAVE = 'Wave One Hand';

const keys = new Set<string>();
let cameraAngleY = 0;
let cameraPitch = 0;
/** Zapisany kąt kamery w momencie wciśnięcia Alt – ruch postaci w trybie free cam używa tego kąta. */
let savedCameraAngleY = 0;
let lastPointerX = 0;
let lastPointerY = 0;
let lastDesiredAnim: string | null | undefined = undefined;

function clearKeys(): void {
  keys.clear();
}

function hasMoveKey(): boolean {
  return keys.has('w') || keys.has('W') || keys.has('a') || keys.has('A') || keys.has('s') || keys.has('S') || keys.has('d') || keys.has('D')
    || keys.has('ArrowUp') || keys.has('ArrowDown') || keys.has('ArrowLeft') || keys.has('ArrowRight');
}

function isCameraFree(): boolean {
  return keys.has('Alt') || keys.has('AltLeft') || keys.has('AltRight');
}

function getDesiredAnimation(): string | null {
  if (keys.has('z') || keys.has('Z')) return ANIM_WAVE;
  if (hasMoveKey()) return keys.has('Shift') ? ANIM_WALKING2 : ANIM_WALKING;
  return null;
}

function animate() {
  rafId = requestAnimationFrame(animate);
  const dt = clock.getDelta();
  if (mixer) mixer.update(dt);

  const running = keys.has('Shift');
  const speed = (running ? RUN_SPEED : WALK_SPEED) * dt;
  const freeCam = isCameraFree();

  if (freeCam) {
    // Free cam = tylko kamera (mysz). Postać stoi w miejscu, żaden stan się nie zmienia.
  } else {
    const forwardX = -Math.sin(cameraAngleY);
    const forwardZ = -Math.cos(cameraAngleY);
    const rightX = Math.cos(cameraAngleY);
    const rightZ = -Math.sin(cameraAngleY);
    if (keys.has('w') || keys.has('W') || keys.has('ArrowUp')) {
      characterRoot.position.x += forwardX * speed;
      characterRoot.position.z += forwardZ * speed;
    }
    if (keys.has('s') || keys.has('S') || keys.has('ArrowDown')) {
      characterRoot.position.x -= forwardX * speed;
      characterRoot.position.z -= forwardZ * speed;
    }
    if (keys.has('a') || keys.has('A') || keys.has('ArrowLeft')) {
      characterRoot.position.x -= rightX * speed;
      characterRoot.position.z -= rightZ * speed;
    }
    if (keys.has('d') || keys.has('D') || keys.has('ArrowRight')) {
      characterRoot.position.x += rightX * speed;
      characterRoot.position.z += rightZ * speed;
    }
    characterRoot.rotation.y = cameraAngleY + Math.PI;
  }

  const desiredAnim = freeCam ? null : getDesiredAnimation();
  if (desiredAnim !== lastDesiredAnim) {
    if (desiredAnim === null) {
      setAnimation('');
    } else if (animationClips.some((a) => a.name === desiredAnim)) {
      setAnimation(desiredAnim);
    }
    lastDesiredAnim = desiredAnim;
  }

  const target = characterRoot.position.clone().add(new THREE.Vector3(0, 1, 0));
  const cp = Math.cos(cameraPitch);
  const sp = Math.sin(cameraPitch);
  const desiredPos = new THREE.Vector3(
    characterRoot.position.x + CAMERA_RADIUS * cp * Math.sin(cameraAngleY),
    characterRoot.position.y + CAMERA_HEIGHT + CAMERA_RADIUS * sp,
    characterRoot.position.z + CAMERA_RADIUS * cp * Math.cos(cameraAngleY)
  );
  camera.position.lerp(desiredPos, CAMERA_LERP);
  camera.lookAt(target);

  renderer?.render(scene, camera);
}

const log = (msg: string, data?: object) => {
  console.log(`[ModelViewer] ${msg}`, data ?? '');
};

/** Seeded PRNG (Mulberry32) – stable between frames for same seed. */
function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0; // 32-bit
    return ((state >>> 0) % 0x100000000) / 0x100000000;
  };
}

const GRASS_SEED = 0x7a3c9f;
const GRASS_SIZE = 80;
const GRASS_SEGMENTS = 80;
const GRASS_HEIGHT_RANGE = 0.04;

const SKY_COLOR = 0x9dd4f0;
const FOG_NEAR = 28;
const FOG_FAR = 55;

const GREEN_PALETTE = [
  0x1b3d1b, 0x234d23, 0x2a5c2a, 0x326b32, 0x3a7a3a, 0x428942, 0x4a984a,
  0x52a752, 0x2d501e, 0x365a24, 0x3f6b28, 0x487c2c, 0x518d30, 0x5a9e34,
  0x63af38, 0x6cc03c, 0x1e4620, 0x255428, 0x2c6230, 0x337038, 0x3a7e40,
  0x418c48, 0x489a50, 0x4fa858, 0x3d6b2a, 0x457a30, 0x4d8936,
];

/** Low-poly grass: large grid, seeded random for heights and colors (stable per frame). Top face visible. */
function createGrassLayer(
  size: number,
  segments: number,
  heightRange: number,
  seed: number
): THREE.Mesh {
  const rnd = createSeededRandom(seed);
  const step = size / segments;
  const half = size / 2;
  const n = segments + 1;
  const heights: number[][] = [];
  for (let iz = 0; iz < n; iz++) {
    heights.push([]);
    for (let ix = 0; ix < n; ix++) {
      heights[iz][ix] = (rnd() * 2 - 1) * heightRange;
    }
  }
  const vertices: number[] = [];
  const colors: number[] = [];
  const yAt = (ix: number, iz: number) => heights[iz][ix];
  for (let iz = 0; iz < segments; iz++) {
    for (let ix = 0; ix < segments; ix++) {
      const x0 = -half + ix * step;
      const z0 = -half + iz * step;
      const x1 = x0 + step;
      const z1 = z0 + step;
      const colorIndex = Math.floor(rnd() * GREEN_PALETTE.length);
      const green = GREEN_PALETTE[colorIndex];
      const r = ((green >> 16) & 0xff) / 255;
      const g = ((green >> 8) & 0xff) / 255;
      const b = (green & 0xff) / 255;
      const pushTri = (
        ax: number, ay: number, az: number,
        bx: number, by: number, bz: number,
        cx: number, cy: number, cz: number
      ) => {
        vertices.push(ax, ay, az, bx, by, bz, cx, cy, cz);
        colors.push(r, g, b, r, g, b, r, g, b);
      };
      pushTri(x0, yAt(ix, iz), z0, x0, yAt(ix, iz + 1), z1, x1, yAt(ix + 1, iz), z0);
      pushTri(x1, yAt(ix + 1, iz), z0, x0, yAt(ix, iz + 1), z1, x1, yAt(ix + 1, iz + 1), z1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    side: THREE.FrontSide,
  });
  applyHandDrawnToMaterial(material);
  const grass = new THREE.Mesh(geometry, material);
  grass.position.y = 0;
  grass.receiveShadow = true;
  return grass;
}

function loadGlbAnimations(url: string, manager?: THREE.LoadingManager): Promise<THREE.AnimationClip[]> {
  return new Promise((resolve, reject) => {
    const loader = manager ? new GLTFLoader(manager) : new GLTFLoader();
    loader.load(
      url,
      (gltf: { animations?: THREE.AnimationClip[] }) => resolve(gltf.animations ?? []),
      undefined,
      (err: unknown) => reject(err)
    );
  });
}

export function initViewer(
  container: HTMLElement,
  options: ModelViewerOptions,
  onLoaded: (animationNames: string[]) => void
): void {
  const { modelUrl, animationUrls = [] } = options;
  log('initViewer', { modelUrl, animationsCount: animationUrls.length });
  onAnimationsLoaded = onLoaded;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_COLOR);
  scene.fog = new THREE.Fog(SKY_COLOR, FOG_NEAR, FOG_FAR);
  scene.environment = null;

  const width = container.clientWidth;
  const height = container.clientHeight;
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.set(0, 1.2, 2.8);

  characterRoot = new THREE.Group();
  characterRoot.position.set(0, 0, 0);
  scene.add(characterRoot);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  const onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === 'w' || k === 'a' || k === 's' || k === 'd' || k === 'z' || e.key === 'Shift' || e.key === 'Alt'
        || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.preventDefault();
    if ((e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight') && !e.repeat) savedCameraAngleY = cameraAngleY;
    keys.add(e.key);
    if (e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight') keys.add('Alt');
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.key);
    if (e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight') keys.delete('Alt');
  };
  const onWindowBlur = () => clearKeys();
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onWindowBlur);

  const canvas = renderer.domElement;
  const onPointerEnter = (e: PointerEvent) => {
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
  };
  const onPointerMove = (e: PointerEvent) => {
    let dx: number;
    let dy: number;
    if (document.pointerLockElement === canvas) {
      dx = e.movementX;
      dy = e.movementY;
    } else {
      dx = e.clientX - lastPointerX;
      dy = e.clientY - lastPointerY;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
    }
    cameraAngleY -= dx * MOUSE_SENSITIVITY;
    cameraPitch += dy * MOUSE_SENSITIVITY;
    cameraPitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, cameraPitch));
  };
  const onPointerDown = (e: PointerEvent) => {
    if (e.button === 0) canvas.requestPointerLock();
  };
  canvas.addEventListener('pointerenter', onPointerEnter);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);

  (container as HTMLElement & { _modelViewerKeyCleanup?: () => void })._modelViewerKeyCleanup = () => {
    document.exitPointerLock();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onWindowBlur);
    canvas.removeEventListener('pointerenter', onPointerEnter);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerdown', onPointerDown);
  };

  const ambient = new THREE.AmbientLight(0xffffff, 0.45);
  scene.add(ambient);
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(3, 6, 4);
  dir.castShadow = true;
  dir.shadow.mapSize.width = 2048;
  dir.shadow.mapSize.height = 2048;
  dir.shadow.camera.near = 0.5;
  dir.shadow.camera.far = 50;
  dir.shadow.camera.left = -GRASS_SIZE / 2 - 5;
  dir.shadow.camera.right = GRASS_SIZE / 2 + 5;
  dir.shadow.camera.top = GRASS_SIZE / 2 + 5;
  dir.shadow.camera.bottom = -GRASS_SIZE / 2 - 5;
  dir.shadow.bias = -0.0001;
  dir.shadow.normalBias = 0.02;
  scene.add(dir);

  const grass = createGrassLayer(GRASS_SIZE, GRASS_SEGMENTS, GRASS_HEIGHT_RANGE, GRASS_SEED);
  scene.add(grass);

  clock = new THREE.Clock();
  animationClips = [];
  currentAction = null;
  lastDesiredAnim = null;
  cameraAngleY = 0;
  cameraPitch = 0;
  savedCameraAngleY = 0;

  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url: string) => {
    if (typeof url !== 'string' || url.startsWith('blob:')) return url;
    try {
      const u = new URL(url, typeof window !== 'undefined' ? window.location.href : 'http://localhost');
      const pageOrigin = typeof window !== 'undefined' ? window.location.origin : '';
      if (u.origin === pageOrigin) return url;
      if (apiBaseUrl) {
        const backendOrigin = new URL(apiBaseUrl).origin;
        if (u.origin === backendOrigin) return url;
      }
      return `${apiUrl('proxy-asset')}?url=${encodeURIComponent(url)}`;
    } catch {
      return url;
    }
  });

  const loader = new GLTFLoader(manager);
  log('GLTFLoader.load model', { modelUrl });
  loader.load(
    modelUrl,
    async (gltf: { scene: THREE.Group; animations?: THREE.AnimationClip[] }) => {
      const model = gltf.scene;
      model.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
        if (mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m) => {
            if (m.map) {
              m.map.colorSpace = THREE.SRGBColorSpace;
              m.map.needsUpdate = true;
            }
            applyHandDrawnToMaterial(m);
          });
        }
      });
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      model.position.sub(center);
      model.position.y += size.y / 2;
      characterRoot.add(model);
      applyHandDrawnToObject3D(model);

      mixer = new THREE.AnimationMixer(model);
      const names: string[] = [];

      if (gltf.animations?.length) {
        gltf.animations.forEach((clip: THREE.AnimationClip) => {
          animationClips.push({ name: clip.name || `anim_${animationClips.length}`, clip });
          names.push(animationClips[animationClips.length - 1].name);
        });
      }

      for (const anim of animationUrls) {
        try {
          const clips = await loadGlbAnimations(anim.url, manager);
          clips.forEach((clip) => animationClips.push({ name: anim.name, clip }));
          if (clips.length) names.push(anim.name);
        } catch (e) {
          log('Animation load failed', { name: anim.name, err: e });
        }
      }

      const finalNames = names.length ? [...new Set(names)] : animationClips.map((a) => a.name);
      onAnimationsLoaded?.(finalNames);
      lastDesiredAnim = null;
      animate();
    },
    (progress: { loaded: number; total?: number }) => {
      if (progress.total) log('GLTFLoader progress', { loaded: progress.loaded, total: progress.total });
    },
    (err: unknown) => {
      log('GLTFLoader.load error', { err, message: (err as Error)?.message });
      onAnimationsLoaded?.([]);
      animate();
    }
  );

  const onResize = (): void => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener('resize', onResize);
  (container as HTMLElement & { _modelViewerResize?: () => void })._modelViewerResize = onResize;
}

const CROSSFADE_DURATION = 0.35;

export function setAnimation(name: string): void {
  if (!mixer) return;
  if (!name) {
    if (currentAction) {
      currentAction.fadeOut(CROSSFADE_DURATION);
      currentAction = null;
    }
    return;
  }
  const entry = animationClips.find((a) => a.name === name);
  if (!entry) return;
  const newAction = mixer.clipAction(entry.clip);
  newAction.reset().setLoop(THREE.LoopRepeat, Infinity);
  newAction.clampWhenFinished = false;
  if (currentAction) {
    currentAction.crossFadeTo(newAction, CROSSFADE_DURATION);
    newAction.fadeIn(CROSSFADE_DURATION).play();
  } else {
    newAction.fadeIn(CROSSFADE_DURATION).play();
  }
  currentAction = newAction;
}

export function disposeViewer(): void {
  document.exitPointerLock();
  cancelAnimationFrame(rafId);
  const container = renderer?.domElement?.parentElement as (HTMLElement & {
    _modelViewerResize?: () => void;
    _modelViewerKeyCleanup?: () => void;
  }) | null;
  if (container?._modelViewerResize) {
    window.removeEventListener('resize', container._modelViewerResize);
    container._modelViewerResize = undefined;
  }
  container?._modelViewerKeyCleanup?.();
  renderer?.dispose();
  scene?.clear();
  mixer = null!;
  currentAction = null;
  animationClips = [];
  onAnimationsLoaded = null;
}
