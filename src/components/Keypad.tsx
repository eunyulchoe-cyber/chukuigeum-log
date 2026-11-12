type Props = {
  value: string;
  amount: number | null;
  onKey: (key: string) => void;
  formatWon: (n: number) => string;
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "←"];

export function Keypad({ value, amount, onKey, formatWon }: Props) {
  return (
    <div className="keypad">
      <div className="amount">{amount ? formatWon(amount) : "0원"}</div>
      <div className="keys">
        {KEYS.map((k) => (
          <button type="button" key={k} className="key" onClick={() => onKey(k)} aria-label={k === "←" ? "지우기" : k === "C" ? "모두 지우기" : k}>
            {k}
          </button>
        ))}
      </div>
      {value ? <div className="faint" style={{ textAlign: "right", fontSize: 12, marginTop: 6 }}>{value}원</div> : null}
    </div>
  );
}
