import { access, cp, mkdir, rm } from "node:fs/promises";
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

if (!(await exists(path.join(standaloneRoot, "server.js")))) {
  throw new Error(".next/standalone/server.js is missing. Run `next build` before preparing Electron.");
}
if (!(await exists(staticSource))) {
  throw new Error(".next/static is missing. Run `next build` before preparing Electron.");
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
