import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Compass, Home, Loader2, PanelLeft, Search, Wifi, WifiOff } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { threadsAreSessions, type Thread } from "@/lib/wing-api";

/** Sidebar's own collapse/expand choice — see the comment above `setExpanded` below. */
const SIDEBAR_EXPANDED_KEY = "wing.sidebarExpanded";

/**
 * The student shell: the wine rail, the conversation list, and the account menu.
 *
 * ── ONE HONEST DIFFERENCE FROM THE DESIGN ────────────────────────────────
 * The design's sidebar lists several conversations, two of them in the same module
 * ("Interview prep — Meridian" and "Interview prep — Northstar"). The backend holds one
 * session per (student, module), so a thread here is a module and there cannot be two.
 *
 * That is stated rather than papered over: with `threadsAreSessions` set, the list does
 * not offer a "new conversation" affordance, because it would silently resume the
 * existing one instead of starting a second — which reads as data loss to anyone who
 * expected the design's behaviour. When `sessions.module_slug` and a thread endpoint
 * land, flip the flag and the affordance appears.
 *
 * ── COLLAPSED HAS TWO SHAPES, NOT ONE ────────────────────────────────────
 * `wing5` (the Lovable reference build) collapses the sidebar two different ways
 * depending on what's behind it:
 *   - on `/chat*`, collapsed means gone — width 0, replaced by a floating expand
 *     button plus the open thread's title, because the chat column IS the content.
 *   - everywhere else (home included), collapsed means a 72px icon rail — logo,
 *     Home, Explore, then the account avatar pinned to the bottom. The nav doesn't
 *     disappear, it just loses its labels.
 *
 * This file used to render only the first shape, for every route, any time it
 * collapsed. On `/` that meant the home page's default (collapsed) state showed
 * literally one floating button and nothing else — no logo, no Home/Explore, no
 * account menu — which is the "sidebar doesn't have all the elements" bug: the icon
 * rail wasn't missing a few elements, it didn't exist. Fixed by giving collapsed a
 * second, route-dependent render, matching wing5's `AppShell.tsx` exactly.
 *
 * `isChatView` also now matches `/chat` AND `/chat/:slug` — real chat threads live at
 * the latter, and the exact-match `location === "/chat"` from before never matched an
 * actual module thread, so opening one never collapsed the sidebar at all.
 *
 * The rail's account button opens the same dropdown as the expanded sidebar's, just
 * anchored to open rightward instead of upward — there is exactly one menu, not two to
 * keep in sync.
 *
 * `Offline mode` is real here, not a preview. wing5's rail carries a manual nav row
 * that opens a demo-only overlay for previewing the offline state — a button with
 * nothing behind it in this app, since offline handling here is already live
 * (`OfflineBanner` reads `navigator.onLine` on its own). So the rail and the full
 * sidebar both get a live connection-status row instead: same icon, same position,
 * reporting what's actually true rather than opening a preview of it. One hook,
 * `useOnlineStatus`, backs both that row and `OfflineBanner` below — one source of
 * truth for "online" rather than two listeners drifting apart.
 *
 * ── THE SIDEBAR IS `sticky`, NOT JUST TALL ────────────────────────────────
 * Neither `<aside>` had a height of its own — no `h-screen`, no `sticky` — so on a
 * page taller than the viewport (the dashboard, once it had five cards on it) the
 * whole flex row grew to match, the sidebar stretched right along with it, and its
 * account button and connection row ended up however far down that stretched column
 * put them: below the fold, reachable only by scrolling the entire page past the
 * dashboard content first. wing5's `<aside>` is `sticky top-0 h-screen` — pinned to
 * one viewport height, staying in view while `main` scrolls past it. Both asides here
 * now match that, which is also what actually makes the rail's `flex-1
 * overflow-y-auto` thread list scroll internally instead of just growing forever.
 *
 * ── WIDTH IS 257px / 64px ─────────────────────────────────────────────────
 * Two requested passes, each against this file's own previous value rather than
 * wing5's `w-[260px]` / `w-[72px]`: first 288px/72px → 245px/61px (−15%), then
 * 245px/61px → 257px/64px (+5%: 245 × 1.05 ≈ 257, 61 × 1.05 ≈ 64). If it changes
 * again, scale both together so the rail stays the expanded sidebar's icon column
 * at the same width, not an unrelated number.
 *
 * ── FOCUS RING: `quiet-focus` ─────────────────────────────────────────────
 * `index.css` puts a global salmon `:focus-visible` outline on every focusable
 * element inside `.wing-surface`, as an accessibility default. Chrome treats a
 * text `<input>`/`<textarea>` as focus-visible on an ordinary mouse click, not
 * just on keyboard focus — so clicking into "Search conversations" outlined the
 * whole pill in salmon, which reads as an error state, not a focus state. The
 * search input carries `quiet-focus` (a scoped, unlayered override defined next
 * to the global rule in index.css — see the comment there for why this can't be
 * a Tailwind `focus-visible:` utility) and keeps its own `focus-visible:ring-1
 * focus-visible:ring-aqua` as the replacement, quieter indicator.
 *
 * ── ACTIVE-NAV RADIUS MATCHES wing5 ───────────────────────────────────────
 * `NavItem`'s active state was `rounded-lg`; wing5's own `NavRow` uses
 * `rounded-xl` for the same highlight. Bumped to match. The thread-list's own
 * active-item highlight stays `rounded-lg` — wing5's thread-list buttons use
 * `rounded-lg` too, so that one was never mismatched.
 *
 * ── EXPANDED IS THE DEFAULT, PERSISTED, EVERYWHERE ────────────────────────
 * Used to re-derive `expanded` from the route on every navigation (collapsed on
 * `/chat` and `/`, expanded elsewhere), which read as "the sidebar is expanded on
 * some screens and collapsed on others" — it wasn't remembering anything, it was
 * recomputing a per-route default each time and discarding whatever the student
 * had actually chosen. Now `expanded` defaults to `true` on every route and is
 * backed by `localStorage` (`SIDEBAR_EXPANDED_KEY`): the student's own
 * collapse/expand click is the only thing that changes it, via `setExpanded`, and
 * that choice loads back on every page, including a hard refresh. The one
 * exception is the mobile auto-hide after picking a thread (small screens only) —
 * that's an automatic space-saving behaviour, not the student's toggle, so it goes
 * through `setExpandedState` directly and does not overwrite the stored choice.
 */
export function AppShell({
  children,
  threads,
  activeThreadId,
  onOpenExplore,
}: {
  children: ReactNode;
  threads: Thread[];
  activeThreadId: string | null;
  onOpenExplore: () => void;
}) {
  const [location, navigate] = useLocation();
  const { user, logoutMutation } = useAuth();
  const [query, setQuery] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);

  const isChatView = location === "/chat" || location.startsWith("/chat/");

  /*
   * Expanded by default, on every route — including `/chat` and `/`, which used to
   * collapse on load no matter what the student had last chosen. The old version
   * re-derived `expanded` from the CURRENT ROUTE on every navigation (a `useEffect`
   * keyed on `location`, unconditionally overwriting the state), which is exactly why
   * the sidebar looked "expanded on some screens, collapsed on others" — it was never
   * remembering anything, it was recomputing a per-route default every time.
   *
   * Now there's one source of truth: `localStorage`. The student's own collapse/expand
   * click is the only thing that changes it, and that choice is read back on every
   * load — including a hard refresh — by the initializer below. A first-ever visit
   * with nothing stored yet still defaults to collapsed on a narrow (phone) viewport,
   * since a 257px sidebar on a 375px screen leaves no room for the page; once the
   * student has picked something, that's what loads, on every route, every time.
   */
  const [expanded, setExpandedState] = useState<boolean>(() => {
    try {
      const stored = window.localStorage.getItem(SIDEBAR_EXPANDED_KEY);
      if (stored !== null) return stored === "true";
    } catch {
      // localStorage unavailable (private browsing, etc.) — fall through to the default below.
    }
    const narrow = typeof window !== "undefined" && window.innerWidth < 768;
    return !narrow;
  });

  /** The student's deliberate toggle — persisted. For an automatic, non-persisted
   *  collapse (see the mobile thread-select below), set `expanded` directly via
   *  `setExpandedState` instead so it doesn't overwrite their stored preference. */
  const setExpanded = (next: boolean) => {
    setExpandedState(next);
    try {
      window.localStorage.setItem(SIDEBAR_EXPANDED_KEY, String(next));
    } catch {
      // best-effort; the sidebar just won't remember this choice past the current load.
    }
  };

  const q = query.trim().toLowerCase();
  const visible = q ? threads.filter((t) => t.title.toLowerCase().includes(q)) : threads;
  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null;

  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.username || "";
  const initials =
    [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("").toUpperCase() ||
    (user?.username?.[0] ?? "?").toUpperCase();

  const signOut = () => logoutMutation.mutate();

  return (
    <div className="wing-surface flex min-h-screen bg-wing-canvas text-forest">
      {expanded ? (
        <aside className="sticky top-0 flex h-screen w-[257px] shrink-0 flex-col bg-wine text-white">
          <div className="flex items-center justify-between px-5 pb-4 pt-5">
            <Link href="/" className="text-lg font-semibold tracking-tight text-aqua">
              Wing
            </Link>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="Collapse sidebar"
              className="rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          </div>

          <nav className="space-y-0.5 px-3">
            <NavItem
              href="/"
              icon={<Home className="h-4 w-4" />}
              label="Home"
              expanded
              active={location === "/"}
            />
            <NavItem
              onClick={onOpenExplore}
              icon={<Compass className="h-4 w-4" />}
              label="Explore"
              expanded
            />
          </nav>

          <div className="px-4 pb-2 pt-5">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/50" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search conversations"
                aria-label="Search conversations"
                className="quiet-focus w-full rounded-lg bg-white/10 py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/45 focus-visible:ring-1 focus-visible:ring-aqua"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {visible.length === 0 ? (
              <p className="px-3 py-2 text-sm text-white/50">
                {q ? "No conversations found." : "Nothing here yet."}
              </p>
            ) : (
              <ul className="space-y-0.5">
                {visible.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => {
                        navigate(`/chat/${t.id}`);
                        // Automatic, space-saving only — not the student's own toggle,
                        // so it doesn't overwrite their stored expand/collapse choice.
                        if (window.innerWidth < 768) setExpandedState(false);
                      }}
                      aria-current={t.id === activeThreadId ? "page" : undefined}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        t.id === activeThreadId
                          ? "bg-wine-dark text-aqua"
                          : "text-white/85 hover:bg-white/10"
                      }`}
                    >
                      <span className="block truncate">{t.title}</span>
                      {t.when && <span className="block text-[11px] text-white/45">{t.when}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/*
              * Only while a thread is a session. The design shows a second conversation
              * in the same module; the backend cannot hold one, so the affordance that
              * would promise it is absent rather than misleading.
              */}
            {!threadsAreSessions && (
              <button
                type="button"
                onClick={onOpenExplore}
                className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm text-aqua hover:bg-white/10"
              >
                New conversation
              </button>
            )}
          </div>

          <div className="border-t border-white/10 px-3 pt-2">
            <ConnectionStatus expanded />
          </div>

          <div className="relative px-3 pb-3">
            <button
              type="button"
              onClick={() => setAccountOpen((o) => !o)}
              aria-expanded={accountOpen}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-white/10"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-midnight text-xs font-semibold text-white">
                {initials}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm text-white">{name}</span>
                <span className="block truncate text-[11px] text-white/50">{user?.username}</span>
              </span>
            </button>

            {accountOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setAccountOpen(false)} />
                <div className="absolute bottom-full left-3 right-3 z-50 mb-1 animate-rise overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-wing-border">
                  <div className="border-b border-wing-border px-4 py-3">
                    <p className="truncate text-[13px] font-semibold text-forest">{name}</p>
                    <p className="truncate text-[11px] text-plum">{user?.username}</p>
                  </div>
                  <AccountMenuItems onSignOut={signOut} signingOut={logoutMutation.isPending} />
                </div>
              </>
            )}
          </div>
        </aside>
      ) : isChatView ? (
        /*
         * ── AN OPAQUE BAR, NOT A FLOATING TRANSLUCENT PILL ───────────────────
         * This used to be a `fixed`, `p-3`-inset pair of `bg-white/80 backdrop-blur`
         * pills sitting at the top-left corner — floating ON TOP of the chat page's own
         * header (`<p className="label-eyebrow">{module?.name}</p>` in `chat.tsx`),
         * which occupies that exact same corner and is not aware this bar exists. Being
         * translucent meant the header's text showed through underneath rather than
         * being covered, so the module name rendered twice, overlapping, at that corner
         * — which is the bug this replaces. wing5's own version (`AppShell.tsx`) is a
         * full-width, opaque, fixed bar instead: `left-0 right-0 h-14 bg-canvas`. Opaque
         * and full-width means there is nothing left for anything behind it to bleed
         * through, by construction, rather than by tuning padding to avoid a collision.
         */
        <div className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center gap-2 bg-wing-canvas px-3">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label="Open sidebar"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-wine text-white/80 shadow-lg transition-colors hover:text-aqua"
          >
            <PanelLeft className="h-5 w-5" />
          </button>
          {activeThread && (
            <span
              className="max-w-[240px] truncate text-[13px] text-plum"
              title={activeThread.title}
            >
              {activeThread.title}
            </span>
          )}
        </div>
      ) : (
        <aside className="sticky top-0 flex h-screen w-[64px] shrink-0 flex-col items-center gap-3 bg-wine px-3 py-5 text-white">
          <Link
            href="/"
            className="text-[15px] font-bold tracking-[0.14em] text-aqua hover:opacity-80"
            aria-label="Wing home"
          >
            W
          </Link>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label="Expand sidebar"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-white/70 hover:bg-white/10 hover:text-aqua"
          >
            <PanelLeft className="h-5 w-5" />
          </button>

          <nav className="mt-2 flex flex-col items-center gap-1">
            <NavItem
              href="/"
              icon={<Home className="h-5 w-5" />}
              label="Home"
              expanded={false}
              active={location === "/"}
            />
            <NavItem
              onClick={onOpenExplore}
              icon={<Compass className="h-5 w-5" />}
              label="Explore"
              expanded={false}
            />
          </nav>

          <div className="flex-1" />

          <ConnectionStatus expanded={false} />

          <div className="relative">
            <button
              type="button"
              onClick={() => setAccountOpen((o) => !o)}
              aria-expanded={accountOpen}
              aria-label="Account"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-midnight text-xs font-semibold text-white"
            >
              {initials}
            </button>

            {accountOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setAccountOpen(false)} />
                <div className="absolute bottom-0 left-full z-50 ml-2 w-60 animate-rise overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-wing-border">
                  <div className="border-b border-wing-border px-4 py-3">
                    <p className="truncate text-[13px] font-semibold text-forest">{name}</p>
                    <p className="truncate text-[11px] text-plum">{user?.username}</p>
                  </div>
                  <AccountMenuItems onSignOut={signOut} signingOut={logoutMutation.isPending} />
                </div>
              </>
            )}
          </div>
        </aside>
      )}

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

/** One nav row, rendered either as an icon-only rail button or a full labelled link. */
function NavItem({
  href,
  onClick,
  icon,
  label,
  expanded,
  active,
}: {
  href?: string;
  onClick?: () => void;
  icon: ReactNode;
  label: string;
  expanded: boolean;
  active?: boolean;
}) {
  const className = `flex items-center rounded-xl text-sm transition-colors ${
    expanded ? "w-full gap-3 px-3 py-2" : "h-10 w-10 justify-center"
  } ${active ? "bg-aqua text-wine" : "text-white/85 hover:bg-white/10 hover:text-aqua"}`;

  if (href) {
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        aria-label={expanded ? undefined : label}
        title={expanded ? undefined : label}
        className={className}
      >
        {icon}
        {expanded && label}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={expanded ? undefined : label}
      title={expanded ? undefined : label}
      className={className}
    >
      {icon}
      {expanded && label}
    </button>
  );
}

/** A live, read-only connection indicator — the rail and full-sidebar equivalent of `Offline mode`. */
function ConnectionStatus({ expanded }: { expanded: boolean }) {
  const online = useOnlineStatus();
  const label = online ? "Online" : "Offline";

  return (
    <div
      role="status"
      aria-label={expanded ? undefined : label}
      title={expanded ? undefined : label}
      className={`flex items-center rounded-lg text-sm text-white/60 ${
        expanded ? "w-full gap-3 px-3 py-2" : "h-10 w-10 justify-center"
      }`}
    >
      {online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
      {expanded && label}
    </div>
  );
}

/** The account dropdown's contents — identical whether it opens from the rail or the full sidebar. */
function AccountMenuItems({
  onSignOut,
  signingOut,
}: {
  onSignOut: () => void;
  /** `logoutMutation.isPending` — the POST itself is normally sub-second now that the
   *  redirect no longer waits on a second round trip (see `useAuth`'s `logoutMutation`),
   *  but the button still gives immediate feedback rather than looking inert on a slow
   *  connection. */
  signingOut: boolean;
}) {
  return (
    <div className="py-1">
      <MenuLink href="/profile" label="Profile" />
      <MenuLink href="/milestones" label="What's Happened" />
      <MenuLink href="/settings" label="Settings" />
      <MenuLink href="/files" label="Your files" />
      <button
        type="button"
        onClick={onSignOut}
        disabled={signingOut}
        className="flex w-full items-center gap-1.5 px-4 py-2 text-left text-[13px] text-midnight transition-colors hover:bg-aqua-light disabled:cursor-not-allowed disabled:opacity-60"
      >
        {signingOut && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}

function MenuLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block px-4 py-2 text-[13px] text-midnight transition-colors hover:bg-aqua-light"
    >
      {label}
    </Link>
  );
}

/**
 * `navigator.onLine`, kept live via the window's `online`/`offline` events.
 *
 * The one source of truth for connectivity in this file — `OfflineBanner` and the
 * sidebar's `ConnectionStatus` both read it, rather than each keeping its own
 * listener and risking the two disagreeing.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}

/**
 * The offline notice.
 *
 * A product surface rather than an error boundary, in the design's own voice — "Lost you
 * for a second there — the connection dropped, not the thread." It reads `navigator.onLine`
 * and the window events, so it appears without anything having to fail first.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-wine px-4 py-2 text-sm text-white"
    >
      <WifiOff className="h-4 w-4" />
      Lost you for a second there — the connection dropped, not the thread.
    </div>
  );
}
