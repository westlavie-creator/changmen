<template>
  <div class="raikiri-loader" aria-busy="true" aria-label="加载中">
    <div class="raikiri-loader__scene">
      <div class="raikiri-loader__field" aria-hidden="true" />
      <div class="raikiri-loader__ring raikiri-loader__ring--outer" aria-hidden="true" />
      <div class="raikiri-loader__ring raikiri-loader__ring--inner" aria-hidden="true" />

      <svg class="raikiri-loader__bolts" viewBox="0 0 240 240" aria-hidden="true">
        <path
          class="raikiri-loader__bolt raikiri-loader__bolt--a"
          d="M118 118 L92 72 L104 96 L78 48 L98 98 L84 118 Z"
        />
        <path
          class="raikiri-loader__bolt raikiri-loader__bolt--b"
          d="M122 122 L148 78 L136 102 L162 58 L142 108 L156 128 Z"
        />
        <path
          class="raikiri-loader__bolt raikiri-loader__bolt--c"
          d="M120 120 L96 156 L108 132 L72 176 L102 134 L88 120 Z"
        />
      </svg>

      <div class="raikiri-loader__hero-wrap">
        <img
          class="raikiri-loader__hero"
          src="/login/kakashi.png"
          alt=""
          decoding="async"
        />
        <div class="raikiri-loader__hand" aria-hidden="true">
          <div class="raikiri-loader__core" />
          <div class="raikiri-loader__core raikiri-loader__core--halo" />
          <span v-for="n in 10" :key="n" class="raikiri-loader__spark" />
        </div>
      </div>

      <p class="raikiri-loader__label">
        <span class="raikiri-loader__label-char">雷</span>
        <span class="raikiri-loader__label-char">切</span>
      </p>
    </div>
  </div>
</template>

<style scoped>
.raikiri-loader {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background-color: #0a1018;
  background-image:
    radial-gradient(ellipse 70% 55% at 50% 40%, rgba(14, 165, 233, 0.18), transparent 70%),
    radial-gradient(ellipse 50% 40% at 50% 100%, rgba(56, 189, 248, 0.08), transparent),
    linear-gradient(180deg, #0a1018 0%, #111827 50%, #0a1018 100%);
}

.raikiri-loader__scene {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: min(1040px, 96vw);
  max-height: 100%;
  flex: 1;
  padding: 0.5rem 0 2.5rem;
  box-sizing: border-box;
}

.raikiri-loader__field {
  position: absolute;
  inset: 4% 6%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(56, 189, 248, 0.35) 0%, rgba(14, 165, 233, 0.08) 45%, transparent 70%);
  animation: raikiri-field 1.4s ease-in-out infinite;
  pointer-events: none;
}

.raikiri-loader__ring {
  position: absolute;
  left: 50%;
  top: 42%;
  width: 360px;
  height: 360px;
  margin: -180px 0 0 -180px;
  border-radius: 50%;
  border: 1px solid rgba(125, 211, 252, 0.35);
  pointer-events: none;
}

.raikiri-loader__ring--outer {
  animation: raikiri-ring 2.2s ease-out infinite;
}

.raikiri-loader__ring--inner {
  width: 240px;
  height: 240px;
  margin: -120px 0 0 -120px;
  animation: raikiri-ring 2.2s ease-out infinite 0.55s;
}

.raikiri-loader__bolts {
  position: absolute;
  left: 50%;
  top: 40%;
  width: 480px;
  height: 480px;
  margin: -240px 0 0 -240px;
  overflow: visible;
  pointer-events: none;
}

.raikiri-loader__bolt {
  fill: none;
  stroke: #e0f2fe;
  stroke-width: 4;
  stroke-linejoin: round;
  filter: drop-shadow(0 0 6px #38bdf8) drop-shadow(0 0 14px #0ea5e9);
  stroke-dasharray: 120;
  stroke-dashoffset: 120;
}

.raikiri-loader__bolt--a {
  animation: raikiri-bolt 1.1s steps(2, end) infinite;
}

.raikiri-loader__bolt--b {
  animation: raikiri-bolt 1.3s steps(2, end) infinite 0.25s;
}

.raikiri-loader__bolt--c {
  animation: raikiri-bolt 0.95s steps(2, end) infinite 0.45s;
}

.raikiri-loader__hero-wrap {
  position: relative;
  z-index: 1;
  width: min(840px, 92vw);
  max-height: min(1280px, 88vh);
}

.raikiri-loader__hero {
  display: block;
  width: 100%;
  height: auto;
  max-height: min(1280px, 88vh);
  object-fit: contain;
  object-position: center bottom;
  filter: drop-shadow(0 10px 28px rgba(0, 0, 0, 0.45));
  animation: raikiri-hero-hum 1.4s ease-in-out infinite;
}

.raikiri-loader__hand {
  position: absolute;
  left: 28%;
  bottom: 22%;
  width: 144px;
  height: 144px;
  pointer-events: none;
}

.raikiri-loader__core {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 56px;
  height: 56px;
  margin: -28px 0 0 -28px;
  border-radius: 50%;
  background: radial-gradient(circle, #f0f9ff 0%, #7dd3fc 35%, #0284c7 70%, transparent 100%);
  box-shadow:
    0 0 12px #e0f2fe,
    0 0 28px #38bdf8,
    0 0 48px #0ea5e9;
  animation: raikiri-core 0.55s ease-in-out infinite alternate;
}

.raikiri-loader__core--halo {
  width: 104px;
  height: 104px;
  margin: -52px 0 0 -52px;
  opacity: 0.55;
  background: radial-gradient(circle, rgba(224, 242, 254, 0.9) 0%, rgba(56, 189, 248, 0.4) 45%, transparent 72%);
  box-shadow: none;
  animation: raikiri-halo 0.85s ease-in-out infinite;
}

.raikiri-loader__spark {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 6px;
  height: 6px;
  margin: -3px 0 0 -3px;
  border-radius: 50%;
  background: #f0f9ff;
  box-shadow: 0 0 6px #7dd3fc;
  animation: raikiri-spark 0.9s linear infinite;
}

.raikiri-loader__spark:nth-child(3) { animation-delay: 0s; --raikiri-angle: 0deg; --raikiri-dist: 84px; }
.raikiri-loader__spark:nth-child(4) { animation-delay: 0.09s; --raikiri-angle: 36deg; --raikiri-dist: 96px; }
.raikiri-loader__spark:nth-child(5) { animation-delay: 0.18s; --raikiri-angle: 72deg; --raikiri-dist: 80px; }
.raikiri-loader__spark:nth-child(6) { animation-delay: 0.27s; --raikiri-angle: 108deg; --raikiri-dist: 92px; }
.raikiri-loader__spark:nth-child(7) { animation-delay: 0.36s; --raikiri-angle: 144deg; --raikiri-dist: 88px; }
.raikiri-loader__spark:nth-child(8) { animation-delay: 0.45s; --raikiri-angle: 180deg; --raikiri-dist: 100px; }
.raikiri-loader__spark:nth-child(9) { animation-delay: 0.54s; --raikiri-angle: 216deg; --raikiri-dist: 84px; }
.raikiri-loader__spark:nth-child(10) { animation-delay: 0.63s; --raikiri-angle: 252deg; --raikiri-dist: 94px; }
.raikiri-loader__spark:nth-child(11) { animation-delay: 0.72s; --raikiri-angle: 288deg; --raikiri-dist: 82px; }
.raikiri-loader__spark:nth-child(12) { animation-delay: 0.81s; --raikiri-angle: 324deg; --raikiri-dist: 90px; }

.raikiri-loader__label {
  position: fixed;
  bottom: 1.25rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  margin: 0;
  display: flex;
  gap: 0.35em;
  font-size: clamp(1.75rem, 5vw, 2.5rem);
  font-weight: 600;
  letter-spacing: 0.35em;
  color: #e0f2fe;
  text-shadow:
    0 0 8px #38bdf8,
    0 0 20px #0ea5e9;
  pointer-events: none;
  user-select: none;
}

.raikiri-loader__label-char {
  display: inline-block;
  animation: raikiri-label 1.4s ease-in-out infinite;
}

.raikiri-loader__label-char:last-child {
  animation-delay: 0.2s;
}

@keyframes raikiri-field {
  0%,
  100% {
    opacity: 0.55;
    transform: scale(0.92);
  }
  50% {
    opacity: 1;
    transform: scale(1.05);
  }
}

@keyframes raikiri-ring {
  0% {
    opacity: 0.85;
    transform: scale(0.35);
  }
  100% {
    opacity: 0;
    transform: scale(1.35);
  }
}

@keyframes raikiri-bolt {
  0%,
  40%,
  100% {
    stroke-dashoffset: 120;
    opacity: 0;
  }
  45%,
  65% {
    stroke-dashoffset: 0;
    opacity: 1;
  }
}

@keyframes raikiri-core {
  from {
    transform: scale(0.85);
    filter: brightness(1);
  }
  to {
    transform: scale(1.12);
    filter: brightness(1.35);
  }
}

@keyframes raikiri-halo {
  0%,
  100% {
    transform: scale(0.9);
    opacity: 0.35;
  }
  50% {
    transform: scale(1.15);
    opacity: 0.7;
  }
}

@keyframes raikiri-spark {
  0% {
    opacity: 1;
    transform: rotate(var(--raikiri-angle, 0deg)) translateX(16px) scale(1);
  }
  100% {
    opacity: 0;
    transform: rotate(var(--raikiri-angle, 0deg)) translateX(var(--raikiri-dist, 44px)) scale(0.2);
  }
}

@keyframes raikiri-hero-hum {
  0%,
  100% {
    filter: drop-shadow(0 10px 28px rgba(0, 0, 0, 0.45)) drop-shadow(0 0 0 transparent);
  }
  50% {
    filter: drop-shadow(0 10px 28px rgba(0, 0, 0, 0.45)) drop-shadow(0 0 18px rgba(56, 189, 248, 0.35));
  }
}

@keyframes raikiri-label {
  0%,
  100% {
    opacity: 0.65;
    text-shadow: 0 0 8px #38bdf8, 0 0 16px #0ea5e9;
  }
  50% {
    opacity: 1;
    text-shadow: 0 0 12px #e0f2fe, 0 0 28px #38bdf8, 0 0 40px #0ea5e9;
  }
}

@media (prefers-reduced-motion: reduce) {
  .raikiri-loader__field,
  .raikiri-loader__ring,
  .raikiri-loader__bolt,
  .raikiri-loader__core,
  .raikiri-loader__core--halo,
  .raikiri-loader__spark,
  .raikiri-loader__hero,
  .raikiri-loader__label-char {
    animation: none;
  }

  .raikiri-loader__core {
    transform: scale(1);
  }
}
</style>
