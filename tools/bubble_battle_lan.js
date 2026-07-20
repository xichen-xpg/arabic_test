#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 8787);
const rooms = new Map();
let nextId = 1;

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav"
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const file = path.resolve(root, pathname.replace(/^\/+/, ""));
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "content-type": types[path.extname(file).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-cache"
    });
    fs.createReadStream(file).pipe(res);
  });
});

server.on("upgrade", (req, socket) => {
  if (req.url !== "/bubble-ws") {
    socket.destroy();
    return;
  }
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }
  const accept = crypto
    .createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "",
    ""
  ].join("\r\n"));
  attachClient(socket);
});

function attachClient(socket) {
  const client = {
    id: `p${nextId++}`,
    name: "玩家",
    room: "",
    socket,
    buffer: Buffer.alloc(0)
  };
  socket.on("data", (chunk) => {
    client.buffer = Buffer.concat([client.buffer, chunk]);
    readFrames(client);
  });
  socket.on("close", () => removeClient(client));
  socket.on("error", () => removeClient(client));
}

function readFrames(client) {
  while (client.buffer.length >= 2) {
    const first = client.buffer[0];
    const second = client.buffer[1];
    const opcode = first & 0x0f;
    const masked = Boolean(second & 0x80);
    let length = second & 0x7f;
    let offset = 2;
    if (length === 126) {
      if (client.buffer.length < 4) return;
      length = client.buffer.readUInt16BE(2);
      offset = 4;
    } else if (length === 127) {
      if (client.buffer.length < 10) return;
      const high = client.buffer.readUInt32BE(2);
      const low = client.buffer.readUInt32BE(6);
      length = high * 2 ** 32 + low;
      offset = 10;
    }
    const maskOffset = masked ? offset : -1;
    if (masked) offset += 4;
    if (client.buffer.length < offset + length) return;
    let payload = client.buffer.subarray(offset, offset + length);
    if (masked) {
      const mask = client.buffer.subarray(maskOffset, maskOffset + 4);
      payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
    }
    client.buffer = client.buffer.subarray(offset + length);
    if (opcode === 8) {
      client.socket.end();
      return;
    }
    if (opcode === 1) {
      handleMessage(client, payload.toString("utf8"));
    }
  }
}

function handleMessage(client, text) {
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    return;
  }
  if (data.type === "join") {
    joinRoom(client, String(data.room || "bubble").slice(0, 24), String(data.name || "玩家").slice(0, 18));
    return;
  }
  if (!client.room) return;
  if (data.type === "input") {
    sendToHost(client, { type: "input", id: client.id, input: data.input || {} });
  } else if (data.type === "state") {
    broadcast(client.room, { type: "state", state: data.state, running: data.running }, client.id);
  }
}

function joinRoom(client, roomName, name) {
  if (client.room) removeClient(client);
  client.room = roomName;
  client.name = name;
  if (!rooms.has(roomName)) rooms.set(roomName, { host: client.id, clients: new Map() });
  const room = rooms.get(roomName);
  room.clients.set(client.id, client);
  if (!room.host || !room.clients.has(room.host)) room.host = client.id;
  send(client, { type: "welcome", id: client.id, host: room.host === client.id });
  broadcastPeers(roomName);
}

function removeClient(client) {
  if (!client.room || !rooms.has(client.room)) return;
  const room = rooms.get(client.room);
  room.clients.delete(client.id);
  if (!room.clients.size) {
    rooms.delete(client.room);
  } else {
    if (room.host === client.id) room.host = room.clients.keys().next().value;
    broadcastPeers(client.room);
  }
  client.room = "";
}

function broadcastPeers(roomName) {
  const room = rooms.get(roomName);
  if (!room) return;
  const peers = [...room.clients.values()].map((client) => ({ id: client.id, name: client.name }));
  broadcast(roomName, { type: "peers", peers, host: room.host });
}

function sendToHost(from, payload) {
  const room = rooms.get(from.room);
  if (!room) return;
  const host = room.clients.get(room.host);
  if (host) send(host, payload);
}

function broadcast(roomName, payload, exceptId = "") {
  const room = rooms.get(roomName);
  if (!room) return;
  room.clients.forEach((client) => {
    if (client.id !== exceptId) send(client, payload);
  });
}

function send(client, payload) {
  if (client.socket.destroyed) return;
  const data = Buffer.from(JSON.stringify(payload));
  let header = null;
  if (data.length < 126) {
    header = Buffer.from([0x81, data.length]);
  } else if (data.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(data.length, 6);
  }
  client.socket.write(Buffer.concat([header, data]));
}

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Bubble Battle LAN may already be running.`);
    console.error(`Open http://localhost:${port}/games/bubble-battle.html or close the existing server first.`);
    process.exit(1);
  }
  throw error;
});

server.listen(port, "0.0.0.0", () => {
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => `http://${item.address}:${port}/`);
  console.log(`Bubble Battle LAN server running on http://localhost:${port}/`);
  addresses.forEach((address) => console.log(`LAN: ${address}`));
});
