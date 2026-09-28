const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const PHOTOS_DIR = path.join(DATA_DIR, "photos");
const ENTRIES_FILE = path.join(DATA_DIR, "entries.json");

const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const STATIC_MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

fs.mkdirSync(PHOTOS_DIR, { recursive: true });
if (!fs.existsSync(ENTRIES_FILE)) {
  fs.writeFileSync(ENTRIES_FILE, "[]\n");
}

function readEntries() {
  try {
    const raw = fs.readFileSync(ENTRIES_FILE, "utf8");
    return JSON.parse(raw || "[]");
  } catch {
    return [];
  }
}

function writeEntries(entries) {
  fs.writeFileSync(ENTRIES_FILE, JSON.stringify(entries, null, 2) + "\n");
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

function serveStaticFile(req, res, urlPath) {
  let relativePath = urlPath === "/" ? "/index.html" : urlPath;
  relativePath = decodeURIComponent(relativePath.split("?")[0]);

  const resolvedPath = path.normalize(path.join(ROOT_DIR, relativePath));
  if (!resolvedPath.startsWith(ROOT_DIR)) {
    sendError(res, 403, "Forbidden");
    return;
  }

  fs.readFile(resolvedPath, (err, data) => {
    if (err) {
      sendError(res, 404, "Not found");
      return;
    }
    const ext = path.extname(resolvedPath).toLowerCase();
    const contentType = STATIC_MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

function parseMultipart(buffer, contentType) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);
  if (!boundaryMatch) {
    throw new Error("Missing multipart boundary");
  }
  const boundary = "--" + (boundaryMatch[1] || boundaryMatch[2]);
  const boundaryBuffer = Buffer.from(boundary);
  const parts = [];

  let start = buffer.indexOf(boundaryBuffer);
  while (start !== -1) {
    const nextStart = buffer.indexOf(boundaryBuffer, start + boundaryBuffer.length);
    if (nextStart === -1) break;

    let partBuffer = buffer.slice(start + boundaryBuffer.length, nextStart);
    if (partBuffer.slice(0, 2).toString() === "--") break;
    if (partBuffer.slice(0, 2).toString("latin1") === "\r\n") {
      partBuffer = partBuffer.slice(2);
    }
    partBuffer = partBuffer.slice(0, partBuffer.length - 2);

    const headerEnd = partBuffer.indexOf("\r\n\r\n");
    if (headerEnd !== -1) {
      const headerText = partBuffer.slice(0, headerEnd).toString("utf8");
      const content = partBuffer.slice(headerEnd + 4);

      const nameMatch = headerText.match(/name="([^"]+)"/);
      const filenameMatch = headerText.match(/filename="([^"]*)"/);
      const contentTypeMatch = headerText.match(/Content-Type:\s*([^\r\n]+)/i);

      parts.push({
        name: nameMatch ? nameMatch[1] : null,
        filename: filenameMatch ? filenameMatch[1] : null,
        contentType: contentTypeMatch ? contentTypeMatch[1].trim() : null,
        content,
      });
    }

    start = nextStart;
  }

  return parts;
}

function handleGetEntries(req, res) {
  const entries = readEntries().sort((a, b) => new Date(b.date) - new Date(a.date) || b.createdAt - a.createdAt);
  sendJson(res, 200, entries);
}

function handlePostEntries(req, res) {
  const contentType = req.headers["content-type"] || "";
  if (!contentType.startsWith("multipart/form-data")) {
    sendError(res, 400, "Expected multipart/form-data");
    return;
  }

  const chunks = [];
  let totalSize = 0;
  const MAX_REQUEST_BYTES = (MAX_PHOTO_BYTES + 1024) * MAX_PHOTOS + 1024 * 50;

  req.on("data", (chunk) => {
    totalSize += chunk.length;
    if (totalSize > MAX_REQUEST_BYTES) {
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on("aborted", () => {
    sendError(res, 413, "Upload too large or connection interrupted");
  });

  req.on("end", () => {
    if (totalSize > MAX_REQUEST_BYTES) return;

    let parts;
    try {
      parts = parseMultipart(Buffer.concat(chunks), contentType);
    } catch (err) {
      sendError(res, 400, "Malformed form data");
      return;
    }

    const fields = {};
    const photoParts = [];
    for (const part of parts) {
      if (!part.name) continue;
      if (part.filename !== null && part.filename !== "") {
        photoParts.push(part);
      } else if (part.filename === null) {
        fields[part.name] = part.content.toString("utf8");
      }
    }

    const name = (fields.name || "").trim();
    const title = (fields.title || "").trim();
    const summary = (fields.summary || "").trim();
    const date = (fields.date || "").trim();

    if (!name || !title || !summary || !date) {
      sendError(res, 400, "Name, title, date, and summary are all required.");
      return;
    }
    if (isNaN(new Date(date).getTime())) {
      sendError(res, 400, "Invalid date.");
      return;
    }
    if (photoParts.length > MAX_PHOTOS) {
      sendError(res, 400, `You may upload at most ${MAX_PHOTOS} photos.`);
      return;
    }
    for (const part of photoParts) {
      if (!ALLOWED_TYPES[part.contentType]) {
        sendError(res, 400, `Unsupported photo type: ${part.contentType}`);
        return;
      }
      if (part.content.length > MAX_PHOTO_BYTES) {
        sendError(res, 400, `Photo "${part.filename}" exceeds the 5MB limit.`);
        return;
      }
    }

    const savedFilenames = [];
    try {
      for (const part of photoParts) {
        const ext = ALLOWED_TYPES[part.contentType];
        const filename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
        fs.writeFileSync(path.join(PHOTOS_DIR, filename), part.content);
        savedFilenames.push(filename);
      }
    } catch (err) {
      sendError(res, 500, "Failed to save photos.");
      return;
    }

    const entries = readEntries();
    const entry = {
      id: crypto.randomUUID(),
      name,
      title,
      summary,
      date,
      photos: savedFilenames,
      createdAt: Date.now(),
    };
    entries.push(entry);
    writeEntries(entries);

    sendJson(res, 201, entry);
  });
}

const server = http.createServer((req, res) => {
  const urlPath = req.url.split("?")[0];

  if (req.method === "GET" && urlPath === "/api/entries") {
    handleGetEntries(req, res);
    return;
  }
  if (req.method === "POST" && urlPath === "/api/entries") {
    handlePostEntries(req, res);
    return;
  }
  if (req.method === "GET") {
    serveStaticFile(req, res, urlPath);
    return;
  }

  sendError(res, 405, "Method not allowed");
});

server.listen(PORT, () => {
  console.log(`Learning Summary Portal running at http://localhost:${PORT}/`);
});
