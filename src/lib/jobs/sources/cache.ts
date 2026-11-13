// In-memory cache for source responses, shared by every request in this
// ApplyStack server. Going back to a page you've seen (or re-sorting a list
// source) never re-downloads within the TTL. Concurrent callers share one fetch.

interface Entry {
  at: number;
  ttl: number;
  value: Promise<unknown>;
}

const g = globalThis as unknown as { __applystackSourceCache?: Map<string, Entry> };
const store = () => (g.__applystackSourceCache ??= new Map());
const MAX_ENTRIES = 400;

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const map = store();
  const hit = map.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value as Promise<T>;
  const value = load();
  map.set(key, { at: Date.now(), ttl: ttlMs, value });
  value.catch(() => map.delete(key)); // never cache failures
  if (map.size > MAX_ENTRIES) {
    const oldest = [...map.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, map.size - MAX_ENTRIES);
    for (const [k] of oldest) map.delete(k);
  }
  return value;
}

export function clearSourceCache(prefix = ""): number {
  const map = store();
  let n = 0;
  for (const k of [...map.keys()]) {
    if (k.startsWith(prefix)) {
      map.delete(k);
      n++;
    }
  }
  return n;
}

export function cacheSize(): number {
  return store().size;
}
