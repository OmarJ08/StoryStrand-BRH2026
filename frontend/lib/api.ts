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
