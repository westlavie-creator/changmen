import { io } from "../gamebet_frontend/app/node_modules/socket.io-client/build/esm/index.js";

const url = process.env.A8_WS_URL || "https://47.115.75.57";
const token = process.env.A8_SOCKET_TOKEN || "";

const socket = io(url, {
  transports: ["websocket"],
  extraHeaders: { Origin: "https://api.a8.to", token: token || "hello" },
});

let count = 0;
socket.on("connect", () => {
  console.log("connected");
  socket.emit("join room", "IM");
});
socket.on("chat message", (raw) => {
  try {
    const packet = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (packet.channel !== "IM") return;
    count++;
    console.log("--- sample", count, "---");
    console.log(JSON.stringify(packet.message, null, 2).slice(0, 4000));
    if (count >= 3) {
      socket.disconnect();
      process.exit(0);
    }
  } catch (e) {
    console.error(e);
  }
});
setTimeout(() => {
  console.log("timeout, got", count);
  process.exit(count ? 0 : 1);
}, 25000);
