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

/**
 * Plays one clip per stop in order through a single reusable <audio> element. It is
 * created and first played inside the button tap, because iPhone Safari only allows
 * audio started by a user gesture; later clips reuse the same, now unlocked, element.
 */
export function useRoutePlayer(
  clips: string[] | null,
  onStop: (index: number) => void,
  onDone: () => void,
): Player {
  const audio = useRef<HTMLAudioElement | null>(null);
  const current = useRef(0);
  const latest = useRef({ clips, onStop, onDone });
  const [state, setState] = useState<{ index: number; playing: boolean } | null>(null);

  useEffect(() => {
    latest.current = { clips, onStop, onDone };
  });

  // a new route (new clips) ends any narration in progress
  useEffect(() => () => {
    audio.current?.pause();
    setState(null);
  }, [clips]);

  const playAt = (i: number) => {
    const a = audio.current;
    const list = latest.current.clips;
    if (!a || !list) return;
    current.current = i;
    latest.current.onStop(i);
    a.src = list[i];
    void a.play();
    setState({ index: i, playing: true });
  };

  const start = () => {
    if (!clips?.length) return;
    if (!audio.current) {
      const a = new Audio();
      a.addEventListener("ended", () => {
        const next = current.current + 1;
        if (next < (latest.current.clips?.length ?? 0)) {
          playAt(next);
        } else {
          setState(null);
          latest.current.onDone();
        }
      });
      audio.current = a;
    }
    playAt(0);
  };

  return {
    index: state?.index ?? null,
    playing: state?.playing ?? false,
    start,
    pause: () => {
      audio.current?.pause();
      setState((s) => s && { ...s, playing: false });
    },
    resume: () => {
      void audio.current?.play();
      setState((s) => s && { ...s, playing: true });
    },
    stop: () => {
      audio.current?.pause();
      setState(null);
      latest.current.onDone();
    },
  };
}
