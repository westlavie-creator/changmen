import { describe, expect, it, afterEach } from "vitest";
import {
  certLoginBindError,
  clientCertCnFromSubject,
  isCertLoginBindEnabled,
} from "./client_cert_gate.js";

describe("client_cert_gate", () => {
  afterEach(() => {
    delete process.env.CHANGMEN_CERT_LOGIN_BIND;
    delete process.env.NODE_ENV;
  });

  it("parses CN from subject", () => {
    expect(clientCertCnFromSubject("CN=gb19")).toBe("gb19");
    expect(clientCertCnFromSubject("CN=gb19,O=changmen")).toBe("gb19");
    expect(clientCertCnFromSubject("/CN=RIVER")).toBe("RIVER");
    expect(clientCertCnFromSubject("")).toBe("");
  });

  it("bind off by default outside production", () => {
    process.env.NODE_ENV = "development";
    expect(isCertLoginBindEnabled()).toBe(false);
    expect(certLoginBindError("gb19", null)).toBe(null);
  });

  it("bind on in production or explicit flag", () => {
    process.env.NODE_ENV = "production";
    expect(isCertLoginBindEnabled()).toBe(true);
    expect(certLoginBindError("gb19", { hasClientCert: false, subject: "" }))
      .toMatch(/客户端证书/);
    expect(certLoginBindError("gb19", { hasClientCert: true, subject: "CN=gb12" }))
      .toMatch(/不匹配/);
    expect(certLoginBindError("GB19", { hasClientCert: true, subject: "CN=gb19" }))
      .toBe(null);
  });

  it("CHANGMEN_CERT_LOGIN_BIND=0 disables even in production", () => {
    process.env.NODE_ENV = "production";
    process.env.CHANGMEN_CERT_LOGIN_BIND = "0";
    expect(isCertLoginBindEnabled()).toBe(false);
  });
});
