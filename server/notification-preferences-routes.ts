import { Express, Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { userChannelPreferences } from "@shared/wing-schema";
import { isAuthenticated } from "./admin-guards";

/**
 * The Email/SMS toggles on Settings.
 *
 * ── THESE USED TO BE ABSENT, ON PURPOSE ───────────────────────────────────
 * wing5's own toggles are two uncontrolled `Switch`es with no `onChange` — clicking one
 * flips it in the browser and nothing else happens. Settings here used to say so
 * explicitly and render plain text instead of a switch, because `user_channel_preferences`
 * existed in the schema (`email_opt_in` default true, `sms_opt_in` default false — every
 * user gets a row at registration, see `identity-store.ts`) and nothing read or wrote it.
 * A switch that looks wired and isn't is worse than no switch: a student who turns email
 * off would keep getting email with the toggle showing off.
 *
 * The column was always real; only the route was missing. These two make the toggles
 * real instead of removing the honesty problem by not having them.
 */
export function registerNotificationPreferencesRoutes(app: Express) {
  app.get(
    "/api/user/notification-preferences",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = (req.user as any).id;
        const [row] = await db
          .select({
            emailOptIn: userChannelPreferences.emailOptIn,
            smsOptIn: userChannelPreferences.smsOptIn,
          })
          .from(userChannelPreferences)
          .where(eq(userChannelPreferences.userId, userId))
          .limit(1);

        /*
         * A row should exist from registration. Falling back to the column defaults
         * (rather than 404ing) covers any account created before this table did.
         */
        res.json(row ?? { emailOptIn: true, smsOptIn: false });
      } catch (error) {
        next(error);
      }
    },
  );

  app.patch(
    "/api/user/notification-preferences",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = (req.user as any).id;

        const patch: { emailOptIn?: boolean; smsOptIn?: boolean } = {};
        if (typeof req.body?.emailOptIn === "boolean") patch.emailOptIn = req.body.emailOptIn;
        if (typeof req.body?.smsOptIn === "boolean") patch.smsOptIn = req.body.smsOptIn;

        if (Object.keys(patch).length === 0) {
          return res.status(400).json({ error: "Nothing to update." });
        }

        /*
         * Upsert rather than update: covers the same pre-registration-table accounts
         * the GET route falls back for, so toggling a preference for one doesn't 404
         * just because nothing ever inserted its row.
         */
        const [row] = await db
          .insert(userChannelPreferences)
          .values({ userId, ...patch })
          .onConflictDoUpdate({
            target: userChannelPreferences.userId,
            set: { ...patch, updatedAt: new Date() },
          })
          .returning({
            emailOptIn: userChannelPreferences.emailOptIn,
            smsOptIn: userChannelPreferences.smsOptIn,
          });

        res.json(row);
      } catch (error) {
        next(error);
      }
    },
  );
}
