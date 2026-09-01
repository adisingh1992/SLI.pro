import type { Express, Request, Response } from "express";
import { isStudent } from "./admin-guards";
import { rateLimitByUser } from "./rate-limit";
import * as freeChat from "./wing/free-chat-store";
import { log } from "./logger";

const messageLimit = rateLimitByUser("free-chat-message", {
  windowMs: 60 * 1000,
  max: 20,
});

function userIdFor(req: Request, res: Response): number | null {
  const userId = Number((req.user as any)?.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return userId;
}

export function registerFreeChatRoutes(app: Express) {
  app.get("/api/wing/free-chat", isStudent, async (req, res, next) => {
    try {
      const userId = userIdFor(req, res);
      if (!userId) return;
      res.json(await freeChat.getState(userId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/wing/free-chat/begin", isStudent, messageLimit, async (req, res, next) => {
    try {
      const userId = userIdFor(req, res);
      if (!userId) return;
      res.json(await freeChat.begin(userId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/wing/free-chat/message", isStudent, messageLimit, async (req, res, next) => {
    try {
      const userId = userIdFor(req, res);
      if (!userId) return;

      const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
      if (!content) return res.status(400).json({ error: "Message content is required" });
      if (content.length > 6000) {
        return res.status(400).json({
          error: "That message is too long for one turn—split it into a couple of messages.",
        });
      }

      const result = await freeChat.sendMessage(userId, content);
      log(`free chat turn ${result.userTurnId} for user ${userId}: ${result.category}`, "free-chat");
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
}
