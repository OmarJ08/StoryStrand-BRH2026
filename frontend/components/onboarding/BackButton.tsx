/** Floating "back" control for the onboarding screens (top-left, safe-area aware). */
export default function BackButton({ onClick, label = "Back" }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="fixed top-[max(1rem,env(safe-area-inset-top))] left-4 z-30 h-10 rounded-full border border-line bg-surface px-4 text-sm font-medium text-white shadow-lg shadow-black/40 hover:border-white/40"
    >
      ← {label}
    </button>
  );
}
