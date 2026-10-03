/** Floating "back" control for the onboarding screens (top-left, safe-area aware). */
export default function BackButton({ onClick, label = "Back" }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="fixed top-[max(1rem,env(safe-area-inset-top))] left-4 z-30 rounded-full border border-white/15 bg-ink/90 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-black/40 backdrop-blur-md hover:bg-ink"
    >
      ← {label}
    </button>
  );
}
