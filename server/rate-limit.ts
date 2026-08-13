import type { Request, Response, NextFunction } from "express";

/**
 * Fixed-window rate limiting for the authentication routes.
 *
 * ── WHY THIS IS HAND-ROLLED ───────────────────────────────────────────────
 * No dependency, deliberately. `express-rate-limit` would be the obvious
 * choice, but the value here is ~60 lines and adding a package to guard four
 * routes is not worth the supply-chain surface. If a second use case appears —
 * per-user API quotas, say — replace this with Redis-backed limiting rather than
 * growing it.
 *
 * ── WHAT IT PROTECTS ──────────────────────────────────────────────────────
 * `/api/login`, `/api/register`, `/api/forgot-password` and `/api/reset-password`
 * were unthrottled. Credential stuffing against a known .edu address and
 * reset-email flooding at somebody else's inbox were both free, and the reset
 * flow sends real email, so the second one costs money as well as trust.
 *
 * ── THE NAT PROBLEM, WHICH DRIVES THE DESIGN ──────────────────────────────
 * Per-IP limiting on login is actively dangerous for this product. A university
 * career centre sits behind one NAT address: thirty students at a Berkeley
 * onboarding session share an IP, and a limit tuned to stop an attacker would
 * lock out the room. Getting that wrong during a partner demo would be worse
 * than the attack.
 *
 * So login is limited on the EMAIL and only counts FAILURES, cleared on success:
 *
 *   - a shared NAT is unaffected, because thirty students signing in are thirty
 *     different emails, each with zero failures;
 *   - stuffing one account is throttled no matter how many IPs it comes from,
 *     which per-IP limiting does not achieve anyway;
 *   - a legitimate user who mistypes twice and then succeeds has their counter
 *     cleared, so the window never strands them.
 *
 * The residual risk is that an attacker who knows an address can spend 8 bad
 * attempts to make that ONE account answer 429 for fifteen minutes. That is a
 * real if minor denial of service, and it is the accepted trade: the alternative
 * is either no limit or locking out cohorts behind a NAT.
 *
 * Registration and the password-reset routes stay per-IP. Their legitimate
 * volume from a shared address is low — a student registers once — so the NAT
 * concern does not apply at these thresholds.
 *
 * ── LIMITATION, STATED PLAINLY ────────────────────────────────────────────
 * In-memory, so the window is PER REPLICA. Container Apps autoscales, so with N
 * replicas the effective limit is N x max, and a restart clears every counter.
 * That is a meaningful weakening of the guarantee and still far better than
 * unlimited. Redis (already in the target architecture for exactly this) is the
 * durable answer when there is a reason to need one.
 */

type Bucket = { count: number; resetAt: number };

const WINDOWS = new Map<string, Map<string, Bucket>>();

/** Dropped keys never come back, so a sweep is enough — no LRU needed. */
function bucketsFor(name: string): Map<string, Bucket> {
  let m = WINDOWS.get(name);
  if (!m) {
    m = new Map();
    WINDOWS.set(name, m);
  }
  return m;
}

function hit(name: string, key: string, windowMs: number, max: number, now: number) {
  const buckets = bucketsFor(name);

  // Sweep opportunistically rather than on a timer: an interval would keep the
  // process alive in scripts and tests that import this module.
  //
  // `forEach` rather than `for...of`: this project targets ES5, where iterating a
  // Map needs --downlevelIteration. Deleting during forEach is well defined —
  // entries removed before they are reached are not visited.
  if (buckets.size > 5000) {
    buckets.forEach((b, k) => {
      if (b.resetAt <= now) buckets.delete(k);
    });
  }

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, retryAfterSec: 0 };
  }

  existing.count += 1;
  if (existing.count > max) {
    return { limited: true, retryAfterSec: Math.ceil((existing.resetAt - now) / 1000) };
  }
  return { limited: false, retryAfterSec: 0 };
}

/** Client address. `trust proxy` is set in setupAuth, so req.ip is the real one. */
function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

/**
 * Per-IP limiter for a named route.
 *
 * Use for routes whose legitimate per-address volume is low. Do NOT use for
 * login — see the NAT note above.
 */
export function rateLimitByIp(name: string, opts: { windowMs: number; max: number }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { limited, retryAfterSec } = hit(name, clientIp(req), opts.windowMs, opts.max, Date.now());
    if (!limited) return next();

    res.setHeader("Retry-After", String(retryAfterSec));
    res.status(429).json({
      message: "Too many attempts. Please wait a few minutes and try again.",
    });
  };
}

/* ── Failed-login tracking ───────────────────────────────────────────────── */

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 8;

const loginKey = (email: unknown) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

/**
 * Refuses a login attempt for an address with too many recent FAILURES.
 *
 * Reads `req.body.username`, which is what the login form sends as the email.
 * An absent or malformed body is not rate limited here — it will fail
 * validation downstream, and inventing a key for it would collapse every
 * malformed request onto one bucket.
 */
export function limitFailedLogins(req: Request, res: Response, next: NextFunction) {
  const key = loginKey((req.body ?? {}).username);
  if (!key) return next();

  const buckets = bucketsFor("login-failures");
  const bucket = buckets.get(key);
  const now = Date.now();

  if (bucket && bucket.resetAt > now && bucket.count >= LOGIN_MAX_FAILURES) {
    res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
    res.status(429).json({
      message: "Too many failed sign-in attempts for this account. Please try again shortly.",
    });
    return;
  }
  next();
}

/** Call on a rejected password. */
export function recordLoginFailure(email: unknown) {
  const key = loginKey(email);
  if (!key) return;
  hit("login-failures", key, LOGIN_WINDOW_MS, Number.MAX_SAFE_INTEGER, Date.now());
}

/**
 * Call on a successful sign-in.
 *
 * This is what makes the limit safe for real users: someone who mistypes twice
 * and then gets it right leaves no trace, so the window never strands them.
 */
export function clearLoginFailures(email: unknown) {
  const key = loginKey(email);
  if (key) bucketsFor("login-failures").delete(key);
}

/** Test seam. Not used by the app. */
export function __resetRateLimits() {
  WINDOWS.clear();
}
