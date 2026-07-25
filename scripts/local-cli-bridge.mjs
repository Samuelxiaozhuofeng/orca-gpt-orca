#!/usr/bin/env node
/**
 * Local CLI HTTP bridge for the Orca AI plugin.
 *
 * The browser/Electron plugin cannot spawn processes. This small Node server
 * accepts run requests over localhost and streams CLI stdout/stderr back.
 *
 * Usage:
 *   node scripts/local-cli-bridge.mjs --port 18777
 *   node scripts/local-cli-bridge.mjs --port 18777 --token secret
 *
 * Endpoints:
 *   GET  /health  → { "ok": true }
 *   POST /run     → JSON body, streams text/event-stream
 *
 * POST /run body:
 *   {
 *     "prompt": string,       // required, sent on stdin
 *     "cwd": string,          // required, must exist as directory
 *     "command": string,      // required, e.g. "codex"
 *     "args": string[]|string,// optional, default []
 *     "timeoutMs": number     // optional, default 300000
 *   }
 *
 * Auth (optional): if --token is set, require Authorization: Bearer <token>.
 */

import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";

const DEFAULT_PORT = 18777;
const DEFAULT_TIMEOUT_MS = 300_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 1_800_000;

const args = parseArgs(process.argv.slice(2));
const port = args.port;
const authToken = args.token;

const server = http.createServer(async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (error) {
    if (!res.headersSent) {
      writeJson(res, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    } else {
      try {
        res.end();
      } catch {
        // connection already closed
      }
    }
    console.error("[bridge] unhandled:", error);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(
    `[local-cli-bridge] listening on http://127.0.0.1:${port}` +
      (authToken ? " (auth required)" : " (no auth)"),
  );
  console.log("[local-cli-bridge] GET  /health");
  console.log("[local-cli-bridge] POST /run");
});

server.on("error", (error) => {
  console.error("[local-cli-bridge] server error:", error);
  process.exit(1);
});

async function handleRequest(req, res) {
  const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  if (pathname === "/health" && req.method === "GET") {
    if (!checkAuth(req, res)) return;
    writeJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/run" && req.method === "POST") {
    if (!checkAuth(req, res)) return;
    await handleRun(req, res);
    return;
  }

  writeJson(res, 404, { error: `Not found: ${req.method} ${pathname}` });
}

function checkAuth(req, res) {
  if (!authToken) return true;
  const header = req.headers.authorization || "";
  const expected = `Bearer ${authToken}`;
  if (header === expected || header === authToken) return true;
  writeJson(res, 401, { error: "Unauthorized: missing or invalid Bearer token." });
  return false;
}

async function handleRun(req, res) {
  const rawBody = await readBody(req, 2 * 1024 * 1024);
  let body;
  try {
    body = JSON.parse(rawBody || "{}");
  } catch {
    writeJson(res, 400, { error: "Invalid JSON body." });
    return;
  }

  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const cwd = typeof body.cwd === "string" ? body.cwd.trim() : "";
  const command = typeof body.command === "string" ? body.command.trim() : "";
  const cliArgs = normalizeArgs(body.args);
  const timeoutMs = clampTimeout(
    typeof body.timeoutMs === "number" ? body.timeoutMs : DEFAULT_TIMEOUT_MS,
  );

  if (!prompt.trim()) {
    writeJson(res, 400, { error: "prompt is required and must be non-empty." });
    return;
  }
  if (!cwd) {
    writeJson(res, 400, { error: "cwd is required." });
    return;
  }
  if (!command) {
    writeJson(res, 400, { error: "command is required." });
    return;
  }

  let cwdStat;
  try {
    cwdStat = fs.statSync(cwd);
  } catch (error) {
    writeJson(res, 400, {
      error: `cwd does not exist: ${cwd} (${error instanceof Error ? error.message : String(error)})`,
    });
    return;
  }
  if (!cwdStat.isDirectory()) {
    writeJson(res, 400, { error: `cwd is not a directory: ${cwd}` });
    return;
  }

  const absCwd = path.resolve(cwd);

  res.writeHead(200, {
    ...corsHeaders(),
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  let closed = false;
  let child = null;
  let timedOut = false;
  let exitCode = null;

  const send = (payload) => {
    if (closed) return;
    const data =
      typeof payload === "string" ? payload : JSON.stringify(payload);
    res.write(`data: ${data}\n\n`);
  };

  const finish = (reason) => {
    if (closed) return;
    clearTimeout(timer);
    send({ event: "done", exitCode, reason, timedOut });
    res.write("data: [DONE]\n\n");
    closed = true;
    res.end();
  };

  const killChild = (signal = "SIGTERM") => {
    if (!child || child.killed) return;
    try {
      child.kill(signal);
    } catch (error) {
      console.error("[bridge] kill failed:", error);
    }
  };

  req.on("close", () => {
    if (closed) return;
    console.log("[bridge] client aborted");
    killChild("SIGTERM");
    setTimeout(() => killChild("SIGKILL"), 1500);
    closed = true;
    clearTimeout(timer);
  });

  const timer = setTimeout(() => {
    timedOut = true;
    console.error(`[bridge] timeout after ${timeoutMs}ms`);
    send({ stderr: `[stderr] timeout after ${timeoutMs}ms\n` });
    killChild("SIGTERM");
    setTimeout(() => killChild("SIGKILL"), 1500);
  }, timeoutMs);

  console.log(
    `[bridge] run command=${command} args=${JSON.stringify(cliArgs)} cwd=${absCwd} timeoutMs=${timeoutMs}`,
  );

  try {
    child = spawn(command, cliArgs, {
      cwd: absCwd,
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });
  } catch (error) {
    send({
      error: `Failed to spawn: ${error instanceof Error ? error.message : String(error)}`,
    });
    finish("spawn_error");
    return;
  }

  child.stdin.write(prompt);
  if (!prompt.endsWith("\n")) child.stdin.write("\n");
  child.stdin.end();

  child.stdout.on("data", (chunk) => {
    const text = stripAnsi(String(chunk));
    if (text) send({ text });
  });

  child.stderr.on("data", (chunk) => {
    const text = stripAnsi(String(chunk));
    if (text) {
      // Visible to the plugin as streaming tokens, clearly labeled.
      send({ text: `[stderr] ${text}` });
    }
  });

  child.on("error", (error) => {
    console.error("[bridge] child error:", error);
    send({
      error: `Process error: ${error instanceof Error ? error.message : String(error)}`,
    });
    finish("error");
  });

  child.on("close", (code, signal) => {
    exitCode = code;
    console.log(`[bridge] exit code=${code} signal=${signal} timedOut=${timedOut}`);
    if (timedOut) {
      finish("timeout");
      return;
    }
    if (code !== 0 && code != null) {
      send({
        text: `\n[bridge] process exited with code ${code}${signal ? ` (signal ${signal})` : ""}\n`,
      });
    }
    finish("exit");
  });
}

function normalizeArgs(value) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim().split(/\s+/).filter(Boolean);
  }
  return [];
}

function clampTimeout(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_TIMEOUT_MS;
  return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, Math.floor(n)));
}

function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;?]*[a-zA-Z]/g, "").replace(/\r/g, "");
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error(`Request body too large (>${maxBytes} bytes).`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function writeJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...corsHeaders(),
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function parseArgs(argv) {
  let port = DEFAULT_PORT;
  let token = "";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--port" || arg === "-p") {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value) || value <= 0 || value > 65535) {
        console.error(`Invalid --port: ${argv[i]}`);
        process.exit(1);
      }
      port = Math.floor(value);
    } else if (arg === "--token" || arg === "-t") {
      token = String(argv[++i] ?? "");
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/local-cli-bridge.mjs [--port 18777] [--token secret]`);
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return { port, token };
}
