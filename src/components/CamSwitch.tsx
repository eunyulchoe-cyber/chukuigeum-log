type Props = {
  disabled?: boolean;
  onClick: () => void;
};

export function CamSwitch({ disabled, onClick }: Props) {
  return (
    <button type="button" className="cam-switch" aria-label="카메라 전환" disabled={disabled} onClick={onClick}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path
          d="M8.2 7h1.15l.55-1.05A1 1 0 0 1 10.75 5.5h2.5a1 1 0 0 1 .85.45L14.65 7H16.5A2.5 2.5 0 0 1 19 9.5v6A2.5 2.5 0 0 1 16.5 18h-9A2.5 2.5 0 0 1 5 15.5v-6A2.5 2.5 0 0 1 7.5 7H8.2z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path
          d="M9.4 13.6a2.7 2.7 0 0 1 4.3-2.15M14.6 11.2l-.05 1.45-1.3-.7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M14.6 12.4a2.7 2.7 0 0 1-4.3 2.15M9.4 14.8l.05-1.45 1.3.7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>전환</span>
    </button>
  );
}
