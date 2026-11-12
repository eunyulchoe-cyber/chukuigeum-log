type Props = { mark?: string; variant?: "hero" | "subtle" };

export function Atmosphere({ mark = "축", variant = "subtle" }: Props) {
  const glyph = (mark && mark.trim().charAt(0)) || "축";
  return (
    <div className={`page-mark${variant === "hero" ? " is-hero" : ""}`} aria-hidden="true">
      {glyph}
    </div>
  );
}
