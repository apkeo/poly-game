import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { apiUrl, apiBaseUrl, assetUrl } from '../config/api';
import { applyHandDrawnToMaterial, applyHandDrawnToObject3D } from './handDrawnStyle';

const ANIM_WALKING = 'Walking';
const ANIM_WALKING2 = 'Walking 2';
const ANIM_WAVE = 'Wave One Hand';
const ANIM_THROW = 'Mage Soul Cast 4';
const WALK_SPEED = 2.2;
const RUN_SPEED = 5;
const CAMERA_RADIUS = 3.4;
const CAMERA_HEIGHT = 1.2;
const CAMERA_LERP = 0.12;
const MOUSE_SENSITIVITY = 0.004;
const PITCH_MIN = -1.1;
const PITCH_MAX = 1.1;
const CROSSFADE_DURATION = 0.35;
const SNOWBALL_SPEED = 25;
const STATE_SEND_INTERVAL_MS = 50;
const GRASS_SIZE = 80;
const GRASS_SEGMENTS = 80;
const GRASS_HEIGHT_RANGE = 0.04;
const GRASS_SEED = 0x7a3c9f;
const SKY_COLOR = 0x9dd4f0;
const FOG_NEAR = 28;
const FOG_FAR = 55;

export interface GameViewerOptions {
  modelUrl: string;
  animationUrls?: { id: string; name: string; url: string }[];
}

export interface GameStateOut {
  position: [number, number, number];
  rotationY: number;
  animation: string;
}

export interface OtherPlayer {
  socketId: string;
  characterId: string;
  position: [number, number, number];
  rotationY: number;
  animation: string;
  hp: number;
  modelUrl: string;
  animationUrls?: { id: string; name: string; url: string }[];
}

export interface SnowballState {
  id: string;
  fromSocketId: string;
  position: [number, number, number];
  direction: [number, number, number];
  startTime: number;
}

export interface HitEvent {
  position: [number, number, number];
}

export type GameViewerCallbacks = {
  onState: (state: GameStateOut) => void;
  onThrow: (position: [number, number, number], direction: [number, number, number]) => void;
  canThrow?: () => boolean;
};

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    return ((state >>> 0) % 0x100000000) / 0x100000000;
  };
}

const GREEN_PALETTE = [
  0x1b3d1b, 0x234d23, 0x2a5c2a, 0x326b32, 0x3a7a3a, 0x428942, 0x4a984a,
  0x52a752, 0x2d501e, 0x365a24, 0x3f6b28, 0x487c2c, 0x518d30, 0x5a9e34,
];

function createGrassLayer(size: number, segments: number, heightRange: number, seed: number): THREE.Mesh {
  const rnd = createSeededRandom(seed);
  const step = size / segments;
  const half = size / 2;
  const n = segments + 1;
  const heights: number[][] = [];
  for (let iz = 0; iz < n; iz++) {
    heights.push([]);
    for (let ix = 0; ix < n; ix++) heights[iz][ix] = (rnd() * 2 - 1) * heightRange;
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
      const c = GREEN_PALETTE[Math.floor(rnd() * GREEN_PALETTE.length)];
      const r = ((c >> 16) & 0xff) / 255, g = ((c >> 8) & 0xff) / 255, b = (c & 0xff) / 255;
      const pushTri = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) => {
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
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.FrontSide });
  applyHandDrawnToMaterial(material);
  const grass = new THREE.Mesh(geometry, material);
  grass.receiveShadow = true;
  return grass;
}

function makeLoaderManager(): THREE.LoadingManager {
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url: string) => {
    if (typeof url !== 'string' || url.startsWith('blob:')) return url;
    try {
      const u = new URL(url, window.location.href);
      if (u.origin === window.location.origin) return url;
      if (apiBaseUrl && new URL(apiBaseUrl).origin === u.origin) return url;
      return `${apiUrl('proxy-asset')}?url=${encodeURIComponent(url)}`;
    } catch { return url; }
  });
  return manager;
}

function loadGlbAnimations(url: string, manager?: THREE.LoadingManager): Promise<THREE.AnimationClip[]> {
  return new Promise((resolve, reject) => {
    const m = manager ?? makeLoaderManager();
    const loader = new GLTFLoader(m);
    loader.load(url, (gltf: { animations?: THREE.AnimationClip[] }) => resolve(gltf.animations ?? []), undefined, (e: unknown) => reject(e));
  });
}

let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let characterRoot: THREE.Group;
let mixer: THREE.AnimationMixer;
let clock: THREE.Clock;
let currentAction: THREE.AnimationAction | null = null;
let throwAction: THREE.AnimationAction | null = null;
let animationClips: { name: string; clip: THREE.AnimationClip }[] = [];
let rafId: number;
const pressedCodes = new Set<string>();
let cameraAngleY = 0;
let cameraPitch = 0;

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el || typeof (el as HTMLElement).tagName === 'undefined') return false;
  const tag = (el as HTMLElement).tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).contentEditable === 'true';
}

function clearKeys(): void {
  pressedCodes.clear();
}
let lastPointerX = 0;
let lastPointerY = 0;
let lastDesiredAnim: string | null = null;
let lastStateSend = 0;
let callbacks: GameViewerCallbacks | null = null;
let otherPlayersData: OtherPlayer[] = [];
let snowballsData: SnowballState[] = [];
let hitEvents: HitEvent[] = [];
const otherMeshes = new Map<string, THREE.Group>();
const otherMixers = new Map<string, THREE.AnimationMixer>();
const otherClipMaps = new Map<string, Map<string, THREE.AnimationClip>>();
const otherCurrentAnim = new Map<string, string>();
const otherCurrentAction = new Map<string, THREE.AnimationAction>();
/** Żeby nie wywoływać loadRemotePlayer setki razy (game:state ~60/s) zanim pierwszy load się skończy. */
const loadingRemoteSocketIds = new Set<string>();
/** Grace period zanim usuniemy gracza po tym jak zniknął z listy (unikamy migania przy opóźnieniach pakietów). */
const REMOVE_PLAYER_GRACE_MS = 1200;
const missingSince = new Map<string, number>();
/** Interpolowana pozycja/rotacja innych graczy (lerp do targetu z serwera). */
const otherDisplayState = new Map<string, { x: number; y: number; z: number; rotationY: number }>();
const OTHER_TAU_SEC = 0.08;
const OTHER_SNAP_DIST = 6;
const snowballMeshes = new Map<string, THREE.Mesh>();
const particleSystems: { mesh: THREE.Points; birth: number }[] = [];
const characterCache = new Map<string, { template: THREE.Group; clipMap: Map<string, THREE.AnimationClip> }>();
const screenshotResolvers: Array<(dataUrl: string | null) => void> = [];

function hasMoveKey(): boolean {
  return (
    pressedCodes.has('KeyW') ||
    pressedCodes.has('KeyA') ||
    pressedCodes.has('KeyS') ||
    pressedCodes.has('KeyD') ||
    pressedCodes.has('ArrowUp') ||
    pressedCodes.has('ArrowDown') ||
    pressedCodes.has('ArrowLeft') ||
    pressedCodes.has('ArrowRight')
  );
}

function getDesiredAnimation(): string | null {
  if (pressedCodes.has('KeyZ')) return ANIM_WAVE;
  if (hasMoveKey()) return (pressedCodes.has('ShiftLeft') || pressedCodes.has('ShiftRight')) ? ANIM_WALKING2 : ANIM_WALKING;
  return null;
}

export function initGameViewer(
  container: HTMLElement,
  options: GameViewerOptions,
  cb: GameViewerCallbacks
): void {
  callbacks = cb;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_COLOR);
  scene.fog = new THREE.Fog(SKY_COLOR, FOG_NEAR, FOG_FAR);
  const width = container.clientWidth;
  const height = container.clientHeight;
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.set(0, 1.2, 2.8);
  characterRoot = new THREE.Group();
  characterRoot.position.set(0, 0, 0);
  scene.add(characterRoot);

  // preserveDrawingBuffer improves reliability of canvas screenshot captures.
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  const onKeyDown = (e: KeyboardEvent) => {
    if (isInputFocused()) return;
    const code = e.code;
    if (
      [
        'KeyW',
        'KeyA',
        'KeyS',
        'KeyD',
        'KeyZ',
        'ShiftLeft',
        'ShiftRight',
        'AltLeft',
        'AltRight',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
      ].includes(code)
    ) {
      e.preventDefault();
    }
    pressedCodes.add(code);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (isInputFocused()) return;
    pressedCodes.delete(e.code);
  };
  const onWindowBlur = () => clearKeys();
  const onVisibilityChange = () => {
    if (document.hidden) clearKeys();
  };
  const onPointerLockChange = () => {
    if (document.pointerLockElement !== canvas) clearKeys();
  };
  const onFocusIn = () => {
    if (isInputFocused()) clearKeys();
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onWindowBlur);
  document.addEventListener('visibilitychange', onVisibilityChange);
  document.addEventListener('pointerlockchange', onPointerLockChange);
  document.addEventListener('focusin', onFocusIn);

  const canvas = renderer.domElement;
  const triggerThrow = () => {
    if (!callbacks) return;
    if (callbacks.canThrow && !callbacks.canThrow()) return;
    if (throwAction) throwAction.reset().setLoop(THREE.LoopOnce, 1).play();
    const forwardX = -Math.sin(cameraAngleY);
    const forwardZ = -Math.cos(cameraAngleY);
    const pos: [number, number, number] = [characterRoot.position.x, characterRoot.position.y + 1, characterRoot.position.z];
    const dir: [number, number, number] = [forwardX, 0, forwardZ];
    callbacks.onThrow(pos, dir);
  };
  const onPointerMove = (e: PointerEvent) => {
    const dx = document.pointerLockElement === canvas ? e.movementX : e.clientX - lastPointerX;
    const dy = document.pointerLockElement === canvas ? e.movementY : e.clientY - lastPointerY;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    cameraAngleY -= dx * MOUSE_SENSITIVITY;
    cameraPitch += dy * MOUSE_SENSITIVITY;
    cameraPitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, cameraPitch));
  };
  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock();
      return;
    }
    if (isInputFocused()) return;
    e.preventDefault();
    triggerThrow();
  };
  canvas.addEventListener('pointerenter', (e: PointerEvent) => { lastPointerX = e.clientX; lastPointerY = e.clientY; });
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);

  (container as HTMLElement & { _gameViewerCleanup?: () => void })._gameViewerCleanup = () => {
    document.exitPointerLock();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onWindowBlur);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    document.removeEventListener('pointerlockchange', onPointerLockChange);
    document.removeEventListener('focusin', onFocusIn);
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
  scene.add(dir);
  scene.add(createGrassLayer(GRASS_SIZE, GRASS_SEGMENTS, GRASS_HEIGHT_RANGE, GRASS_SEED));

  clock = new THREE.Clock();
  animationClips = [];
  currentAction = null;
  throwAction = null;
  lastDesiredAnim = null;
  cameraAngleY = 0;
  cameraPitch = 0;

  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url: string) => {
    if (typeof url !== 'string' || url.startsWith('blob:')) return url;
    try {
      const u = new URL(url, window.location.href);
      if (u.origin === window.location.origin) return url;
      if (apiBaseUrl && new URL(apiBaseUrl).origin === u.origin) return url;
      return `${apiUrl('proxy-asset')}?url=${encodeURIComponent(url)}`;
    } catch { return url; }
  });

  const loader = new GLTFLoader(manager);
  loader.load(
    options.modelUrl,
    async (gltf: { scene: THREE.Group; animations?: THREE.AnimationClip[] }) => {
      const model = gltf.scene;
      model.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
        if ((mesh as unknown as { isSkinnedMesh?: boolean; frustumCulled?: boolean }).isSkinnedMesh) {
          (mesh as unknown as { frustumCulled?: boolean }).frustumCulled = false;
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
      if (gltf.animations?.length) {
        gltf.animations.forEach((clip: THREE.AnimationClip) => {
          animationClips.push({ name: clip.name || `anim_${animationClips.length}`, clip });
        });
      }
      for (const anim of options.animationUrls ?? []) {
        try {
          const clips = await loadGlbAnimations(anim.url, manager);
          clips.forEach((clip) => animationClips.push({ name: anim.name, clip }));
        } catch (_) {}
      }
      const throwEntry = animationClips.find((a) => a.name === ANIM_THROW);
      if (throwEntry) throwAction = mixer.clipAction(throwEntry.clip);
      lastDesiredAnim = null;
      animate();
    },
    undefined,
    () => animate()
  );

  const onResize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener('resize', onResize);
  (container as HTMLElement & { _gameViewerResize?: () => void })._gameViewerResize = onResize;
}

export function captureGameViewerScreenshot(): Promise<string | null> {
  if (!renderer?.domElement) return Promise.resolve(null);
  return new Promise((resolve) => {
    screenshotResolvers.push(resolve);
  });
}

function setAnimation(name: string): void {
  if (!mixer) return;
  if (!name) {
    if (currentAction) { currentAction.fadeOut(CROSSFADE_DURATION); currentAction = null; }
    return;
  }
  const entry = animationClips.find((a) => a.name === name);
  if (!entry) return;
  const newAction = mixer.clipAction(entry.clip);
  newAction.reset().setLoop(THREE.LoopRepeat, Infinity);
  if (currentAction) {
    currentAction.crossFadeTo(newAction, CROSSFADE_DURATION);
    newAction.fadeIn(CROSSFADE_DURATION).play();
  } else newAction.fadeIn(CROSSFADE_DURATION).play();
  currentAction = newAction;
}

function animate() {
  rafId = requestAnimationFrame(animate);
  const dt = clock.getDelta();
  if (mixer) mixer.update(dt);
  otherMixers.forEach((m) => m.update(dt));

  const inputFocused = isInputFocused();
  const running = !inputFocused && (pressedCodes.has('ShiftLeft') || pressedCodes.has('ShiftRight'));
  const speed = (running ? RUN_SPEED : WALK_SPEED) * dt;
  const forwardX = -Math.sin(cameraAngleY);
  const forwardZ = -Math.cos(cameraAngleY);
  const rightX = Math.cos(cameraAngleY);
  const rightZ = -Math.sin(cameraAngleY);
  if (!inputFocused && (pressedCodes.has('KeyW') || pressedCodes.has('ArrowUp'))) {
    characterRoot.position.x += forwardX * speed;
    characterRoot.position.z += forwardZ * speed;
  }
  if (!inputFocused && (pressedCodes.has('KeyS') || pressedCodes.has('ArrowDown'))) {
    characterRoot.position.x -= forwardX * speed;
    characterRoot.position.z -= forwardZ * speed;
  }
  if (!inputFocused && (pressedCodes.has('KeyA') || pressedCodes.has('ArrowLeft'))) {
    characterRoot.position.x -= rightX * speed;
    characterRoot.position.z -= rightZ * speed;
  }
  if (!inputFocused && (pressedCodes.has('KeyD') || pressedCodes.has('ArrowRight'))) {
    characterRoot.position.x += rightX * speed;
    characterRoot.position.z += rightZ * speed;
  }
  if (!inputFocused) characterRoot.rotation.y = cameraAngleY + Math.PI;

  const desiredAnim = getDesiredAnimation();
  if (desiredAnim !== lastDesiredAnim) {
    if (desiredAnim === null) setAnimation('');
    else if (animationClips.some((a) => a.name === desiredAnim)) setAnimation(desiredAnim);
    lastDesiredAnim = desiredAnim;
  }

  const now = performance.now();
  if (callbacks && now - lastStateSend > STATE_SEND_INTERVAL_MS) {
    lastStateSend = now;
    const anim = lastDesiredAnim ?? (throwAction?.isRunning() ? ANIM_THROW : '');
    callbacks.onState({
      position: [characterRoot.position.x, characterRoot.position.y, characterRoot.position.z],
      rotationY: characterRoot.rotation.y,
      animation: anim,
    });
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

  const t = clock.getElapsedTime();
  const nowSec = Date.now() / 1000;
  for (const sb of snowballsData) {
    const elapsed = nowSec - sb.startTime;
    const x = sb.position[0] + sb.direction[0] * SNOWBALL_SPEED * elapsed;
    const y = sb.position[1] + sb.direction[1] * SNOWBALL_SPEED * elapsed;
    const z = sb.position[2] + sb.direction[2] * SNOWBALL_SPEED * elapsed;
    let mesh = snowballMeshes.get(sb.id);
    if (!mesh) {
      const geo = new THREE.SphereGeometry(0.15, 8, 8);
      const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
      applyHandDrawnToMaterial(mat);
      mesh = new THREE.Mesh(geo, mat);
      scene.add(mesh);
      snowballMeshes.set(sb.id, mesh);
    }
    mesh.position.set(x, y, z);
    mesh.visible = elapsed < 2;
  }
  snowballMeshes.forEach((mesh, id) => {
    if (!snowballsData.some((s) => s.id === id)) {
      scene.remove(mesh);
      (mesh.geometry as THREE.BufferGeometry).dispose();
      (mesh.material as THREE.Material).dispose();
      snowballMeshes.delete(id);
    }
  });

  for (const hit of hitEvents) {
    const count = 24;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = hit.position[0] + (Math.random() - 0.5);
      positions[i * 3 + 1] = hit.position[1] + (Math.random() - 0.5);
      positions[i * 3 + 2] = hit.position[2] + (Math.random() - 0.5);
      velocities[i] = 2 + Math.random() * 3;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.2 });
    applyHandDrawnToMaterial(mat);
    const points = new THREE.Points(geo, mat);
    scene.add(points);
    particleSystems.push({ mesh: points, birth: t });
  }
  hitEvents.length = 0;

  for (let i = particleSystems.length - 1; i >= 0; i--) {
    const ps = particleSystems[i];
    const age = t - ps.birth;
    if (age > 1) {
      scene.remove(ps.mesh);
      (ps.mesh.geometry as THREE.BufferGeometry).dispose();
      (ps.mesh.material as THREE.Material).dispose();
      particleSystems.splice(i, 1);
      continue;
    }
    const pos = ps.mesh.geometry.attributes.position as THREE.BufferAttribute;
    for (let j = 0; j < pos.count; j++) {
      const v = (ps.mesh as THREE.Points & { _vel?: number[] })._vel ?? (() => {
        const vv: number[] = [];
        for (let k = 0; k < 24; k++) vv.push(2 + Math.random() * 3);
        (ps.mesh as THREE.Points & { _vel?: number[] })._vel = vv;
        return vv;
      })();
      pos.setY(j, pos.getY(j) + v[j] * dt * 2);
    }
    pos.needsUpdate = true;
  }

  const otherAlpha = OTHER_TAU_SEC > 0 ? (1 - Math.exp(-dt / OTHER_TAU_SEC)) : 1;
  otherPlayersData.forEach((p) => {
    const group = otherMeshes.get(p.socketId);
    if (!group) return;
    let disp = otherDisplayState.get(p.socketId);
    if (!disp) {
      disp = { x: p.position[0], y: p.position[1], z: p.position[2], rotationY: p.rotationY };
      otherDisplayState.set(p.socketId, disp);
    }
    const dx = p.position[0] - disp.x;
    const dyPos = p.position[1] - disp.y;
    const dz = p.position[2] - disp.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > OTHER_SNAP_DIST) {
      disp.x = p.position[0];
      disp.y = p.position[1];
      disp.z = p.position[2];
    } else {
      disp.x += dx * otherAlpha;
      disp.y += dyPos * otherAlpha;
      disp.z += dz * otherAlpha;
    }
    const dy = p.rotationY - disp.rotationY;
    const wrap = ((dy % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
    disp.rotationY += wrap * otherAlpha;
    group.position.set(disp.x, disp.y, disp.z);
    group.rotation.y = disp.rotationY;
    const mix = otherMixers.get(p.socketId);
    const clipMap = otherClipMaps.get(p.socketId);
    if (!mix || !clipMap) return;
    const desired = p.animation ?? '';
    const current = otherCurrentAnim.get(p.socketId) ?? '';
    if (desired !== current) {
      const prev = otherCurrentAction.get(p.socketId);
      if (!desired) {
        prev?.fadeOut(0.15);
        otherCurrentAction.delete(p.socketId);
        otherCurrentAnim.set(p.socketId, '');
      } else {
        const clip = clipMap.get(desired);
        if (clip) {
          const next = mix.clipAction(clip);
          next.reset().setLoop(THREE.LoopRepeat, Infinity);
          if (prev) {
            prev.crossFadeTo(next, 0.2, false);
            next.play();
          } else {
            next.fadeIn(0.2).play();
          }
          otherCurrentAction.set(p.socketId, next);
          otherCurrentAnim.set(p.socketId, desired);
        }
      }
    } else if (desired) {
      const running = otherCurrentAction.get(p.socketId);
      if (running && !running.isRunning()) running.play();
    }
  });

  renderer?.render(scene, camera);
  if (screenshotResolvers.length > 0 && renderer?.domElement) {
    let dataUrl: string | null = null;
    try {
      dataUrl = renderer.domElement.toDataURL('image/png');
    } catch {
      dataUrl = null;
    }
    const queued = screenshotResolvers.splice(0, screenshotResolvers.length);
    queued.forEach((resolve) => resolve(dataUrl));
  }
}

function loadRemotePlayer(player: OtherPlayer): void {
  if (loadingRemoteSocketIds.has(player.socketId)) return;
  const fullModelUrl = player.modelUrl.startsWith('http')
    ? player.modelUrl
    : assetUrl(player.modelUrl.startsWith('/') ? player.modelUrl : `/${player.modelUrl}`);
  const cacheKey = player.characterId;
  const cached = characterCache.get(cacheKey);
  if (cached) {
    const group = new THREE.Group();
    const cloned = SkeletonUtils.clone(cached.template) as THREE.Group;
    applyHandDrawnToObject3D(cloned);
    group.add(cloned);
    if (scene) scene.add(group);
    const mix = new THREE.AnimationMixer(cloned);
    otherMeshes.set(player.socketId, group);
    otherMixers.set(player.socketId, mix);
    otherClipMaps.set(player.socketId, cached.clipMap);
    otherDisplayState.set(player.socketId, {
      x: player.position[0],
      y: player.position[1],
      z: player.position[2],
      rotationY: player.rotationY,
    });
    group.position.set(player.position[0], player.position[1], player.position[2]);
    group.rotation.y = player.rotationY;
    return;
  }
  loadingRemoteSocketIds.add(player.socketId);
  const manager = makeLoaderManager();
  const loader = new GLTFLoader(manager);
  const done = () => loadingRemoteSocketIds.delete(player.socketId);
  loader.load(
    fullModelUrl,
    async (gltf: { scene: THREE.Group; animations?: THREE.AnimationClip[] }) => {
      try {
        const template = SkeletonUtils.clone(gltf.scene) as THREE.Group;
        template.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
          if ((mesh as unknown as { isSkinnedMesh?: boolean; frustumCulled?: boolean }).isSkinnedMesh) {
            (mesh as unknown as { frustumCulled?: boolean }).frustumCulled = false;
          }
          if ((mesh as unknown as { material?: unknown }).material) {
            const material = (mesh as unknown as { material: unknown }).material;
            const mats = Array.isArray(material) ? material : [material];
            mats.forEach((m) => {
              const mm = m as THREE.MeshStandardMaterial;
              if (mm.map) {
                mm.map.colorSpace = THREE.SRGBColorSpace;
                mm.map.needsUpdate = true;
              }
              applyHandDrawnToMaterial(mm);
            });
          }
        });
        const box = new THREE.Box3().setFromObject(template);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        template.position.sub(center);
        template.position.y += size.y / 2;
        const group = new THREE.Group();
        const model = SkeletonUtils.clone(template) as THREE.Group;
        applyHandDrawnToObject3D(model);
        group.add(model);
        if (scene) scene.add(group);
        const mix = new THREE.AnimationMixer(model);
        const clipMap = new Map<string, THREE.AnimationClip>();
        (gltf.animations ?? []).forEach((clip) => clipMap.set(clip.name || `anim_${clipMap.size}`, clip));
        for (const a of player.animationUrls ?? []) {
          try {
            const url = a.url.startsWith('http') ? a.url : assetUrl(a.url.startsWith('/') ? a.url : `/${a.url}`);
            const clips = await loadGlbAnimations(url);
            clips.forEach((clip) => clipMap.set(a.name, clip));
          } catch (_) {}
        }
        characterCache.set(cacheKey, { template, clipMap });
      otherMeshes.set(player.socketId, group);
      otherMixers.set(player.socketId, mix);
      otherClipMaps.set(player.socketId, clipMap);
      otherDisplayState.set(player.socketId, {
        x: player.position[0],
        y: player.position[1],
        z: player.position[2],
        rotationY: player.rotationY,
      });
      group.position.set(player.position[0], player.position[1], player.position[2]);
      group.rotation.y = player.rotationY;
      } finally {
        done();
      }
    },
    undefined,
    () => done()
  );
}

function removeRemotePlayer(socketId: string): void {
  loadingRemoteSocketIds.delete(socketId);
  missingSince.delete(socketId);
  otherDisplayState.delete(socketId);
  otherCurrentAnim.delete(socketId);
  otherCurrentAction.delete(socketId);
  const group = otherMeshes.get(socketId);
  if (group && scene) {
    scene.remove(group);
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) (m.geometry as THREE.BufferGeometry).dispose();
      if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((mat) => mat.dispose());
    });
    otherMeshes.delete(socketId);
    otherMixers.delete(socketId);
    otherClipMaps.delete(socketId);
  }
}

export function setGameViewerData(data: {
  otherPlayers?: OtherPlayer[];
  snowballs?: SnowballState[];
  hitPositions?: HitEvent[];
}): void {
  if (data.otherPlayers) {
    const next = data.otherPlayers;
    const now = Date.now();
    for (const p of next) {
      missingSince.delete(p.socketId);
      if (!otherMeshes.has(p.socketId) && !loadingRemoteSocketIds.has(p.socketId)) loadRemotePlayer(p);
      if (!otherDisplayState.has(p.socketId)) {
        otherDisplayState.set(p.socketId, {
          x: p.position[0],
          y: p.position[1],
          z: p.position[2],
          rotationY: p.rotationY,
        });
      }
    }
    for (const sid of otherMeshes.keys()) {
      if (!next.some((p) => p.socketId === sid)) {
        const since = missingSince.get(sid) ?? now;
        missingSince.set(sid, since);
        if (now - since >= REMOVE_PLAYER_GRACE_MS) {
          removeRemotePlayer(sid);
          missingSince.delete(sid);
        }
      }
    }
    otherPlayersData = next;
  }
  if (data.snowballs) snowballsData = data.snowballs;
  if (data.hitPositions) hitEvents.push(...data.hitPositions);
}

export function disposeGameViewer(): void {
  cancelAnimationFrame(rafId);
  document.exitPointerLock();
  if (screenshotResolvers.length > 0) {
    const queued = screenshotResolvers.splice(0, screenshotResolvers.length);
    queued.forEach((resolve) => resolve(null));
  }
  const container = renderer?.domElement?.parentElement as (HTMLElement & { _gameViewerResize?: () => void; _gameViewerCleanup?: () => void }) | null;
  container?._gameViewerCleanup?.();
  if (container?._gameViewerResize) {
    window.removeEventListener('resize', container._gameViewerResize);
  }
  snowballMeshes.forEach((mesh) => {
    scene.remove(mesh);
    (mesh.geometry as THREE.BufferGeometry).dispose();
    (mesh.material as THREE.Material).dispose();
  });
  snowballMeshes.clear();
  otherMeshes.forEach((group) => scene.remove(group));
  otherMeshes.clear();
  otherMixers.clear();
  otherClipMaps.clear();
  otherCurrentAnim.clear();
  otherCurrentAction.clear();
  loadingRemoteSocketIds.clear();
  missingSince.clear();
  otherDisplayState.clear();
  otherPlayersData = [];
  snowballsData = [];
  hitEvents = [];
  renderer?.dispose();
  scene?.clear();
  callbacks = null;
}
