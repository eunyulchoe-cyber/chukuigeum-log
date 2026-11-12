import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024 },
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "chukuigeum-video" });
});

app.get("/api/videos/:eventId", (req, res) => {
  const dir = path.join(dataDir, safe(req.params.eventId));
  if (!fs.existsSync(dir)) return res.json({ videos: [] });
  const videos = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    try {
      videos.push(JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")));
    } catch {
      /* skip */
    }
  }
  res.json({ videos });
});

app.get("/api/videos/:eventId/:guestId", (req, res) => {
  const file = binPath(req.params.eventId, req.params.guestId);
  const metaFile = metaPath(req.params.eventId, req.params.guestId);
  if (!fs.existsSync(file)) return res.status(404).json({ error: "없음" });
  let mime = "video/webm";
  if (fs.existsSync(metaFile)) {
    try {
      mime = JSON.parse(fs.readFileSync(metaFile, "utf8")).mime || mime;
    } catch {
      /* default */
    }
  }
  res.setHeader("Content-Type", mime);
  fs.createReadStream(file).pipe(res);
});

app.post("/api/videos/:eventId/:guestId", upload.single("video"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "영상이 없습니다." });
  const eventId = safe(req.params.eventId);
  const guestId = safe(req.params.guestId);
  const dir = path.join(dataDir, eventId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${guestId}.bin`), req.file.buffer);
  const meta = {
    guestId,
    mime: req.file.mimetype || "video/webm",
    size: req.file.size,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(dir, `${guestId}.json`), JSON.stringify(meta));
  res.json({ ok: true, ...meta });
});

app.use(express.static(dist));
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(dist, "index.html"));
});

const port = Number(process.env.PORT || 8787);
app.listen(port, "0.0.0.0", () => {
  console.log(`축의금 로그 server http://0.0.0.0:${port}`);
});

function safe(id) {
  return String(id).replace(/[^a-zA-Z0-9._-]/g, "_");
}
function binPath(eventId, guestId) {
  return path.join(dataDir, safe(eventId), `${safe(guestId)}.bin`);
}
function metaPath(eventId, guestId) {
  return path.join(dataDir, safe(eventId), `${safe(guestId)}.json`);
}
