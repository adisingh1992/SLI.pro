import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import {
  entitlements,
  pricingPlans,
  transactions as wingTransactions,
} from "@shared/wing-schema";
import { ensureWingUser } from "./bootstrap";

/**
 * Commerce, backed by the Wing schema.
 *
 * The MVP kept commercial state as columns on `users`
 * (subscriptionTier / subscriptionStatus / stripeCustomerId / …) with prices
 * hardcoded in the checkout route. The spec replaces that with configurable
 * plans and entitlements (§13):
 *
 *   pricing_plans  — what is on sale, at what price, for which audience
 *   entitlements   — what a user is entitled to and WHY (purchase or licence)
 *   transactions   — Stripe activity against a plan, not a hardcoded tier
 *
 * This is what makes the dual revenue model work: an institutional licence
 * grants the same entitlement as a direct purchase, differing only in `source`
 * and the institution/cycle it is attached to. Changing a price is a row
 * update rather than a deploy.
 */

export type PlanCode = "premium" | "subscription";

/**
 * Default catalogue, seeded on first use so behaviour matches the MVP exactly
 * ($129 one-time premium, $39/month subscription). Once seeded, prices are
 * edited in the database — these values are a starting point, not the source
 * of truth.
 */
const DEFAULT_PLANS = [
  {
    code: "premium",
    name: "Premium",
    audience: "direct" as const,
    billingType: "one_time" as const,
    amountCents: 12900,
    billingInterval: null as string | null,
  },
  {
    code: "subscription",
    name: "Subscription",
    audience: "direct" as const,
    billingType: "subscription" as const,
    amountCents: 3900,
    billingInterval: "month" as string | null,
  },
];

/** Creates the default plans if they do not exist. Idempotent. */
export async function ensureDefaultPlans() {
  for (const plan of DEFAULT_PLANS) {
    await db.insert(pricingPlans).values(plan).onConflictDoNothing();
  }
}

export async function getPlanByCode(code: string) {
  await ensureDefaultPlans();
  const [row] = await db
    .select()
    .from(pricingPlans)
    .where(and(eq(pricingPlans.code, code), eq(pricingPlans.active, true)))
    .limit(1);
  return row ?? null;
}

export async function listPlans() {
  await ensureDefaultPlans();
  return db.select().from(pricingPlans).where(eq(pricingPlans.active, true));
}

/** Post-cutover `userId` already IS the wing user id. */
async function wingUserFor(userId: number): Promise<number> {
  return userId;
}

/* ── Entitlements ──────────────────────────────────────────────────────── */

export type EntitlementView = {
  id: number;
  status: "active" | "expired" | "canceled";
  source: "purchase" | "institutional_license";
  planCode: string;
  planName: string;
  billingType: string;
  amountCents: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  startsAt: Date;
  expiresAt: Date | null;
};

/**
 * The entitlement currently in force, with its plan.
 * Expires it in passing if its window has closed, so callers never see a
 * stale `active` row.
 */
export async function getActiveEntitlement(
  userId: number,
): Promise<EntitlementView | null> {
  const wingUserId = await wingUserFor(userId);

  const rows = await db
    .select({
      id: entitlements.id,
      status: entitlements.status,
      source: entitlements.source,
      stripeCustomerId: entitlements.stripeCustomerId,
      stripeSubscriptionId: entitlements.stripeSubscriptionId,
      startsAt: entitlements.startsAt,
      expiresAt: entitlements.expiresAt,
      planCode: pricingPlans.code,
      planName: pricingPlans.name,
      billingType: pricingPlans.billingType,
      amountCents: pricingPlans.amountCents,
    })
    .from(entitlements)
    .innerJoin(pricingPlans, eq(pricingPlans.id, entitlements.planId))
    .where(eq(entitlements.userId, wingUserId))
    .orderBy(desc(entitlements.startsAt));

  const active = rows.find((r) => r.status === "active");
  if (!active) return null;

  // Lazily expire a lapsed entitlement rather than reporting it as active.
  if (active.expiresAt && new Date() > active.expiresAt) {
    await db
      .update(entitlements)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(entitlements.id, active.id));
    return null;
  }

  return active as EntitlementView;
}

/** Any Stripe customer id we already hold for this user. */
export async function getStripeCustomerId(userId: number): Promise<string | null> {
  const wingUserId = await wingUserFor(userId);
  const [row] = await db
    .select({ stripeCustomerId: entitlements.stripeCustomerId })
    .from(entitlements)
    .where(eq(entitlements.userId, wingUserId))
    .orderBy(desc(entitlements.startsAt))
    .limit(1);
  return row?.stripeCustomerId ?? null;
}

/**
 * Grants an entitlement. Any existing active entitlement is superseded, so a
 * user only ever holds one at a time.
 */
export async function grantEntitlement(params: {
  userId: number;
  planCode: string;
  source?: "purchase" | "institutional_license";
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  expiresAt?: Date | null;
  institutionId?: number | null;
  cycleId?: number | null;
}): Promise<EntitlementView | null> {
  const wingUserId = await wingUserFor(params.userId);
  const plan = await getPlanByCode(params.planCode);
  if (!plan) throw new Error(`Pricing plan '${params.planCode}' not found`);

  await db
    .update(entitlements)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(
      and(eq(entitlements.userId, wingUserId), eq(entitlements.status, "active")),
    );

  await db.insert(entitlements).values({
    userId: wingUserId,
    planId: plan.id,
    source: params.source ?? "purchase",
    status: "active",
    stripeCustomerId: params.stripeCustomerId ?? null,
    stripeSubscriptionId: params.stripeSubscriptionId ?? null,
    startsAt: new Date(),
    expiresAt: params.expiresAt ?? null,
    institutionId: params.institutionId ?? null,
    cycleId: params.cycleId ?? null,
  });

  return getActiveEntitlement(params.userId);
}

/** Marks the active entitlement canceled (e.g. subscription cancelled). */
export async function cancelEntitlement(userId: number, expiresAt?: Date | null) {
  const wingUserId = await wingUserFor(userId);
  await db
    .update(entitlements)
    .set({
      status: "canceled",
      expiresAt: expiresAt ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(eq(entitlements.userId, wingUserId), eq(entitlements.status, "active")),
    );
}

/** Extends the current entitlement's window (subscription renewal). */
export async function extendEntitlement(userId: number, expiresAt: Date) {
  const wingUserId = await wingUserFor(userId);
  await db
    .update(entitlements)
    .set({ status: "active", expiresAt, updatedAt: new Date() })
    .where(eq(entitlements.userId, wingUserId));
}

/* ── Transactions ──────────────────────────────────────────────────────── */

export async function createTransaction(data: {
  userId: number;
  planCode?: string | null;
  stripeSessionId?: string | null;
  stripePaymentId?: string | null;
  amountCents: number;
  currency?: string;
  status?: "pending" | "succeeded" | "failed" | "refunded";
}) {
  const wingUserId = await wingUserFor(data.userId);
  const plan = data.planCode ? await getPlanByCode(data.planCode) : null;

  const [row] = await db
    .insert(wingTransactions)
    .values({
      userId: wingUserId,
      planId: plan?.id ?? null,
      stripeSessionId: data.stripeSessionId ?? null,
      stripePaymentId: data.stripePaymentId ?? null,
      amountCents: data.amountCents,
      currency: data.currency ?? "usd",
      status: data.status ?? "pending",
    })
    .returning();
  return row;
}

export async function markTransactionSucceeded(
  stripeSessionId: string,
  stripePaymentId?: string | null,
) {
  await db
    .update(wingTransactions)
    .set({
      status: "succeeded",
      stripePaymentId: stripePaymentId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(wingTransactions.stripeSessionId, stripeSessionId));
}

export async function getTransactions(userId: number) {
  const wingUserId = await wingUserFor(userId);
  return db
    .select()
    .from(wingTransactions)
    .where(eq(wingTransactions.userId, wingUserId))
    .orderBy(desc(wingTransactions.createdAt));
}
