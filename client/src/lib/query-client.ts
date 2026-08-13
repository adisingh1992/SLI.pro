/**
 * DEPRECATED — kept only so this path cannot construct a second query client.
 *
 * This module used to export its own `new QueryClient(...)` plus an
 * `apiRequest` with a different signature to the one in `./queryClient`
 * (object-form `apiRequest({ url, method, body })` returning parsed JSON,
 * versus positional `apiRequest(method, url, data)` returning a `Response`).
 * Two clients and two same-named helpers, one hyphen apart in the filename.
 *
 * App.tsx passed this file's client to the provider while 46 files imported the
 * other one, so every `invalidateQueries` in those files ran against a cache
 * nothing was subscribed to. See the comment in `./queryClient`.
 *
 * Nothing imports this any more. It re-exports the real client rather than
 * being deleted outright so that a stray or reintroduced
 * `from "@/lib/query-client"` still resolves to the single instance instead of
 * quietly recreating the bug. `apiRequest` is deliberately NOT re-exported —
 * the two signatures were incompatible, so a caller expecting the old one
 * should fail at the type level rather than at runtime.
 *
 * Safe to `git rm` once you are happy nothing references it.
 */
export { queryClient } from "./queryClient";
