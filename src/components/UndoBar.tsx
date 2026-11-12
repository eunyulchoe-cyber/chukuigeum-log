type Props = {
  label: string;
  left: number;
  onUndo: () => void;
};

export function UndoBar({ label, left, onUndo }: Props) {
  return (
    <div className="undo-bar" role="status">
      <div className="undo-track" style={{ width: `${(left / 5) * 100}%` }} />
      <span>방금 {label}을 저장했습니다. {left}초</span>
      <button type="button" onClick={onUndo}>
        되돌리기
      </button>
    </div>
  );
}
