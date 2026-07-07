const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT || 3000);
const TIMEZONE = process.env.CALENDAR_TZ || "Asia/Shanghai";
const CALENDAR_NAME = process.env.CALENDAR_NAME || "预约日程";
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(ROOT_DIR, "data");
const DATA_FILE = path.join(DATA_DIR, "bookings.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const BLOB_DATA_PREFIX = (process.env.BLOB_DATA_PREFIX || "apple-calendar-scheduler/data")
  .replace(/^\/+|\/+$/g, "");
const BLOB_ACCESS = process.env.BLOB_ACCESS === "public" ? "public" : "private";
const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

let blobClientPromise;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon"
};

async function ensureDataFile() {
  if (shouldUseBlobStorage() || isVercelRuntime()) return;
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, "[]\n", "utf8");
  }
}

async function ensureUsersFile() {
  if (shouldUseBlobStorage() || isVercelRuntime()) return;
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(USERS_FILE);
  } catch {
    await fs.writeFile(USERS_FILE, "[]\n", "utf8");
  }
}

function isVercelRuntime() {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
}

function shouldUseBlobStorage() {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
      (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID)
  );
}

function blobPath(filename) {
  return `${BLOB_DATA_PREFIX}/${filename}`;
}

async function getBlobClient() {
  if (!blobClientPromise) {
    blobClientPromise = import("@vercel/blob");
  }
  return blobClientPromise;
}

function parseJsonArray(raw, fallback = []) {
  const parsed = JSON.parse(raw || "[]");
  return Array.isArray(parsed) ? parsed : fallback;
}

async function readBlobJson(filename, fallback = []) {
  const { get } = await getBlobClient();
  const result = await get(blobPath(filename), {
    access: BLOB_ACCESS,
    headers: { "cache-control": "no-cache" }
  });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return fallback;
  }

  const raw = await new Response(result.stream).text();
  return parseJsonArray(raw, fallback);
}

async function writeBlobJson(filename, data) {
  const { put } = await getBlobClient();
  await put(blobPath(filename), `${JSON.stringify(data, null, 2)}\n`, {
    access: BLOB_ACCESS,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    contentType: JSON_CONTENT_TYPE
  });
}

async function readLocalJson(filePath, fallback = []) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return parseJsonArray(raw, fallback);
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function assertWritableStorageConfigured() {
  if (!shouldUseBlobStorage() && isVercelRuntime()) {
    throw new Error(
      "Vercel 部署需要先连接 Vercel Blob 存储，并设置 BLOB_READ_WRITE_TOKEN，或连接 Blob Store 让 Vercel 自动提供 OIDC 凭证。"
    );
  }
}

async function readJsonStore(filename, localFile, fallback = []) {
  if (shouldUseBlobStorage()) {
    return readBlobJson(filename, fallback);
  }
  await (filename === "users.json" ? ensureUsersFile() : ensureDataFile());
  return readLocalJson(localFile, fallback);
}

async function writeJsonStore(filename, localFile, data) {
  if (shouldUseBlobStorage()) {
    await writeBlobJson(filename, data);
    return;
  }

  assertWritableStorageConfigured();
  await (filename === "users.json" ? ensureUsersFile() : ensureDataFile());
  await fs.writeFile(localFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function readBookings() {
  const bookings = await readJsonStore("bookings.json", DATA_FILE, []);
  return bookings.sort((a, b) => {
    const left = `${a.date}T${a.startTime}`;
    const right = `${b.date}T${b.startTime}`;
    return left.localeCompare(right);
  });
}

async function writeBookings(bookings) {
  await writeJsonStore("bookings.json", DATA_FILE, bookings);
}

async function readUsers() {
  const users = await readJsonStore("users.json", USERS_FILE, []);
  return users
    .filter(user => user && user.id && user.name)
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

async function writeUsers(users) {
  await writeJsonStore("users.json", USERS_FILE, users);
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, data) {
  send(res, status, JSON.stringify(data), {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
}

function notFound(res) {
  sendJson(res, 404, { error: "Not found" });
}

function readRequestJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body is too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function minutes(value) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function dayIndex(value) {
  const [year, month, day] = value.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function bookingRange(value) {
  const start = dayIndex(value.date) * 1440 + minutes(value.startTime);
  const end = dayIndex(value.date) * 1440 + minutes(value.endTime);
  return { start, end };
}

function rangesOverlap(left, right) {
  return left.start < right.end && right.start < left.end;
}

function hasBookingConflict(input, bookings) {
  const nextRange = bookingRange(input);
  return bookings.some(booking => {
    if (booking.userId !== input.userId) return false;
    if (
      !isValidDate(booking.date) ||
      !isValidTime(booking.startTime) ||
      !isValidTime(booking.endTime) ||
      minutes(booking.endTime) <= minutes(booking.startTime)
    ) {
      return false;
    }

    return rangesOverlap(nextRange, bookingRange(booking));
  });
}

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function validateUser(input, users) {
  const name = normalizeText(input.name);
  const note = normalizeText(input.note);

  if (!name) return "请填写预约用户";
  if (name.length > 50) return "预约用户不能超过 50 个字";
  if (note.length > 120) return "备注不能超过 120 个字";
  if (users.some(user => user.name.toLowerCase() === name.toLowerCase())) {
    return "这个预约用户已经存在";
  }

  return null;
}

function makeUser(input) {
  return {
    id: crypto.randomUUID(),
    name: normalizeText(input.name),
    note: normalizeText(input.note),
    createdAt: new Date().toISOString()
  };
}

function validateBooking(input, users, bookings = []) {
  const applicant = normalizeText(input.applicant);
  const userId = String(input.userId || "").trim();
  const date = String(input.date || "").trim();
  const startTime = String(input.startTime || "").trim();
  const endTime = String(input.endTime || "").trim();

  if (!userId) return "请选择预约用户";
  if (!users.some(user => user.id === userId)) return "预约用户不存在";
  if (!applicant) return "请填写申请人";
  if (!isValidDate(date)) return "请选择有效日期";
  if (!isValidTime(startTime)) return "请选择有效开始时间";
  if (!isValidTime(endTime)) return "请选择有效结束时间";
  if (minutes(endTime) <= minutes(startTime)) {
    return "结束时间必须晚于开始时间";
  }
  if (hasBookingConflict({ userId, date, startTime, endTime }, bookings)) {
    return "该预约用户在这个时间段已有预约";
  }

  return null;
}

function makeBooking(input) {
  return {
    id: crypto.randomUUID(),
    userId: String(input.userId).trim(),
    applicant: normalizeText(input.applicant),
    reason: normalizeText(input.reason),
    date: String(input.date).trim(),
    startTime: String(input.startTime).trim(),
    endTime: String(input.endTime).trim(),
    createdAt: new Date().toISOString()
  };
}

function icsEscape(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function foldIcsLine(line) {
  const parts = [];
  let current = "";
  for (const char of line) {
    const next = current + char;
    if (Buffer.byteLength(next, "utf8") > 73) {
      parts.push(current);
      current = ` ${char}`;
    } else {
      current = next;
    }
  }
  parts.push(current);
  return parts.join("\r\n");
}

function localIcsDate(date, time) {
  return `${date.replaceAll("-", "")}T${time.replace(":", "")}00`;
}

function addDays(date, dayCount) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + dayCount));
  const nextYear = next.getUTCFullYear();
  const nextMonth = String(next.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(next.getUTCDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function bookingEndDate(booking) {
  return minutes(booking.endTime) <= minutes(booking.startTime)
    ? addDays(booking.date, 1)
    : booking.date;
}

function utcIcsDate(value = new Date()) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function eventToIcs(booking, origin, userMap = new Map()) {
  const user = booking.userId ? userMap.get(booking.userId) : null;
  const userName = user ? user.name : "未分配用户";
  const reason = booking.reason || "预约";
  const description = `预约用户：${userName}\n申请人：${booking.applicant}\n原因：${reason}`;
  const lines = [
    "BEGIN:VEVENT",
    `UID:${booking.id}@apple-calendar-scheduler.local`,
    `DTSTAMP:${utcIcsDate()}`,
    `CREATED:${utcIcsDate(new Date(booking.createdAt))}`,
    `DTSTART;TZID=${TIMEZONE}:${localIcsDate(booking.date, booking.startTime)}`,
    `DTEND;TZID=${TIMEZONE}:${localIcsDate(bookingEndDate(booking), booking.endTime)}`,
    `SUMMARY:${icsEscape(`${reason} - ${booking.applicant}`)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    origin ? `URL:${origin}/api/bookings/${booking.id}.ics` : "",
    "END:VEVENT"
  ];
  return lines.filter(Boolean).map(foldIcsLine).join("\r\n");
}

function buildCalendar(bookings, origin, options = {}) {
  const calendarName = options.calendarName || CALENDAR_NAME;
  const userMap = options.userMap || new Map();
  const headerLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Codex//Apple Calendar Scheduler//CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(calendarName)}`,
    `X-WR-TIMEZONE:${TIMEZONE}`
  ];
  const eventBlocks = bookings.map(booking => eventToIcs(booking, origin, userMap));
  const sections = [
    headerLines.map(foldIcsLine).join("\r\n"),
    ...eventBlocks,
    "END:VCALENDAR"
  ];
  return `${sections.join("\r\n")}\r\n`;
}

function getOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers.host || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function safeFilename(value, fallback) {
  const cleaned = String(value || "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || fallback;
}

function userCalendarPath(user) {
  return `/calendar/${encodeURIComponent(user.id)}.ics`;
}

function decorateUsers(users) {
  return users.map(user => ({
    ...user,
    icsUrl: userCalendarPath(user)
  }));
}

function decorateBookings(bookings, users) {
  const userMap = new Map(users.map(user => [user.id, user]));
  return bookings.map(booking => ({
    ...booking,
    userName: booking.userId
      ? userMap.get(booking.userId)?.name || "未知用户"
      : "未分配用户"
  }));
}

async function serveStatic(req, res, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    notFound(res);
    return;
  }

  try {
    const body = await fs.readFile(filePath);
    send(res, 200, body, {
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream"
    });
  } catch {
    notFound(res);
  }
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/users") {
    const users = await readUsers();
    sendJson(res, 200, { users: decorateUsers(users) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/users") {
    const input = await readRequestJson(req);
    const users = await readUsers();
    const error = validateUser(input, users);
    if (error) {
      sendJson(res, 400, { error });
      return;
    }

    const user = makeUser(input);
    users.push(user);
    await writeUsers(users);
    sendJson(res, 201, { user: decorateUsers([user])[0] });
    return;
  }

  const deleteUserMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
  if (req.method === "DELETE" && deleteUserMatch) {
    const userId = decodeURIComponent(deleteUserMatch[1]);
    const users = await readUsers();
    const user = users.find(item => item.id === userId);
    if (!user) {
      notFound(res);
      return;
    }

    const bookings = await readBookings();
    if (bookings.some(booking => booking.userId === userId)) {
      sendJson(res, 409, { error: "该用户已有预约，不能删除" });
      return;
    }

    await writeUsers(users.filter(item => item.id !== userId));
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/bookings") {
    const users = await readUsers();
    const bookings = await readBookings();
    const userId = url.searchParams.get("userId");
    const filteredBookings = userId
      ? bookings.filter(booking => booking.userId === userId)
      : bookings;
    sendJson(res, 200, { bookings: decorateBookings(filteredBookings, users) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/bookings") {
    const input = await readRequestJson(req);
    const users = await readUsers();
    const bookings = await readBookings();
    const error = validateBooking(input, users, bookings);
    if (error) {
      sendJson(res, 400, { error });
      return;
    }

    const booking = makeBooking(input);
    bookings.push(booking);
    await writeBookings(bookings);
    sendJson(res, 201, {
      booking: decorateBookings([booking], users)[0],
      icsUrl: `/api/bookings/${booking.id}.ics`
    });
    return;
  }

  const singleIcsMatch = url.pathname.match(/^\/api\/bookings\/([^/]+)\.ics$/);
  if (req.method === "GET" && singleIcsMatch) {
    const bookings = await readBookings();
    const users = await readUsers();
    const userMap = new Map(users.map(user => [user.id, user]));
    const booking = bookings.find(item => item.id === singleIcsMatch[1]);
    if (!booking) {
      notFound(res);
      return;
    }

    const user = booking.userId ? userMap.get(booking.userId) : null;
    const calendarName = user ? `${CALENDAR_NAME} - ${user.name}` : CALENDAR_NAME;
    const calendar = buildCalendar([booking], getOrigin(req), { calendarName, userMap });
    send(res, 200, calendar, {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"booking-${booking.date}.ics\"`
    });
    return;
  }

  const deleteMatch = url.pathname.match(/^\/api\/bookings\/([^/]+)$/);
  if (req.method === "DELETE" && deleteMatch) {
    const bookings = await readBookings();
    const nextBookings = bookings.filter(item => item.id !== deleteMatch[1]);
    if (nextBookings.length === bookings.length) {
      notFound(res);
      return;
    }

    await writeBookings(nextBookings);
    sendJson(res, 200, { ok: true });
    return;
  }

  notFound(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/calendar.ics" && req.method === "GET") {
      const bookings = await readBookings();
      const users = await readUsers();
      const userMap = new Map(users.map(user => [user.id, user]));
      const calendar = buildCalendar(bookings, getOrigin(req), { userMap });
      send(res, 200, calendar, {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": "inline; filename=\"bookings.ics\"",
        "Cache-Control": "no-cache"
      });
      return;
    }

    const userCalendarMatch = url.pathname.match(/^\/calendar\/([^/]+)\.ics$/);
    if (userCalendarMatch && req.method === "GET") {
      const userId = decodeURIComponent(userCalendarMatch[1]);
      const users = await readUsers();
      const user = users.find(item => item.id === userId);
      if (!user) {
        notFound(res);
        return;
      }

      const bookings = await readBookings();
      const userMap = new Map(users.map(item => [item.id, item]));
      const userBookings = bookings.filter(booking => booking.userId === user.id);
      const calendar = buildCalendar(userBookings, getOrigin(req), {
        calendarName: `${CALENDAR_NAME} - ${user.name}`,
        userMap
      });
      send(res, 200, calendar, {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `inline; filename=\"bookings-${safeFilename(user.name, user.id)}.ics\"`,
        "Cache-Control": "no-cache"
      });
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    await serveStatic(req, res, decodeURIComponent(url.pathname));
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error" });
  }
});

Promise.all([ensureDataFile(), ensureUsersFile()]).then(() => {
  server.listen(PORT, () => {
    console.log(`Schedule booking app running at http://localhost:${PORT}`);
  });
});
