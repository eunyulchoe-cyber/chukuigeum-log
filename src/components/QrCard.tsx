type Props = {
  dataUrl: string;
  title: string;
  caption: string;
  children?: import('react').ReactNode;
};

export function QrCard({ dataUrl, title, caption, children }: Props) {
  return (
    <div className="qr-card">
      <img src={dataUrl} alt="영상편지 QR 코드" width={132} height={132} />
      <div>
        <b>{title}</b>
        <p>{caption}</p>
        {children}
      </div>
    </div>
  );
}
