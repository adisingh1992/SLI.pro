import type { Express, Request, Response } from "express";
import express from "express";
import Stripe from "stripe";
import { storage } from "./storage";
import * as commerce from "./wing/commerce-store";
import QRCode from "qrcode";
import * as identity from "./wing/identity-store";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Middleware to check if user is authenticated
const isAuthenticated = (req: Request, res: Response, next: Function) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
};

export function registerPaymentRoutes(app: Express) {
  // Stripe webhook handler - raw body is handled in server/index.ts
  app.post(
    "/api/payments/webhook",
    async (req, res) => {
      const sig = req.headers['stripe-signature'];

      if (!sig) {
        return res.status(400).send('Missing stripe signature');
      }

      let event: Stripe.Event;

      try {
        // Verify webhook signature for security
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        
        if (webhookSecret) {
          // In production: verify the signature using the webhook secret and raw body
          event = stripe.webhooks.constructEvent(
            req.body, // This is the raw buffer when using express.raw()
            sig,
            webhookSecret
          );
        } else {
          // Development mode: parse without verification (NOT SECURE for production)
          console.warn('WARNING: Webhook signature verification skipped. Set STRIPE_WEBHOOK_SECRET for production.');
          // Parse the raw buffer to JSON
          event = JSON.parse(req.body.toString());
        }

        // Handle the event
        switch (event.type) {
          case 'checkout.session.completed':
            const session = event.data.object as Stripe.Checkout.Session;
            await handleCheckoutCompleted(session);
            break;

          case 'customer.subscription.updated':
          case 'customer.subscription.deleted':
            const subscription = event.data.object as Stripe.Subscription;
            await handleSubscriptionUpdate(subscription);
            break;

          case 'invoice.payment_succeeded':
            const invoice = event.data.object as Stripe.Invoice;
            await handleInvoicePaymentSucceeded(invoice);
            break;

          case 'invoice.payment_failed':
            const failedInvoice = event.data.object as Stripe.Invoice;
            await handleInvoicePaymentFailed(failedInvoice);
            break;

          default:
            console.log(`Unhandled event type ${event.type}`);
        }

        res.json({ received: true });
      } catch (err) {
        console.error('Webhook error:', err);
        return res.status(400).send(`Webhook Error: ${err}`);
      }
    }
  );

  // Create checkout session for tier upgrade
  app.post("/api/payments/create-checkout-session", isAuthenticated, async (req, res, next) => {
    try {
      const { tier } = req.body;
      const user = req.user;

      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!tier || !['premium', 'subscription'].includes(tier)) {
        return res.status(400).json({ message: "Invalid tier specified" });
      }

      // Commercial state now lives in entitlements, not on the user row.
      const current = await commerce.getActiveEntitlement(user.id);

      if (current?.planCode === tier) {
        return res.status(400).json({ message: "You already have this tier" });
      }

      if (current?.planCode === 'subscription' && tier === 'premium') {
        return res.status(400).json({ message: "Cannot downgrade from Subscription to Premium. Please cancel your subscription first." });
      }

      // Price comes from the plan row — configurable without a deploy.
      const plan = await commerce.getPlanByCode(tier);
      if (!plan) {
        return res.status(400).json({ message: `Pricing plan '${tier}' is not available` });
      }
      const amount = plan.amountCents;

      // Reuse the Stripe customer we already hold for this user, if any.
      let stripeCustomerId = await commerce.getStripeCustomerId(user.id);
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: user.username,
          name: `${user.firstName} ${user.lastName}`,
          metadata: {
            userId: user.id.toString()
          }
        });
        stripeCustomerId = customer.id;
        // Persisted on the entitlement when the purchase completes.
      }

      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers.host;
      const baseUrl = `${protocol}://${host}`;

      // Create checkout session based on tier type
      let session: Stripe.Checkout.Session;
      
      if (tier === 'premium') {
        // One-time payment for premium tier
        session = await stripe.checkout.sessions.create({
          customer: stripeCustomerId,
          payment_method_types: ['card'],
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: {
                  name: 'Premium Tier',
                  description: 'One-time upgrade to Premium tier',
                },
                unit_amount: amount,
              },
              quantity: 1,
            },
          ],
          mode: 'payment',
          success_url: `${baseUrl}/?payment=success`,
          cancel_url: `${baseUrl}/?payment=canceled`,
          metadata: {
            userId: user.id.toString(),
            tier: tier,
          },
        });
      } else {
        // Recurring subscription for subscription tier
        session = await stripe.checkout.sessions.create({
          customer: stripeCustomerId,
          payment_method_types: ['card'],
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: {
                  name: 'Subscription Tier',
                  description: 'Monthly subscription',
                },
                unit_amount: amount,
                recurring: {
                  interval: 'month',
                },
              },
              quantity: 1,
            },
          ],
          mode: 'subscription',
          success_url: `${baseUrl}/?payment=success`,
          cancel_url: `${baseUrl}/?payment=canceled`,
          subscription_data: {
            metadata: {
              userId: user.id.toString(),
            },
          },
          metadata: {
            userId: user.id.toString(),
            tier: tier,
          },
        });
      }

      // Generate QR code for the checkout URL
      const qrCodeDataUrl = await QRCode.toDataURL(session.url || '');

      // Transactions record activity against a plan, not a hardcoded tier.
      await commerce.createTransaction({
        userId: user.id,
        planCode: tier,
        stripeSessionId: session.id,
        amountCents: amount,
        currency: 'usd',
        status: 'pending',
      });

      res.json({
        sessionId: session.id,
        url: session.url,
        qrCode: qrCodeDataUrl,
      });
    } catch (error) {
      console.error('Error creating checkout session:', error);
      next(error);
    }
  });

  // Get subscription status
  app.get("/api/payments/subscription-status", isAuthenticated, async (req, res, next) => {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // getActiveEntitlement lazily expires a lapsed window, so a stale
      // 'active' row is never reported.
      const entitlement = await commerce.getActiveEntitlement(user.id);

      res.json({
        tier: entitlement?.planCode || 'free',
        status: entitlement?.status || 'active',
        expiresAt: entitlement?.expiresAt ?? null,
        premiumPurchasedAt:
          entitlement?.planCode === 'premium' ? entitlement.startsAt : null,
        source: entitlement?.source ?? null,
      });
    } catch (error) {
      next(error);
    }
  });

  // Cancel subscription
  app.post("/api/payments/cancel-subscription", isAuthenticated, async (req, res, next) => {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const entitlement = await commerce.getActiveEntitlement(user.id);

      if (entitlement?.planCode !== 'subscription') {
        return res.status(400).json({ message: "No active subscription to cancel" });
      }

      if (!entitlement.stripeSubscriptionId) {
        return res.status(400).json({ message: "No Stripe subscription found" });
      }

      // Cancel at period end; the entitlement keeps its expiry so access
      // continues until the paid window closes.
      await stripe.subscriptions.update(entitlement.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });

      await commerce.cancelEntitlement(user.id, entitlement.expiresAt);

      res.json({ message: "Subscription will be canceled at period end" });
    } catch (error) {
      console.error('Error canceling subscription:', error);
      next(error);
    }
  });
}

// Helper functions for webhook handlers
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = parseInt(session.metadata?.userId || '0');
  const tier = session.metadata?.tier as 'premium' | 'subscription';

  if (!userId || !tier) {
    console.error('Missing metadata in checkout session');
    return;
  }

  const user = await identity.getUser(userId);
  if (!user) {
    console.error(`User ${userId} not found`);
    return;
  }

  await commerce.markTransactionSucceeded(
    session.id,
    session.payment_intent as string,
  );

  if (tier === 'premium') {
    // One-time purchase: no expiry.
    await commerce.grantEntitlement({
      userId,
      planCode: 'premium',
      source: 'purchase',
      stripeCustomerId: session.customer as string,
    });
  } else if (tier === 'subscription') {
    // Get subscription details
    const subscriptionId = session.subscription as string;
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    
    // Safely handle the current_period_end timestamp
    let expiresAt: Date | undefined;
    const periodEnd = (subscription as any).current_period_end;
    if (periodEnd) {
      expiresAt = new Date(periodEnd * 1000);
      if (isNaN(expiresAt.getTime())) {
        console.error('Invalid current_period_end timestamp:', periodEnd);
        expiresAt = undefined;
      }
    }

    await commerce.grantEntitlement({
      userId,
      planCode: 'subscription',
      source: 'purchase',
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: subscriptionId,
      expiresAt: expiresAt ?? null,
    });
  }
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  let userId = parseInt(subscription.metadata?.userId || '0');
  if (!userId) {
    // Try to find user by customer ID
    const customer = await stripe.customers.retrieve(subscription.customer as string);
    if (customer.deleted || !customer.metadata?.userId) {
      console.error('Cannot find user for subscription update');
      return;
    }
    userId = parseInt(customer.metadata.userId);
  }

  const user = await identity.getUser(userId);
  if (!user) return;

  // Safely handle the current_period_end timestamp
  let expiresAt: Date | undefined;
  const periodEnd = (subscription as any).current_period_end;
  if (periodEnd) {
    expiresAt = new Date(periodEnd * 1000);
    if (isNaN(expiresAt.getTime())) {
      console.error('Invalid current_period_end timestamp:', periodEnd);
      expiresAt = undefined;
    }
  }
  
  if (subscription.status === 'active' && expiresAt) {
    await commerce.extendEntitlement(userId, expiresAt);
  } else if (subscription.status === 'canceled' || subscription.cancel_at_period_end) {
    await commerce.cancelEntitlement(userId, expiresAt ?? null);
  }
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const subscriptionId = (invoice as any).subscription as string;
  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const userId = parseInt(subscription.metadata?.userId || '0');
  
  if (!userId) return;

  // Safely handle the current_period_end timestamp
  let expiresAt: Date | undefined;
  const periodEnd = (subscription as any).current_period_end;
  if (periodEnd) {
    expiresAt = new Date(periodEnd * 1000);
    if (isNaN(expiresAt.getTime())) {
      console.error('Invalid current_period_end timestamp:', periodEnd);
      expiresAt = undefined;
    }
  }
  
  // Renewal: extend the entitlement's window.
  if (expiresAt) {
    await commerce.extendEntitlement(userId, expiresAt);
  }

  await commerce.createTransaction({
    userId,
    planCode: 'subscription',
    stripePaymentId: (invoice as any).payment_intent as string,
    amountCents: invoice.amount_paid,
    currency: invoice.currency,
    status: 'succeeded',
  });
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = (invoice as any).subscription as string;
  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const userId = parseInt(subscription.metadata?.userId || '0');
  
  if (!userId) return;

  // Payment failed: the entitlement lapses at its current expiry rather than
  // being revoked instantly, so a retry within the window keeps access.
  await commerce.cancelEntitlement(userId);

  await commerce.createTransaction({
    userId,
    planCode: 'subscription',
    stripePaymentId: ((invoice as any).payment_intent as string) || '',
    amountCents: invoice.amount_due,
    currency: invoice.currency,
    status: 'failed',
  });
}
