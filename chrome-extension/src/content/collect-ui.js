const ICON_SIZE_PX = 56;
const DRAG_THRESHOLD_PX = 6;
const POS_KEY = "gamebetCollectIconPos";
const ICON_URL = () => chrome.runtime.getURL("assets/icon128.png");

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/** 与 A8 共用 class 时会被其 content.css 覆盖位置，故仅用 Gamebet 专用 class + 内联 !important */
function applyFloatPosition(el, { top, right, left, width, height }) {
  el.style.setProperty("position", "fixed", "important");
  if (top != null) el.style.setProperty("top", typeof top === "number" ? `${top}px` : top, "important");
  if (left != null) {
    el.style.setProperty("left", typeof left === "number" ? `${left}px` : left, "important");
    el.style.setProperty("right", "auto", "important");
  } else if (right != null) {
    el.style.setProperty("right", typeof right === "number" ? `${right}px` : right, "important");
    el.style.setProperty("left", "auto", "important");
  }
  el.style.setProperty("bottom", "auto", "important");
  el.style.setProperty("transform", "none", "important");
  el.style.setProperty("margin", "0", "important");
  if (width != null) el.style.setProperty("width", width, "important");
  if (height != null) el.style.setProperty("height", height, "important");
  el.style.setProperty("z-index", "2147483646", "important");
}

function clampIconPos(left, top) {
  return {
    left: clamp(left, 0, Math.max(0, window.innerWidth - ICON_SIZE_PX)),
    top: clamp(top, 0, Math.max(0, window.innerHeight - ICON_SIZE_PX)),
  };
}

function defaultIconPos() {
  return clampIconPos(window.innerWidth - ICON_SIZE_PX - 20, 20);
}

function readSavedPos() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(POS_KEY, (bag) => {
        const pos = bag?.[POS_KEY];
        if (pos && Number.isFinite(Number(pos.left)) && Number.isFinite(Number(pos.top))) {
          resolve(clampIconPos(Number(pos.left), Number(pos.top)));
          return;
        }
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
}

function savePos(left, top) {
  try {
    chrome.storage.local.set({ [POS_KEY]: clampIconPos(left, top) });
  } catch {
    /* ignore */
  }
}

function applyIconPos(el, left, top) {
  const pos = clampIconPos(left, top);
  applyFloatPosition(el, {
    left: pos.left,
    top: pos.top,
    width: `${ICON_SIZE_PX}px`,
    height: `${ICON_SIZE_PX}px`,
  });
  return pos;
}

function enableIconDrag(icon) {
  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  icon.addEventListener("pointerdown", (event) => {
    if (event.button != null && event.button !== 0) return;
    const rect = icon.getBoundingClientRect();
    dragging = true;
    moved = false;
    startX = event.clientX;
    startY = event.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    icon.classList.add("dragging");
    icon.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  icon.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    moved = true;
    applyIconPos(icon, startLeft + dx, startTop + dy);
  });

  const endDrag = (event) => {
    if (!dragging) return;
    dragging = false;
    icon.classList.remove("dragging");
    if (moved) {
      const rect = icon.getBoundingClientRect();
      savePos(rect.left, rect.top);
      icon.dataset.gamebetDragged = "1";
    }
    try {
      icon.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  };

  icon.addEventListener("pointerup", endDrag);
  icon.addEventListener("pointercancel", endDrag);

  icon.addEventListener("click", (event) => {
    if (icon.dataset.gamebetDragged !== "1") return;
    delete icon.dataset.gamebetDragged;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}

function placePanelNearIcon(panel, icon) {
  const rect = icon.getBoundingClientRect();
  const width = Math.min(640, window.innerWidth - 40);
  let left = rect.right - width;
  left = clamp(left, 20, Math.max(20, window.innerWidth - width - 20));
  let top = rect.bottom + 12;
  if (top > window.innerHeight - 80) top = Math.max(20, rect.top - 12);
  applyFloatPosition(panel, {
    left,
    top,
    width: `${width}px`,
    height: "auto",
  });
}

/**
 * 浮动采集图标 + 凭证面板
 * @param {{ Check(): Promise<boolean>; GetConfig(): Promise<Record<string, string>|undefined> }} provider
 */
export async function mountCollectIcon(provider) {
  if (document.body.querySelector(".gamebet-collect-float")) {
    return true;
  }

  const icon = document.createElement("button");
  icon.type = "button";
  icon.classList.add("gamebet-collect-float");
  icon.dataset.gamebetPlugin = "collect";
  icon.title = "拖动可移动；点击打开采集凭证";
  icon.setAttribute("aria-label", "Gamebet 采集凭证");
  const saved = await readSavedPos();
  const start = saved || defaultIconPos();
  applyIconPos(icon, start.left, start.top);
  icon.style.backgroundImage = `url("${ICON_URL()}")`;

  document.body.appendChild(icon);
  enableIconDrag(icon);

  window.addEventListener("resize", () => {
    const rect = icon.getBoundingClientRect();
    const pos = applyIconPos(icon, rect.left, rect.top);
    savePos(pos.left, pos.top);
  });

  icon.addEventListener("click", async () => {
    icon.classList.add("hide");
    const panel = document.createElement("div");
    panel.classList.add("gamebet-collect-panel");
    panel.dataset.gamebetPlugin = "collect-panel";
    placePanelNearIcon(panel, icon);
    panel.style.setProperty("z-index", "2147483647", "important");
    document.body.appendChild(panel);

    let config;
    try {
      panel.classList.add("loading");
      config = await provider.GetConfig();
      if (!config) {
        alert("没有检测到登录信息");
        icon.classList.remove("hide");
        panel.remove();
        return;
      }
      // [changmen 扩展] 馆侧返回 error（如 PB 缺 X-U）时禁止复制残缺凭证
      if (config.error) {
        alert(String(config.error));
        icon.classList.remove("hide");
        panel.remove();
        return;
      }
    } finally {
      panel.classList.remove("loading");
    }

    const row = (label, name) =>
      `<div class="gamebet-collect-panel-item"><label>${label}:</label><input type="text" readonly name="${name}" /></div>`;

    panel.innerHTML = [
      row("网关", "gateway"),
      row("token", "token"),
      ...(config.sessionId ? [row("sessionId", "sessionId")] : []),
      row("referer", "referer"),
      row("数据", "data"),
      '<div class="gamebet-collect-panel-confirm">确定</div>',
    ].join("");

    panel.querySelectorAll("input[name]").forEach((input) => {
      const name = input.getAttribute("name");
      if (name && name in config) {
        input.value = String(config[name] ?? "");
      }
    });

    panel.querySelectorAll("input").forEach((input) => {
      input.addEventListener("click", () => {
        input.select();
        navigator.clipboard
          .writeText(input.value)
          .then(() => panel.classList.add("copy"))
          .catch(() => {
            if (document.execCommand("copy")) panel.classList.add("copy");
          })
          .finally(() => {
            setTimeout(() => panel.classList.remove("copy"), 500);
          });
      });
    });

    panel.querySelector(".gamebet-collect-panel-confirm")?.addEventListener("click", () => {
      icon.classList.remove("hide");
      panel.remove();
    });
  });

  console.info("[Gamebet] 采集图标已挂载（可拖动）");
  return true;
}
