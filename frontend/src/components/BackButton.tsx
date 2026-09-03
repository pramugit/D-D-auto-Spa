import { useNavigate } from "react-router-dom";

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <path
        d="M15 6l-6 6l6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BackButton() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(-1)}
      className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-950 transition hover:text-sky-500"
    >
      <ChevronLeftIcon />
      Back
    </button>
  );
}
