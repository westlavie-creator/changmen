#!/usr/bin/env node
"use strict";

process.env.A8_AUTH = process.env.A8_AUTH || "0";

const { handleEsportRequest } = require("../esport-api/router.js");
const http = require("http");

function mockReq(body) {
  const raw = JSON.stringify(body);
  const listeners = { data: [], end: [], error: [] };
  return {
    method: "POST",
    url: "/esport/Client_Login",
    headers: { "content-type": "application/json" },
    on(ev, fn) {
      listeners[ev]?.push(fn);
    },
    _emit(ev, arg) {
      for (const fn of listeners[ev] || []) fn(arg);
    },
    _start() {
      listeners.data.forEach((fn) => fn(Buffer.from(raw)));
      listeners.end.forEach((fn) => fn());
    },
  };
}

function mockRes() {
  return {
    headersSent: false,
    statusCode: 0,
    body: "",
    writeHead(code) {
      this.statusCode = code;
      this.headersSent = true;
    },
    end(text) {
      this.body = text || "";
    },
  };
}

async function runLogin(userName, password) {
  const req = mockReq({ userName, password });
  const res = mockRes();
  const p = handleEsportRequest(req, res, "/esport/Client_Login");
  req._start();
  await p;
  return { status: res.statusCode, body: JSON.parse(res.body || "{}") };
}

(async () => {
  const r = await runLogin("admin", "admin");
  console.log(JSON.stringify(r, null, 2));
  if (r.body.success !== 1 || !r.body.info?.token) {
    process.exit(1);
  }
})();
