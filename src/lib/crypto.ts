export async function hashPin(pin: string, eventId: string): Promise<string> {
  const data = new TextEncoder().encode(`chukuigeum:v1:${eventId}:${pin}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function newId(): string {
  return crypto.randomUUID();
}
