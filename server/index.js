import express from "express";
import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT || 3000);
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
if (!SUPABASE_URL) throw new Error("Configure SUPABASE_URL nas variáveis do servidor.");

const jwks = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`));
const app = express();
app.disable("x-powered-by");
app.get("/", (_req, res) => res.json({ name: "Zaply", service: "signaling", status: "online" }));
app.get("/health", (_req, res) => res.json({ ok: true, service: "Zaply", time: new Date().toISOString() }));

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
const clients = new Map(); // user id -> active sockets
const calls = new Map();   // call id -> participant user ids

function send(ws, type, data = {}) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, ...data }));
}
function sendUser(userId, type, data = {}) {
  const sockets = clients.get(userId);
  if (!sockets) return false;
  let delivered = false;
  for (const ws of sockets) { send(ws, type, data); delivered = true; }
  return delivered;
}
function removeClient(ws) {
  if (!ws.userId) return;
  const set = clients.get(ws.userId);
  if (set) {
    set.delete(ws);
    if (!set.size) clients.delete(ws.userId);
  }
}
function validId(value) {
  return typeof value === "string" && value.length >= 8 && value.length <= 100;
}
function relayToPeer(ws, type, data) {
  const call = calls.get(data.callId);
  if (!call || !call.users.includes(ws.userId)) return send(ws, "error", { message: "Chamada não encontrada." });
  const peerId = call.users.find(id => id !== ws.userId);
  if (!peerId || !sendUser(peerId, type, { callId: data.callId, from: ws.userId, payload: data.payload ?? null })) {
    return send(ws, "error", { message: "A outra pessoa não está conectada." });
  }
}

server.on("upgrade", (req, socket, head) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.length && (!origin || !ALLOWED_ORIGINS.includes(origin))) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n"); socket.destroy(); return;
  }
  if (req.url !== "/ws") { socket.write("HTTP/1.1 404 Not Found\r\n\r\n"); socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws, req));
});

wss.on("connection", ws => {
  let authenticated = false;
  const authTimeout = setTimeout(() => { if (!authenticated) ws.close(4401, "Autenticação necessária"); }, 7000);
  ws.on("message", async raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return send(ws, "error", { message: "Mensagem inválida." }); }
    if (!authenticated) {
      if (msg.type !== "auth" || typeof msg.token !== "string") return ws.close(4401, "Envie o token de acesso");
      try {
        const { payload } = await jwtVerify(msg.token, jwks, { issuer: `${SUPABASE_URL}/auth/v1` });
        if (!payload.sub) throw new Error("Token sem usuário");
        ws.userId = payload.sub;
        authenticated = true;
        clearTimeout(authTimeout);
        if (!clients.has(ws.userId)) clients.set(ws.userId, new Set());
        clients.get(ws.userId).add(ws);
        return send(ws, "auth:ok", { userId: ws.userId });
      } catch {
        return ws.close(4401, "Token inválido");
      }
    }

    if (msg.type === "call:invite") {
      const to = msg.to;
      if (!validId(to) || to === ws.userId) return send(ws, "error", { message: "Destinatário inválido." });
      const callId = randomUUID();
      if (!sendUser(to, "call:incoming", { callId, from: ws.userId, mode: msg.mode === "video" ? "video" : "audio" })) {
        return send(ws, "call:unavailable", { callId, to });
      }
      calls.set(callId, { users: [ws.userId, to], createdAt: Date.now() });
      return send(ws, "call:ringing", { callId });
    }
    if (["call:accept", "call:reject", "webrtc:offer", "webrtc:answer", "webrtc:ice", "call:end"].includes(msg.type)) {
      if (!validId(msg.callId)) return send(ws, "error", { message: "Identificador de chamada inválido." });
      if (msg.type === "call:end" || msg.type === "call:reject") {
        const call = calls.get(msg.callId);
        if (call && call.users.includes(ws.userId)) {
          const peerId = call.users.find(id => id !== ws.userId);
          sendUser(peerId, msg.type === "call:end" ? "call:ended" : "call:rejected", { callId: msg.callId, from: ws.userId });
          calls.delete(msg.callId);
        }
        return;
      }
      return relayToPeer(ws, msg.type, { callId: msg.callId, payload: msg.payload });
    }
    send(ws, "error", { message: "Evento não reconhecido." });
  });
  ws.on("close", () => {
    clearTimeout(authTimeout);
    removeClient(ws);
  });
  ws.on("error", () => removeClient(ws));
});

setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, call] of calls) if (call.createdAt < cutoff) calls.delete(id);
}, 60_000).unref();

server.listen(PORT, "0.0.0.0", () => console.log(`Zaply signaling server on port ${PORT}`));
