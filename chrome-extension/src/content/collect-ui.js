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

function applyStyles(el, styles) {
  for (const [key, value] of Object.entries(styles)) {
    el.style.setProperty(key, value, "important");
  }
}

function stylePanel(panel) {
  applyStyles(panel, {
    "box-sizing": "border-box",
    "display": "block",
    "padding": "12px",
    "border-radius": "12px",
    "color": "#fff",
    "background-color": "rgba(0, 0, 0, 0.72)",
    "border": "1px solid rgba(255, 255, 255, 0.45)",
    "overflow": "hidden",
    "max-width": "calc(100vw - 40px)",
    "font-family": "Arial, Helvetica, sans-serif",
    "font-size": "14px",
    "line-height": "1.4",
    "box-shadow": "0 10px 30px rgba(0, 0, 0, 0.35)",
  });
}

function createPanelRow(labelText, name) {
  const row = document.createElement("div");
  row.className = "gamebet-collect-panel-item";
  applyStyles(row, {
    "box-sizing": "border-box",
    "display": "flex",
    "align-items": "center",
    "gap": "10px",
    "padding": "10px 0",
    "width": "100%",
    "height": "auto",
  });

  const label = document.createElement("label");
  label.textContent = `${labelText}:`;
  applyStyles(label, {
    "box-sizing": "border-box",
    "display": "block",
    "width": "80px",
    "min-width": "80px",
    "text-align": "left",
    "color": "#fff",
    "font-size": "14px",
    "font-weight": "400",
  });

  const input = document.createElement("input");
  input.type = "text";
  input.readOnly = true;
  input.name = name;
  applyStyles(input, {
    "box-sizing": "border-box",
    "display": "block",
    "flex": "1 1 auto",
    "width": "0",
    "min-width": "0",
    "height": "36px",
    "min-height": "36px",
    "max-height": "36px",
    "margin": "0",
    "padding": "8px",
    "border": "1px solid rgba(255, 255, 255, 0.5)",
    "border-radius": "6px",
    "background-color": "rgba(0, 0, 0, 0.5)",
    "color": "#fff",
    "font-size": "14px",
    "line-height": "20px",
    "font-family": "Arial, Helvetica, sans-serif",
    "cursor": "default",
    "outline": "none",
    "appearance": "none",
    "-webkit-appearance": "none",
  });

  row.append(label, input);
  return row;
}

function createPanelHint(text) {
  const hint = document.createElement("div");
  hint.className = "gamebet-collect-panel-hint";
  hint.textContent = text;
  applyStyles(hint, {
    "box-sizing": "border-box",
    "padding": "8px 10px",
    "margin": "0 0 6px",
    "border-radius": "8px",
    "background-color": "rgba(27, 154, 247, 0.18)",
    "color": "#d9efff",
    "font-size": "13px",
  });
  return hint;
}

function createPanelConfirm() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "gamebet-collect-panel-confirm";
  button.textContent = "确定";
  applyStyles(button, {
    "box-sizing": "border-box",
    "display": "block",
    "width": "100%",
    "height": "42px",
    "margin": "8px 0 0",
    "padding": "0 12px",
    "border": "1px solid #1b9af7",
    "border-radius": "999px",
    "background-color": "#1b9af7",
    "color": "#fff",
    "font-size": "15px",
    "font-family": "Arial, Helvetica, sans-serif",
    "line-height": "40px",
    "text-align": "center",
    "cursor": "pointer",
    "appearance": "none",
    "-webkit-appearance": "none",
  });
  return button;
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
    stylePanel(panel);
    panel.style.setProperty("z-index", "2147483647", "important");
    document.body.appendChild(panel);

    let config;
    try {
      panel.classList.add("loading");
      panel.textContent = "加载中...";
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
      panel.textContent = "";
    }

    if (config.sessionId || config.kind === "sport")
      panel.appendChild(createPanelHint("当前：体育（贴到足球采集会话，勿写入电竞）"));

    panel.appendChild(createPanelRow("网关", "gateway"));
    panel.appendChild(createPanelRow("token", "token"));
    if (config.sessionId)
      panel.appendChild(createPanelRow("sessionId", "sessionId"));
    panel.appendChild(createPanelRow("referer", "referer"));
    panel.appendChild(createPanelRow("数据", "data"));
    panel.appendChild(createPanelConfirm());

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
      const data = String(config.data || config.token || "");
      if (data) {
        void navigator.clipboard.writeText(data).catch(() => {
          document.execCommand("copy");
        });
      }
      icon.classList.remove("hide");
      panel.remove();
    });
  });

  console.info("[Gamebet] 采集图标已挂载（可拖动）");
  return true;
}
