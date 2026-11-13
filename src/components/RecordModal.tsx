import { useEffect, useRef, useState } from "react";
import { CamSwitch } from "./CamSwitch";
import {
  beginRecording,
  cameraErrorMessage,
  countVideoInputs,
  openCamera,
  screenOrient,
  stopStream,
  type Facing,
} from "../lib/camera";
import { formatClock } from "../lib/format";

type Props = {
  title: string;
  onCancel: () => void;
  onSave: (blob: Blob, mime: string) => void;
};

const LIMIT = 60;

function pickMime(): string {
  const types = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  return types.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}

export function RecordModal({ title, onCancel, onSave }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const stopAuxRef = useRef<() => void>(() => undefined);
  const chunks = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const facingRef = useRef<Facing>("user");
  const startingRef = useRef(false);
  const phaseRef = useRef<"live" | "recording" | "review" | "error">("live");
  const [facing, setFacing] = useState<Facing>("user");
  const [cameraCount, setCameraCount] = useState(0);
  const [starting, setStarting] = useState(true);
  const [phase, setPhase] = useState<"live" | "recording" | "review" | "error">("live");
  const [sec, setSec] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [mime, setMime] = useState("video/webm");
  const [err, setErr] = useState("");

  function setPhaseBoth(next: typeof phase) {
    phaseRef.current = next;
    setPhase(next);
  }

  async function attach(stream: MediaStream) {
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => undefined);
    }
  }

  async function startStream(next: Facing) {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    const prev = streamRef.current;
    streamRef.current = null;
    try {
      const stream = await openCamera(next, prev, screenOrient());
      await attach(stream);
      facingRef.current = next;
      setFacing(next);
      setCameraCount(await countVideoInputs());
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
          setErr(cameraErrorMessage(e));
          setPhaseBoth("error");
        }
      }
    })();
    return () => {
      stopped = true;
      stopStream(streamRef.current);
      streamRef.current = null;
      if (recRef.current?.state === "recording") recRef.current.stop();
      stopAuxRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(orientation: portrait)");
    const onChange = () => {
      if (phaseRef.current === "recording" || startingRef.current) return;
      if (!streamRef.current) return;
      void startStream(facingRef.current).catch((e) => setErr(cameraErrorMessage(e)));
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  async function switchFacing() {
    if (phaseRef.current === "recording" || startingRef.current) return;
    const next: Facing = facingRef.current === "user" ? "environment" : "user";
    try {
      await startStream(next);
      setErr("");
      if (phaseRef.current === "error") setPhaseBoth("live");
    } catch (e) {
      setErr(cameraErrorMessage(e));
    }
  }

  function start() {
    const stream = streamRef.current;
    if (!stream || starting) return;
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
  }

  function stop() {
    if (recRef.current && recRef.current.state === "recording") recRef.current.stop();
  }

  function retake() {
    setBlob(null);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    setSec(0);
    setPhaseBoth("live");
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play();
    }
  }

  const live = phase === "live" || phase === "recording";
  const canSwitch = cameraCount > 1 && live;
  const canRecord = Boolean(streamRef.current) && !starting && phase === "live";

  return (
    <div className="modal-back" onClick={onCancel}>
      <div className="modal record-modal" onClick={(e) => e.stopPropagation()}>
        <div className="kicker">태블릿 촬영 · 최대 1분</div>
        <h2 className="h2" style={{ marginBottom: 12 }}>{title}</h2>
        {err ? <div className="callout warn">{err}</div> : null}
        <div className="preview cam-preview">
          {phase === "review" && preview ? (
            <video src={preview} controls playsInline />
          ) : (
            <video
              ref={videoRef}
              className={facing === "user" ? "mirror" : undefined}
              muted
              playsInline
              autoPlay
            />
          )}
          {starting && live ? <span className="cam-status">카메라 준비 중…</span> : null}
        </div>
        {phase === "recording" ? <div className="timer rec-timer">{formatClock(sec)} / 1:00</div> : null}
        <div className="rec-actions">
          {phase === "live" ? (
            <button className="btn btn-primary" onClick={start} disabled={!canRecord}>
              {starting ? "준비 중…" : "촬영"}
            </button>
          ) : null}
          {phase === "recording" ? (
            <button className="btn btn-danger" onClick={stop}>
              촬영 끝내기
            </button>
          ) : null}
          {canSwitch ? (
            <CamSwitch disabled={phase === "recording" || starting} onClick={() => void switchFacing()} />
          ) : null}
          {phase === "review" && blob ? (
            <>
              <button className="btn" onClick={retake}>
                다시 찍기
              </button>
              <button className="btn btn-primary" onClick={() => onSave(blob, mime)}>
                저장
              </button>
            </>
          ) : null}
          <button className="btn" onClick={onCancel}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
