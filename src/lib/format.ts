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

export function honorificName(eventName: string): string {
  return eventName.replace(/\s*(결혼식|돌잔치|칠순|잔치|장례식|장례|별세).*$/u, "").trim() || eventName;
}

export function guestPrompt(type: string, eventName: string): string {
  const who = honorificName(eventName);
  if (type === "결혼") return `${who}님 결혼을 축하하는 영상을 남겨주세요`;
  if (type === "돌") return `${who} 돌잔치를 축하하는 영상을 남겨주세요`;
  if (type === "칠순") return `${who}님 칠순을 축하하는 영상을 남겨주세요`;
  if (type === "부의") return `고인을 기리는 마음을 영상으로 남겨 주세요`;
  return `${who}님께 전하는 영상을 남겨주세요`;
}


export function eventMonogram(name?: string | null): string {
  if (!name) return "축";
  const skip = /^(결혼식|돌잔치|칠순|팔순|잔치|부의|장례|행사)$/;
  const parts = name
    .split(/[·•,/]|와 |과 |\s+/)
    .map((s) => s.trim())
    .filter((s) => s && !skip.test(s));
  return (parts[0] || name).charAt(0) || "축";
}
