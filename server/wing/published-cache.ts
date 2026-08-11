/**
 * In-process cache for published editorial content on the turn path.
 *
 * ── THE MEASUREMENT THAT PROMPTED THIS ───────────────────────────────────────
 * From the per-turn timing line, Foundation Session 2, one turn:
 *
 *   session 0.3s | turns 2.5s | context 6.2s | prompt 13.2s | first token 16.5s
 *   | stream done 17.9s | TURN RELEASED 23.1s | analysis 47.4s
 *
 * The seven seconds between `context` and `prompt` are not computation. They
 * are two sequential database round trips — published completion criteria,
 * then the published objective set — and each costs the better part of two
 * seconds because the query travels to Azure Postgres. Generation itself took
 * 1.4 seconds (`stream done` minus `first token`). **The prompt took five
 * times longer to assemble than the model took to answer it.**
 *
 * ── WHY THIS CONTENT IS SAFE TO CACHE, WHEN LITTLE ELSE IS ───────────────────
 * Criteria, methodology and objective sets follow the retire-never-edit rule:
 * a row is never updated in place. Publishing a new version inserts a new row
 * and retires the old one, so a cached row can never become *wrong* — it can
 * only become *stale*, which is a different and much weaker failure. The value
 * cached here is the answer to "which version is published", and that pointer
 * moves only when a human clicks Publish in the admin UI.
 *
 * This is exactly the property that makes caching defensible. It would not be
 * defensible for a student's transcript, their documents, or their session
 * state, none of which are immutable and none of which are cached here.
 *
 * ── WHY BOTH A TTL AND EXPLICIT INVALIDATION ────────────────────────────────
 * `invalidate()` is called from every publish and revert path, which handles
 * the case that actually matters: someone edits criteria and immediately opens
 * a session to see the effect. In a single process that is sufficient.
 *
 * The TTL exists because the deployment is not a single process. Container
 * Apps runs several replicas, and a publish served by replica A leaves replica
 * B holding the previous version with no way to hear about it. Sixty seconds
 * is the bound on that disagreement. The alternative — a pub/sub channel or a
 * shared cache — is real infrastructure for a page that gets edited a few
 * times a week, and a minute of skew on an editorial change is not a problem
 * anyone will notice.
 *
 * A cache that cannot be reasoned about is worse than a slow query. The rule
 * for adding anything here: it must be immutable once written, it must be read
 * on the turn path, and it must be content rather than student data.
 */

const TTL_MS = 60_000;

type Entry = { value: unknown; at: number };

const entries = new Map<string, Entry>();

/** Cache statistics, for the readiness endpoint and for tests. */
let hits = 0;
let misses = 0;

/**
 * Returns the cached value for `key`, or computes and stores it.
 *
 * `null` is cached like any other value — "no published version" is a real
 * answer and re-asking for it every turn is the same round trip. That is the
 * common case for populations nobody has published criteria for yet.
 *
 * A rejected `compute` is not cached: a transient database error must not be
 * remembered for a minute.
 */
export async function cached<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const hit = entries.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    hits++;
    return hit.value as T;
  }

  misses++;
  const value = await compute();
  entries.set(key, { value, at: Date.now() });
  return value;
}

/**
 * Drops cached entries.
 *
 * Called from every publish and revert path. The prefix form exists so a
 * store can clear its own namespace without knowing about the others —
 * `invalidate("criteria:")` rather than a full flush, which would throw away
 * the objective sets a live session is mid-way through using.
 */
export function invalidate(prefix?: string): void {
  if (!prefix) {
    entries.clear();
    return;
  }
  for (const key of Array.from(entries.keys())) {
    if (key.startsWith(prefix)) entries.delete(key);
  }
}

export function stats(): { size: number; hits: number; misses: number } {
  return { size: entries.size, hits, misses };
}

/** Test seam. Not called by application code. */
export function __reset(): void {
  entries.clear();
  hits = 0;
  misses = 0;
}
