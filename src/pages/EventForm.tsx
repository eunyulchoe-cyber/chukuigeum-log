import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Atmosphere } from "../components/Atmosphere";
import { DriveConnect } from "../components/DriveConnect";
import { PinPad } from "../components/PinPad";
import { hashPin, newId } from "../lib/crypto";
import { getEvent, saveEvent } from "../lib/db";
import { eventMonogram, nowIso, todaySeoul } from "../lib/format";
import {
  DEFAULT_AMOUNTS,
  DEFAULT_RELATIONS,
  EVENT_TYPES,
  type EventRecord,
  type EventType,
} from "../lib/types";

export function EventForm() {
  const { eventId } = useParams();
  const nav = useNavigate();
  const editing = Boolean(eventId);
  const [loaded, setLoaded] = useState(!editing);
  const [name, setName] = useState("");
  const [type, setType] = useState<EventType>("결혼");
  const [date, setDate] = useState(todaySeoul());
  const [amounts, setAmounts] = useState(DEFAULT_AMOUNTS.map((n) => String(n / 10000)));
  const [relations, setRelations] = useState(DEFAULT_RELATIONS.slice());
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [stage, setStage] = useState<"form" | "pin" | "pin2">("form");
  const [error, setError] = useState("");
  const [existing, setExisting] = useState<EventRecord | null>(null);

  useEffect(() => {
    if (!eventId) return;
    void getEvent(eventId).then((e) => {
      if (!e) return;
      setExisting(e);
      setName(e.name);
      setType(e.type);
      setDate(e.date);
      setAmounts(e.amountButtons.map((n) => String(n / 10000)));
      setRelations(e.relationButtons.slice());
      setLoaded(true);
    });
  }, [eventId]);

  function parseAmounts(): number[] | null {
    const next: number[] = [];
    for (const raw of amounts) {
      const man = Number(raw);
      if (!Number.isFinite(man) || man <= 0) return null;
      next.push(Math.round(man * 10000));
    }
    return next.length ? next : null;
  }

  async function persist(pinHash: string, id: string) {
    const amountButtons = parseAmounts();
    const rels = relations.map((r) => r.trim()).filter(Boolean);
    if (!name.trim() || !amountButtons || !rels.length) {
      setError("행사 이름, 금액 버튼, 관계 버튼을 확인해 주세요.");
      setStage("form");
      return;
    }
    const now = nowIso();
    const rec: EventRecord = {
      id,
      name: name.trim(),
      type,
      date,
      amountButtons,
      relationButtons: rels,
      pinHash,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await saveEvent(rec);
    nav(`/e/${id}`);
  }

  function onPinKey(key: string, which: "pin" | "pin2") {
    setError("");
    const cur = which === "pin" ? pin : pin2;
    const set = which === "pin" ? setPin : setPin2;
    let next = cur;
    if (key === "←") next = cur.slice(0, -1);
    else if (cur.length < 6 && /^\d$/.test(key)) next = cur + key;
    set(next);
    if (which === "pin" && (next.length === 4 || next.length === 5 || next.length === 6)) {
      // wait for user to continue — auto advance at 4 if they pause? Better: auto-go at 4 and allow 5-6 via a button.
    }
  }

  async function confirmFirstPin() {
    if (pin.length < 4 || pin.length > 6) {
      setError("비밀번호는 4~6자리입니다.");
      return;
    }
    setStage("pin2");
    setPin2("");
  }

  async function confirmSecondPin() {
    if (pin2 !== pin) {
      setError("비밀번호가 서로 다릅니다. 다시 입력해 주세요.");
      setPin2("");
      return;
    }
    const id = existing?.id ?? newId();
    const pinHash = await hashPin(pin, id);
    await persist(pinHash, id);
  }

  async function saveWithoutPinChange() {
    if (!existing) return;
    await persist(existing.pinHash, existing.id);
  }

  if (!loaded) {
    return (
      <div className="app-shell muted">
        <Atmosphere mark="축" />
        불러오는 중…
      </div>
    );
  }
  const mark = eventMonogram(name);

  if (stage === "pin" || stage === "pin2") {
    return (
      <div className="app-shell">
        <Atmosphere mark={mark} />
        <button className="btn btn-ghost" onClick={() => { setStage("form"); setError(""); }}>
          ← 행사 정보로
        </button>
        <PinPad
          pin={stage === "pin" ? pin : pin2}
          error={error}
          title={stage === "pin" ? "관리자 비밀번호를 정하세요" : "한 번 더 입력해 주세요"}
          hint="4~6자리 숫자입니다. 총합계와 엑셀은 이 번호 뒤에 둡니다."
          onKey={(k) => onPinKey(k, stage === "pin" ? "pin" : "pin2")}
        />
        <div className="center" style={{ marginTop: 16 }}>
          {stage === "pin" ? (
            <button className="btn btn-primary" disabled={pin.length < 4} onClick={() => void confirmFirstPin()}>
              다음
            </button>
          ) : (
            <button className="btn btn-primary" disabled={pin2.length < 4} onClick={() => void confirmSecondPin()}>
              행사 만들기
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell" style={{ maxWidth: 720, margin: "0 auto" }}>
      <Atmosphere mark={mark} />
      <header className="topbar">
        <Link to={existing ? `/e/${existing.id}/admin` : "/"} className="btn btn-ghost">
          ← 뒤로
        </Link>
      </header>
      <h1 className="h1">{editing ? "행사 수정" : "행사 만들기"}</h1>
      <p className="lead">접수에 쓸 이름, 종류, 날짜와 자주 쓰는 버튼을 정합니다.</p>

      <div className="stack" style={{ marginTop: 24 }}>
        <div className="field">
          <div className="label">행사 이름</div>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 김민준 · 김서연 결혼식" />
        </div>
        <div className="field">
          <div className="label">종류</div>
          <div className="chip-row">
            {EVENT_TYPES.map((t) => (
              <button type="button" key={t} className={`chip${type === t ? " on" : ""}`} onClick={() => setType(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <div className="label">날짜</div>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <div className="label">금액 버튼 (만 원)</div>
          <div className="row">
            {amounts.map((v, i) => (
              <input
                key={i}
                className="input input-sm"
                style={{ width: 88, minWidth: 80, flex: "0 0 88px" }}
                type="number"
                inputMode="numeric"
                value={v}
                onChange={(e) => {
                  const next = amounts.slice();
                  next[i] = e.target.value;
                  setAmounts(next);
                }}
              />
            ))}
            <button type="button" className="btn btn-quiet" onClick={() => setAmounts((a) => a.concat(["5"]))}>
              추가
            </button>
            {amounts.length > 1 ? (
              <button type="button" className="btn btn-ghost" onClick={() => setAmounts((a) => a.slice(0, -1))}>
                하나 줄이기
              </button>
            ) : null}
          </div>
        </div>
        <div className="field">
          <div className="label">관계 버튼</div>
          <div className="row">
            {relations.map((v, i) => (
              <input
                key={i}
                className="input input-sm"
                style={{ width: 110, flex: "0 0 110px" }}
                value={v}
                onChange={(e) => {
                  const next = relations.slice();
                  next[i] = e.target.value;
                  setRelations(next);
                }}
              />
            ))}
            <button type="button" className="btn btn-quiet" onClick={() => setRelations((a) => a.concat([""]))}>
              추가
            </button>
            {relations.length > 1 ? (
              <button type="button" className="btn btn-ghost" onClick={() => setRelations((a) => a.slice(0, -1))}>
                하나 줄이기
              </button>
            ) : null}
          </div>
        </div>
        {error ? <div className="callout warn">{error}</div> : null}
        {existing ? <DriveConnect event={existing} returnPath={`#/e/${existing.id}/edit`} /> : null}
        {existing ? (
          <div className="row">
            <button className="btn btn-primary" onClick={() => void saveWithoutPinChange()}>
              저장하고 접수로
            </button>
            <button className="btn btn-quiet" onClick={() => { setPin(""); setStage("pin"); setError(""); }}>
              비밀번호 바꾸기
            </button>
          </div>
        ) : (
          <button
            className="btn btn-primary"
            onClick={() => {
              if (!name.trim() || !parseAmounts()) {
                setError("행사 이름과 금액 버튼을 확인해 주세요.");
                return;
              }
              setError("");
              setPin("");
              setStage("pin");
            }}
          >
            다음, 관리자 비밀번호
          </button>
        )}
      </div>
    </div>
  );
}
