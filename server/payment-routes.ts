import type { Express, Request, Response } from "express";
import Stripe from "stripe";
import { storage } from "./storage";
import QRCode from "qrcode";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-09-30.clover",
});

// Middleware to check if user is authenticated
const isAuthenticated = (req: Request, res: Response, next: Function) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
};

export function registerPaymentRoutes(app: Express) {
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

      // Check if user already has this tier or higher
      if (user.subscriptionTier === tier || 
          (user.subscriptionTier === 'premium' && tier === 'subscription' && user.subscriptionStatus === 'active')) {
        return res.status(400).json({ message: "User already has this tier or higher" });
      }

      // Determine price and mode based on tier
      const amount = tier === 'premium' ? 1500 : 500; // $15 for premium, $5 for subscription (in cents)
      const mode = tier === 'premium' ? 'payment' : 'subscription';

      // Create Stripe customer if not exists
      let stripeCustomerId = user.stripeCustomerId;
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: user.username,
          name: `${user.firstName} ${user.lastName}`,
          metadata: {
            userId: user.id.toString()
          }
        });
        stripeCustomerId = customer.id;
        await storage.updateUser(user.id, { stripeCustomerId });
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
          metadata: {
            userId: user.id.toString(),
            tier: tier,
          },
        });
      }

      // Generate QR code for the checkout URL
      const qrCodeDataUrl = await QRCode.toDataURL(session.url || '');

      // Create transaction record
      await storage.createTransaction({
        userId: user.id,
        stripeSessionId: session.id,
        amount: amount,
        currency: 'usd',
        tier: tier as 'premium' | 'subscription',
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

  // Stripe webhook handler
  app.post("/api/payments/webhook", async (req, res) => {
    const sig = req.headers['stripe-signature'];

    if (!sig) {
      return res.status(400).send('Missing stripe signature');
    }

    let event: Stripe.Event;

    try {
      // Note: In production, you should set up a webhook secret in Stripe dashboard
      // and verify the signature. For now, we'll just parse the event.
      event = req.body;

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
  });

  // Get subscription status
  app.get("/api/payments/subscription-status", isAuthenticated, async (req, res, next) => {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // Check if subscription has expired
      if (user.subscriptionTier === 'subscription' && user.subscriptionExpiresAt) {
        const now = new Date();
        if (now > user.subscriptionExpiresAt && user.subscriptionStatus === 'active') {
          await storage.updateUser(user.id, { subscriptionStatus: 'expired' });
        }
      }

      // Get updated user
      const updatedUser = await storage.getUser(user.id);
      
      res.json({
        tier: updatedUser?.subscriptionTier || 'free',
        status: updatedUser?.subscriptionStatus || 'active',
        expiresAt: updatedUser?.subscriptionExpiresAt,
        premiumPurchasedAt: updatedUser?.premiumPurchasedAt,
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

      if (user.subscriptionTier !== 'subscription') {
        return res.status(400).json({ message: "No active subscription to cancel" });
      }

      if (!user.stripeSubscriptionId) {
        return res.status(400).json({ message: "No Stripe subscription found" });
      }

      // Cancel the subscription at period end
      await stripe.subscriptions.update(user.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });

      await storage.updateUser(user.id, {
        subscriptionStatus: 'canceled',
      });

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

  const user = await storage.getUser(userId);
  if (!user) {
    console.error(`User ${userId} not found`);
    return;
  }

  // Update transaction status
  const transactions = await storage.getTransactions(userId);
  const transaction = transactions.find(t => t.stripeSessionId === session.id);
  if (transaction) {
    await storage.updateTransaction(transaction.id, {
      status: 'succeeded',
      stripePaymentId: session.payment_intent as string,
    });
  }

  // Update user's subscription tier
  if (tier === 'premium') {
    await storage.updateUser(userId, {
      subscriptionTier: 'premium',
      subscriptionStatus: 'active',
      premiumPurchasedAt: new Date(),
    });
  } else if (tier === 'subscription') {
    // Get subscription details
    const subscriptionId = session.subscription as string;
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    
    const expiresAt = new Date((subscription as any).current_period_end * 1000);

    await storage.updateUser(userId, {
      subscriptionTier: 'subscription',
      subscriptionStatus: 'active',
      stripeSubscriptionId: subscriptionId,
      subscriptionExpiresAt: expiresAt,
    });
  }
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const userId = parseInt(subscription.metadata?.userId || '0');
  if (!userId) {
    // Try to find user by customer ID
    const customer = await stripe.customers.retrieve(subscription.customer as string);
    if (customer.deleted || !customer.metadata?.userId) {
      console.error('Cannot find user for subscription update');
      return;
    }
  }

  const user = await storage.getUser(userId);
  if (!user) return;

  const expiresAt = new Date((subscription as any).current_period_end * 1000);
  
  if (subscription.status === 'active') {
    await storage.updateUser(userId, {
      subscriptionStatus: 'active',
      subscriptionExpiresAt: expiresAt,
    });
  } else if (subscription.status === 'canceled' || subscription.cancel_at_period_end) {
    await storage.updateUser(userId, {
      subscriptionStatus: 'canceled',
    });
  }
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const subscriptionId = (invoice as any).subscription as string;
  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const userId = parseInt(subscription.metadata?.userId || '0');
  
  if (!userId) return;

  const expiresAt = new Date((subscription as any).current_period_end * 1000);
  
  await storage.updateUser(userId, {
    subscriptionStatus: 'active',
    subscriptionExpiresAt: expiresAt,
  });

  // Record the transaction
  await storage.createTransaction({
    userId: userId,
    stripePaymentId: (invoice as any).payment_intent as string,
    amount: invoice.amount_paid,
    currency: invoice.currency,
    tier: 'subscription',
    status: 'succeeded',
  });
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = (invoice as any).subscription as string;
  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const userId = parseInt(subscription.metadata?.userId || '0');
  
  if (!userId) return;

  await storage.updateUser(userId, {
    subscriptionStatus: 'expired',
  });

  // Record the failed transaction
  await storage.createTransaction({
    userId: userId,
    stripePaymentId: ((invoice as any).payment_intent as string) || '',
    amount: invoice.amount_due,
    currency: invoice.currency,
    tier: 'subscription',
    status: 'failed',
  });
}
