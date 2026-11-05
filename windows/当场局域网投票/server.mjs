import { execFile } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID } from "node:crypto";

const root = dirname(fileURLToPath(import.meta.url));
const publicDir = join(root, "public");
const dataDir = join(root, "data");
mkdirSync(dataDir, { recursive: true });

const QUESTION_MAX = 48;
const OPTION_MAX = 28;
const PORT_START = Number(process.env.PORT) || 8787;

const keyPath = join(dataDir, "host-key.txt");
const pollPath = join(dataDir, "poll.json");
const hostKey = existsSync(keyPath) ? readFileSync(keyPath, "utf8").trim() : randomBytes(18).toString("hex");
if (!existsSync(keyPath)) writeFileSync(keyPath, hostKey, "utf8");

/** @type {{ question: string, options: {id: string, label: string, votes: number}[], voters: Record<string, string> } | null} */
let poll = null;
try {
  if (existsSync(pollPath)) {
    const saved = JSON.parse(readFileSync(pollPath, "utf8"));
    if (saved && typeof saved.question === "string" && Array.isArray(saved.options)) poll = saved;
  }
} catch {
  poll = null;
}

let version = 1;
/** @type {Set<import('node:http').ServerResponse>} */
const clients = new Set();

function percentages(votes) {
  const total = votes.reduce((sum, n) => sum + n, 0);
  if (total <= 0) return votes.map(() => 0);
  const exact = votes.map((n) => (n / total) * 100);
  const floored = exact.map((n) => Math.floor(n));
  let left = 100 - floored.reduce((sum, n) => sum + n, 0);
  const order = exact
    .map((n, index) => ({ index, frac: n - Math.floor(n) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  const out = [...floored];
  for (let i = 0; i < left; i += 1) {
    const slot = order[i];
    if (!slot) break;
    out[slot.index] += 1;
  }
  return out;
}

function lanUrls(port) {
  const urls = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      const family = net.family;
      if (net.internal) continue;
      if (family !== "IPv4" && family !== 4) continue;
      urls.push(`http://${net.address}:${port}`);
    }
  }
  return urls;
}

function snapshot(voterId, isHost, port) {
  if (!poll) {
    return {
      error: null,
      phase: isHost ? "compose" : "waiting",
      isHost,
      links: isHost ? lanUrls(port) : [],
      online: clients.size,
      question: "",
      options: [],
      total: 0,
      myChoiceId: null,
      version,
    };
  }
  const counts = poll.options.map((option) => option.votes);
  const shares = percentages(counts);
  return {
    error: null,
    phase: "live",
    isHost,
    links: isHost ? lanUrls(port) : [],
    online: clients.size,
    question: poll.question,
    options: poll.options.map((option, index) => ({
      id: option.id,
      label: option.label,
      votes: option.votes,
      percent: shares[index] ?? 0,
    })),
    total: counts.reduce((sum, n) => sum + n, 0),
    myChoiceId: poll.voters[voterId] ?? null,
    version,
  };
}

function savePoll() {
  writeFileSync(pollPath, JSON.stringify(poll), "utf8");
}

function broadcast() {
  const chunk = `data: ${version}\n\n`;
  for (const client of clients) {
    client.write(chunk);
  }
}

function bump() {
  version += 1;
  savePoll();
  broadcast();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 20_000) {
        reject(new Error("too-large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("bad-json"));
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function voterOf(value) {
  const id = String(value ?? "").slice(0, 80);
  return /^[A-Za-z0-9-]{8,80}$/.test(id) ? id : "";
}

function isHostKey(value) {
  return String(value ?? "") === hostKey;
}

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

function serveStatic(req, res, url) {
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const rel = pathname.replace(/^[/\\]+/, "");
  const file = normalize(join(publicDir, rel));
  if (!file.startsWith(publicDir + sep) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("找不到页面");
    return;
  }
  res.writeHead(200, {
    "content-type": types[extname(file)] || "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(file).pipe(res);
}

function listen(port) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
    try {
      if (url.pathname === "/api/events") {
        res.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        res.write(`data: ${version}\n\n`);
        clients.add(res);
        broadcast();
        const beat = setInterval(() => res.write(": ping\n\n"), 15000);
        req.on("close", () => {
          clearInterval(beat);
          clients.delete(res);
          broadcast();
        });
        return;
      }

      if (url.pathname === "/api/state" && req.method === "GET") {
        const voterId = voterOf(url.searchParams.get("voter"));
        const isHost = isHostKey(url.searchParams.get("host"));
        send(res, 200, snapshot(voterId, isHost, port));
        return;
      }

      if (url.pathname === "/api/state" && req.method === "POST") {
        const body = await readBody(req);
        const voterId = voterOf(body.voterId);
        const isHost = isHostKey(body.hostKey);
        const fail = (error) => send(res, 200, { ...snapshot(voterId, isHost, port), error });

        if (body.action === "create") {
          if (!isHost) return fail("只有主持人能发起投票。");
          if (poll) return fail("已经有一场投票。请先发起新投票。");
          const question = String(body.question ?? "").trim().slice(0, QUESTION_MAX);
          const labels = Array.isArray(body.options)
            ? body.options.map((item) => String(item ?? "").trim().slice(0, OPTION_MAX))
            : [];
          if (!question) return fail("先写下一个问题。");
          if (labels.length < 2) return fail("至少需要两个选项。");
          if (labels.length > 6) return fail("最多 6 个选项。");
          if (labels.some((label) => !label)) return fail("每个选项都要有文字。");
          if (new Set(labels).size !== labels.length) return fail("选项不能重复。");
          poll = {
            question,
            voters: {},
            options: labels.map((label) => ({ id: randomUUID(), label, votes: 0 })),
          };
          bump();
          send(res, 200, snapshot(voterId, isHost, port));
          return;
        }

        if (body.action === "vote") {
          if (!voterId) return fail("无法确认这台设备，请刷新后再投。");
          if (!poll) return fail("还没有进行中的投票。");
          if (poll.voters[voterId]) return fail("你已经投过了。");
          const option = poll.options.find((item) => item.id === String(body.optionId ?? ""));
          if (!option) return fail("这个选项不存在。");
          option.votes += 1;
          poll.voters[voterId] = option.id;
          bump();
          send(res, 200, snapshot(voterId, isHost, port));
          return;
        }

        if (body.action === "reset") {
          if (!isHost) return fail("只有主持人能重置票数。");
          if (poll) {
            for (const option of poll.options) option.votes = 0;
            poll.voters = {};
            bump();
          }
          send(res, 200, snapshot(voterId, isHost, port));
          return;
        }

        if (body.action === "new") {
          if (!isHost) return fail("只有主持人能发起新投票。");
          poll = null;
          bump();
          send(res, 200, snapshot(voterId, isHost, port));
          return;
        }

        return fail("无法识别的操作。");
      }

      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
        res.end("不支持的请求");
        return;
      }
      serveStatic(req, res, url);
    } catch (error) {
      const message = error instanceof Error && error.message === "too-large" ? "内容太长。" : "请求没有完成。";
      send(res, 400, { error: message });
    }
  });

  server.on("error", (error) => {
    if (error && error.code === "EADDRINUSE" && port < PORT_START + 10) {
      listen(port + 1);
      return;
    }
    console.error("当场没能启动。", error);
    process.exit(1);
  });

  server.listen(port, "0.0.0.0", () => {
    const local = `http://127.0.0.1:${port}/?host=${hostKey}`;
    const links = lanUrls(port);
    console.log("");
    console.log("当场已启动。不要关闭这个窗口，关掉就会停止投票。");
    console.log(`本机主持页：${local}`);
    if (links.length) {
      console.log("同一 Wi-Fi 的其他人打开：");
      for (const link of links) console.log(`  ${link}`);
    } else {
      console.log("没有发现局域网地址。请先连上 Wi-Fi 或网线，然后重新打开。");
    }
    console.log("如果手机打不开，请在 Windows 防火墙提示里允许 Node.js 访问。");
    console.log("");
    if (process.env.DANGCHANG_NO_OPEN === "1" || process.platform !== "win32") return;
    execFile("cmd.exe", ["/c", "start", "", local], { windowsHide: true });
  });
}

listen(PORT_START);
