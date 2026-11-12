import { openDB, type IDBPDatabase } from "idb";
import type { BackupFile, EventRecord, GuestRecord, VideoRecord } from "./types";

const DB_NAME = "chukuigeum";
const DB_VERSION = 2;

type KvRecord = { key: string; value: unknown };

type Schema = {
  events: { key: string; value: EventRecord };
  guests: { key: string; value: GuestRecord; indexes: { byEvent: string } };
  videos: { key: string; value: VideoRecord; indexes: { byGuest: string; byEvent: string } };
  kv: { key: string; value: KvRecord };
};

let _db: IDBPDatabase<Schema> | null = null;

async function db(): Promise<IDBPDatabase<Schema>> {
  if (_db) return _db;
  _db = await openDB<Schema>(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        database.createObjectStore("events", { keyPath: "id" });
        const guests = database.createObjectStore("guests", { keyPath: "id" });
        guests.createIndex("byEvent", "eventId");
        const videos = database.createObjectStore("videos", { keyPath: "id" });
        videos.createIndex("byGuest", "guestId");
        videos.createIndex("byEvent", "eventId");
      }
      if (oldVersion < 2 && !database.objectStoreNames.contains("kv")) {
        database.createObjectStore("kv", { keyPath: "key" });
      }
    },
  });
  return _db;
}

export async function listEvents(): Promise<EventRecord[]> {
  const all = await (await db()).getAll("events");
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getEvent(id: string): Promise<EventRecord | undefined> {
  return (await db()).get("events", id);
}

export async function saveEvent(event: EventRecord): Promise<void> {
  await (await db()).put("events", event);
}

export async function listGuests(eventId: string): Promise<GuestRecord[]> {
  const all = await (await db()).getAllFromIndex("guests", "byEvent", eventId);
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getGuest(id: string): Promise<GuestRecord | undefined> {
  return (await db()).get("guests", id);
}

export async function saveGuest(guest: GuestRecord): Promise<void> {
  await (await db()).put("guests", guest);
}

export async function deleteGuest(id: string): Promise<void> {
  const d = await db();
  const videos = await d.getAllFromIndex("videos", "byGuest", id);
  const tx = d.transaction(["guests", "videos"], "readwrite");
  await tx.objectStore("guests").delete(id);
  for (const v of videos) await tx.objectStore("videos").delete(v.id);
  await tx.done;
}

export async function getVideoForGuest(guestId: string): Promise<VideoRecord | undefined> {
  const all = await (await db()).getAllFromIndex("videos", "byGuest", guestId);
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export async function saveVideo(video: VideoRecord): Promise<void> {
  const d = await db();
  const existing = await d.getAllFromIndex("videos", "byGuest", video.guestId);
  const tx = d.transaction(["videos", "guests"], "readwrite");
  for (const v of existing) await tx.objectStore("videos").delete(v.id);
  await tx.objectStore("videos").put(video);
  const guest = await tx.objectStore("guests").get(video.guestId);
  if (guest) await tx.objectStore("guests").put({ ...guest, hasVideo: true, updatedAt: video.createdAt });
  await tx.done;
}

export async function exportBackup(eventId: string): Promise<BackupFile> {
  const event = await getEvent(eventId);
  if (!event) throw new Error("행사를 찾을 수 없습니다.");
  const guests = await listGuests(eventId);
  return { version: 1, exportedAt: new Date().toISOString(), event, guests };
}

export async function importBackup(data: BackupFile, mode: "replace" | "new-id"): Promise<string> {
  if (data.version !== 1 || !data.event || !Array.isArray(data.guests)) {
    throw new Error("백업 파일 형식이 올바르지 않습니다.");
  }
  let event = data.event;
  let guests = data.guests;
  if (mode === "new-id") {
    const newEventId = crypto.randomUUID();
    event = { ...event, id: newEventId, name: event.name + " (가져옴)", updatedAt: new Date().toISOString() };
    guests = guests.map((g) => ({ ...g, id: crypto.randomUUID(), eventId: newEventId, hasVideo: false }));
  }
  const d = await db();
  const tx = d.transaction(["events", "guests"], "readwrite");
  await tx.objectStore("events").put(event);
  if (mode === "replace") {
    const old = await tx.objectStore("guests").index("byEvent").getAll(event.id);
    for (const g of old) await tx.objectStore("guests").delete(g.id);
  }
  for (const g of guests) await tx.objectStore("guests").put({ ...g, eventId: event.id });
  await tx.done;
  return event.id;
}

export async function wipeEvent(eventId: string): Promise<void> {
  const d = await db();
  const guests = await d.getAllFromIndex("guests", "byEvent", eventId);
  const videos = await d.getAllFromIndex("videos", "byEvent", eventId);
  const tx = d.transaction(["events", "guests", "videos"], "readwrite");
  await tx.objectStore("events").delete(eventId);
  for (const g of guests) await tx.objectStore("guests").delete(g.id);
  for (const v of videos) await tx.objectStore("videos").delete(v.id);
  await tx.done;
}

export async function getKv<T>(key: string): Promise<T | undefined> {
  const row = await (await db()).get("kv", key);
  return row ? (row.value as T) : undefined;
}

export async function setKv<T>(key: string, value: T): Promise<void> {
  await (await db()).put("kv", { key, value });
}
