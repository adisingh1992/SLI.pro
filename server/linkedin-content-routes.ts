import { Request, Response, NextFunction, Express } from "express";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { IStorage } from "./storage";
import { storage } from "./storage";
import * as wingStore from "./wing/session-store";
import * as artifactStore from "./wing/artifact-store";
import * as sliStore from "./wing/sli-store";
import * as orchestrator from "./orchestrator";
import * as profileStore from "./wing/profile-store";
import * as identity from "./wing/identity-store";
import { checkAuthenticity, renderStandardForPrompt } from "./wing/authenticity";

// Import the logging function
const log = (message: string, tag = "express") => {
  console.log(`${new Date().toLocaleTimeString()} [${tag}] ${message}`);
};

const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Not authenticated" });
};

// Helper function for exponential backoff retries when calling the model
async function callWithRetry<T>(
  fn: () => Promise<T>, 
  maxRetries = 5, 
  initialBackoff = 60000, // 60 seconds initial backoff
  identifier = "API Call"
): Promise<T> {
  let retries = 0;
  
  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      // Check if it's a rate limit error
      const isRateLimit = error?.toString().includes('rate_limit_error') || error?.status === 429;
      
      if (!isRateLimit || retries >= maxRetries) {
        // If it's not a rate limit error or we've used all retries, rethrow
        throw error;
      }
      
      // Calculate exponential backoff time
      const backoffTime = initialBackoff * Math.pow(2, retries);
      retries++;
      
      log(`Rate limit exceeded for ${identifier}. Retrying in ${backoffTime/1000} seconds (retry ${retries}/${maxRetries})`, "content-drafts");
      
      // Wait for the backoff period
      await new Promise(resolve => setTimeout(resolve, backoffTime));
      
      log(`Resuming ${identifier} after backoff`, "content-drafts");
    }
  }
}

/**
 * Generate LinkedIn content drafts based on the user's context
 */
async function generateLinkedinContentDrafts(userId: number) {
  try {
    // Get the user profile to collect context data
    const userProfile = await profileStore.getUserProfile(userId);
    if (!userProfile) {
      throw new Error("User profile not found");
    }

    // Get necessary context from documents, SLI, etc.
    const resumeDoc = userProfile.documents?.find(doc => doc.type === "resume");
    const linkedinDoc = userProfile.documents?.find(doc => doc.type === "linkedin");
    const otherDocs = userProfile.documents?.filter(doc => doc.type !== "resume" && doc.type !== "linkedin");
    
    // The SLI in force — one row, no reconstruction from packed columns.
    const sliText = (await sliStore.getActiveStatement(userId)) || "No SLI available";
    
    // Get questionnaire data
    const questionnaire = userProfile.questionnaire;
    const interests = questionnaire?.interests || "";
    
    // Get coaching notes
    const coachingNotes = userProfile.coachingNotes || [];
    const latestCoachingNote = coachingNotes.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
    
    // Foundation Session 3 outcome, read from the wing artifact.
    const luser = await identity.getUser(userId);
    const foundationSession3 = luser
      ? await wingStore.getFoundationSessionForUser(luser, 3)
      : null;
    const session3Data = foundationSession3?.completionData;
    
    // Format context for the model
    let context = "";
    
    if (resumeDoc?.analysisContent) {
      context += `## Resume Context\n${resumeDoc.analysisContent}\n\n`;
    }
    
    if (linkedinDoc?.analysisContent) {
      context += `## LinkedIn Profile Context\n${linkedinDoc.analysisContent}\n\n`;
    }
    
    if (otherDocs && otherDocs.length > 0) {
      context += "## Additional Document Context\n";
      otherDocs.forEach(doc => {
        if (doc.analysisContent) {
          context += `${doc.analysisContent}\n`;
        }
      });
      context += "\n";
    }
    
    if (interests) {
      context += `## Interest Areas from Questionnaire\n${interests}\n\n`;
    }
    
    if (latestCoachingNote) {
      context += `## Latest Coaching Note\n${latestCoachingNote.content}\n\n`;
    }
    
    // Add foundation session 3 context if available
    if (session3Data) {
      context += `## Foundation Session 3: Content Strategy\n`;
      
      // Add signature story if available
      if (session3Data.signatureStory) {
        const story = session3Data.signatureStory;
        context += `\n### Signature Story\n`;
        context += `**Title:** ${story.title}\n`;
        context += `**Context:** ${story.context}\n`;
        context += `**Challenge:** ${story.challenge}\n`;
        context += `**Approach:** ${story.approach}\n`;
        context += `**Tension:** ${story.tension}\n`;
        context += `**Outcome:** ${story.outcome}\n`;
        context += `**Repeatability:** ${story.repeatability}\n\n`;
      }
      
      // Add content angles if available
      if (session3Data.contentAngles && session3Data.contentAngles.length > 0) {
        context += `### Content Angles\n`;
        session3Data.contentAngles.forEach((angle: string, index: number) => {
          context += `${index + 1}. ${angle}\n`;
        });
        context += `\n`;
      }
      
      // Add methodology if available
      if (session3Data.methodology) {
        context += `### Methodology\n${session3Data.methodology}\n\n`;
      }
    }
    
    context += `## SLI (Single Lasting Impression)\n${sliText}\n\n`;
    
    // Define the system prompt
    /*
     * A4: the 360Brew authenticity standard is IN the system prompt, and the
     * output is checked against it afterwards.
     *
     * The old prompt asked the model to avoid "AI-detection triggers (e.g.
     * overly formulaic writing, clichés)", which is precisely the instruction
     * models ignore — it names the category without naming a single word, so
     * nothing constrains the tokens it actually reaches for. The standard below
     * lists them.
     */
    const systemPrompt = `You are a professional content strategist for MyWing, creating custom LinkedIn posts for clients.

${renderStandardForPrompt()}`;
    
    // Define user prompt with the model prompt from the feature request
    const userPrompt = `${context}

Based on the above context about this user, please generate two distinct, ready-to-use LinkedIn posts that the client can immediately copy, paste, and publish.

Generate two LinkedIn posts with different approaches from the following rotation:
1. Experiential insight (lesson learned from professional experience)
2. Breaking news commentary (current development in their field)
3. Industry trend analysis with personal perspective
4. Curated resource share (article, image, event with commentary)

For each post, include:

### Post 1: [APPROACH TYPE]
**Hook:** [Attention-grabbing first line that establishes the key takeaway]  
**Body:** [3-4 paragraphs incorporating:  
- A specific example or data point  
- Their unique perspective (aligned with SLI)  
- Connection to their target audience  
- Optional: bullet points with actionable insights]  
**Closing:** [Call to action, reflection question, or forward-looking statement]  
**Hashtags:** [AT MOST 3, and only ones people genuinely search. A wall of hashtags is itself a marker of generated content.]

### Post 2: [DIFFERENT APPROACH TYPE]
[Same structure as above, but using a different content angle]

## Stylistic Guidelines

Ensure each post:
- Reflects the client's authentic voice (based on resume, LinkedIn profile, and SLI)
- Matches sophistication to career level (executive/mid/early)
- Demonstrates credibility through insights and context
- Obeys the authenticity standard above — this is the hard constraint, not a preference
- Projects confidence appropriate to their personality profile

## Topic Selection Strategy

Choose topics based on:
1. Interest areas from their questionnaire
2. News or trends (from the last 2 weeks) in their industry
3. SLI-aligned aspirational themes
4. Relevant experience from their background
5. Their signature story and content angles from Foundation Session 3 (if available)

When Foundation Session 3 content is available, leverage:
- The signature story's narrative elements to create compelling posts
- The content angles to identify relevant topics and perspectives
- The methodology to understand their preferred content approach

Stay optimistic, insightful, and grounded—avoiding political or divisive topics. Each post must pass the "SLI reinforcement test": Would this strengthen the reader's understanding of the client's professional identity?`;

    // Call the model with retry for rate limits
    log(`Generating LinkedIn content drafts`, "content-drafts");
    const response = await callWithRetry(
      () => orchestrator.complete({
        tier: "mid", // content drafting
        system: systemPrompt,
        maxTokens: 4096,
        temperature: 0.7,
        messages: [{ role: "user", content: userPrompt }]
      }),
      5,  // max retries
      60000,  // initial backoff
      "LinkedIn content drafts generation"
    );

    if (!response.text) {
      throw new Error("Empty response from the model");
    }

    let responseText = response.text;

    /*
     * A4: check the output, and regenerate once if it fails.
     *
     * The instruction alone is not enough. Told not to use "leverage", a model
     * still produces it — the flagged words are the ones it reaches for by
     * default, which is exactly why they mark text as generated.
     *
     * One retry, not a loop. If a second attempt with the specific findings
     * named still fails, the drafts go through anyway with the report attached:
     * a student looking at a flagged draft they can fix is better served than a
     * student watching a spinner while we spend their money re-rolling.
     */
    let authenticity = checkAuthenticity(responseText);

    if (!authenticity.passes) {
      const problems = authenticity.findings
        .map((f) => `- "${f.found}" — ${f.note}`)
        .join("\n");

      log(
        `content drafts scored ${authenticity.score}; regenerating with ${authenticity.findings.length} finding(s)`,
        "content-drafts",
      );

      try {
        const retry = await orchestrator.complete({
          tier: "mid",
          system: systemPrompt,
          maxTokens: 4096,
          temperature: 0.8,
          messages: [
            { role: "user", content: userPrompt },
            { role: "assistant", content: responseText },
            {
              role: "user",
              content:
                `That draft breaks the authenticity standard. Specifically:\n\n${problems}\n\n` +
                `Rewrite both posts. Keep the same structure and the same underlying ` +
                `substance — fix the language. Do not swap one banned word for another ` +
                `from the list.`,
            },
          ],
        });

        if (retry.text) {
          const second = checkAuthenticity(retry.text);
          // Only take the retry if it is actually better. A regeneration that
          // scores worse is a regression, and keeping it would make the check
          // actively harmful.
          if (second.score > authenticity.score) {
            responseText = retry.text;
            authenticity = second;
          }
        }
      } catch (err) {
        // A failed retry is not a failed generation — the first draft stands.
        log(`authenticity retry failed: ${(err as Error).message}`, "content-drafts");
      }
    }

    log(
      `content drafts authenticity: ${authenticity.score}/100` +
        (authenticity.findings.length ? ` (${authenticity.findings.length} finding(s))` : ""),
      "content-drafts",
    );
    
    // Extract post types and content
    const post1TypeMatch = responseText.match(/### Post 1: \[(.*?)\]/);
    const post2TypeMatch = responseText.match(/### Post 2: \[(.*?)\]/);
    
    // Extract post content sections using regex
    const post1HookMatch = responseText.match(/### Post 1:.*?\*\*Hook:\*\* (.*?)(?=\*\*Body)/s);
    const post1BodyMatch = responseText.match(/\*\*Body:\*\* (.*?)(?=\*\*Closing)/s);
    const post1ClosingMatch = responseText.match(/\*\*Closing:\*\* (.*?)(?=\*\*Hashtags)/s);
    const post1HashtagsMatch = responseText.match(/\*\*Hashtags:\*\* (.*?)(?=### Post 2|$)/s);
    
    const post2HookMatch = responseText.match(/### Post 2:.*?\*\*Hook:\*\* (.*?)(?=\*\*Body)/s);
    const post2BodyMatch = responseText.match(/### Post 2:.*?\*\*Body:\*\* (.*?)(?=\*\*Closing)/s);
    const post2ClosingMatch = responseText.match(/### Post 2:.*?\*\*Closing:\*\* (.*?)(?=\*\*Hashtags)/s);
    const post2HashtagsMatch = responseText.match(/### Post 2:.*?\*\*Hashtags:\*\* (.*?)(?=$)/s);
    
    // Create content draft object
    const contentDraft = {
      userId,
      post1Type: post1TypeMatch ? post1TypeMatch[1].trim() : "Experiential insight",
      post1Content: {
        hook: post1HookMatch ? post1HookMatch[1].trim() : "No hook provided",
        body: post1BodyMatch ? post1BodyMatch[1].trim() : "No body provided",
        closing: post1ClosingMatch ? post1ClosingMatch[1].trim() : "No closing provided",
        hashtags: post1HashtagsMatch ? post1HashtagsMatch[1].trim() : "#professional #career #SLIpro"
      },
      post2Type: post2TypeMatch ? post2TypeMatch[1].trim() : "Industry trend analysis",
      post2Content: {
        hook: post2HookMatch ? post2HookMatch[1].trim() : "No hook provided",
        body: post2BodyMatch ? post2BodyMatch[1].trim() : "No body provided",
        closing: post2ClosingMatch ? post2ClosingMatch[1].trim() : "No closing provided",
        hashtags: post2HashtagsMatch ? post2HashtagsMatch[1].trim() : "#professional #career #SLIpro"
      }
    };
    
    // One row per post (spec §12) rather than two posts in a single row —
    // this is what lets the Tier 2 Feature Article module iterate on a draft.
    const saved = [];
    for (const [type, content] of [
      [contentDraft.post1Type, contentDraft.post1Content],
      [contentDraft.post2Type, contentDraft.post2Content],
    ] as const) {
      saved.push(
        await artifactStore.createContentDraft({
          userId,
          draftType: "post",
          content: { postType: type, ...(content as object) },
        }),
      );
    }
    return saved;
  } catch (error) {
    console.error("Error generating LinkedIn content drafts:", error);
    throw error;
  }
}

export function registerLinkedinContentRoutes(app: Express) {
  // Get all LinkedIn content drafts for the current user
  app.get("/api/linkedin-content-drafts", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const contentDrafts = await artifactStore.getContentDrafts(userId);
      res.json(contentDrafts);
    } catch (error) {
      console.error("Error fetching LinkedIn content drafts:", error);
      res.status(500).json({ error: "Failed to fetch LinkedIn content drafts" });
    }
  });

  // Get latest LinkedIn content draft for the current user
  app.get("/api/linkedin-content-drafts/latest", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      // artifactStore (wing), not legacy storage — drafts are written to
      // wing.content_drafts, one row per post.
      const contentDraft = await artifactStore.getLatestContentDraft(userId);
      if (!contentDraft) {
        res.status(404).json({ error: "No LinkedIn content draft found" });
        return;
      }
      res.json(contentDraft);
    } catch (error) {
      console.error("Error fetching latest LinkedIn content draft:", error);
      res.status(500).json({ error: "Failed to fetch latest LinkedIn content draft" });
    }
  });

  // Get a specific LinkedIn content draft by ID
  app.get("/api/linkedin-content-drafts/:id", isAuthenticated, async (req, res) => {
    try {
      const contentDraftId = parseInt(req.params.id);
      if (isNaN(contentDraftId)) {
        res.status(400).json({ error: "Invalid content draft ID" });
        return;
      }
      
      const contentDraft = await artifactStore.getContentDraft(contentDraftId);
      if (!contentDraft) {
        res.status(404).json({ error: "LinkedIn content draft not found" });
        return;
      }
      
      // Authorise by student id (forward comparison).
      const callerStudentId = await artifactStore.studentIdForUser(req.user!.id);
      if (contentDraft.studentId !== callerStudentId) {
        res.status(403).json({ error: "Not authorized to access this content draft" });
        return;
      }
      
      res.json(contentDraft);
    } catch (error) {
      console.error("Error fetching LinkedIn content draft:", error);
      res.status(500).json({ error: "Failed to fetch LinkedIn content draft" });
    }
  });

  // Generate new LinkedIn content drafts
  app.post("/api/linkedin-content-drafts/generate", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      
      // Check prerequisites
      const userProfile = await profileStore.getUserProfile(userId);
      
      if (!userProfile) {
        return res.status(404).json({ error: "User profile not found" });
      }
      
      // Check if user has required documents
      const hasResume = userProfile.documents?.some(doc => doc.type === "resume");
      const hasLinkedIn = userProfile.documents?.some(doc => doc.type === "linkedin");
      
      if (!hasResume || !hasLinkedIn) {
        return res.status(400).json({ 
          error: "Missing required documents",
          details: {
            hasResume,
            hasLinkedIn
          }
        });
      }
      
      // Check if user has a selected or refined SLI
      // 'has an SLI' now means one is in force (active/selected).
      const hasSli = !!(await sliStore.getActive(userId));
      
      if (!hasSli) {
        return res.status(400).json({ 
          error: "No SLI selected or refined",
          details: {
            hasSli
          }
        });
      }
      
      // Generate content drafts
      const contentDraft = await generateLinkedinContentDrafts(userId);
      res.json(contentDraft);
    } catch (error) {
      console.error("Error generating LinkedIn content drafts:", error);
      res.status(500).json({ error: "Failed to generate LinkedIn content drafts" });
    }
  });

  // Post content to LinkedIn
  // No :postNumber — a wing content_drafts row is one post, so the draft id
  // identifies it. The MVP needed (draftId, postNumber) only because a legacy
  // row held two posts in one record.
  app.post("/api/linkedin-content-drafts/:draftId/post", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const draftId = parseInt(req.params.draftId);
      const { content } = req.body;

      if (isNaN(draftId)) {
        return res.status(400).json({ error: "Invalid draft ID" });
      }

      if (!content) {
        return res.status(400).json({ error: "Content is required" });
      }

      // Get the user to access their LinkedIn access token
      const user = await identity.getUser(userId);
      if (!user || !user.linkedinAccessToken) {
        return res.status(400).json({ error: "LinkedIn not connected. Please authenticate with LinkedIn first." });
      }

      // Check if token is expired
      if (user.linkedinTokenExpiry && new Date(user.linkedinTokenExpiry) < new Date()) {
        return res.status(401).json({ error: "LinkedIn token expired. Please re-authenticate with LinkedIn." });
      }

      // Verify the content draft belongs to the user
      const contentDraft = await artifactStore.getContentDraft(draftId);
      const callerStudentId = await artifactStore.studentIdForUser(req.user!.id);
      if (!contentDraft || contentDraft.studentId !== callerStudentId) {
        return res.status(403).json({ error: "Not authorized to access this content draft" });
      }

      // Post to LinkedIn using the UGC Posts API
      const linkedinResponse = await fetch("https://api.linkedin.com/v2/ugcPosts", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${user.linkedinAccessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0"
        },
        body: JSON.stringify({
          author: `urn:li:person:${user.linkedinId}`,
          lifecycleState: "PUBLISHED",
          specificContent: {
            "com.linkedin.ugc.ShareContent": {
              shareCommentary: {
                text: content
              },
              shareMediaCategory: "NONE"
            }
          },
          visibility: {
            "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
          }
        })
      });

      if (!linkedinResponse.ok) {
        const errorText = await linkedinResponse.text();
        console.error("LinkedIn API error:", errorText);
        return res.status(linkedinResponse.status).json({ 
          error: "Failed to post to LinkedIn", 
          details: errorText 
        });
      }

      const linkedinData = await linkedinResponse.json();

      // Increment share count on the wing row, and mark it published.
      const shared = await artifactStore.recordContentDraftShare(draftId);

      /*
       * S5 · the 90-Day Positioning Launch starts here.
       *
       * "When: First SLI-aligned LinkedIn post. 12-week content calendar for
       * 360Brew DNA." The window the spec cares about — LinkedIn's model
       * beginning to associate topics with a person — only opens once there is
       * something to associate, so this is the honest trigger. Starting it at
       * session completion would spend the first weeks on someone who has not
       * posted.
       *
       * Fired after the response and never awaited into the failure path: the
       * post succeeded, and a sequence that failed to start must not report the
       * post as failed. startSequence is a no-op when one is already running,
       * so a second published post does not restart the twelve weeks.
       */
      void (async () => {
        try {
          const studentId = await artifactStore.studentIdForUser(req.user!.id);
          if (studentId) {
            const launch = await import("./wing/event-sequences");
            await launch.onFirstPostPublished(studentId);
          }
        } catch (err) {
          console.error(`[launch] could not start sequence: ${(err as Error).message}`);
        }
      })();

      res.json({
        success: true,
        linkedinPostId: linkedinData.id,
        shareCount: shared?.shareCount ?? 0,
        lastSharedAt: shared?.publishedAt ?? null,
        message: "Posted to LinkedIn successfully"
      });
    } catch (error) {
      console.error("Error posting to LinkedIn:", error);
      res.status(500).json({ error: "Failed to post to LinkedIn" });
    }
  });

  // Share count for a draft. No :postNumber — see the POST route above.
  app.get("/api/linkedin-content-drafts/:draftId/shares", isAuthenticated, async (req, res) => {
    try {
      const draftId = parseInt(req.params.draftId);

      if (isNaN(draftId)) {
        return res.status(400).json({ error: "Invalid draft ID" });
      }

      // Verify the content draft belongs to the user
      const contentDraft = await artifactStore.getContentDraft(draftId);
      if (!contentDraft) {
        return res.status(404).json({ error: "Content draft not found" });
      }
      
      const callerStudentId = await artifactStore.studentIdForUser(req.user!.id);
      if (contentDraft.studentId !== callerStudentId) {
        return res.status(403).json({ error: "Not authorized to access this content draft" });
      }

      // The count lives on the draft row now, so it came back with the
      // authorisation read above — no second query, no legacy join table.
      res.json({
        shareCount: contentDraft.shareCount ?? 0,
        lastSharedAt: contentDraft.publishedAt ?? null
      });
    } catch (error) {
      console.error("Error fetching share count:", error);
      res.status(500).json({ error: "Failed to fetch share count" });
    }
  });
}
