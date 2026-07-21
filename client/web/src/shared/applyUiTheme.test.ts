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

  it("clears brutal and restores dark on admin-route", () => {
    const el = mockDocumentElement();
    el.classList.add("admin-route");
    applyUiTheme("brutal");
    applyUiTheme("default");
    expect(el.hasAttribute("data-ui-theme")).toBe(false);
    expect(el.classList.contains("ui-theme-brutal")).toBe(false);
    expect(el.classList.contains("dark")).toBe(true);
  });
});
