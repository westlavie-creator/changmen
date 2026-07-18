import { loadCustomOrderSoundBlob } from "./customStore";
import { renderBuiltinPresetBuffer } from "./presets";
import type { OrderSoundPrefs } from "./types";

export type OrderSoundPurpose = "preview" | "notify";

export interface OrderSoundSession {
  readonly id: number;
  readonly purpose: OrderSoundPurpose;
  stop(): void;
  readonly done: Promise<void>;
}

interface ActivePlayback {
  session: OrderSoundSession;
  source: AudioBufferSourceNode;
  gain: GainNode;
  finished: boolean;
}

let sessionCounter = 0;

function customCacheKey(userName: string, prefs: OrderSoundPrefs) {
  return `${userName}:${prefs.customFileName ?? ""}`;
}

class OrderSoundEngine {
  private ctx: AudioContext | null = null;
  private unlocked = false;
  private active: ActivePlayback | null = null;
  private readonly builtinBuffers = new Map<Exclude<OrderSoundPrefs["presetId"], "custom">, AudioBuffer>();
  private readonly customBuffers = new Map<string, AudioBuffer>();
  private readonly listeners = new Set<() => void>();
  private unlockInstalled = false;

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  isPlaying() {
    return this.active != null && !this.active.finished;
  }

  isUnlocked() {
    return this.unlocked && this.ctx != null && this.ctx.state === "running";
  }

  /** 首次用户手势时 resume AudioContext，避免下单回调时仍 suspended */
  installUnlockOnGesture() {
    if (this.unlockInstalled || typeof window === "undefined")
      return;
    this.unlockInstalled = true;
    const onGesture = () => {
      void this.ensureContext().then((ok) => {
        if (ok && this.ctx?.state === "running") {
          window.removeEventListener("pointerdown", onGesture, true);
          window.removeEventListener("keydown", onGesture, true);
        }
      });
    };
    window.addEventListener("pointerdown", onGesture, true);
    window.addEventListener("keydown", onGesture, true);
  }

  clearCustomBufferCache(userName?: string) {
    if (!userName) {
      this.customBuffers.clear();
      return;
    }
    const prefix = `${userName}:`;
    for (const key of [...this.customBuffers.keys()]) {
      if (key.startsWith(prefix))
        this.customBuffers.delete(key);
    }
  }

  resetForTests() {
    this.stop();
    this.ctx = null;
    this.unlocked = false;
    this.builtinBuffers.clear();
    this.customBuffers.clear();
    this.listeners.clear();
    this.unlockInstalled = false;
    sessionCounter = 0;
  }

  async stop() {
    const current = this.active;
    if (!current)
      return;
    current.session.stop();
    this.active = null;
    this.notify();
  }

  /** 仅停止试听，避免关闭设置页时打断下单成功提示音 */
  async stopIfPreview() {
    if (this.active?.session.purpose !== "preview")
      return;
    await this.stop();
  }

  async play(opts: {
    prefs: OrderSoundPrefs;
    purpose: OrderSoundPurpose;
    userName: string;
    force?: boolean;
  }): Promise<OrderSoundSession | null> {
    const { prefs, purpose, userName, force = false } = opts;
    if (!force && purpose === "notify" && !prefs.enabled)
      return null;
    if (!(await this.ensureContext()))
      return null;

    await this.stop();

    const buffer = await this.resolveBuffer(prefs, userName, purpose);
    if (!buffer)
      return null;

    const session = this.startSession(buffer, prefs.volume, purpose);
    this.active = session;
    this.notify();
    return session.session;
  }

  private notify() {
    for (const listener of this.listeners)
      listener();
  }

  async ensureContext() {
    if (typeof window === "undefined")
      return false;
    const Ctx = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx)
      return false;
    if (!this.ctx)
      this.ctx = new Ctx();
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      }
      catch {
        /* 无用户手势时可能仍 suspended；仍允许 start，待解锁后出声 */
      }
    }
    this.unlocked = this.ctx.state === "running";
    return true;
  }

  private async resolveBuffer(
    prefs: OrderSoundPrefs,
    userName: string,
    purpose: OrderSoundPurpose,
  ) {
    if (prefs.presetId === "custom") {
      if (!prefs.customFileName)
        return null;
      const cacheKey = customCacheKey(userName, prefs);
      const cached = this.customBuffers.get(cacheKey);
      if (cached)
        return cached;
      const blob = await loadCustomOrderSoundBlob(userName, {
        allowPermissionPrompt: purpose === "preview",
      });
      if (!blob || !this.ctx)
        return null;
      try {
        const buffer = await this.ctx.decodeAudioData(await blob.arrayBuffer());
        this.customBuffers.set(cacheKey, buffer);
        return buffer;
      }
      catch {
        return null;
      }
    }

    const cached = this.builtinBuffers.get(prefs.presetId);
    if (cached)
      return cached;
    const buffer = await renderBuiltinPresetBuffer(prefs.presetId, 1);
    this.builtinBuffers.set(prefs.presetId, buffer);
    return buffer;
  }

  private startSession(buffer: AudioBuffer, volume: number, purpose: OrderSoundPurpose): ActivePlayback {
    const ctx = this.ctx!;
    const id = ++sessionCounter;
    let finished = false;
    let resolveDone: (() => void) | undefined;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = Math.min(1, Math.max(0, volume));
    source.connect(gain);
    gain.connect(ctx.destination);

    const finish = () => {
      if (finished)
        return;
      finished = true;
      try {
        source.disconnect();
      }
      catch {
        /* ignore */
      }
      try {
        gain.disconnect();
      }
      catch {
        /* ignore */
      }
      if (this.active?.session.id === id)
        this.active = null;
      resolveDone?.();
      this.notify();
    };

    const session: OrderSoundSession = {
      id,
      purpose,
      stop() {
        if (finished)
          return;
        try {
          source.stop(0);
        }
        catch {
          finish();
        }
      },
      done,
    };

    source.onended = finish;
    source.start(0);

    return { session, source, gain, finished: false };
  }
}

const engine = new OrderSoundEngine();

export function getOrderSoundEngine() {
  return engine;
}
