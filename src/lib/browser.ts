/** Small, SSR-safe browser helpers. */

export const isBrowser = typeof window !== "undefined";

export function readStorage<T>(key: string, fallback: T): T {
  if (!isBrowser) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/** Returns false when storage is unavailable (private mode, quota, blocked). */
export function writeStorage(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function getSearchParam(name: string): string | null {
  return isBrowser ? new URLSearchParams(location.search).get(name) : null;
}

/** Update query parameters in place without adding a history entry. `null` deletes. */
export function updateSearchParams(changes: Record<string, string | null>) {
  if (!isBrowser) return;
  const url = new URL(location.href);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  history.replaceState(history.state, "", url);
}

export function downloadJson(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Inject a classic script once and resolve when it has executed. */
const scriptLoads = new Map<string, Promise<void>>();
export function loadScript(src: string): Promise<void> {
  let pending = scriptLoads.get(src);
  if (!pending) {
    pending = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptLoads.delete(src);
        reject(new Error(`Failed to load ${src}`));
      };
      document.head.append(script);
    });
    scriptLoads.set(src, pending);
  }
  return pending;
}
