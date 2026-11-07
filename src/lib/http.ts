/** Fetch JSON with a timeout, throwing on non-2xx responses. */
export async function fetchJson<T = unknown>(url: string, timeout = 18_000): Promise<T> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeout),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
  return response.json() as Promise<T>;
}
