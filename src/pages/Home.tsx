import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Atmosphere } from "../components/Atmosphere";
import { APP_KICKER, APP_NAME, typeLabel, useAppTone } from "../lib/copy";
import { listEvents } from "../lib/db";
import { formatDate } from "../lib/format";
import type { EventRecord } from "../lib/types";

export function Home() {
  const [events, setEvents] = useState<EventRecord[] | null>(null);
  useAppTone("celebration");

  useEffect(() => {
    void listEvents().then(setEvents);
  }, []);

  if (!events) {
    return (
      <div className="app-shell muted">
        <Atmosphere mark="마" />
        불러오는 중…
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Atmosphere mark="마" />
      <header className="topbar">
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" width={40} height={40} />
          <div>
            <div className="kicker">{APP_KICKER}</div>
            <div className="name">{APP_NAME}</div>
          </div>
        </div>
        <Link to="/new" className="btn btn-primary">
          행사 만들기
        </Link>
      </header>

      {events.length === 0 ? (
        <div className="card empty">
          <h1 className="h2">아직 만든 행사가 없습니다</h1>
          <p className="lead" style={{ margin: "8px auto 20px" }}>
            결혼식, 돌잔치, 칠순·생신, 장례 행사의 접수 기록을 이 태블릿에서 바로 시작할 수 있습니다. 네트워크가 없어도 접수는 저장됩니다.
          </p>
          <Link to="/new" className="btn btn-primary">
            첫 행사 만들기
          </Link>
        </div>
      ) : (
        <div className="event-list">
          {events.map((e) => (
            <div key={e.id} className="event-item" style={{ cursor: "default" }}>
              <div className="meta">
                <div className="kicker">{typeLabel(e.type)} · {formatDate(e.date)}</div>
                <div className="title">{e.name}</div>
              </div>
              <Link className="btn btn-quiet" to={`/e/${e.id}/admin`}>
                관리자
              </Link>
              <Link className="btn btn-primary" to={`/e/${e.id}`}>
                접수
              </Link>
            </div>
          ))}
        </div>
      )}
      <p className="faint legal-foot"><Link to="/privacy">개인정보 처리방침</Link></p>
    </div>
  );
}
