import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Atmosphere } from "../components/Atmosphere";
import { CamSwitch } from "../components/CamSwitch";
import { uploadRemoteVideo, serverAvailable } from "../lib/api";
import { completeGuestUpload, initGuestUpload, putResumable } from "../lib/cloud";
import { beginRecording, cameraErrorMessage, countVideoInputs, openCamera, screenOrient, stopStream, type Facing } from "../lib/camera";
import { newId } from "../lib/crypto";
import { getEvent, getGuest, saveVideo } from "../lib/db";
import { copyFor, parseToneParam, useAppTone } from "../lib/copy";
import { eventMonogram, formatClock, guestPrompt, todaySeoul } from "../lib/format";
import type { EventRecord, GuestRecord } from "../lib/types";

const LIMIT = 60;

function pickMime(): string {
  const types = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  return types.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}

export function GuestUpload() {
  const { eventId = "", guestId = "", token = "" } = useParams();
  const [search] = useSearchParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const stopAuxRef = useRef<() => void>(() => undefined);
  const chunks = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const phaseRef = useRef<"idle" | "recording" | "review" | "sending" | "sent" | "error">("idle");
  const facingRef = useRef<Facing>("user");
  const startingRef = useRef(false);
  const [facing, setFacing] = useState<Facing>("user");
  const [cameraCount, setCameraCount] = useState(0);
  const [hasStream, setHasStream] = useState(false);
  const [starting, setStarting] = useState(true);
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [guest, setGuest] = useState<GuestRecord | null>(null);
  const [missing, setMissing] = useState(false);
  const [expired, setExpired] = useState(false);
  const [phase, setPhase] = useState<"idle" | "recording" | "review" | "sending" | "sent" | "error">("idle");
  const [sec, setSec] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [mime, setMime] = useState("video/webm");
  const [note, setNote] = useState("");
  const [hasServer, setHasServer] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadToken] = useState(token);
  function setPhaseBoth(next: typeof phase) {
    phaseRef.current = next;
    setPhase(next);
  }

  const tone = event ? (event.type === "부의" ? "mourning" : "celebration") : parseToneParam(search.get("tone"));
  const copy = copyFor(tone);
  const displayName = event?.name || search.get("name") || "";
  useAppTone(tone);


  useEffect(() => {
    void (async () => {
      const e = await getEvent(eventId);
      const g = await getGuest(guestId);
      setHasServer(await serverAvailable());
      if (e) setEvent(e);
      if (g && g.eventId === eventId) setGuest(g);
      if (!e && !g) {
        // Opening on a different device: event is not in this browser's IDB.
        // Guest page can still record and upload if the server is up, if we have ids.
        setEvent(null);
        setGuest(null);
      }
      if (e && e.date !== todaySeoul()) setExpired(true);
      if (!e && !g) {
        // Still allow recording for remote upload; expiration unknown without event.
        // Mark that this device has no local copy.
        setMissing(true);
      }
    })();
  }, [eventId, guestId]);

  useEffect(() => {
    if (phase !== "recording") return;
    const t = setInterval(() => {
      setSec((s) => {
        if (s + 1 >= LIMIT) {
          stop();
          return LIMIT;
        }
        return s + 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => () => {
    stopStream(streamRef.current);
    stopAuxRef.current();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(orientation: portrait)");
    const onChange = () => {
      if (phaseRef.current === "recording" || startingRef.current) return;
      if (!streamRef.current) return;
      void startStream(facingRef.current).catch((e) => {
        setNote(cameraErrorMessage(e));
      });
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function attach(stream: MediaStream) {
    streamRef.current = stream;
    setHasStream(true);
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => undefined);
    }
  }

  async function startStream(next: Facing): Promise<MediaStream | undefined> {
    if (startingRef.current) return streamRef.current ?? undefined;
    startingRef.current = true;
    setStarting(true);
    const prev = streamRef.current;
    streamRef.current = null;
    setHasStream(false);
    try {
      const stream = await openCamera(next, prev, screenOrient());
      await attach(stream);
      facingRef.current = next;
      setFacing(next);
      setCameraCount(await countVideoInputs());
      return stream;
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }

  useEffect(() => {
    let stopped = false;
    void (async () => {
      try {
        await startStream("user");
        if (stopped) {
          stopStream(streamRef.current);
          streamRef.current = null;
        }
      } catch (e) {
        if (!stopped) {
          setNote(cameraErrorMessage(e));
          setPhaseBoth("error");
        }
      }
    })();
    return () => {
      stopped = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function switchFacing() {
    if (phase === "recording" || startingRef.current) return;
    const next: Facing = facingRef.current === "user" ? "environment" : "user";
    try {
      await startStream(next);
      setNote("");
      if (phase === "error") setPhaseBoth("idle");
    } catch (e) {
      setNote(cameraErrorMessage(e));
    }
  }

  async function ensureStream(): Promise<MediaStream | undefined> {
    if (streamRef.current) return streamRef.current;
    return startStream(facingRef.current);
  }

  async function start() {
    if (startingRef.current || phase === "recording") return;
    try {
      const stream = await ensureStream();
      if (!stream) return;
      chunks.current = [];
      const type = pickMime();
      const { recorder, stopAux } = beginRecording(videoRef.current, stream, type);
      stopAuxRef.current = stopAux;
      setMime(recorder.mimeType || type || "video/webm");
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      recorder.onstop = () => {
        stopAuxRef.current();
        const b = new Blob(chunks.current, { type: recorder.mimeType || mime });
        setBlob(b);
        const url = URL.createObjectURL(b);
        setPreview((old) => {
          if (old) URL.revokeObjectURL(old);
          return url;
        });
        setPhaseBoth("review");
      };
      recRef.current = recorder;
      recorder.start(200);
      setSec(0);
      setPhaseBoth("recording");
    } catch (e) {
      setNote(cameraErrorMessage(e));
      setPhaseBoth("error");
    }
  }

  function stop() {
    if (recRef.current && recRef.current.state === "recording") recRef.current.stop();
  }

  async function send() {
    if (!blob) return;
    setPhaseBoth("sending");
    setProgress(0);
    setNote("");
    let localOk = false;
    let remoteOk = false;
    if (guest && event) {
      try {
        await saveVideo({
          id: newId(),
          eventId: event.id,
          guestId: guest.id,
          blob,
          mime,
          createdAt: new Date().toISOString(),
        });
        localOk = true;
      } catch {
        localOk = false;
      }
    }
    let fail = "";
    if (uploadToken) {
      try {
        const session = await initGuestUpload(uploadToken, mime || blob.type || "video/webm", blob.size);
        setProgress(5);
        const fileId = await putResumable(session.sessionUrl, blob, (pct) => setProgress(Math.max(5, pct)));
        await completeGuestUpload(uploadToken, fileId);
        remoteOk = true;
        setProgress(100);
      } catch (e) {
        fail = e instanceof Error ? e.message : "영상을 올리지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.";
      }
    } else {
      remoteOk = await uploadRemoteVideo(eventId, guestId, blob);
    }
    if (localOk || remoteOk) {
      setPhaseBoth("sent");
      stopStream(streamRef.current);
      streamRef.current = null;
      setHasStream(false);
      return;
    }
    setNote(
      fail || (uploadToken
        ? "영상을 올리지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요."
        : "이 폰에는 접수 기록이 없고, 주최자의 드라이브로 보내는 코드도 없습니다. 행사 당일 QR을 다시 찍어 주세요."),
    );
    setPhaseBoth("review");
  }

  const typeFromQuery = search.get("type") || (tone === "mourning" ? "부의" : "");
  const prompt = event
    ? guestPrompt(event.type, event.name)
    : (displayName ? guestPrompt(typeFromQuery || "기타", displayName) : copy.guestPromptFallback);
  const mark = eventMonogram(event?.name || displayName, event?.type || typeFromQuery);

  if (expired && event) {
    return (
      <div className="phone-page">
        <Atmosphere mark={mark} />
        <div className="kicker">{event.name}</div>
        <h1 className="guest-msg">{copy.guestExpiredTitle}</h1>
        <p className="muted">{copy.guestExpiredBody}</p>
      </div>
    );
  }

  return (
    <div className="phone-page">
      <Atmosphere mark={mark} />
      <div className="kicker">{copy.guestKicker(event?.name || displayName || null)}</div>
      <h1 className="guest-msg">{prompt}</h1>
      {missing && !hasServer && !uploadToken ? (
        <p className="callout warn">
          이 폰에는 접수 기록이 없습니다. 주최자가 구글 드라이브를 연결한 뒤 받은 QR로 들어와 주세요.
        </p>
      ) : (
        <p className="muted" style={{ marginTop: 0 }}>
          {copy.guestLead}
        </p>
      )}

      {phase === "idle" || phase === "error" || phase === "recording" ? (
        <>
          <div className="preview cam-preview">
            <video
              ref={videoRef}
              className={facing === "user" ? "mirror" : undefined}
              muted
              playsInline
              autoPlay
              style={{ display: hasStream ? "block" : "none" }}
            />
            {!hasStream && phase !== "error" ? (
              <span className="cam-status">{starting ? "카메라 준비 중…" : "카메라를 켜는 중입니다"}</span>
            ) : null}
          </div>
          {note && phase === "error" ? <div className="callout warn">{note}</div> : null}
          <div className="rec-dock">
            {phase === "recording" ? <div className="timer rec-timer">{formatClock(sec)} / 1:00</div> : null}
            <div className="rec-wrap">
              <div className="rec-side rec-side-start">
                {cameraCount > 1 && (hasStream || starting) ? (
                  <CamSwitch disabled={phase === "recording" || starting} onClick={() => void switchFacing()} />
                ) : null}
              </div>
              <button
                type="button"
                className={`rec-btn${phase === "recording" ? " busy" : ""}`}
                onClick={() => (phase === "recording" ? stop() : void start())}
                disabled={starting || (phase !== "recording" && !hasStream)}
                aria-label={phase === "recording" ? "촬영 끝내기" : "촬영"}
              >
                <i />
              </button>
              <div className="rec-side rec-side-end" />
            </div>
            <div className="rec-label">{phase === "recording" ? "누르면 촬영이 끝납니다" : starting ? "준비 중…" : "촬영"}</div>
          </div>
        </>
      ) : null}

      {phase === "review" || phase === "sending" ? (
        <>
          <div className="preview cam-preview">{preview ? <video src={preview} controls playsInline /> : null}</div>
          {note ? <div className="callout warn" style={{ textAlign: "left" }}>{note}</div> : null}
          {phase === "sending" ? (
            <div className="upload-progress" aria-live="polite">
              <div className="bar"><i style={{ width: `${progress}%` }} /></div>
              <p className="muted">{copy.sendingVideo(progress)}</p>
            </div>
          ) : null}
          <div className="row" style={{ marginTop: "auto" }}>
            <button
              className="btn"
              style={{ flex: 1 }}
              disabled={phase === "sending"}
              onClick={() => {
                setBlob(null);
                setPreview((o) => {
                  if (o) URL.revokeObjectURL(o);
                  return null;
                });
                setNote("");
                setSec(0);
                setPhaseBoth("idle");
              }}
            >
              다시 찍기
            </button>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={phase === "sending"} onClick={() => void send()}>
              {phase === "sending" ? "보내는 중…" : "드라이브로 보내기"}
            </button>
          </div>
        </>
      ) : null}

      {phase === "sent" ? (
        <>
          <p className="h2" style={{ marginTop: 48 }}>{copy.guestSuccessTitle}</p>
          <p className="muted">{copy.guestSuccessBody}</p>
        </>
      ) : null}
      <p className="faint legal-foot"><a href={`#/privacy`}>개인정보 처리방침</a></p>
    </div>
  );
}
