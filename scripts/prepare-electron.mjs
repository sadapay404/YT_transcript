import { access, cp, mkdir, readdir, realpath, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneRoot = path.join(repositoryRoot, ".next", "standalone");
const staticSource = path.join(repositoryRoot, ".next", "static");
const staticDestination = path.join(standaloneRoot, ".next", "static");
const publicSource = path.join(repositoryRoot, "public");
const publicDestination = path.join(standaloneRoot, "public");

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Next can leave traced dependencies as symlinks under `.next/node_modules`.
 * They work during local Node development, but Windows' NSIS/7-Zip staging
 * cannot reliably archive a link whose target sits elsewhere in the traced
 * tree. Materialise those links before electron-builder sees the payload.
 */
async function materializeSymlinks(root) {
  const pending = [root];
  let count = 0;

  while (pending.length > 0) {
    const directory = pending.pop();
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        const target = await realpath(entryPath);
        const targetStats = await stat(target);
        await rm(entryPath, { recursive: true, force: true });
        if (targetStats.isDirectory()) {
          await cp(target, entryPath, { recursive: true });
        } else {
          await cp(target, entryPath);
        }
        count += 1;
      } else if (entry.isDirectory()) {
        pending.push(entryPath);
      }
    }
  }

  return count;
}

if (!(await exists(path.join(standaloneRoot, "server.js")))) {
  throw new Error(".next/standalone/server.js is missing. Run `next build` before preparing Electron.");
}
if (!(await exists(staticSource))) {
  throw new Error(".next/static is missing. Run `next build` before preparing Electron.");
}

const materializedSymlinkCount = await materializeSymlinks(standaloneRoot);
if (materializedSymlinkCount > 0) {
  console.log(`  materialized ${materializedSymlinkCount} traced dependency symlink(s)`);
}

await rm(staticDestination, { recursive: true, force: true });
await mkdir(path.dirname(staticDestination), { recursive: true });
await cp(staticSource, staticDestination, { recursive: true });

if (await exists(publicSource)) {
  await rm(publicDestination, { recursive: true, force: true });
  await cp(publicSource, publicDestination, { recursive: true });
}

console.log("Electron payload prepared:");
console.log(`  server: ${path.join(standaloneRoot, "server.js")}`);
console.log(`  static: ${staticDestination}`);
if (await exists(publicDestination)) console.log(`  public: ${publicDestination}`);
