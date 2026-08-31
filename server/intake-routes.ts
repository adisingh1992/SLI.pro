import { Express, Request, Response, NextFunction } from "express";
import * as conversation from "./wing/intake-conversation";
import * as intakeStore from "./wing/intake-store";
import { log } from "./logger";
import { minorProtectionActive } from "./wing/minor-protection";
import { isStudent } from "./admin-guards";

/**
 * Conversational intake API (Feature List A1).
 *
 * Wing's first interaction, replacing the six-stage form.
 *
 * ── NOTHING HERE BLOCKS ──────────────────────────────────────────────────
 * The spec says "the verification step should happen in the background while
 * the student continues engaging", and names the old "Submit for verification"
 * screen as where 43% of registrants stalled. That screen no longer exists —
 * so the requirement here is negative: do not reintroduce a gate. There is no
 * endpoint below that a student must wait on before continuing, and the
 * demographics step at the end is explicitly skippable.
 */

// Every route below resolves the student from `req.user!.id`. `isStudent` also
// refuses a signed-in admin, who has no student record for this to serve —
// see admin-guards.ts. Aliased so nothing below needed to change.
const isAuthenticated = isStudent;

export function registerIntakeRoutes(app: Express) {
  /**
   * Current state — transcript so far, progress, whether it is done.
   *
   * Returns the whole conversation rather than a delta. An intake is a dozen
   * short messages; paginating it would add a failure mode to save nothing.
   */
  app.get("/api/intake", isAuthenticated, async (req, res, next) => {
    try {
      const state = await conversation.getState(req.user!.id);
      if (!state) return res.status(404).json({ error: "No student record for this account" });

      const record = await intakeStore.getIntakeRecord(req.user!.id);

      /*
       * IG-S06. The client uses this to skip the demographics step entirely, because
       * asking and then discarding is still asking. The server refuses the fields
       * regardless — see the finish route — so this is the courtesy half, not the
       * enforcement.
       *
       * Deliberately only the boolean. Which signal fired, and what the user said to
       * produce it, are not the client's business and would put a minor-detection
       * verdict into a browser.
       */
      const responses = (await intakeStore.getBrandingIntake(req.user!.id))?.responses ?? {};
      const protectedFooting = minorProtectionActive({
        statedUnder18: (responses as Record<string, unknown>)._minor_stated === true,
        statedInSchool: false,
      }).active;

      res.json({
        messages: state.messages,
        progress: state.progress,
        complete: state.complete,
        population: state.population,
        insightDelivered: state.insightDelivered,
        // `completed` is the whole intake including demographics; `complete` is
        // just the conversation. The dashboard routes on the former.
        finished: !!record?.completed,
        protectedFooting,
      });
    } catch (error) {
      next(error);
    }
  });

  /** Opens the conversation, or returns it if already open. */
  app.post("/api/intake/begin", isAuthenticated, async (req, res, next) => {
    try {
      const result = await conversation.begin(req.user!.id);
      if (!result) return res.status(404).json({ error: "No student record for this account" });

      /*
       * `delivery` is how the reply arrives — the messages the student sees, each with the
       * pause before it. `reply` stays as the whole text, so a client that has not been
       * taught to pace anything still renders one correct message.
       */
      res.json({
        reply: result.reply,
        delivery: result.delivery,
        pauseAfterMs: result.pauseAfterMs,
        progress: result.state.progress,
        complete: result.state.complete,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/intake/message", isAuthenticated, async (req, res, next) => {
    try {
      const message = String(req.body?.message ?? "").trim();
      if (!message) return res.status(400).json({ error: "Say something first." });
      if (message.length > 5000) {
        return res.status(400).json({ error: "That's longer than this box takes — trim it a little." });
      }

      const result = await conversation.respond(req.user!.id, message);

      /*
       * 503, not 500. `respond` records the student's message BEFORE calling
       * the model, so a failure here means their words are safely in the
       * transcript and only Wing's reply is missing. The client retries the
       * turn rather than making them retype anything.
       */
      if (!result) {
        return res.status(503).json({
          error: "Wing didn't manage a reply just then. Your message was saved — try again.",
        });
      }

      res.json({
        reply: result.reply,
        delivery: result.delivery,
        pauseAfterMs: result.pauseAfterMs,
        progress: result.state.progress,
        complete: result.state.complete,
        population: result.state.population,
        insightDelivered: result.insightDelivered,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * The closing step: demographics, privacy and marketing consent.
   *
   * Deliberately a form and deliberately optional. Consent has to be
   * unambiguous, the analytics need exact enum values rather than an inference
   * drawn from prose, and a chatbot asking someone's ethnicity is more
   * intrusive than a labelled optional field, not less. Submitting with an
   * empty body is a valid "skip".
   */
  app.post("/api/intake/finish", isAuthenticated, async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;

      /*
       * ── IG-S06: NO EXTRA PII FROM A SELF-DECLARED MINOR ────────────────
       * Her card's protected scope sets `extraPiiCollection: false`, and this route is
       * the only place the platform asks for race, gender identity, identity
       * representation or first-generation status. Collecting those from someone who has
       * told Wing they are under eighteen is the concrete thing that gate exists to
       * prevent, and until now the route asked everyone.
       *
       * Enforced HERE and not only in the client. A client that skips the step is a
       * courtesy; a server that accepts the fields anyway means one stale bundle, one
       * curl, or one replayed request writes them. The client change below stops it being
       * asked; this stops it being stored.
       *
       * `institutionSetting` is deliberately absent rather than guessed: no column
       * carries it yet, and absent reads as off, which is her ruling for Berkeley. When
       * institutions can configure it, that value comes from here and nothing else moves.
       */
      const captured = (await intakeStore.getBrandingIntake(req.user!.id))?.responses ?? {};
      const protection = minorProtectionActive({
        /*
         * One flag, not two. `intake-conversation.ts` sets `_minor_stated` for either
         * signal — an explicit age under eighteen, or being at school now — because both
         * make the gate active and the verdict is the same. Which one it was is in the
         * log, and the distinction belongs on an admin surface rather than here.
         */
        statedUnder18: (captured as Record<string, unknown>)._minor_stated === true,
        statedInSchool: false,
      });

      const demographics: Record<string, unknown> = {};
      for (const key of [
        "race_ethnicity",
        "race_ethnicity_other",
        "gender_identity",
        "gender_identity_other",
        "identity_representation",
        "first_generation_student",
        "first_generation_grad",
      ]) {
        const v = body[key];
        if (typeof v === "string" && v.trim()) demographics[key] = v.trim();
        else if (Array.isArray(v)) demographics[key] = v.filter((x) => typeof x === "string");
        else if (typeof v === "boolean") demographics[key] = v;
      }

      if (protection.active) {
        /*
         * Dropped, not stored-and-hidden. A field that is written and then filtered on
         * read is still a field the platform holds about a minor, and the gate is about
         * collection.
         */
        const refused = Object.keys(demographics);
        if (refused.length) {
          log(
            `IG-S06: refused ${refused.length} demographic field(s) for user ${req.user!.id} — ` +
              protection.because,
            "intake",
          );
        }
      } else if (Object.keys(demographics).length) {
        await intakeStore.mergeIntakeResponses(req.user!.id, demographics);
      }

      /*
       * Discovery source lives on wing.users, not in structured_responses, and
       * it is the one field the old onboarding gate collected that the
       * conversation deliberately does not.
       *
       * "How did you hear about us?" is an analytics question wearing a
       * conversation's clothes. Asked mid-chat it breaks the register — Wing
       * has spent ten turns being interested in them and then asks a marketing
       * attribution question — and it needs an exact enum value, which is
       * exactly what free text is worst at.
       */
      const DISCOVERY = [
        "university_partnership", "colleague_or_mentor", "linkedin",
        "web_search", "professional_network_or_conference", "other",
      ];
      if (typeof body.discoverySource === "string" && DISCOVERY.includes(body.discoverySource)) {
        const identity = await import("./wing/identity-store");
        await identity.updateUser(req.user!.id, {
          discoverySource: body.discoverySource,
          ...(typeof body.discoverySourceOther === "string" && body.discoverySourceOther.trim()
            ? { discoverySourceOther: body.discoverySourceOther.trim() }
            : {}),
        } as any);
      }

      if (typeof body.marketingOptIn === "boolean") {
        await intakeStore.upsertBrandingIntake(req.user!.id, {
          marketingOptIn: body.marketingOptIn,
        });
      }

      await conversation.finish(req.user!.id);

      log(`intake finished for user ${req.user!.id}`, "intake");
      res.json({ finished: true });
    } catch (error) {
      next(error);
    }
  });
}
