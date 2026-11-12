import { useEffect, useRef } from "react";

type Props = { text: string; onDone: () => void };

export function Toast({ text, onDone }: Props) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => onDoneRef.current(), 2400);
    return () => clearTimeout(t);
  }, [text]);
  return <div className="toast">{text}</div>;
}
