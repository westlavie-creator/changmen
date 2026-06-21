<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";

interface Star {
  angle: number;
  radius: number;
  speed: number;
  size: number;
  alpha: number;
  twinkle: number;
  twinkleSpeed: number;
}

const canvasRef = ref<HTMLCanvasElement | null>(null);
let frameId = 0;
let stars: Star[] = [];
let galaxyAngle = 0;
let width = 0;
let height = 0;
let dpr = 1;

const ARM_COUNT = 4;
const STAR_COUNT = 520;

function buildStars(maxRadius: number) {
  stars = [];
  for (let i = 0; i < STAR_COUNT; i += 1) {
    const arm = i % ARM_COUNT;
    const t = Math.random() ** 0.72;
    const radius = 18 + t * maxRadius;
    const spiral = arm * ((Math.PI * 2) / ARM_COUNT) + radius * 0.11;
    stars.push({
      angle: spiral + (Math.random() - 0.5) * 0.35,
      radius,
      speed: 0.22 / (radius * 0.018 + 1.2),
      size: 0.6 + Math.random() * 1.8,
      alpha: 0.35 + Math.random() * 0.65,
      twinkle: Math.random() * Math.PI * 2,
      twinkleSpeed: 0.8 + Math.random() * 2.2,
    });
  }
}

function resize() {
  const canvas = canvasRef.value;
  if (!canvas)
    return;
  const parent = canvas.parentElement;
  if (!parent)
    return;

  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = parent.clientWidth;
  height = parent.clientHeight;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  buildStars(Math.min(width, height) * 0.42);
}

function drawGalaxy(time: number) {
  const canvas = canvasRef.value;
  if (!canvas)
    return;
  const ctx = canvas.getContext("2d");
  if (!ctx)
    return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const cx = width * 0.5;
  const cy = height * 0.5;
  const tilt = 0.38;

  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.75);
  bg.addColorStop(0, "rgba(18, 8, 42, 0.95)");
  bg.addColorStop(0.45, "rgba(6, 4, 18, 0.98)");
  bg.addColorStop(1, "rgba(0, 0, 0, 1)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 90; i += 1) {
    const sx = ((i * 97) % width) + ((i * 53) % 40);
    const sy = ((i * 61) % height) + ((i * 29) % 30);
    const flicker = 0.25 + Math.sin(time * 0.0015 + i) * 0.15;
    ctx.fillStyle = `rgba(210, 220, 255, ${flicker})`;
    ctx.fillRect(sx % width, sy % height, 1, 1);
  }

  galaxyAngle += 0.00035;

  const corePulse = 0.85 + Math.sin(time * 0.002) * 0.15;
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, 42 * corePulse);
  core.addColorStop(0, "rgba(255, 245, 210, 0.95)");
  core.addColorStop(0.2, "rgba(255, 210, 140, 0.55)");
  core.addColorStop(0.55, "rgba(120, 90, 220, 0.18)");
  core.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 36 * corePulse, 14 * corePulse, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(galaxyAngle);

  for (const star of stars) {
    star.angle += star.speed * 0.016;
    const twinkle = 0.55 + Math.sin(time * 0.001 * star.twinkleSpeed + star.twinkle) * 0.45;
    const x = Math.cos(star.angle) * star.radius;
    const y = Math.sin(star.angle) * star.radius * tilt;
    const hue = star.radius < 80 ? 52 : 220;
    const sat = star.radius < 80 ? 80 : 55;
    const light = star.radius < 80 ? 88 : 72;
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${star.alpha * twinkle})`;
    ctx.beginPath();
    ctx.arc(x, y, star.size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  const haze = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(width, height) * 0.48);
  haze.addColorStop(0, "rgba(147, 112, 219, 0.08)");
  haze.addColorStop(0.6, "rgba(56, 78, 160, 0.04)");
  haze.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, width, height);

  frameId = requestAnimationFrame(drawGalaxy);
}

onMounted(() => {
  resize();
  frameId = requestAnimationFrame(drawGalaxy);
  window.addEventListener("resize", resize);
});

onUnmounted(() => {
  cancelAnimationFrame(frameId);
  window.removeEventListener("resize", resize);
});
</script>

<template>
  <div class="galaxy-spinner" aria-hidden="true">
    <canvas ref="canvasRef" class="galaxy-spinner__canvas" />
  </div>
</template>

<style scoped>
.galaxy-spinner {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #020108;
}

.galaxy-spinner__canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
