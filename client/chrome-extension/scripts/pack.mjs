#!/usr/bin/env node
/**
 * 构建并打包 Chrome 扩展为 zip，供朋友「加载已解压的扩展程序」安装。
 * 输出：changmen/dist/gamebet-chromeplug-v{version}.zip
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const plugRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const changmenRoot = path.dirname(plugRoot);
const distRoot = path.join(changmenRoot, "dist");

/** 扩展运行时需要的文件（不含 node_modules / src / scripts） */
const RUNTIME_FILES = [
  "manifest.json",
  "background.js",
  "content.js",
  "content.js.LICENSE.txt",
  "popup.html",
  "popup.js",
  "version.json",
  "extension-id.json",
];
const RUNTIME_DIRS = ["assets", "vendor"];

const EXTENSION_ID = "mogfpjihgoghabicofkbcmcidlcoofee";

function runBuild() {
  console.log("[pack] npm run build …");
  execSync("npm run build", { cwd: plugRoot, stdio: "inherit" });
}

function readVersion() {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(plugRoot, "manifest.json"), "utf8"),
  );
  return manifest.version;
}

function stage(version) {
  const folderName = `gamebet-chromeplug-v${version}`;
  const outDir = path.join(distRoot, folderName);

  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outDir, { recursive: true });

  for (const name of RUNTIME_FILES) {
    const src = path.join(plugRoot, name);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(outDir, name));
    }
  }
  for (const name of RUNTIME_DIRS) {
    const src = path.join(plugRoot, name);
    if (!fs.existsSync(src)) {
      throw new Error(`缺少目录 ${name}，请先 npm run build`);
    }
    fs.cpSync(src, path.join(outDir, name), { recursive: true });
  }

  if (!fs.existsSync(path.join(outDir, "manifest.json"))) {
    throw new Error("打包失败：manifest.json 未生成");
  }

  return { outDir, folderName };
}

function zipDir(outDir, folderName) {
  fs.mkdirSync(distRoot, { recursive: true });
  const zipPath = path.join(distRoot, `${folderName}.zip`);
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  if (process.platform === "win32") {
    const psOut = outDir.replace(/'/g, "''");
    const psZip = zipPath.replace(/'/g, "''");
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -LiteralPath '${psOut}' -DestinationPath '${psZip}' -Force"`,
      { stdio: "inherit" },
    );
  } else {
    execSync(
      `cd "${distRoot}" && zip -rq "${zipPath}" "${folderName}"`,
      { stdio: "inherit" },
    );
  }

  return zipPath;
}

function main() {
  runBuild();
  const version = readVersion();
  const { outDir, folderName } = stage(version);
  const zipPath = zipDir(outDir, folderName);

  const publishDir = path.join(changmenRoot, "apps", "backend", "public", "esport2", "extensions");
  fs.mkdirSync(publishDir, { recursive: true });
  const publishZip = path.join(publishDir, `${version}.zip`);
  fs.copyFileSync(zipPath, publishZip);
  console.log(`  发布: server/backend/public/esport2/extensions/${version}.zip`);

  console.log("");
  console.log("打包完成");
  console.log(`  zip:     ${zipPath}`);
  console.log(`  文件夹:  ${outDir}`);
  console.log(`  版本:    ${version}`);
  console.log(`  扩展 ID: ${EXTENSION_ID}`);
  console.log("");
  console.log("发给朋友后安装步骤：");
  console.log("  1. 解压 zip");
  console.log(`  2. chrome://extensions → 开发者模式 → 加载已解压 → 选 ${folderName}`);
  console.log("  3. 确认扩展 ID 与上面一致");
  console.log("  4. 浏览器打开你的 changmen 地址（如 http://你的服务器:3456/）");
}

main();
