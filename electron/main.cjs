/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { readBundledKeys } = require("./bundled-keys.cjs");
const HOST = "127.0.0.1";
const SERVER_START_TIMEOUT_MS = 30_000;

let mainWindow = null;
let nextServer = null;
let serverUrl = null;
let quitting = false;
let serverLog = "";

if (process.platform === "win32") {
  app.setAppUserModelId("com.transtudio.desktop");
}

function appendServerLog(chunk) {
  serverLog = `${serverLog}${chunk}`.slice(-8_000);
  // Keep the child output available for debugging without exposing environment
  // variables or sending anything to a remote service.
  process.stdout.write(`[TranStudio server] ${chunk}`);
}

function serverRoot() {
  if (!app.isPackaged) {
    return path.resolve(__dirname, "..", ".next", "standalone");
  }

  // electron-builder unpacks the standalone Next tree because Node cannot
  // execute a child script from inside an asar archive.
  return path.join(process.resourcesPath, "app.asar.unpacked", ".next", "standalone");
}

function parseEnvFile(contents) {
  const values = {};
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;

    let value = match[2];
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    } else {
      // This is intentionally a small dotenv reader: support comments after
      // an unquoted value, but do not try to interpret shell expressions.
      value = value.replace(/\s+#.*$/, "");
    }
    values[match[1]] = value.replace(/\\n/g, "\n");
  }
  return values;
}

function readDesktopEnv() {
  const envPath = path.join(app.getPath("userData"), ".env.local");
  try {
    return parseEnvFile(fs.readFileSync(envPath, "utf8"));
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      console.warn(`[TranStudio] Could not read ${envPath}: ${error.message}`);
    }
    return {};
  }
}

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, HOST, () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : null;
      probe.close((error) => {
        if (error) reject(error);
        else if (!port) reject(new Error("Could not choose a local TranStudio port."));
        else resolve(port);
      });
    });
  });
}

function probeServer(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(Boolean(response.statusCode && response.statusCode < 500));
    });
    request.setTimeout(1_000, () => {
      request.destroy();
      resolve(false);
    });
    request.once("error", () => resolve(false));
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForServer(url, child) {
  const deadline = Date.now() + SERVER_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `The local Next server stopped before the app opened (exit ${child.exitCode}).\n\n${serverLog}`,
      );
    }
    if (await probeServer(url)) return;
    await delay(150);
  }
  throw new Error(`The local Next server did not become ready in time.\n\n${serverLog}`);
}

async function startNextServer() {
  const root = serverRoot();
  const entrypoint = path.join(root, "server.js");
  if (!fs.existsSync(entrypoint)) {
    throw new Error(
      `TranStudio's standalone server is missing:\n${entrypoint}\n\nRun the desktop build first so Next can create .next/standalone.`,
    );
  }

  const port = await getAvailablePort();
    const desktopEnv = readDesktopEnv();
  // Built-in AI keys (packed at build time) are the lowest layer, so a key the
  // user sets in %APPDATA%\TranStudio\.env.local always takes precedence.
  const bundledKeys = readBundledKeys();
  const environment = {
    ...bundledKeys,
    ...desktopEnv,
    ...process.env,
    NODE_ENV: "production",
    HOSTNAME: HOST,
    PORT: String(port),
    NEXT_TELEMETRY_DISABLED: "1",
    // Electron's executable can run a regular Node entry point in this mode.
    ELECTRON_RUN_AS_NODE: "1",
  };

  nextServer = spawn(process.execPath, [entrypoint], {
    cwd: root,
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  nextServer.stdout.on("data", appendServerLog);
  nextServer.stderr.on("data", appendServerLog);
  nextServer.once("error", (error) => {
    appendServerLog(`\n[process error] ${error.message}\n`);
  });
  nextServer.once("exit", (code, signal) => {
    if (!quitting) {
      appendServerLog(`\n[process exit] code=${code ?? "null"} signal=${signal ?? "none"}\n`);
    }
  });

  serverUrl = `http://${HOST}:${port}`;
  await waitForServer(serverUrl, nextServer);
  return serverUrl;
}

function stopNextServer() {
  if (!nextServer || nextServer.killed) return;
  try {
    if (process.platform === "win32" && nextServer.pid) {
      // Terminate the process tree so a Windows child worker cannot outlive
      // the shell after the user closes the window.
      spawn("taskkill", ["/pid", String(nextServer.pid), "/t", "/f"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } else {
      nextServer.kill("SIGTERM");
    }
  } catch (error) {
    console.warn(`[TranStudio] Could not stop the local server: ${error.message}`);
  }
  nextServer = null;
}

function isInternalUrl(candidate) {
  if (!serverUrl) return false;
  try {
    const expected = new URL(serverUrl);
    const actual = new URL(candidate);
    return (
      actual.protocol === expected.protocol &&
      actual.hostname === expected.hostname &&
      actual.port === expected.port
    );
  } catch {
    return false;
  }
}

async function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 700,
    show: false,
    backgroundColor: "#f4f0e8",
    // Set the window icon explicitly as well as electron-builder's installer
    // icon. Windows uses this value for the taskbar identity at runtime.
    icon: path.join(__dirname, "icon.ico"),
    title: "TranStudio — Read it. Clip it. Ship it.",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (!isInternalUrl(target)) void shell.openExternal(target);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, target) => {
    if (event.isMainFrame && !isInternalUrl(target)) {
      event.preventDefault();
      void shell.openExternal(target);
    }
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    if (errorCode !== -3) {
      console.warn(`[TranStudio] Could not load ${validatedURL}: ${errorCode} ${errorDescription}`);
    }
  });

  mainWindow.once("ready-to-show", () => {
    if (mainWindow) mainWindow.show();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(url);
}

app.whenReady().then(async () => {
  try {
    const url = await startNextServer();
    await createWindow(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[TranStudio] ${message}`);
    await dialog.showMessageBox({
      type: "error",
      title: "TranStudio could not start",
      message: "The local TranStudio server could not start.",
      detail: message,
    });
    app.quit();
  }
});

app.on("before-quit", () => {
  quitting = true;
  stopNextServer();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", async () => {
  if (mainWindow) return;
  try {
    if (!serverUrl) serverUrl = await startNextServer();
    await createWindow(serverUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await dialog.showErrorBox("TranStudio could not reopen", message);
    app.quit();
  }
});

// Keep async startup failures from becoming an unhelpful native crash dialog.
process.on("unhandledRejection", (error) => {
  console.error("[TranStudio] Unhandled startup error", error);
});

