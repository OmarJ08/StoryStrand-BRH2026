"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clusterPalette } from "@/components/map/colors";
import { useScene } from "@/components/map/SceneContext";
import { useGuest, useHydrated } from "@/lib/guest";
import type { DnaShare, MapName, Pin } from "@/lib/types";
import BackButton from "./BackButton";

const TOP = 5;
const PIN_DISTANCE = 11;
const AFTER_PORTAL_MS = 950;   // let the map-switch flight finish before flying to the pin

const pinFocus = (p: Pin) => ({ x: p.x, y: p.y, z: p.z, distance: PIN_DISTANCE });

/** Top neighborhoods as bars in their map colours, the rest folded into "Other". */
function DnaBars({ dna }: { dna: DnaShare[] }) {
  const palette = clusterPalette(dna.map((d) => d.label));
  const top = dna.slice(0, TOP);
  const other = 1 - top.reduce((s, d) => s + d.share, 0);
  const rows = other > 0.005 ? [...top, { label: "Other", share: other }] : top;
  return (
    <ul className="mt-3 space-y-2">
      {rows.map((d, i) => {
        const color = palette.get(d.label);
        return (
          <li key={d.label}>
            <div className="flex justify-between text-sm">
              <span className={i === 0 ? "font-semibold" : "text-white/80"}>{d.label}</span>
              <span className="tabular-nums text-muted">{Math.round(d.share * 100)}%</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full rounded-full"
                style={{ background: color ? `#${color.getHexString()}` : "rgb(255 255 255 / 0.3)" }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(2, d.share * 100)}%` }}
                transition={{ delay: 0.35 + i * 0.08, duration: 0.6, ease: "easeOut" }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Reveal after onboarding: the Book Map pin drops and the reading DNA slides up. When sci-fi
 * is a real part of the picks, a portal jump to the Knowledge Map follows, where the
 * suggested curiosity pin drops. Headlines always name the top DNA bar.
 */
export default function RevealFlow() {
  const router = useRouter();
  const guest = useGuest();
  const hydrated = useHydrated();
  const { flyTo, setMapOverride, setSelection } = useScene();
  const [step, setStep] = useState<MapName>("books");

  useEffect(() => {
    if (!hydrated) return;              // the saved guest isn't readable until hydration ends
    if (!guest) {
      router.replace("/onboarding");
      return;
    }
    setSelection(null);
    flyTo(pinFocus(guest.book_pin));
    // run once per guest result; flyTo/setSelection are recreated each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, guest?.guest_id, guest?.book_pin.x]);

  useEffect(() => () => setMapOverride(null), [setMapOverride]);

  if (!guest) return null;

  const curiosity = guest.curiosity_pin;
  const knowledgeDna = guest.dna.knowledge;
  const showCuriosity = () => {
    if (!curiosity) return;
    setStep("knowledge");
    setMapOverride("knowledge");
    setTimeout(() => flyTo(pinFocus(curiosity)), AFTER_PORTAL_MS);
  };
  const backToBooks = () => {
    setStep("books");
    setMapOverride("books");
    setTimeout(() => flyTo(pinFocus(guest.book_pin)), AFTER_PORTAL_MS);
  };

  return (
    <>
    <BackButton
      onClick={step === "knowledge" ? backToBooks : () => router.push("/onboarding")}
      label={step === "knowledge" ? "My reading" : "Change picks"}
    />
    <motion.section
      key={step}
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      transition={{ type: "spring", damping: 28, stiffness: 260, delay: step === "books" ? 0.9 : 0.6 }}
      className="fixed inset-x-0 bottom-0 z-20 mx-auto max-h-[62dvh] max-w-lg overflow-y-auto rounded-t-3xl border border-b-0 border-line bg-surface px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl shadow-black/60"
    >
      {step === "books" ? (
        <>
          <h2 className="font-display text-2xl font-bold leading-tight">
            Your reading lives near <span className="text-coral">{guest.dna.books[0].label}</span>
          </h2>
          <p className="mt-1 text-sm text-muted">
            Your reading DNA, from {guest.picks.map((p) => p.title.replace(/\s*\(.*\)$/, "")).slice(0, 3).join(", ")} and more:
          </p>
          <DnaBars dna={guest.dna.books} />
          {curiosity ? (
            <button onClick={showCuriosity}
              className="mt-5 w-full rounded-full bg-coral py-3 font-display font-semibold text-ink">
              See where your curiosity lives →
            </button>
          ) : (
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Link href="/map/books" className="rounded-full bg-coral py-3 text-center font-display font-semibold text-ink">
                Explore the Book Map
              </Link>
              <Link href="/onboarding" className="rounded-full border border-line py-3 hover:border-white/40 text-center font-display font-semibold">
                Pick again
              </Link>
            </div>
          )}
        </>
      ) : curiosity && knowledgeDna && (
        <>
          <h2 className="font-display text-2xl font-bold leading-tight">
            Your curiosity lives near <span className="text-[#2fc4c4]">{knowledgeDna[0].label}</span>
          </h2>
          <p className="mt-1 text-sm text-muted">
            {guest.scifi_picks.length} of your 5 picks are science fiction, so here&apos;s the real science
            nearest your taste. It&apos;s a suggestion: books and papers speak differently.
          </p>
          <DnaBars dna={knowledgeDna} />
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Link href="/route" className="rounded-full bg-coral py-3 text-center font-display font-semibold text-ink">
              Plan a learning route
            </Link>
            <Link href="/map/knowledge" className="rounded-full border border-line py-3 hover:border-white/40 text-center font-display font-semibold">
              Explore the map
            </Link>
          </div>
          <div className="mt-3 text-right text-xs text-muted">
            <Link href="/onboarding" className="hover:text-white">Pick again</Link>
          </div>
        </>
      )}
    </motion.section>
    </>
  );
}
