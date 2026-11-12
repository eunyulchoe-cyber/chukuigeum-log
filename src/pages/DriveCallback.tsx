import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Atmosphere } from "../components/Atmosphere";
import { registerEvent } from "../lib/cloud";
import { getEvent } from "../lib/db";
import { refreshHostStatus } from "../lib/host";

function paramsFromHash(): URLSearchParams {
  const hash = window.location.hash.slice(1);
  const q = hash.indexOf("?");
  return new URLSearchParams(q >= 0 ? hash.slice(q + 1) : "");
}

export function DriveCallback() {
  const nav = useNavigate();

  useEffect(() => {
    const q = paramsFromHash();
    const ok = q.get("ok") === "1";
    const err = q.get("error");
    const returnTo = sessionStorage.getItem("chukuigeum-drive-return") || "";
    void (async () => {
      if (ok) {
        const host = await refreshHostStatus();
        const m = returnTo.match(/^#?\/e\/([^/]+)/);
        if (host.googleConnected && m) {
          const ev = await getEvent(m[1]);
          if (ev) {
            try {
              await registerEvent(host.hostSecret, { id: ev.id, date: ev.date, name: ev.name });
            } catch {
              // status will show on admin
            }
          }
        }
      }
      const dest = returnTo.startsWith("#") ? returnTo.slice(1) : returnTo || "/";
      const joiner = dest.includes("?") ? "&" : "?";
      nav(`${dest}${joiner}drive=${ok ? "ok" : err || "fail"}`, { replace: true });
    })();
  }, [nav]);

  return (
    <div className="app-shell muted">
      <Atmosphere mark="마" />
      구글 드라이브 연결을 확인하고 있습니다…
    </div>
  );
}
