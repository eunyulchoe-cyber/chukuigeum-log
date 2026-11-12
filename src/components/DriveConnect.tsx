import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { disconnectDrive, getDriveStatus, registerEvent, startGoogleOAuth } from "../lib/cloud";
import { DRIVE_TEST_USER_HINT, copyForType, driveOauthMessage } from "../lib/copy";
import { ensureHost, refreshHostStatus } from "../lib/host";
import type { EventRecord } from "../lib/types";

type Props = {
  event: EventRecord;
  returnPath: string;
};

export function DriveConnect({ event, returnPath }: Props) {
  const [search] = useSearchParams();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [folderReady, setFolderReady] = useState(false);

  async function reload() {
    const host = await refreshHostStatus();
    setConnected(host.googleConnected);
    setEmail(host.googleEmail ?? null);
    try {
      const st = await getDriveStatus(host.hostSecret);
      setConfigured(st.googleConfigured);
    } catch {
      setConfigured(true);
    }
    if (host.googleConnected) {
      try {
        const reg = await registerEvent(host.hostSecret, { id: event.id, date: event.date, name: event.name });
        setFolderReady(reg.folderReady);
      } catch (e) {
        setNote(e instanceof Error ? e.message : "행사를 클라우드에 등록하지 못했습니다.");
      }
    }
  }

  useEffect(() => {
    const code = search.get("drive") || (search.get("ok") === "0" ? search.get("error") : null);
    const ok = search.get("drive") === "ok" || search.get("ok") === "1";
    if (ok || code) {
      const msg = ok ? null : driveOauthMessage(code);
      if (msg) setNote(msg);
      const next = new URLSearchParams(search);
      next.delete("drive");
      next.delete("ok");
      next.delete("error");
      const qs = next.toString();
      nav(`${window.location.hash.split("?")[0].replace(/^#/, "")}${qs ? `?${qs}` : ""}`, { replace: true });
    }
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id, event.date]);

  async function connect() {
    setBusy(true);
    setNote("");
    try {
      const host = await ensureHost();
      sessionStorage.setItem("chukuigeum-drive-return", returnPath);
      const { url } = await startGoogleOAuth(host.hostSecret, returnPath);
      window.location.href = url;
    } catch (e) {
      setNote(e instanceof Error ? e.message : "구글 연결을 시작하지 못했습니다.");
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm("이 기기의 구글 드라이브 연결을 해제할까요? 이미 올린 영상은 드라이브에 그대로 남습니다.")) return;
    setBusy(true);
    setNote("");
    try {
      const host = await ensureHost();
      await disconnectDrive(host.hostSecret);
      await reload();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "연결을 해제하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const c = copyForType(event.type);

  return (
    <section className="card drive-card">
      <div className="kicker">{c.driveKicker}</div>
      <h2 className="h3" style={{ margin: "4px 0 8px" }}>구글 드라이브 연결</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        {c.driveBlurb}
      </p>
      {connected ? (
        <div className="callout ok" style={{ textAlign: "left" }}>
          연결됨{email ? ` · ${email}` : ""}{folderReady ? " · 이 행사 폴더 준비됨" : " · 폴더를 준비하는 중이거나 다시 연결이 필요합니다"}
        </div>
      ) : (
        <div className="callout info" style={{ textAlign: "left" }}>
          {configured
            ? "아직 연결되지 않았습니다. 연결하면 손님용 QR로 영상을 받을 수 있습니다."
            : "구글 클라우드 OAuth 클라이언트를 먼저 만들어야 연결할 수 있습니다."}
        </div>
      )}
      {note ? <div className="callout warn" style={{ textAlign: "left" }}>{note}</div> : null}
      {!connected && configured ? (
        <p className="faint" style={{ margin: "0 0 8px", textAlign: "left", fontSize: 13 }}>
          {DRIVE_TEST_USER_HINT}
        </p>
      ) : null}
      <div className="row">
        {connected ? (
          <button className="btn" disabled={busy} onClick={() => void disconnect()}>
            연결 해제
          </button>
        ) : (
          <button className="btn btn-primary" disabled={busy} onClick={() => void connect()}>
            {busy ? "이동 중…" : "구글 드라이브 연결"}
          </button>
        )}
      </div>
    </section>
  );
}
