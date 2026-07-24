import { afterEach, describe, expect, it, vi } from "vitest";
import { ESPORT_ACTIONS } from "@changmen/api-contract/actions";
import {
  assertRegistryCoversContract,
  classifyAction,
  compareActionRoute,
  getActionDispatchMode,
  getActionRoute,
  legacyBucketFor,
} from "./action_registry.js";

describe("action_registry", () => {
  afterEach(() => {
    delete process.env.ESPORT_ACTION_COMPARE;
    delete process.env.ESPORT_ACTION_DISPATCH;
  });

  it("covers every ESPORT_ACTIONS entry", () => {
    expect(assertRegistryCoversContract()).toEqual([]);
    for (const action of ESPORT_ACTIONS) {
      const route = getActionRoute(action);
      expect(route, action).not.toBeNull();
      expect(route.bucket).toBe(classifyAction(action).bucket);
      expect(route.bucket).toBe(legacyBucketFor(action));
    }
  });

  it("classifies known buckets", () => {
    expect(classifyAction("Client_Login").bucket).toBe("login");
    expect(classifyAction("Client_AdminUsers").bucket).toBe("admin");
    expect(classifyAction("Pm_SubmitOrder").bucket).toBe("pm_pf");
    expect(classifyAction("Pf_SubmitOrder").bucket).toBe("pm_pf");
    expect(classifyAction("Client_SaveAccounts").bucket).toBe("account");
    expect(classifyAction("Client_GetMatchs").bucket).toBe("core");
    expect(classifyAction("API_SaveMatch").bucket).toBe("core");
  });

  it("defaults DISPATCH to legacy", () => {
    delete process.env.ESPORT_ACTION_DISPATCH;
    expect(getActionDispatchMode()).toBe("legacy");
    process.env.ESPORT_ACTION_DISPATCH = "registry";
    expect(getActionDispatchMode()).toBe("registry");
    process.env.ESPORT_ACTION_DISPATCH = "nope";
    expect(getActionDispatchMode()).toBe("legacy");
  });

  it("COMPARE is silent when routes match", () => {
    process.env.ESPORT_ACTION_COMPARE = "1";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(compareActionRoute("Client_GetMatchs", "core")).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("COMPARE warns on bucket mismatch without throwing", () => {
    process.env.ESPORT_ACTION_COMPARE = "1";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(compareActionRoute("Client_GetMatchs", "admin")).toBe(false);
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).toMatch(/COMPARE mismatch/);
    warn.mockRestore();
  });
});
