type Props = {
  disabled?: boolean;
  onClick: () => void;
};

export function CamSwitch({ disabled, onClick }: Props) {
  return (
    <button type="button" className="cam-switch" aria-label="카메라 전환" disabled={disabled} onClick={onClick}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path
          d="M16.2 3.8h2.3A1.8 1.8 0 0 1 20.3 5.6V8M7.8 20.2H5.5A1.8 1.8 0 0 1 3.7 18.4V16M20.2 7.2 16.8 3.8 13.4 7.2M3.8 16.8 7.2 20.2 10.6 16.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="3.1" fill="none" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    </button>
  );
}
