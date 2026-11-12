type Props = {
  dataUrl: string;
  title: string;
  caption: string;
  alt?: string;
  children?: import("react").ReactNode;
};

export function QrCard({ dataUrl, title, caption, alt = "손님 영상 QR 코드", children }: Props) {
  return (
    <div className="qr-card">
      <img src={dataUrl} alt={alt} width={132} height={132} />
      <div>
        <b>{title}</b>
        <p>{caption}</p>
        {children}
      </div>
    </div>
  );
}
