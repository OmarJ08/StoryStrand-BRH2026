import Link from "next/link";
import Logo from "@/components/Logo";

/** Starting screen: the brand, the pitch, and the two ways in. */
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-12 text-center">
      <Logo variant="stacked" size="lg" />
      <p className="max-w-md text-lg text-white/75">
        Google Maps for your curiosity. See where your reading lives, and get turn-by-turn
        directions from the stories you love to the science behind them.
      </p>
      <div className="flex flex-col items-center gap-3">
        <Link
          href="/onboarding"
          className="rounded-full bg-coral px-7 py-3.5 font-display text-lg font-semibold text-ink transition-transform active:scale-95"
        >
          Pick 5 books you loved
        </Link>
        <Link href="/map/books" className="text-sm text-white/60 hover:text-white">
          or just explore the map →
        </Link>
      </div>
    </main>
  );
}
