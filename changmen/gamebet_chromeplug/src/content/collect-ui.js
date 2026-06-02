const ICON_SIZE_PX = 56;
const ICON_URL = () => chrome.runtime.getURL("assets/icon128.png");

/** 与 A8 共用 class 时会被其 content.css 覆盖位置，故仅用 Gamebet 专用 class + 内联 !important */
function applyFloatPosition(el, { top, right, width, height }) {
  el.style.setProperty("position", "fixed", "important");
  el.style.setProperty("top", top, "important");
  el.style.setProperty("right", right, "important");
  el.style.setProperty("left", "auto", "important");
  el.style.setProperty("bottom", "auto", "important");
  el.style.setProperty("transform", "none", "important");
  el.style.setProperty("margin", "0", "important");
  el.style.setProperty("width", width, "important");
  el.style.setProperty("height", height, "important");
  el.style.setProperty("z-index", "2147483646", "important");
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
  icon.title = "Gamebet 采集凭证";
  icon.setAttribute("aria-label", "Gamebet 采集凭证");
  applyFloatPosition(icon, {
    top: "20px",
    right: "20px",
    width: `${ICON_SIZE_PX}px`,
    height: `${ICON_SIZE_PX}px`,
  });
  icon.style.backgroundImage = `url("${ICON_URL()}")`;

  document.body.appendChild(icon);

  icon.addEventListener("click", async () => {
    icon.classList.add("hide");
    const panel = document.createElement("div");
    panel.classList.add("gamebet-collect-panel");
    panel.dataset.gamebetPlugin = "collect-panel";
    applyFloatPosition(panel, {
      top: "88px",
      right: "20px",
      width: "min(640px, calc(100vw - 40px))",
      height: "auto",
    });
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
    } finally {
      panel.classList.remove("loading");
    }

    const row = (label, name) =>
      `<div class="gamebet-collect-panel-item"><label>${label}:</label><input type="text" readonly name="${name}" /></div>`;

    panel.innerHTML = [
      row("网关", "gateway"),
      row("token", "token"),
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

  console.info("[Gamebet] 采集图标已挂载（右上角）");
  return true;
}
