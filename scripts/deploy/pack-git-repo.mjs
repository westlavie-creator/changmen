/**
 * Pack deployable repo from git HEAD only (no .turbo / .claude / untracked junk).
 * VPS compiles gitignored router.js via deploy-server-remote.sh.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";

/** Abort if pack exceeds this — local caches must never ship again. */
export const REPO_PACK_MAX_MB = 40;

/**
 * @param {string} repoRoot git work tree root
 * @param {string} outPath destination .tgz / .tar.gz
 * @param {{ maxMb?: number }} [opts]
 * @returns {{ bytes: number, mb: number, head: string }}
 */
export function packGitRepoArchive(repoRoot, outPath, opts = {}) {
  const maxMb = Number(opts.maxMb) > 0 ? Number(opts.maxMb) : REPO_PACK_MAX_MB;

  const gitOk = spawnSync("git", ["-C", repoRoot, "rev-parse", "--is-inside-work-tree"], {
    encoding: "utf8",
  });
  if (gitOk.status !== 0 || String(gitOk.stdout || "").trim() !== "true")
    throw new Error(`not a git work tree: ${repoRoot}`);

  const head = spawnSync("git", ["-C", repoRoot, "rev-parse", "--short", "HEAD"], {
    encoding: "utf8",
  });
  if (head.status !== 0)
    throw new Error(`git rev-parse HEAD failed in ${repoRoot}`);
  const headShort = String(head.stdout || "").trim();

  if (fs.existsSync(outPath))
    fs.unlinkSync(outPath);

  // Only tracked files at HEAD — immune to .turbo / .claude / tmp_* growth
  const archived = spawnSync(
    "git",
    ["-C", repoRoot, "archive", "--format=tar.gz", `-o`, outPath, "HEAD"],
    { encoding: "utf8" },
  );
  if (archived.status !== 0) {
    const err = String(archived.stderr || archived.stdout || "").trim();
    throw new Error(`git archive failed: ${err || `exit ${archived.status}`}`);
  }
  if (!fs.existsSync(outPath))
    throw new Error(`git archive produced no file: ${outPath}`);

  const bytes = fs.statSync(outPath).size;
  const mb = bytes / (1024 * 1024);
  console.log(`==> repo pack (git HEAD ${headShort}): ${mb.toFixed(1)} MB -> ${outPath}`);
  if (mb > maxMb) {
    try {
      fs.unlinkSync(outPath);
    }
    catch {
      /* ignore */
    }
    throw new Error(
      `repo pack ${mb.toFixed(1)} MB exceeds ${maxMb} MB limit. `
      + `Refusing to upload — check for unexpected large tracked files.`,
    );
  }
  return { bytes, mb, head: headShort };
}
