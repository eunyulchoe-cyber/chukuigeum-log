import * as XLSX from "xlsx";
import { copyForType } from "./copy";
import type { EventRecord, GuestRecord } from "./types";
import { formatDateTime, formatWon } from "./format";

export function buildWorkbook(event: EventRecord, guests: GuestRecord[]): XLSX.WorkBook {
  const c = copyForType(event.type);
  const rows: (string | number)[][] = [
    ["행사", event.name],
    ["종류", event.type],
    ["날짜", event.date],
    [],
    ["이름", "관계", c.excelAmountHeader, "메모", "접수 시각", c.videoShort],
  ];
  for (const g of guests) {
    rows.push([
      g.name,
      g.relation || "",
      g.amount,
      g.memo || "",
      formatDateTime(g.createdAt),
      g.hasVideo ? "있음" : "없음",
    ]);
  }
  const total = guests.reduce((s, g) => s + g.amount, 0);
  rows.push([]);
  rows.push(["총건수", guests.length]);
  rows.push(["총합계", total, formatWon(total)]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, c.excelSheet);
  return wb;
}

export function downloadWorkbook(event: EventRecord, guests: GuestRecord[]): void {
  const wb = buildWorkbook(event, guests);
  const c = copyForType(event.type);
  const safe = event.name.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 40);
  XLSX.writeFile(wb, `${safe}_${c.excelFileSuffix}.xlsx`);
}
