export const EVENT_TYPES = ["결혼", "돌", "칠순", "부의", "기타"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export type HistoryItem = {
  at: string;
  text: string;
};

export type EventRecord = {
  id: string;
  name: string;
  type: EventType;
  date: string;
  amountButtons: number[];
  relationButtons: string[];
  pinHash: string;
  createdAt: string;
  updatedAt: string;
};

export type GuestRecord = {
  id: string;
  eventId: string;
  name: string;
  relation: string;
  amount: number;
  memo: string;
  createdAt: string;
  updatedAt: string;
  history: HistoryItem[];
  hasVideo: boolean;
};

export type VideoRecord = {
  id: string;
  eventId: string;
  guestId: string;
  blob: Blob;
  mime: string;
  createdAt: string;
};

export type BackupFile = {
  version: 1;
  exportedAt: string;
  event: EventRecord;
  guests: GuestRecord[];
};

export const DEFAULT_AMOUNTS = [50000, 100000, 200000, 300000, 500000];
export const RECENT_LIMIT = 5;
