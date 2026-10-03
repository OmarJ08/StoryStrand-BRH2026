"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { GuestResponse } from "./types";

/** No login: a guest is a random UUID kept in this browser (Section 12). */
const ID_KEY = "storystrand.guestId";
const RESULT_KEY = "storystrand.guest";
const CHANGED = "storystrand:guest";

export function getGuestId(): string {
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}

export function saveGuest(guest: GuestResponse): void {
  localStorage.setItem(RESULT_KEY, JSON.stringify(guest));
  window.dispatchEvent(new Event(CHANGED));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);   // other tabs
  window.addEventListener(CHANGED, onChange);     // this tab
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

const noSubscribe = () => () => {};

/**
 * False during the server render and hydration, true after. useGuest() reports null
 * until then, so "no guest" only means something once this is true.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(noSubscribe, () => true, () => false);
}

/**
 * The guest's latest pins and DNA, or null before onboarding. Read through
 * useSyncExternalStore so the server render (no localStorage) and hydration agree.
 */
export function useGuest(): GuestResponse | null {
  const raw = useSyncExternalStore(subscribe, () => localStorage.getItem(RESULT_KEY), () => null);
  return useMemo(() => {
    if (!raw) return null;
    try {
      const guest = JSON.parse(raw) as GuestResponse;
      // results saved before the sci-fi gate lack scifi_picks: treat as stale, re-onboard
      return Array.isArray(guest.scifi_picks) ? guest : null;
    } catch {
      return null;
    }
  }, [raw]);
}
