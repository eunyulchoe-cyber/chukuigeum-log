import { useEffect } from "react";
import type { EventType } from "./types";

export const APP_NAME = "마음장부";
export const APP_DESCRIPTION = "경조사 축의금·부의금 접수 기록";
export const APP_KICKER = "경조사 접수";

export function honorificName(eventName: string): string {
  return eventName.replace(/\s*(결혼식|돌잔치|칠순|생신|잔치|장례식|장례|별세).*$/u, "").trim() || eventName;
}


export type EventTone = "celebration" | "mourning";

export const EVENT_TYPE_META: Record<EventType, { label: string; tone: EventTone }> = {
  결혼: { label: "결혼", tone: "celebration" },
  돌: { label: "돌", tone: "celebration" },
  칠순: { label: "칠순/생신", tone: "celebration" },
  부의: { label: "장례/부의", tone: "mourning" },
  기타: { label: "기타 경사", tone: "celebration" },
};

export function eventTone(type?: string | null): EventTone {
  return type === "부의" ? "mourning" : "celebration";
}

export function parseToneParam(raw: string | null | undefined): EventTone {
  return raw === "mourning" || raw === "m" ? "mourning" : "celebration";
}

export function typeLabel(type: string): string {
  return (EVENT_TYPE_META as Record<string, { label: string } | undefined>)[type]?.label ?? type;
}

export const DEFAULT_RELATIONS_CELEBRATION = ["친구", "회사", "친척", "신랑측", "신부측", "기타"];
export const DEFAULT_RELATIONS_MOURNING = ["친구", "회사", "친척", "가족", "지인", "기타"];

export function defaultRelations(type?: string | null): string[] {
  return (eventTone(type) === "mourning" ? DEFAULT_RELATIONS_MOURNING : DEFAULT_RELATIONS_CELEBRATION).slice();
}

export function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export type Copy = {
  amountName: string;
  receptionTitle: string;
  todayReception: string;
  noRecent: string;
  noGuests: string;
  videoShort: string;
  videoLong: string;
  videoHas: string;
  videoQrTitle: (guestName: string) => string;
  videoQrCaption: string;
  videoQrAlt: string;
  tabletRecord: string;
  videoAttachedToast: string;
  guestPromptFallback: string;
  guestPrompt: (eventName: string, type: string) => string;
  guestKicker: (eventName?: string | null) => string;
  guestLead: string;
  guestExpiredTitle: string;
  guestExpiredBody: string;
  guestSuccessTitle: string;
  guestSuccessBody: string;
  sendingVideo: (pct: number) => string;
  excelAmountHeader: string;
  excelSheet: string;
  excelFileSuffix: string;
  driveKicker: string;
  driveBlurb: string;
  monogramDefault: string;
  eventNamePlaceholder: string;
  recordModalTitle: (guestName: string) => string;
};

const celebration: Copy = {
  amountName: "축의금",
  receptionTitle: "축의금 접수",
  todayReception: "오늘 축의금 접수",
  noRecent: "아직 최근 접수가 없습니다.",
  noGuests: "아직 접수가 없습니다.",
  videoShort: "축하 영상",
  videoLong: "축하 영상",
  videoHas: "축하 영상 있음",
  videoQrTitle: (guestName) => `${guestName} 님 축하 영상 QR`,
  videoQrCaption:
    "저장이 끝난 뒤 이 손님용 주소입니다. 앱을 설치하지 않아도 됩니다. 행사 당일에만 유효합니다. 다른 폰에서 올리려면 주최자가 구글 드라이브를 연결해 두어야 합니다.",
  videoQrAlt: "축하 영상 QR 코드",
  tabletRecord: "태블릿으로 촬영",
  videoAttachedToast: "축하 영상을 이 기록에 붙였습니다.",
  guestPromptFallback: "축하하는 영상을 남겨 주세요",
  guestPrompt: (eventName, type) => {
    const who = honorificName(eventName);
    if (type === "결혼") return `${who}님 결혼을 축하하는 영상을 남겨 주세요`;
    if (type === "돌") return `${who} 돌잔치를 축하하는 영상을 남겨 주세요`;
    if (type === "칠순") return `${who}님 생신을 축하하는 영상을 남겨 주세요`;
    return `${who}님께 전하는 축하 영상을 남겨 주세요`;
  },
  guestKicker: (eventName) => (eventName ? `${eventName} · 오늘만 유효` : "축하 영상 · 앱 설치 없음"),
  guestLead: "앱을 설치하지 않아도 됩니다. 최대 1분까지 촬영할 수 있으며, 영상은 주최자의 구글 드라이브로 보내집니다.",
  guestExpiredTitle: "이 링크는 행사 당일에만 사용할 수 있습니다",
  guestExpiredBody: "축하 영상 QR은 행사 날짜에만 유효합니다.",
  guestSuccessTitle: "영상을 보냈습니다. 감사합니다.",
  guestSuccessBody: "주최자의 구글 드라이브에 저장되었으며, 접수 기록에 표시됩니다. 이 링크는 행사 당일에만 유효합니다.",
  sendingVideo: (pct) => (pct < 5 ? "업로드 준비 중…" : `영상을 올리는 중… ${pct}%`),
  excelAmountHeader: "축의금",
  excelSheet: "축의금 목록",
  excelFileSuffix: "축의금목록",
  driveKicker: "손님 축하 영상",
  driveBlurb: "손님이 QR로 찍은 영상은 주최자님의 구글 드라이브에 바로 저장됩니다. 이름과 축의금 목록은 이 태블릿 밖으로 나가지 않습니다.",
  monogramDefault: "마",
  eventNamePlaceholder: "예: 김민준 · 김서연 결혼식",
  recordModalTitle: (guestName) => `${guestName} 님 축하 영상`,
};

const mourning: Copy = {
  amountName: "부의금",
  receptionTitle: "부의금 접수",
  todayReception: "오늘 부의금 접수",
  noRecent: "아직 최근 접수가 없습니다.",
  noGuests: "아직 접수가 없습니다.",
  videoShort: "조문 영상",
  videoLong: "조문 영상/추모 메시지",
  videoHas: "조문 영상 있음",
  videoQrTitle: (guestName) => `${guestName} 님 조문 영상 QR`,
  videoQrCaption:
    "저장이 끝난 뒤 이 손님용 주소입니다. 앱을 설치하지 않아도 됩니다. 행사 당일에만 유효합니다. 다른 폰에서 올리려면 주최자가 구글 드라이브를 연결해 두어야 합니다.",
  videoQrAlt: "조문 영상 QR 코드",
  tabletRecord: "태블릿으로 촬영",
  videoAttachedToast: "조문 영상을 이 기록에 붙였습니다.",
  guestPromptFallback: "삼가 고인의 명복을 빕니다",
  guestPrompt: () => "삼가 고인의 명복을 빕니다",
  guestKicker: (eventName) => (eventName ? `${eventName} · 오늘만 유효` : "조문 영상 · 앱 설치 없음"),
  guestLead: "앱을 설치하지 않아도 됩니다. 최대 1분까지 촬영할 수 있으며, 조문 영상은 주최자의 구글 드라이브로 보내집니다.",
  guestExpiredTitle: "이 링크는 행사 당일에만 사용할 수 있습니다",
  guestExpiredBody: "조문 영상 QR은 행사 날짜에만 유효합니다.",
  guestSuccessTitle: "삼가 고인의 명복을 빕니다.",
  guestSuccessBody: "영상이 주최자의 구글 드라이브에 저장되었으며, 접수 기록에 표시됩니다. 이 링크는 행사 당일에만 유효합니다.",
  sendingVideo: (pct) => (pct < 5 ? "업로드 준비 중…" : `영상을 올리는 중… ${pct}%`),
  excelAmountHeader: "부의금",
  excelSheet: "부의금 목록",
  excelFileSuffix: "부의금목록",
  driveKicker: "손님 조문 영상",
  driveBlurb: "손님이 QR로 찍은 영상은 주최자님의 구글 드라이브에 바로 저장됩니다. 이름과 부의금 목록은 이 태블릿 밖으로 나가지 않습니다.",
  monogramDefault: "마",
  eventNamePlaceholder: "예: 고 김민준 님 장례",
  recordModalTitle: (guestName) => `${guestName} 님 조문 영상`,
};

export function copyFor(tone: EventTone = "celebration"): Copy {
  return tone === "mourning" ? mourning : celebration;
}

export function copyForType(type?: string | null): Copy {
  return copyFor(eventTone(type));
}

export function guestPrompt(type: string, eventName: string): string {
  return copyForType(type).guestPrompt(eventName, type);
}

export function useAppTone(tone: EventTone) {
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.dataset.tone;
    el.dataset.tone = tone;
    return () => {
      if (el.dataset.tone === tone) {
        if (prev && prev !== tone) el.dataset.tone = prev;
        else delete el.dataset.tone;
      }
    };
  }, [tone]);
}

/** Append tone + event name so a guest phone can show the right wording without local data. */
export function appendCopyQuery(url: string, type: string, name: string): string {
  const q = `tone=${eventTone(type)}&type=${encodeURIComponent(type)}&name=${encodeURIComponent(name)}`;
  const hashIdx = url.indexOf("#");
  if (hashIdx >= 0) {
    const pre = url.slice(0, hashIdx);
    const hash = url.slice(hashIdx);
    return `${pre}${hash}${hash.includes("?") ? "&" : "?"}${q}`;
  }
  return `${url}${url.includes("?") ? "&" : "?"}${q}`;
}

export function brandMonogram(name?: string | null, type?: string | null): string {
  const fallback = copyForType(type).monogramDefault;
  if (!name) return fallback;
  const skip = /^(결혼식|돌잔치|칠순|팔순|생신|잔치|부의|장례식|장례|별세|행사)$/;
  const parts = name
    .split(/[·•,/]|와 |과 |\s+/)
    .map((s) => s.trim())
    .filter((s) => s && !skip.test(s) && s !== "고");
  return (parts[0] || name).charAt(0) || fallback;
}

export const DRIVE_TEST_USER_HINT =
  "연결하는 구글 계정이 Google Cloud Console OAuth 동의 화면의 테스트 사용자로 등록되어 있어야 합니다. 테스트 모드에서는 등록된 계정만 연결할 수 있습니다.";

const DRIVE_OAUTH_ERRORS: Record<string, string> = {
  access_denied:
    "이 구글 계정은 아직 테스트 사용자로 등록되어 있지 않거나, 연결이 취소되었습니다. Google Cloud Console → API 및 서비스 → OAuth 동의 화면 → 테스트 사용자에 지금 쓰신 구글 계정을 추가한 뒤, 잠시 기다렸다가 다시 연결해 주세요.",
  denied:
    "이 구글 계정은 아직 테스트 사용자로 등록되어 있지 않거나, 연결이 취소되었습니다. Google Cloud Console의 테스트 사용자 목록을 확인한 뒤 다시 시도해 주세요.",
  missing: "구글 인증 응답이 올바르지 않습니다. 이 페이지에서 다시 연결해 주세요.",
  state: "인증 세션을 확인할 수 없습니다. 이 페이지에서 다시 연결해 주세요.",
  expired: "인증 유효 시간이 지났습니다. 다시 연결해 주세요.",
  no_refresh: "구글이 재연결 권한을 주지 않았습니다. 구글 계정 권한을 해제한 뒤 다시 연결해 주세요.",
  exchange: "구글 인증 토큰을 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.",
  save: "연결 정보를 저장하지 못했습니다. 다시 시도해 주세요.",
  fail: "구글 드라이브 연결에 실패했습니다. 다시 시도해 주세요.",
};

export function driveOauthMessage(code?: string | null): string | null {
  if (!code || code === "ok") return null;
  return DRIVE_OAUTH_ERRORS[code] ?? DRIVE_OAUTH_ERRORS.fail;
}
