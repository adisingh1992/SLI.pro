import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * API origin.
 *
 * Empty by default, so requests are relative — behind Azure Front Door the SPA
 * and the API share one hostname (static → Static Web Apps, /api/* → Container
 * Apps), and relative URLs are exactly right.
 *
 * Set VITE_API_BASE_URL only when the client is served from a different origin
 * than the API — e.g. hitting the Static Web Apps URL directly, bypassing
 * Front Door.
 */
const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL ?? "";

/** Prefixes API paths with the configured origin, if any. */
export function apiUrl(path: string): string {
  if (!API_BASE || /^https?:\/\//i.test(path)) return path;
  return `${API_BASE.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let errorMessage = res.statusText;

    try {
      // Try to parse the response as JSON
      const errorData = await res.json();

      // If there's a message property, use it.
      // `error` is also accepted: the admin/methodology routes return
      // { error: "..." }, and without this every one of their failures
      // surfaced as a bare "Conflict" or "Bad Request".
      if (errorData && (errorData.message || errorData.error)) {
        errorMessage = errorData.message ?? errorData.error;
      }
    } catch (e) {
      // If JSON parsing fails, try to get the text
      try {
        const text = await res.text();
        if (text) errorMessage = text;
      } catch (e) {
        // If all fails, use the status text
        errorMessage = res.statusText;
      }
    }
    
    throw new Error(errorMessage);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(apiUrl(url), {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

/**
 * Like apiRequest, but NEVER throws — returns the status and parsed body.
 *
 * apiRequest throws a plain Error on any non-2xx, which discards two things a
 * caller sometimes needs:
 *
 *   - the STATUS CODE, so it cannot branch on it. The methodology UI has to
 *     distinguish a 409 (publishing outside the evaluation window, which
 *     offers an override) from a 400 (a malformed sequence, which does not).
 *   - the RESPONSE BODY, so structured fields are lost. These routes return
 *     `remedy`, `missing`, `retired` and `warnings` alongside `error`, and all
 *     of it is worth showing.
 *
 * Use this wherever the failure is part of the interaction rather than an
 * exception. Use apiRequest where a failure is simply an error.
 */
export async function apiFetch<T = any>(
  method: string,
  url: string,
  data?: unknown,
): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(apiUrl(url), {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    // A body-less response (204, or an upstream error page) is not a failure
    // of this helper — the caller has the status either way.
  }

  return { ok: res.ok, status: res.status, data: body as T };
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Build the URL - if queryKey has multiple items, handle the path params
    let url = queryKey[0] as string;
    if (queryKey.length > 1 && queryKey[1] !== null && queryKey[1] !== undefined) {
      // Assuming the second item is the ID parameter
      url = `${url}/${queryKey[1]}`;
    }

    const res = await fetch(apiUrl(url), {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

/**
 * THE query client. There must be exactly one.
 *
 * ── WHY THIS COMMENT EXISTS ───────────────────────────────────────────────
 * There used to be two. `lib/query-client.ts` constructed a second client and
 * App.tsx passed *that* one to the provider, while 46 files imported the
 * singleton from here and called `invalidateQueries` on it. Those calls were
 * not failing — they were succeeding against a cache with no observers, which
 * is worse, because nothing anywhere reported a problem.
 *
 * What it looked like from outside: an admin saves a heuristic card, the save
 * returns 200, and the panel keeps showing the old text until a reload. A
 * student refines their SLI, the server writes it correctly, and the page never
 * shows the result — so the page keeps resubmitting the pre-refinement row and
 * the three-refinement cap never counts past one.
 *
 * If you are about to write `new QueryClient(` anywhere in this app: don't.
 * Import this one. `api-contracts.test.ts` fails the build on a second
 * instance.
 *
 * ── ON THESE DEFAULTS ─────────────────────────────────────────────────────
 * `staleTime` is five minutes, not Infinity. Infinity is the better setting
 * once every screen's invalidation is known to be correct, and that is not yet
 * established here: invalidation has never actually run in this app, so any
 * screen with a wrong or missing `invalidateQueries` call has been coasting on
 * staleness to refresh itself. Five minutes keeps that safety net while
 * invalidation starts working. Tighten to Infinity deliberately, per screen.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
    mutations: {
      retry: false,
    },
  },
});
