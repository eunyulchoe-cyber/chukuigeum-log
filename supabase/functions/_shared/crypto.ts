const enc = new TextEncoder();
const dec = new TextDecoder();

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("invalid key");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function b64(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importKey(hex: string, usage: KeyUsage[]): Promise<CryptoKey> {
  const raw = hexToBytes(hex);
  if (raw.length !== 32) throw new Error("DRIVE_TOKEN_KEY must be 32 bytes hex");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, usage);
}

export async function encryptString(plain: string, keyHex: string): Promise<string> {
  const key = await importKey(keyHex, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain));
  return `${b64(iv)}.${b64(ct)}`;
}

export async function decryptString(packed: string, keyHex: string): Promise<string> {
  const [ivB64, ctB64] = packed.split(".");
  if (!ivB64 || !ctB64) throw new Error("invalid ciphertext");
  const key = await importKey(keyHex, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(ivB64) }, key, unb64(ctB64));
  return dec.decode(pt);
}

export async function hmacSign(payload: string, keyHex: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    hexToBytes(keyHex),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return b64(sig).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function hmacVerify(payload: string, sig: string, keyHex: string): Promise<boolean> {
  const expected = await hmacSign(payload, keyHex);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

export type MediaTicket = { hostId: string; eventId: string; fileId: string; exp: number };

export async function issueMediaTicket(data: Omit<MediaTicket, "exp">, keyHex: string, ttlSec = 600): Promise<string> {
  const ticket: MediaTicket = { ...data, exp: Math.floor(Date.now() / 1000) + ttlSec };
  const payload = b64(enc.encode(JSON.stringify(ticket))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const sig = await hmacSign(payload, keyHex);
  return `${payload}.${sig}`;
}

export async function verifyMediaTicket(token: string, keyHex: string): Promise<MediaTicket | null> {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!(await hmacVerify(payload, sig, keyHex))) return null;
  const pad = "=".repeat((4 - (payload.length % 4)) % 4);
  const json = dec.decode(unb64(payload.replace(/-/g, "+").replace(/_/g, "/") + pad));
  try {
    const t = JSON.parse(json) as MediaTicket;
    if (!t.hostId || !t.eventId || !t.fileId || !t.exp) return null;
    if (t.exp < Math.floor(Date.now() / 1000)) return null;
    return t;
  } catch {
    return null;
  }
}
