const API = process.env.NEXT_PUBLIC_API_URL!;   // the static ngrok URL (not a secret)

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "1",
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json() as Promise<T>;
}

/**
 * Binary responses (e.g. narration MP3s). <audio src> cannot send the ngrok header, so
 * free ngrok may answer it with its HTML warning page; fetch as a blob and play that.
 */
export async function apiBlob(path: string): Promise<Blob> {
  const res = await fetch(`${API}${path}`, { headers: { "ngrok-skip-browser-warning": "1" } });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.blob();
}

/**
 * Pre-baked demo data shipped with the site (public/demo/, written by scripts/bake_demo.py),
 * used when the backend is slow or unreachable. Same origin, so no ngrok header.
 */
export async function bakedJson<T>(path: string): Promise<T> {
  const res = await fetch(`/demo/${path}`);
  if (!res.ok) throw new Error(`${res.status} /demo/${path}`);
  return res.json() as Promise<T>;
}

/** Rejects if the promise hasn't settled within ms (the live call keeps running). */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/**
 * Live API call with a baked fallback: the live answer if it arrives within ms, otherwise
 * (or on error) the baked file; if neither exists, the live error.
 */
export async function liveOrBaked<T>(live: Promise<T>, baked: string, ms: number): Promise<T> {
  try {
    return await withTimeout(live, ms);
  } catch (e) {
    try {
      return await bakedJson<T>(baked);
    } catch {
      throw e;
    }
  }
}
