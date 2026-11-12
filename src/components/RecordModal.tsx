import { useEffect, useRef, useState } from "react";
import { CamSwitch } from "./CamSwitch";
import {
  cameraErrorMessage,
  countVideoInputs,
  openCamera,
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
  const chunks = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const facingRef = useRef<Facing>("user");
  const [facing, setFacing] = useState<Facing>("user");
  const [cameraCount, setCameraCount] = useState(0);
  const [phase, setPhase] = useState<"live" | "recording" | "review" | "error">("live");
  const [sec, setSec] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [mime, setMime] = useState("video/webm");
  const [err, setErr] = useState("");

  async function attach(stream: MediaStream) {
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => undefined);
    }
  }

  async function startStream(next: Facing) {
    const stream = await openCamera(next);
    stopStream(streamRef.current);
    await attach(stream);
    facingRef.current = next;
    setFacing(next);
    setCameraCount(await countVideoInputs());
  }

  useEffect(() => {
    let stopped = false;
    void (async () => {
      try {
        const stream = await openCamera("user");
        if (stopped) {
          stopStream(stream);
          return;
        }
        await attach(stream);
        setCameraCount(await countVideoInputs());
      } catch (e) {
        if (!stopped) {
          setErr(cameraErrorMessage(e));
          setPhase("error");
        }
      }
    })();
    return () => {
      stopped = true;
      stopStream(streamRef.current);
      if (recRef.current?.state === "recording") recRef.current.stop();
    };
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
    if (phase === "recording") return;
    const next: Facing = facingRef.current === "user" ? "environment" : "user";
    try {
      await startStream(next);
      setErr("");
    } catch (e) {
      setErr(cameraErrorMessage(e));
    }
  }

  function start() {
    const stream = streamRef.current;
    if (!stream) return;
    chunks.current = [];
    const type = pickMime();
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    setMime(rec.mimeType || type || "video/webm");
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.current.push(e.data);
    };
    rec.onstop = () => {
      const b = new Blob(chunks.current, { type: rec.mimeType || mime });
      setBlob(b);
      const url = URL.createObjectURL(b);
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return url;
      });
      setPhase("review");
    };
    recRef.current = rec;
    rec.start(200);
    setSec(0);
    setPhase("recording");
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
    setPhase("live");
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play();
    }
  }

  const live = phase === "live" || phase === "recording";
  const canSwitch = cameraCount > 1 && live;

  return (
    <div className="modal-back" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="kicker">태블릿 촬영 · 최대 1분</div>
        <h2 className="h2" style={{ marginBottom: 12 }}>{title}</h2>
        {err ? <div className="callout warn">{err}</div> : null}
        <div className="preview">
          {phase === "review" && preview ? (
            <video src={preview} controls playsInline />
          ) : (
            <video
              ref={videoRef}
              className={facing === "user" ? "mirror" : undefined}
              muted
              playsInline
              autoPlay
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          )}
          {canSwitch ? <CamSwitch disabled={phase === "recording"} onClick={() => void switchFacing()} /> : null}
        </div>
        {phase === "recording" ? <div className="timer">{formatClock(sec)} / 1:00</div> : null}
        <div className="row" style={{ marginTop: 12 }}>
          {phase === "live" ? (
            <button className="btn btn-primary" onClick={start} style={{ flex: 1 }}>
              촬영
            </button>
          ) : null}
          {phase === "recording" ? (
            <button className="btn btn-danger" onClick={stop} style={{ flex: 1 }}>
              촬영 끝내기
            </button>
          ) : null}
          {phase === "review" && blob ? (
            <>
              <button className="btn" onClick={retake} style={{ flex: 1 }}>
                다시 찍기
              </button>
              <button className="btn btn-primary" onClick={() => onSave(blob, mime)} style={{ flex: 1 }}>
                저장
              </button>
            </>
          ) : null}
          <button className="btn btn-ghost" onClick={onCancel}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
