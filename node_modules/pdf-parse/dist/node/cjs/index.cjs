"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/node/index.ts
var index_exports = {};
__export(index_exports, {
  getHeader: () => getHeader
});
module.exports = __toCommonJS(index_exports);

// src/node/getHeader.ts
var http = __toESM(require("node:http"), 1);
var https = __toESM(require("node:https"), 1);
async function nodeRequest(u, method, headers) {
  return new Promise((resolve, reject) => {
    const reqFn = u.protocol === "https:" ? https.request : http.request;
    const req = reqFn(u, { method, headers }, (res) => {
      const headersObj = {};
      for (const [k, v] of Object.entries(res.headers)) {
        headersObj[k] = Array.isArray(v) ? v.join(",") : v ?? "";
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(Buffer.from(c)));
      res.on("end", () => {
        const buffer = chunks.length ? Buffer.concat(chunks) : void 0;
        resolve({ status: res.statusCode ?? 0, headers: headersObj, buffer });
      });
    });
    req.on("error", (err) => reject(err));
    req.end();
  });
}
async function getHeader(url, check = false) {
  try {
    const u = typeof url === "string" ? new URL(url) : url;
    const headResp = await nodeRequest(u, "HEAD");
    const size = headResp.headers["content-length"] ? parseInt(headResp.headers["content-length"], 10) : void 0;
    let magic = null;
    if (check) {
      const rangeResp = await nodeRequest(u, "GET", { Range: "bytes=0-4" });
      if (rangeResp.status >= 200 && rangeResp.status < 300 && rangeResp.buffer) {
        const headerStr = rangeResp.buffer.slice(0, 4).toString("utf8");
        magic = headerStr.startsWith("%PDF");
      } else {
        magic = false;
      }
    }
    return {
      ok: headResp.status >= 200 && headResp.status < 300,
      status: headResp.status,
      size,
      magic,
      headers: headResp.headers
    };
  } catch (error) {
    return {
      ok: false,
      status: void 0,
      size: void 0,
      magic: false,
      headers: {},
      error: new Error(String(error))
    };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getHeader
});
//# sourceMappingURL=index.cjs.map
