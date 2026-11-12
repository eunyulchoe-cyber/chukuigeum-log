type Props = {
  pin: string;
  error?: string;
  hint?: string;
  title?: string;
  max?: number;
  onKey: (key: string) => void;
};

export function PinPad({ pin, error, hint, title = "비밀번호를 입력해 주세요", max = 6, onKey }: Props) {
  const dots = Math.max(4, Math.min(max, Math.max(pin.length, 4)));
  return (
    <div className="center" style={{ maxWidth: 360, margin: "28px auto" }}>
      <div className="kicker">관리자</div>
      <h2 className="h2">{title}</h2>
      {hint ? <p className="lead">{hint}</p> : null}
      <div style={{ display: "flex", justifyContent: "center", gap: 10, margin: "22px 0 18px" }}>
        {Array.from({ length: dots }, (_, i) => (
          <i
            key={i}
            style={{
              width: 14,
              height: 14,
              borderRadius: 99,
              display: "block",
              border: "2px solid var(--line-strong)",
              background: i < pin.length ? "var(--accent)" : "transparent",
            }}
          />
        ))}
      </div>
      <div className="keys" style={{ maxWidth: 300, margin: "0 auto" }}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "←"].map((k, i) =>
          k ? (
            <button type="button" key={k} className="key" onClick={() => onKey(k)}>
              {k}
            </button>
          ) : (
            <span key={i} />
          ),
        )}
      </div>
      {error ? <div className="callout warn" style={{ marginTop: 16 }}>{error}</div> : null}
    </div>
  );
}
