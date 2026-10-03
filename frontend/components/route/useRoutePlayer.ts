"use client";

import { useEffect, useRef, useState } from "react";

export interface Player {
  index: number | null;          // stop being narrated, null when stopped
  playing: boolean;
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

/**
 * One <audio> element for the whole app. iPhone Safari only plays audio started by a user
 * gesture, but an element that has played once inside a tap stays unlocked; so the first
 * play happens in a tap ("Start route", or unlockAudio() in "Learn the real science") and
 * every later clip reuses the element, even after a page change.
 */
let shared: HTMLAudioElement | null = null;
const sharedAudio = () => (shared ??= new Audio());

/** Call inside a tap handler when narration should be able to start later on its own. */
export function unlockAudio(): void {
  const a = sharedAudio();
  if (!a.paused) return;
  a.onended = null;
  a.src = SILENT_WAV;
  void a.play().catch(() => {});
}

/** Plays one clip per stop in order through the shared element. */
export function useRoutePlayer(
  clips: string[] | null,
  onStop: (index: number) => void,
  onDone: () => void,
): Player {
  const current = useRef(0);
  const latest = useRef({ clips, onStop, onDone });
  const [state, setState] = useState<{ index: number; playing: boolean } | null>(null);

  useEffect(() => {
    latest.current = { clips, onStop, onDone };
  });

  // a new route (new clips) ends any narration in progress
  useEffect(() => () => {
    shared?.pause();
    setState(null);
  }, [clips]);

  const playAt = (i: number) => {
    const list = latest.current.clips;
    if (!list) return;
    const a = sharedAudio();
    current.current = i;
    latest.current.onStop(i);
    a.src = list[i];
    a.play().catch(() => {});   // a pause() during loading (e.g. a new route) aborts play()
    setState({ index: i, playing: true });
  };

  const start = () => {
    if (!clips?.length) return;
    sharedAudio().onended = () => {
      const next = current.current + 1;
      if (next < (latest.current.clips?.length ?? 0)) {
        playAt(next);
      } else {
        setState(null);
        latest.current.onDone();
      }
    };
    playAt(0);
  };

  return {
    index: state?.index ?? null,
    playing: state?.playing ?? false,
    start,
    pause: () => {
      shared?.pause();
      setState((s) => s && { ...s, playing: false });
    },
    resume: () => {
      shared?.play().catch(() => {});
      setState((s) => s && { ...s, playing: true });
    },
    stop: () => {
      shared?.pause();
      setState(null);
      latest.current.onDone();
    },
  };
}
