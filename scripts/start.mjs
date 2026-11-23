import { activatePrewarmListener } from "./prewarm-listener.mjs";

process.env.ASTRO_NODE_AUTOSTART = "disabled";
const { startServer } = await import("../dist/server/entry.mjs");
const { server, done } = startServer();
activatePrewarmListener(server.server, process.env.SERVER_CERT_PATH && process.env.SERVER_KEY_PATH ? "https" : "http");
await done;
