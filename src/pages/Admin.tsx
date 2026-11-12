import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Atmosphere } from "../components/Atmosphere";
import { DriveConnect } from "../components/DriveConnect";
import { PinPad } from "../components/PinPad";
import { Toast } from "../components/Toast";
import { hashPin } from "../lib/crypto";
import { getVideoMediaUrl, listEventVideos } from "../lib/cloud";
import { exportBackup, getEvent, getVideoForGuest, importBackup, listGuests, deleteGuest, saveGuest, wipeEvent } from "../lib/db";
import { loadHost } from "../lib/host";
import { downloadWorkbook } from "../lib/excel";
import { copyForType, typeLabel, useAppTone } from "../lib/copy";
import { eventMonogram, formatDate, formatDateTime, formatWon } from "../lib/format";
import type { BackupFile, EventRecord, GuestRecord } from "../lib/types";

const unlockKey = (id: string) => `chukuigeum-admin:${id}`;

export function Admin() {
  const { eventId = "" } = useParams();
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [guests, setGuests] = useState<GuestRecord[]>([]);
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(unlockKey(eventId)) === "1");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [playing, setPlaying] = useState<{ name: string; url: string } | null>(null);
  const copy = copyForType(event?.type);
  useAppTone(event?.type === "부의" ? "mourning" : "celebration");

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
    if (!unlocked || !eventId) return;
    let stop = false;
    const tick = async () => {
      const host = await loadHost();
      if (!host?.hostSecret) return;
      try {
        const remote = await listEventVideos(host.hostSecret, eventId);
        if (stop) return;
        const guestsNow = await listGuests(eventId);
        for (const v of remote) {
          const g = guestsNow.find((x) => x.id === v.guestId);
          if (g && !g.hasVideo) {
            await saveGuest({ ...g, hasVideo: true, updatedAt: v.completedAt });
          }
        }
        if (remote.length) await reload();
      } catch {
        // offline or not registered — keep local list
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 15000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [unlocked, eventId, reload]);

  useEffect(() => () => {
    if (playing) URL.revokeObjectURL(playing.url);
  }, [playing]);

  async function tryPin(next: string) {
    if (!event || next.length < 4) return;
    const hash = await hashPin(next, event.id);
    if (hash === event.pinHash) {
      sessionStorage.setItem(unlockKey(event.id), "1");
      setUnlocked(true);
      setPin("");
      setError("");
      return;
    }
    if (next.length === 6) {
      setError("비밀번호가 다릅니다.");
      setPin("");
    }
  }

  function onKey(k: string) {
    setError("");
    let next = pin;
    if (k === "←") next = pin.slice(0, -1);
    else if (pin.length < 6 && /^\d$/.test(k)) next = pin + k;
    setPin(next);
    if (/^\d$/.test(k)) void tryPin(next);
  }

  async function playVideo(g: GuestRecord) {
    const local = await getVideoForGuest(g.id);
    if (local) {
      if (playing) URL.revokeObjectURL(playing.url);
      setPlaying({ name: g.name, url: URL.createObjectURL(local.blob) });
      return;
    }
    try {
      const host = await loadHost();
      if (!host?.hostSecret) {
        setToast("이 기록에 영상이 없습니다.");
        return;
      }
      const remote = await getVideoMediaUrl(host.hostSecret, eventId, g.id);
      if (playing && playing.url.startsWith("blob:")) URL.revokeObjectURL(playing.url);
      setPlaying({ name: g.name, url: remote.mediaUrl });
    } catch (e) {
      setToast(e instanceof Error ? e.message : "영상을 열지 못했습니다.");
    }
  }

  async function onImport(file: File) {
    try {
      const data = JSON.parse(await file.text()) as BackupFile;
      const id = await importBackup(data, event && data.event.id === event.id ? "replace" : "new-id");
      setToast("백업을 가져왔습니다.");
      if (id !== eventId) nav(`/e/${id}/admin`);
      else await reload();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "가져오기에 실패했습니다.");
    }
  }

  async function onWipe() {
    if (!event) return;
    if (!confirm("엑셀이나 JSON 백업을 이미 받아 두었나요? 이 기기의 이 행사 기록을 모두 지웁니다.")) return;
    if (!confirm("정말로 이 행사와 접수 기록, 영상을 삭제할까요?")) return;
    await wipeEvent(event.id);
    sessionStorage.removeItem(unlockKey(event.id));
    nav("/");
  }

  if (!event) {
    return (
      <div className="app-shell muted">
        <Atmosphere mark="마" />
        불러오는 중…
      </div>
    );
  }
  const mark = eventMonogram(event.name);

  if (!unlocked) {
    return (
      <div className="app-shell">
        <Atmosphere mark={mark} />
        <Link to={`/e/${event.id}`} className="btn btn-ghost">
          ← 접수로
        </Link>
        <PinPad
          pin={pin}
          error={error}
          hint="총합계, 전체 목록, 엑셀 내보내기를 보려면 행사 때 정한 4~6자리 번호를 넣습니다."
          onKey={onKey}
        />
        <div className="center" style={{ marginTop: 16 }}>
          <button
            className="btn btn-primary"
            disabled={pin.length < 4}
            onClick={() => {
              void (async () => {
                if (!event || pin.length < 4) return;
                const hash = await hashPin(pin, event.id);
                if (hash === event.pinHash) {
                  sessionStorage.setItem(unlockKey(event.id), "1");
                  setUnlocked(true);
                  setPin("");
                  setError("");
                } else {
                  setError("비밀번호가 다릅니다.");
                  setPin("");
                }
              })();
            }}
          >
            확인
          </button>
        </div>
      </div>
    );
  }

  const total = guests.reduce((s, g) => s + g.amount, 0);

  return (
    <div className="app-shell wide">
      <Atmosphere mark={mark} />
      <header className="topbar">
        <div>
          <div className="kicker">관리자 · {copy.receptionTitle} · {typeLabel(event.type)} · {formatDate(event.date)}</div>
          <h1 className="h2">{event.name}</h1>
        </div>
        <div className="row">
          <Link to={`/e/${event.id}`} className="btn btn-ghost">
            접수로
          </Link>
          <button
            className="btn btn-quiet"
            onClick={() => {
              sessionStorage.removeItem(unlockKey(event.id));
              setUnlocked(false);
              setPin("");
            }}
          >
            다시 잠그기
          </button>
        </div>
      </header>

      <div className="stats">
        <div className="stat">
          <div className="l">총건수</div>
          <div className="n">{guests.length}건</div>
        </div>
        <div className="stat">
          <div className="l">총합계</div>
          <div className="n">{formatWon(total)}</div>
        </div>
      </div>

      <div className="row" style={{ margin: "16px 0" }}>
        <button className="btn btn-primary" onClick={() => downloadWorkbook(event, guests)}>
          엑셀 내려받기
        </button>
        <button
          className="btn btn-quiet"
          onClick={() => void exportBackup(event.id).then((data) => {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `${event.name.replace(/[\\/:*?"<>|]+/g, "_")}_백업.json`;
            a.click();
            URL.revokeObjectURL(a.href);
          })}
        >
          JSON 백업
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          백업 가져오기
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImport(f);
            e.target.value = "";
          }}
        />
        <Link to={`/e/${event.id}/edit`} className="btn btn-quiet">
          행사 수정
        </Link>
        <span className="spacer" />
        <button className="btn btn-danger" onClick={() => void onWipe()}>
          백업 후 삭제
        </button>
      </div>

      <DriveConnect event={event} returnPath={`#/e/${event.id}/admin`} />

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>이름</th>
              <th>관계</th>
              <th>{copy.amountName}</th>
              <th>메모</th>
              <th>시각</th>
              <th>{copy.videoShort}</th>
              <th>이력</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {guests.length === 0 ? (
              <tr>
                <td colSpan={8} className="muted">
                  {copy.noGuests}
                </td>
              </tr>
            ) : (
              guests
                .slice()
                .reverse()
                .map((g) => (
                  <tr key={g.id}>
                    <td>{g.name}</td>
                    <td>{g.relation}</td>
                    <td className="num">{formatWon(g.amount)}</td>
                    <td>{g.memo || "—"}</td>
                    <td>{formatDateTime(g.createdAt)}</td>
                    <td>
                      {g.hasVideo ? (
                        <button type="button" className="btn btn-ghost" onClick={() => void playVideo(g)}>
                          보기
                        </button>
                      ) : (
                        "없음"
                      )}
                    </td>
                    <td style={{ maxWidth: 200, fontSize: 12.5, color: "var(--muted)" }}>
                      {g.history.length ? g.history.map((h) => formatDateTime(h.at) + " " + h.text).join(" / ") : "—"}
                    </td>
                    <td>
                      <Link className="btn btn-ghost" to={`/e/${event.id}?edit=${g.id}`}>
                        수정
                      </Link>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ color: "var(--danger)" }}
                        onClick={() => {
                          if (confirm(`${g.name} 님 기록을 삭제할까요?`)) void deleteGuest(g.id).then(reload);
                        }}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
      <p className="faint" style={{ fontSize: 13, marginTop: 12 }}>
        기록은 이 기기에 암호화된 연결(HTTPS 또는 로컬)에서 IndexedDB로 저장됩니다. 비밀번호는 해시로만 보관됩니다. 삭제는 관리자만 할 수 있습니다.
      </p>

      {playing ? (
        <div className="modal-back" onClick={() => { URL.revokeObjectURL(playing.url); setPlaying(null); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="kicker">{copy.videoLong}</div>
            <h2 className="h2" style={{ marginBottom: 12 }}>{playing.name}</h2>
            <video src={playing.url} controls autoPlay playsInline style={{ width: "100%", borderRadius: 12, background: "#111" }} />
            <button className="btn" style={{ marginTop: 12 }} onClick={() => { URL.revokeObjectURL(playing.url); setPlaying(null); }}>
              닫기
            </button>
          </div>
        </div>
      ) : null}
      {toast ? <Toast text={toast} onDone={() => setToast("")} /> : null}
    </div>
  );
}
