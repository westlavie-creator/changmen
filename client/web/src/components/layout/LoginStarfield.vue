<script setup lang="ts">
/**
 * betmoar.fun hero starfield — Three.js Points + mouse camera parallax.
 * Port of their landing chunk (10000 points, size 0.02, color 0x607d8b, disc map).
 * three 仅动态 import，且 idle 后再拉，避免挡登录首屏。
 */
import { onMounted, onUnmounted, ref } from "vue";

type ThreeModule = typeof import("three");
type ThreeScene = InstanceType<ThreeModule["Scene"]>;
type ThreeCamera = InstanceType<ThreeModule["PerspectiveCamera"]>;
type ThreeRenderer = InstanceType<ThreeModule["WebGLRenderer"]>;
type ThreePoints = InstanceType<ThreeModule["Points"]>;
type ThreeTexture = InstanceType<ThreeModule["CanvasTexture"]>;
type ThreeGeometry = InstanceType<ThreeModule["BufferGeometry"]>;

const hostRef = ref<HTMLElement | null>(null);

let disposed = false;
let raf = 0;
let mouseX = 0;
let mouseY = 0;
let contextLost = false;
let reducedMotion = false;
let rebuild: (() => void) | null = null;
let startLoop: (() => void) | null = null;
let idleHandle: number | null = null;

let scene: ThreeScene | null = null;
let camera: ThreeCamera | null = null;
let renderer: ThreeRenderer | null = null;
let points: ThreePoints | null = null;
let discTex: ThreeTexture | null = null;
let geometry: ThreeGeometry | null = null;

function makeDiscTexture(THREE: ThreeModule): ThreeTexture {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.2, "rgba(255,255,255,1)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.6)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function disposeGl() {
  if (raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
  if (renderer) {
    const el = renderer.domElement;
    el.removeEventListener("webglcontextlost", onContextLost);
    el.removeEventListener("webglcontextrestored", onContextRestored);
    if (el.parentElement) el.parentElement.removeChild(el);
    renderer.dispose();
  }
  if (geometry) geometry.dispose();
  if (points) {
    const mat = points.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat.dispose();
  }
  discTex?.dispose();
  scene = null;
  camera = null;
  renderer = null;
  points = null;
  discTex = null;
  geometry = null;
}

function onContextLost(e: Event) {
  e.preventDefault();
  contextLost = true;
  if (raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
}

function onContextRestored() {
  disposeGl();
  contextLost = false;
  if (disposed) return;
  rebuild?.();
  startLoop?.();
}

function onMouse(e: MouseEvent) {
  mouseX = (e.clientX - window.innerWidth / 2) / 1000;
  mouseY = (e.clientY - window.innerHeight / 2) / 1000;
}

function onResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function scheduleIdle(cb: () => void) {
  const ric = window.requestIdleCallback;
  if (typeof ric === "function") {
    idleHandle = ric(() => cb(), { timeout: 1200 });
    return;
  }
  idleHandle = window.setTimeout(cb, 0) as unknown as number;
}

function cancelIdle() {
  if (idleHandle == null) return;
  if (typeof window.cancelIdleCallback === "function") {
    window.cancelIdleCallback(idleHandle);
  } else {
    clearTimeout(idleHandle);
  }
  idleHandle = null;
}

function bootThree(THREE: ThreeModule, host: HTMLElement) {
  if (disposed || !hostRef.value) return;

  rebuild = () => {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 2.5;

    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      renderer = null;
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);
    renderer.domElement.addEventListener("webglcontextlost", onContextLost, false);
    renderer.domElement.addEventListener("webglcontextrestored", onContextRestored, false);

    geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(30000);
    for (let i = 0; i < 10000; i++) {
      const t = 3 * i;
      positions[t] = (Math.random() - 0.5) * 10;
      positions[t + 1] = (Math.random() - 0.5) * 10;
      positions[t + 2] = (Math.random() - 0.5) * 10;
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    discTex = makeDiscTexture(THREE);
    const material = new THREE.PointsMaterial({
      size: 0.02,
      color: 0x607d8b,
      map: discTex,
      alphaTest: 0.5,
      transparent: true,
      depthWrite: false,
      sizeAttenuation: true,
    });

    points = new THREE.Points(geometry, material);
    scene.add(points);
  };

  const animate = () => {
    if (!renderer || !camera || !scene || !points || contextLost || disposed) return;
    raf = requestAnimationFrame(animate);

    if (!reducedMotion) {
      const t = 1e-4 * Date.now();
      points.rotation.x = 0.25 * t;
      points.rotation.y = 0.5 * t;
      camera.position.x += (mouseX - camera.position.x) * 0.05;
      camera.position.y += (-mouseY - camera.position.y) * 0.05;
      camera.lookAt(scene.position);
    }

    renderer.render(scene, camera);
  };

  startLoop = () => {
    if (!renderer || !scene || !camera) return;
    if (reducedMotion) {
      renderer.render(scene, camera);
      return;
    }
    if (!raf) animate();
  };

  rebuild();
  if (!renderer) return;

  window.addEventListener("resize", onResize);
  if (!reducedMotion) {
    document.addEventListener("mousemove", onMouse, { passive: true });
  }
  startLoop();
}

onMounted(() => {
  const host = hostRef.value;
  if (!host) return;

  reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  disposed = false;

  scheduleIdle(() => {
    if (disposed || !hostRef.value) return;
    void import("three").then((THREE) => {
      bootThree(THREE, host);
    });
  });
});

onUnmounted(() => {
  disposed = true;
  cancelIdle();
  window.removeEventListener("resize", onResize);
  document.removeEventListener("mousemove", onMouse);
  disposeGl();
  rebuild = null;
  startLoop = null;
});
</script>

<template>
  <div ref="hostRef" class="login-starfield" aria-hidden="true" />
</template>

<style scoped>
.login-starfield {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}

.login-starfield :deep(canvas) {
  display: block;
  position: absolute;
  inset: 0;
  width: 100% !important;
  height: 100% !important;
}
</style>
