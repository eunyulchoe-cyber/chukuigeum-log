const SEOUL = "Asia/Seoul";

export function formatWon(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

export function formatMan(n: number): string {
  if (n >= 10000 && n % 10000 === 0) return (n / 10000).toLocaleString("ko-KR") + "만";
  return formatWon(n);
}

export function todaySeoul(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SEOUL }).format(new Date());
}

export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return `${y}년 ${m}월 ${d}일`;
}

export function formatDateTime(iso: string): string {
  const dt = new Date(iso);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: SEOUL,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dt);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export { honorificName, guestPrompt } from "./copy";
export { brandMonogram as eventMonogram } from "./copy";
