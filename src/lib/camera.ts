export type Facing = "user" | "environment";
export type FrameOrient = "portrait" | "landscape";

export const PORTRAIT_WIDTH = 960;
export const PORTRAIT_HEIGHT = 1280;
export const LANDSCAPE_WIDTH = 1280;
export const LANDSCAPE_HEIGHT = 720;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function screenOrient(): FrameOrient {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "portrait";
  return window.matchMedia("(orientation: portrait)").matches ? "portrait" : "landscape";
}

export function frameSize(orient: FrameOrient): { width: number; height: number } {
  return orient === "portrait"
    ? { width: PORTRAIT_WIDTH, height: PORTRAIT_HEIGHT }
    : { width: LANDSCAPE_WIDTH, height: LANDSCAPE_HEIGHT };
}

export function frameAspect(orient: FrameOrient): number {
  const { width, height } = frameSize(orient);
  return width / height;
}

export function videoConstraints(
  facing: Facing,
  opts?: { deviceId?: string; orient?: FrameOrient },
): MediaTrackConstraints {
  const orient = opts?.orient ?? "portrait";
  const { width, height } = frameSize(orient);
  const maxW = orient === "portrait" ? 1080 : 1920;
  const maxH = orient === "portrait" ? 1440 : 1080;
  const base: MediaTrackConstraints = {
    width: { ideal: width, max: maxW },
    height: { ideal: height, max: maxH },
    aspectRatio: { ideal: frameAspect(orient) },
  };
  if (opts?.deviceId) return { ...base, deviceId: { exact: opts.deviceId } };
  return { ...base, facingMode: { ideal: facing } };
}

export function cameraErrorMessage(err: unknown): string {
  const name = err && typeof err === "object" && "name" in err ? String((err as { name?: string }).name) : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "카메라나 마이크 권한이 필요합니다. 브라우저 설정에서 허용해 주세요.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "이 기기에서 카메라를 찾을 수 없습니다.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "카메라가 다른 앱에서 사용 중이거나 사용할 수 없습니다.";
  }
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return "요청한 카메라로 전환할 수 없습니다.";
  }
  if (name === "SecurityError" || name === "NotSupportedError") {
    return "이 페이지에서는 카메라를 사용할 수 없습니다. 주소가 보안 연결(HTTPS)인지 확인해 주세요.";
  }
  return "카메라나 마이크를 사용할 수 없습니다. 권한을 확인해 주세요.";
}

export async function countVideoInputs(): Promise<number> {
  if (!navigator.mediaDevices?.enumerateDevices) return 0;
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === "videoinput").length;
}

export async function findCameraId(facing: Facing, excludeId?: string): Promise<string | undefined> {
  if (!navigator.mediaDevices?.enumerateDevices) return undefined;
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
  if (!devices.length) return undefined;
  const needle = facing === "user"
    ? /front|user|face|전면|selfie/i
    : /back|rear|environment|후면|후방|world/i;
  const match = devices.find((d) => needle.test(d.label) && d.deviceId !== excludeId);
  if (match?.deviceId) return match.deviceId;
  if (excludeId) {
    const other = devices.find((d) => d.deviceId && d.deviceId !== excludeId);
    return other?.deviceId;
  }
  return undefined;
}

type CameraRange = { min?: number; max?: number };
type CameraCapabilities = MediaTrackCapabilities & {
  focusMode?: string[];
  zoom?: CameraRange;
};
type CameraConstraints = MediaTrackConstraintSet & {
  focusMode?: string;
  zoom?: number;
};

export async function applyCameraTweaks(stream: MediaStream): Promise<void> {
  const track = stream.getVideoTracks()[0];
  if (!track) return;
  const caps = typeof track.getCapabilities === "function"
    ? track.getCapabilities() as CameraCapabilities
    : undefined;
  if (!caps) return;

  const advanced: CameraConstraints[] = [];
  if (caps.focusMode?.includes("continuous")) {
    advanced.push({ focusMode: "continuous" });
  }
  if (caps.zoom) {
    const min = caps.zoom.min ?? 1;
    const max = caps.zoom.max ?? min;
    const zoom = min <= 1 && max >= 1 ? 1 : min;
    advanced.push({ zoom });
  }
  if (!advanced.length) return;

  try {
    await track.applyConstraints({ advanced: advanced as MediaTrackConstraintSet[] });
    return;
  } catch {
    /* some browsers reject a combined advanced list */
  }
  for (const constraint of advanced) {
    try {
      await track.applyConstraints({ advanced: [constraint as MediaTrackConstraintSet] });
    } catch {
      try {
        await track.applyConstraints(constraint as MediaTrackConstraintSet);
      } catch {
        /* capability advertised but not writable */
      }
    }
  }
}

export async function openCamera(
  facing: Facing,
  previous?: MediaStream | null,
  orient: FrameOrient = screenOrient(),
): Promise<MediaStream> {
  const prevId = previous?.getVideoTracks()[0]?.getSettings()?.deviceId;
  // iOS Safari and many Android browsers allow only one camera at a time.
  stopStream(previous);
  if (previous) await wait(100);

  const deviceId = await findCameraId(facing, prevId);
  const size = frameSize(orient);
  const attempts: MediaStreamConstraints[] = [];
  if (deviceId) attempts.push({ audio: true, video: videoConstraints(facing, { deviceId, orient }) });
  attempts.push({ audio: true, video: videoConstraints(facing, { orient }) });
  attempts.push({
    audio: true,
    video: { facingMode: facing, width: { ideal: size.width }, height: { ideal: size.height } },
  });
  attempts.push({ audio: true, video: true });

  let lastErr: unknown;
  for (const constraints of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      await applyCameraTweaks(stream);
      return stream;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("camera");
}

export function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Source crop rectangle equivalent to CSS object-fit: cover, object-position: center. */
export function coverSourceRect(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): { sx: number; sy: number; sw: number; sh: number } {
  if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) {
    return { sx: 0, sy: 0, sw: Math.max(0, srcW), sh: Math.max(0, srcH) };
  }
  const srcAspect = srcW / srcH;
  const dstAspect = dstW / dstH;
  if (srcAspect > dstAspect) {
    const sw = srcH * dstAspect;
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh: srcH };
  }
  const sh = srcW / dstAspect;
  return { sx: 0, sy: (srcH - sh) / 2, sw: srcW, sh };
}

export function drawCoveredFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  dstW: number,
  dstH: number,
): void {
  const srcW = video.videoWidth;
  const srcH = video.videoHeight;
  if (!srcW || !srcH) return;
  const { sx, sy, sw, sh } = coverSourceRect(srcW, srcH, dstW, dstH);
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, dstW, dstH);
}

export function startFramedRecorder(
  video: HTMLVideoElement,
  cameraStream: MediaStream,
  orient: FrameOrient,
  mime?: string,
): { recorder: MediaRecorder; stop: () => void } | null {
  const canvas = document.createElement("canvas");
  const size = frameSize(orient);
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx || typeof canvas.captureStream !== "function") return null;

  let running = true;
  const tick = () => {
    if (!running) return;
    if (video.readyState >= 2 && video.videoWidth > 0) {
      drawCoveredFrame(ctx, video, size.width, size.height);
    }
    requestAnimationFrame(tick);
  };
  tick();

  let canvasStream: MediaStream;
  try {
    canvasStream = canvas.captureStream(30);
  } catch {
    running = false;
    return null;
  }
  if (!canvasStream.getVideoTracks().length) {
    running = false;
    return null;
  }

  const mixed = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...cameraStream.getAudioTracks(),
  ]);
  try {
    const recorder = new MediaRecorder(mixed, mime ? { mimeType: mime } : undefined);
    return {
      recorder,
      stop() {
        running = false;
        canvasStream.getTracks().forEach((t) => t.stop());
      },
    };
  } catch {
    running = false;
    canvasStream.getTracks().forEach((t) => t.stop());
    return null;
  }
}

export function beginRecording(
  video: HTMLVideoElement | null,
  stream: MediaStream,
  mime: string,
  orient: FrameOrient = screenOrient(),
): { recorder: MediaRecorder; stopAux: () => void } {
  if (video) {
    const framed = startFramedRecorder(video, stream, orient, mime);
    if (framed) return { recorder: framed.recorder, stopAux: framed.stop };
  }
  return {
    recorder: new MediaRecorder(stream, mime ? { mimeType: mime } : undefined),
    stopAux: () => undefined,
  };
}
