export type Facing = "user" | "environment";

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

export async function openCamera(facing: Facing): Promise<MediaStream> {
  const audio = true;
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio,
      video: { facingMode: { exact: facing } },
    });
  } catch (e) {
    const name = e && typeof e === "object" && "name" in e ? String((e as { name: string }).name) : "";
    if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError" || name === "NotFoundError") {
      return await navigator.mediaDevices.getUserMedia({
        audio,
        video: { facingMode: { ideal: facing } },
      });
    }
    throw e;
  }
}

export function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((t) => t.stop());
}
