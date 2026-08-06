import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import { isMatcherSkipAuthEnabled } from "../lib/config.js";
import { canAccessMatcherUi, getRequestToken, isMatcherAuthBypassed } from "./matcher_auth.js";

const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
});

describe("isMatcherSkipAuthEnabled", () => {
  it("默认关闭", () => {
    delete process.env.MATCHER_SKIP_AUTH;
    delete process.env.NODE_ENV;
    assert.equal(isMatcherSkipAuthEnabled(), false);
  });

  it("显式 SKIP_AUTH=1 且 NODE_ENV=development 时开启", () => {
    process.env.MATCHER_SKIP_AUTH = "1";
    process.env.NODE_ENV = "development";
    assert.equal(isMatcherSkipAuthEnabled(), true);
  });

  it("sKIP_AUTH=1 但 NODE_ENV 未设置时不开启", () => {
    process.env.MATCHER_SKIP_AUTH = "1";
    delete process.env.NODE_ENV;
    assert.equal(isMatcherSkipAuthEnabled(), false);
  });

  it("production 下忽略 SKIP_AUTH", () => {
    process.env.MATCHER_SKIP_AUTH = "1";
    process.env.NODE_ENV = "production";
    assert.equal(isMatcherSkipAuthEnabled(), false);
  });
});

describe("isMatcherAuthBypassed", () => {
  it("与 isMatcherSkipAuthEnabled 一致", () => {
    process.env.MATCHER_SKIP_AUTH = "1";
    process.env.NODE_ENV = "test";
    assert.equal(isMatcherAuthBypassed(), isMatcherSkipAuthEnabled());
  });
});

describe("getRequestToken", () => {
  it("读取 token 头与 Bearer", () => {
    assert.equal(getRequestToken({ headers: { token: "abc" } }), "abc");
    assert.equal(getRequestToken({ headers: { authorization: "Bearer xyz" } }), "xyz");
    assert.equal(getRequestToken({ headers: { cookie: "app_token=tok%201" } }), "tok 1");
    assert.equal(getRequestToken({ headers: {} }), "");
  });
});

describe("canAccessMatcherUi", () => {
  it("允许管理员和团队长访问 matcher", () => {
    assert.equal(canAccessMatcherUi({ role: "admin" }), true);
    assert.equal(canAccessMatcherUi({ role: "leader" }), true);
    assert.equal(canAccessMatcherUi({ isAdmin: true }), true);
  });

  it("拒绝普通用户访问 matcher", () => {
    assert.equal(canAccessMatcherUi({ role: "user" }), false);
    assert.equal(canAccessMatcherUi({}), false);
    assert.equal(canAccessMatcherUi(null), false);
  });
});
