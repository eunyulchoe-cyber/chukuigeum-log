import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import QRCode from "qrcode";
import { Keypad } from "../components/Keypad";
import { QrCard } from "../components/QrCard";
import { RecordModal } from "../components/RecordModal";
import { Atmosphere } from "../components/Atmosphere";
import { Toast } from "../components/Toast";
import { UndoBar } from "../components/UndoBar";
import { downloadRemoteVideo, listRemoteVideos } from "../lib/api";
import { issueUploadToken, listEventVideos, registerEvent } from "../lib/cloud";
import { loadHost } from "../lib/host";
import { newId } from "../lib/crypto";
import { getEvent, getGuest, listGuests, saveGuest, saveVideo, deleteGuest } from "../lib/db";
import { eventMonogram, formatDate, formatWon, formatMan, nowIso } from "../lib/format";
import { RECENT_LIMIT, type EventRecord, type GuestRecord } from "../lib/types";

export function Reception() {
  const { eventId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [guests, setGuests] = useState<GuestRecord[]>([]);
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [digits, setDigits] = useState("");
  const [keypad, setKeypad] = useState(false);
  const [memo, setMemo] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState("");
  const [undo, setUndo] = useState<{ id: string; label: string; left: number } | null>(null);
  const [toast, setToast] = useState("");
  const [recording, setRecording] = useState(false);

  const reload = useCallback(async () => {
    const e = await getEvent(eventId);
    if (!e) return;
    setEvent(e);
    setGuests(await listGuests(eventId));
  }, [eventId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const edit = params.get("edit");
    if (!edit) return;
    void getGuest(edit).then((g) => {
      if (!g || g.eventId !== eventId) return;
      fillEdit(g);
      setParams({}, { replace: true });
    });
  }, [params, eventId, setParams]);

  useEffect(() => {
    if (!undo) return;
    const t = setInterval(() => {
      setUndo((u) => {
        if (!u) return null;
        if (u.left <= 1) return null;
        return { ...u, left: u.left - 1 };
      });
    }, 1000);
    return () => clearInterval(t);
  }, [undo]);

  useEffect(() => {
    const last = guests.find((g) => g.id === lastSavedId) ?? guests.filter((g) => recentIds(guests).includes(g.id)).at(-1);
    if (!last) {
      setQrUrl("");
      return;
    }
    let cancelled = false;
    const base = new URL(import.meta.env.BASE_URL, location.href).href;
    const fallback = `${base}#/g/${eventId}/${last.id}`;
    const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#111111";
    const paper = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() || "#ffffff";
    void (async () => {
      let url = fallback;
      try {
        const ev = await getEvent(eventId);
        const host = await loadHost();
        if (ev && host?.hostSecret && host.googleConnected) {
          await registerEvent(host.hostSecret, { id: ev.id, date: ev.date, name: ev.name });
          const tok = await issueUploadToken(host.hostSecret, eventId, last.id);
          url = tok.uploadUrl;
        }
      } catch {
        url = fallback;
      }
      const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 264, color: { dark: ink, light: paper } });
      if (!cancelled) setQrUrl(dataUrl);
    })();
    return () => {
      cancelled = true;
    };
  }, [lastSavedId, guests, eventId]);

  // Pull remote videos when a server is present
  useEffect(() => {
    if (!eventId) return;
    let stop = false;
    const tick = async () => {
      try {
        const host = await loadHost();
        if (host?.hostSecret) {
          const cloud = await listEventVideos(host.hostSecret, eventId);
          for (const v of cloud) {
            if (stop) return;
            const g = await getGuest(v.guestId);
            if (g && !g.hasVideo) {
              await saveGuest({ ...g, hasVideo: true, updatedAt: v.completedAt });
            }
          }
        }
      } catch {
        // Drive relay may be unconfigured or offline.
      }
      const remote = await listRemoteVideos(eventId);
      for (const v of remote) {
        if (stop) return;
        const g = await getGuest(v.guestId);
        if (!g || g.hasVideo) continue;
        const blob = await downloadRemoteVideo(eventId, v.guestId);
        if (!blob) continue;
        await saveVideo({
          id: newId(),
          eventId,
          guestId: v.guestId,
          blob,
          mime: v.mime || blob.type,
          createdAt: v.createdAt || nowIso(),
        });
      }
      if (!stop) setGuests(await listGuests(eventId));
    };
    void tick();
    const t = setInterval(() => void tick(), 5000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [eventId]);

  const confirm = name.trim() && amount ? confirmLabel(name.trim(), relation, amount) : null;
  const dups = name.trim()
    ? guests.filter((g) => g.name.trim() === name.trim() && g.id !== editingId)
    : [];
  const recent = useMemo(() => guests.filter((g) => recentIds(guests).includes(g.id)).slice().reverse(), [guests]);
  const last = guests.find((g) => g.id === lastSavedId) ?? recent[0];

  function fillEdit(g: GuestRecord) {
    setEditingId(g.id);
    setName(g.name);
    setRelation(g.relation);
    setAmount(g.amount);
    setDigits(String(g.amount));
    setMemo(g.memo);
    setKeypad(false);
    setUndo(null);
  }

  function pressKey(k: string) {
    let next = digits;
    if (k === "C") next = "";
    else if (k === "←") next = digits.slice(0, -1);
    else if (digits.length < 9) next = digits + k;
    setDigits(next);
    const n = Number(next);
    setAmount(Number.isFinite(n) && n > 0 ? n : null);
  }

  function resetForm() {
    setName("");
    setRelation("");
    setAmount(null);
    setDigits("");
    setKeypad(false);
    setMemo("");
    setEditingId(null);
  }

  async function save() {
    if (!confirm || !event || amount === null) return;
    const now = nowIso();
    if (editingId) {
      const prev = guests.find((g) => g.id === editingId);
      if (!prev) return;
      const changes: string[] = [];
      if (prev.name !== name.trim()) changes.push(`이름 ${prev.name} → ${name.trim()}`);
      if (prev.relation !== relation) changes.push(`관계 ${prev.relation || "없음"} → ${relation || "없음"}`);
      if (prev.amount !== amount) changes.push(`금액 ${formatWon(prev.amount)} → ${formatWon(amount)}`);
      if ((prev.memo || "") !== memo.trim()) changes.push("메모 수정");
      const updated: GuestRecord = {
        ...prev,
        name: name.trim(),
        relation,
        amount,
        memo: memo.trim(),
        updatedAt: now,
        history: changes.length ? prev.history.concat([{ at: now, text: changes.join(", ") }]) : prev.history,
      };
      await saveGuest(updated);
      setLastSavedId(updated.id);
      setUndo(null);
      resetForm();
      setToast(`${updated.name} 님 기록을 고쳤습니다.`);
      await reload();
      return;
    }
    const rec: GuestRecord = {
      id: newId(),
      eventId: event.id,
      name: name.trim(),
      relation,
      amount,
      memo: memo.trim(),
      createdAt: now,
      updatedAt: now,
      history: [],
      hasVideo: false,
    };
    await saveGuest(rec);
    setLastSavedId(rec.id);
    setUndo({ id: rec.id, label: confirm, left: 5 });
    resetForm();
    await reload();
  }

  async function undoSave() {
    if (!undo) return;
    await deleteGuest(undo.id);
    setUndo(null);
    setLastSavedId(null);
    setToast("방금 저장을 되돌렸습니다.");
    await reload();
  }

  async function storeTabletVideo(blob: Blob, mime: string) {
    if (!last || !event) return;
    await saveVideo({
      id: newId(),
      eventId: event.id,
      guestId: last.id,
      blob,
      mime,
      createdAt: nowIso(),
    });
    setRecording(false);
    setToast("영상편지를 이 기록에 붙였습니다.");
    await reload();
  }

  if (!event) {
    return (
      <div className="app-shell muted">
        <Atmosphere mark="축" />
        행사를 불러오는 중…
      </div>
    );
  }

  const step = !name.trim() ? 1 : !relation && !amount ? 2 : !amount ? 3 : 4;

  return (
    <div className="app-shell wide">
      <Atmosphere mark={eventMonogram(event.name)} variant="hero" />
      <header className="topbar">
        <div>
          <div className="kicker">
            {event.type} · {formatDate(event.date)} · 총합계는 이 화면에 보이지 않습니다
          </div>
          <h1 className="h2">{event.name}</h1>
        </div>
        <div className="row">
          <Link to="/" className="btn btn-ghost">
            행사 목록
          </Link>
          <Link to={`/e/${event.id}/admin`} className="btn btn-quiet">
            관리자
          </Link>
        </div>
      </header>

      <div className="recv">
        <section className="card">
          <div className="stepper" style={{ marginBottom: 14 }}>
            <span className={step >= 1 ? "on" : ""}>1 이름</span>
            <span className={step >= 2 ? "on" : ""}>2 관계</span>
            <span className={step >= 3 ? "on" : ""}>3 금액</span>
            <span className={step >= 4 ? "on" : ""}>4 저장</span>
          </div>
          <div className="stack">
            <div className="field">
              <div className="label">이름</div>
              <input
                className="input"
                value={name}
                autoComplete="off"
                autoCapitalize="words"
                placeholder="손님 이름"
                onChange={(e) => {
                  setName(e.target.value);
                  if (!editingId) setMemo("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void save();
                }}
              />
            </div>
            <div className="field">
              <div className="label">관계</div>
              <div className="pad-grid">
                {event.relationButtons.map((r) => (
                  <button
                    type="button"
                    key={r}
                    className={`pad${relation === r ? " selected" : ""}`}
                    onClick={() => setRelation(r)}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <div className="label">
                금액
                <button type="button" className="btn btn-ghost" onClick={() => setKeypad((v) => !v)}>
                  {keypad ? "키패드 닫기" : "직접 입력"}
                </button>
              </div>
              <div className="pad-grid">
                {event.amountButtons.map((v) => (
                  <button
                    type="button"
                    key={v}
                    className={`pad${amount === v && !keypad ? " selected" : ""}`}
                    onClick={() => {
                      setAmount(v);
                      setDigits(String(v));
                      setKeypad(false);
                    }}
                  >
                    {formatMan(v)}
                  </button>
                ))}
              </div>
              {keypad ? <Keypad value={digits} amount={amount} onKey={pressKey} formatWon={formatWon} /> : null}
            </div>
            {dups.length ? (
              <div className="callout warn">
                같은 이름 「{name.trim()}」이(가) 이미 {dups.length}건 있습니다. 다른 손님이면 메모로 구별해 주세요.
                {dups.slice(0, 3).map((d) => (
                  <div key={d.id} style={{ marginTop: 4 }}>
                    기존: {d.relation || "관계 없음"}
                    {d.memo ? ` · ${d.memo}` : ""} · {formatWon(d.amount)}
                  </div>
                ))}
                <div className="field" style={{ marginTop: 10 }}>
                  <div className="label">메모 (동명이인 구별)</div>
                  <input className="input input-sm" value={memo} placeholder="예: 고등학교 친구" onChange={(e) => setMemo(e.target.value)} />
                </div>
              </div>
            ) : editingId ? (
              <div className="field">
                <div className="label">메모</div>
                <input className="input input-sm" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="선택" />
              </div>
            ) : null}
            <button type="button" className="confirm" disabled={!confirm} onClick={() => void save()}>
              {confirm ? (
                <>
                  <span className="sub">{editingId ? "수정 확인" : "아래 내용으로 저장"}</span>
                  {confirm}
                </>
              ) : (
                "이름과 금액을 입력해 주세요"
              )}
            </button>
          </div>
        </section>

        <aside className="stack">
          <section className="card">
            <div className="kicker">오늘 접수 · 최근 {RECENT_LIMIT}건만 여기서 수정</div>
            <div className="row" style={{ alignItems: "end" }}>
              <h2 className="h1" style={{ fontVariantNumeric: "tabular-nums" }}>
                {guests.length}건
              </h2>
              <span className="spacer" />
            </div>
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>이름</th>
                    <th>관계</th>
                    <th>금액</th>
                    <th>영상</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {recent.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="muted">
                        아직 최근 접수가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    recent.map((g) => (
                      <tr key={g.id}>
                        <td>
                          {g.name}
                          {g.memo ? <div className="faint" style={{ fontSize: 12 }}>{g.memo}</div> : null}
                        </td>
                        <td>{g.relation}</td>
                        <td className="num">{formatWon(g.amount)}</td>
                        <td>{g.hasVideo ? <span className="pill gold">영상</span> : "없음"}</td>
                        <td>
                          <button type="button" className="btn btn-ghost" onClick={() => fillEdit(g)}>
                            수정
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="faint" style={{ fontSize: 13, margin: "12px 0 0" }}>
              전체 목록과 총합계는 관리자 비밀번호 뒤에 있습니다. 삭제는 관리자만 할 수 있습니다.
            </p>
          </section>

          {last && qrUrl ? (
            <section>
              <QrCard
                dataUrl={qrUrl}
                title={`${last.name} 님 영상편지 QR`}
                caption="저장이 끝난 뒤 이 손님용 주소입니다. 앱을 설치하지 않아도 됩니다. 행사 당일에만 유효합니다. 다른 폰에서 올리려면 이 앱이 서버와 함께 열려 있어야 합니다."
              >
                <div className="row" style={{ marginTop: 10 }}>
                  <button type="button" className="btn btn-quiet" onClick={() => setRecording(true)}>
                    태블릿으로 촬영
                  </button>
                  {last.hasVideo ? <span className="pill gold">영상 있음</span> : null}
                </div>
              </QrCard>
            </section>
          ) : (
            <p className="faint" style={{ fontSize: 13, margin: 0 }}>
              저장하면 이 손님용 QR이 여기 나타납니다.
            </p>
          )}
        </aside>
      </div>

      {undo ? <UndoBar label={undo.label} left={undo.left} onUndo={() => void undoSave()} /> : null}
      {toast ? <Toast text={toast} onDone={() => setToast("")} /> : null}
      {recording && last ? (
        <RecordModal
          title={`${last.name} 님 영상편지`}
          onCancel={() => setRecording(false)}
          onSave={(blob, mime) => void storeTabletVideo(blob, mime)}
        />
      ) : null}
    </div>
  );
}

function confirmLabel(name: string, relation: string, amount: number): string {
  return relation ? `${name} · ${relation} · ${formatWon(amount)}` : `${name} · ${formatWon(amount)}`;
}

function recentIds(guests: GuestRecord[]): string[] {
  return guests
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, RECENT_LIMIT)
    .map((g) => g.id);
}


