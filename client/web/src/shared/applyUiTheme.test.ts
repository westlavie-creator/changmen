import { afterEach, describe, expect, it, vi } from "vitest";
import { applyUiTheme } from "@/shared/applyUiTheme";

function mockDocumentElement() {
  const classes = new Set<string>();
  let themeAttr: string | null = null;
  const el = {
    classList: {
      add: (...names: string[]) => {
        for (const n of names) classes.add(n);
      },
      remove: (...names: string[]) => {
        for (const n of names) classes.delete(n);
      },
      contains: (name: string) => classes.has(name),
    },
    setAttribute: (key: string, value: string) => {
      if (key === "data-ui-theme")
        themeAttr = value;
    },
    removeAttribute: (key: string) => {
      if (key === "data-ui-theme")
        themeAttr = null;
    },
    getAttribute: (key: string) => (key === "data-ui-theme" ? themeAttr : null),
    hasAttribute: (key: string) => key === "data-ui-theme" && themeAttr != null,
  };
  vi.stubGlobal("document", { documentElement: el });
  return el;
}

describe("applyUiTheme", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sets brutal attribute and drops dark", () => {
    const el = mockDocumentElement();
    el.classList.add("dark");
    expect(applyUiTheme("brutal")).toBe("brutal");
    expect(el.getAttribute("data-ui-theme")).toBe("brutal");
    expect(el.classList.contains("ui-theme-brutal")).toBe(true);
    expect(el.classList.contains("dark")).toBe(false);
  });

  it("sets paper as light theme", () => {
    const el = mockDocumentElement();
    el.classList.add("dark");
    expect(applyUiTheme("paper")).toBe("paper");
    expect(el.getAttribute("data-ui-theme")).toBe("paper");
    expect(el.classList.contains("ui-theme-paper")).toBe(true);
    expect(el.classList.contains("ui-theme-brutal")).toBe(false);
    expect(el.classList.contains("dark")).toBe(false);
  });

  it("sets terminal as dark theme", () => {
    const el = mockDocumentElement();
    expect(applyUiTheme("terminal")).toBe("terminal");
    expect(el.getAttribute("data-ui-theme")).toBe("terminal");
    expect(el.classList.contains("ui-theme-terminal")).toBe(true);
    expect(el.classList.contains("dark")).toBe(true);
  });

  it("clears theme and restores dark on admin-route", () => {
    const el = mockDocumentElement();
    el.classList.add("admin-route");
    applyUiTheme("paper");
    applyUiTheme("default");
    expect(el.hasAttribute("data-ui-theme")).toBe(false);
    expect(el.classList.contains("ui-theme-paper")).toBe(false);
    expect(el.classList.contains("dark")).toBe(true);
  });

  it("drops dark when leaving terminal for default on home", () => {
    const el = mockDocumentElement();
    applyUiTheme("terminal");
    expect(el.classList.contains("dark")).toBe(true);
    applyUiTheme("default");
    expect(el.classList.contains("dark")).toBe(false);
  });

  it("switches between themes without leftover classes", () => {
    const el = mockDocumentElement();
    applyUiTheme("brutal");
    applyUiTheme("terminal");
    expect(el.classList.contains("ui-theme-brutal")).toBe(false);
    expect(el.classList.contains("ui-theme-terminal")).toBe(true);
    expect(el.getAttribute("data-ui-theme")).toBe("terminal");
  });
});
