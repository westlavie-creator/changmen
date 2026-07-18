<template>
  <div class="session-loader" aria-busy="true" aria-label="加载中">
    <div class="session-loader__scene">
      <div class="session-loader__field" aria-hidden="true" />
      <div class="session-loader__ring session-loader__ring--outer" aria-hidden="true" />
      <div class="session-loader__ring session-loader__ring--inner" aria-hidden="true" />

      <svg class="session-loader__bolts" viewBox="0 0 240 240" aria-hidden="true">
        <path
          class="session-loader__bolt session-loader__bolt--a"
          d="M118 118 L92 72 L104 96 L78 48 L98 98 L84 118 Z"
        />
        <path
          class="session-loader__bolt session-loader__bolt--b"
          d="M122 122 L148 78 L136 102 L162 58 L142 108 L156 128 Z"
        />
        <path
          class="session-loader__bolt session-loader__bolt--c"
          d="M120 120 L96 156 L108 132 L72 176 L102 134 L88 120 Z"
        />
      </svg>

      <div class="session-loader__hero-wrap">
        <div class="session-loader__hand" aria-hidden="true">
          <div class="session-loader__core" />
          <div class="session-loader__core session-loader__core--halo" />
          <span v-for="n in 10" :key="n" class="session-loader__spark" />
        </div>
      </div>

      <p class="session-loader__label">加载中</p>
    </div>
  </div>
</template>

<style scoped>
.session-loader {
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

.session-loader__scene {
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

.session-loader__field {
  position: absolute;
  inset: 4% 6%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(56, 189, 248, 0.35) 0%, rgba(14, 165, 233, 0.08) 45%, transparent 70%);
  animation: session-field 1.4s ease-in-out infinite;
  pointer-events: none;
}

.session-loader__ring {
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

.session-loader__ring--outer {
  animation: session-ring 2.2s ease-out infinite;
}

.session-loader__ring--inner {
  width: 240px;
  height: 240px;
  margin: -120px 0 0 -120px;
  animation: session-ring 2.2s ease-out infinite 0.55s;
}

.session-loader__bolts {
  position: absolute;
  left: 50%;
  top: 40%;
  width: 480px;
  height: 480px;
  margin: -240px 0 0 -240px;
  overflow: visible;
  pointer-events: none;
}

.session-loader__bolt {
  fill: none;
  stroke: #e0f2fe;
  stroke-width: 4;
  stroke-linejoin: round;
  filter: drop-shadow(0 0 6px #38bdf8) drop-shadow(0 0 14px #0ea5e9);
  stroke-dasharray: 120;
  stroke-dashoffset: 120;
}

.session-loader__bolt--a {
  animation: session-bolt 1.1s steps(2, end) infinite;
}

.session-loader__bolt--b {
  animation: session-bolt 1.3s steps(2, end) infinite 0.25s;
}

.session-loader__bolt--c {
  animation: session-bolt 0.95s steps(2, end) infinite 0.45s;
}

.session-loader__hero-wrap {
  position: relative;
  z-index: 1;
  width: 200px;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.session-loader__hand {
  position: relative;
  width: 144px;
  height: 144px;
  pointer-events: none;
}

.session-loader__core {
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
  animation: session-core 0.55s ease-in-out infinite alternate;
}

.session-loader__core--halo {
  width: 104px;
  height: 104px;
  margin: -52px 0 0 -52px;
  opacity: 0.55;
  background: radial-gradient(circle, rgba(224, 242, 254, 0.9) 0%, rgba(56, 189, 248, 0.4) 45%, transparent 72%);
  box-shadow: none;
  animation: session-halo 0.85s ease-in-out infinite;
}

.session-loader__spark {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 6px;
  height: 6px;
  margin: -3px 0 0 -3px;
  border-radius: 50%;
  background: #f0f9ff;
  box-shadow: 0 0 6px #7dd3fc;
  animation: session-spark 0.9s linear infinite;
}

.session-loader__spark:nth-child(3) { animation-delay: 0s; --session-angle: 0deg; --session-dist: 84px; }
.session-loader__spark:nth-child(4) { animation-delay: 0.09s; --session-angle: 36deg; --session-dist: 96px; }
.session-loader__spark:nth-child(5) { animation-delay: 0.18s; --session-angle: 72deg; --session-dist: 80px; }
.session-loader__spark:nth-child(6) { animation-delay: 0.27s; --session-angle: 108deg; --session-dist: 92px; }
.session-loader__spark:nth-child(7) { animation-delay: 0.36s; --session-angle: 144deg; --session-dist: 88px; }
.session-loader__spark:nth-child(8) { animation-delay: 0.45s; --session-angle: 180deg; --session-dist: 100px; }
.session-loader__spark:nth-child(9) { animation-delay: 0.54s; --session-angle: 216deg; --session-dist: 84px; }
.session-loader__spark:nth-child(10) { animation-delay: 0.63s; --session-angle: 252deg; --session-dist: 94px; }
.session-loader__spark:nth-child(11) { animation-delay: 0.72s; --session-angle: 288deg; --session-dist: 82px; }
.session-loader__spark:nth-child(12) { animation-delay: 0.81s; --session-angle: 324deg; --session-dist: 90px; }

.session-loader__label {
  position: fixed;
  bottom: 1.25rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  margin: 0;
  font-size: clamp(1.25rem, 3.5vw, 1.75rem);
  font-weight: 600;
  letter-spacing: 0.45em;
  color: #e0f2fe;
  text-shadow:
    0 0 8px #38bdf8,
    0 0 20px #0ea5e9;
  pointer-events: none;
  user-select: none;
  animation: session-label 1.4s ease-in-out infinite;
}

@keyframes session-field {
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

@keyframes session-ring {
  0% {
    opacity: 0.85;
    transform: scale(0.35);
  }
  100% {
    opacity: 0;
    transform: scale(1.35);
  }
}

@keyframes session-bolt {
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

@keyframes session-core {
  from {
    transform: scale(0.85);
    filter: brightness(1);
  }
  to {
    transform: scale(1.12);
    filter: brightness(1.35);
  }
}

@keyframes session-halo {
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

@keyframes session-spark {
  0% {
    opacity: 1;
    transform: rotate(var(--session-angle, 0deg)) translateX(16px) scale(1);
  }
  100% {
    opacity: 0;
    transform: rotate(var(--session-angle, 0deg)) translateX(var(--session-dist, 44px)) scale(0.2);
  }
}

@keyframes session-label {
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
  .session-loader__field,
  .session-loader__ring,
  .session-loader__bolt,
  .session-loader__core,
  .session-loader__core--halo,
  .session-loader__spark,
  .session-loader__label {
    animation: none;
  }

  .session-loader__core {
    transform: scale(1);
  }
}
</style>

