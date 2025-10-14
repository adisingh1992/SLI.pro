import { Request, Response, NextFunction, Express } from "express";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { Anthropic } from "@anthropic-ai/sdk";
import { IStorage } from "./storage";
import { storage } from "./storage";

// Import the logging function
const log = (message: string, tag = "express") => {
  console.log(`${new Date().toLocaleTimeString()} [${tag}] ${message}`);
};

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-3-7-sonnet-20250219";
const apiKey = process.env.ANTHROPIC_API_KEY;

if (!apiKey) {
  console.error("ANTHROPIC_API_KEY is not set in environment variables");
}

const anthropic = new Anthropic({
  apiKey,
});

const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Not authenticated" });
};

// Helper function for exponential backoff retries when calling Claude
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
      
      log(`Rate limit exceeded for ${identifier}. Retrying in ${backoffTime/1000} seconds (retry ${retries}/${maxRetries})`, "claude");
      
      // Wait for the backoff period
      await new Promise(resolve => setTimeout(resolve, backoffTime));
      
      log(`Resuming ${identifier} after backoff`, "claude");
    }
  }
}

/**
 * Generate LinkedIn content drafts based on the user's context
 */
async function generateLinkedinContentDrafts(userId: number) {
  try {
    // Get the user profile to collect context data
    const userProfile = await storage.getUserProfile(userId);
    if (!userProfile) {
      throw new Error("User profile not found");
    }

    // Get necessary context from documents, SLI, etc.
    const resumeDoc = userProfile.documents?.find(doc => doc.type === "resume");
    const linkedinDoc = userProfile.documents?.find(doc => doc.type === "linkedin");
    const otherDocs = userProfile.documents?.filter(doc => doc.type !== "resume" && doc.type !== "linkedin");
    
    // Get SLI context
    const slis = userProfile.slis || [];
    const selectedSli = slis.find(sli => sli.selectedSliIndex !== null || sli.customSliText);
    const refinedSli = selectedSli?.refinedSliText;
    const sliText = refinedSli || 
                   (selectedSli?.selectedSliIndex === 1 ? selectedSli.statement1 : 
                    selectedSli?.selectedSliIndex === 2 ? selectedSli.statement2 : 
                    selectedSli?.selectedSliIndex === 3 ? selectedSli.statement3 : 
                    selectedSli?.customSliText || "No SLI available");
    
    // Get questionnaire data
    const questionnaire = userProfile.questionnaire;
    const interests = questionnaire?.interests || "";
    
    // Get coaching notes
    const coachingNotes = userProfile.coachingNotes || [];
    const latestCoachingNote = coachingNotes.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
    
    // Get foundation session 3 data
    const foundationSession3 = await storage.getFoundationSession(userId, 3);
    const session3Data = foundationSession3?.completionData;
    
    // Format context for Claude
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
    
    context += `## SLI (Single Lasting Impression)\n${sliText}\n\n`;
    
    // Define Claude system prompt
    const systemPrompt = `You are a professional content strategist for SLI.pro, creating custom LinkedIn posts for clients.`;
    
    // Define user prompt with Claude prompt from the feature request
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
**Hashtags:** [5-7 relevant hashtags, including #SLIpro]

### Post 2: [DIFFERENT APPROACH TYPE]
[Same structure as above, but using a different content angle]

## Stylistic Guidelines

Ensure each post:
- Reflects the client's authentic voice (based on resume, LinkedIn profile, and SLI)
- Matches sophistication to career level (executive/mid/early)
- Demonstrates credibility through insights and context
- Avoids AI-detection triggers (e.g., overly formulaic writing, clichés)
- Projects confidence appropriate to their personality profile

## Topic Selection Strategy

Choose topics based on:
1. Interest areas from their questionnaire
2. News or trends (from the last 2 weeks) in their industry
3. SLI-aligned aspirational themes
4. Relevant experience from their background

Stay optimistic, insightful, and grounded—avoiding political or divisive topics. Each post must pass the "SLI reinforcement test": Would this strengthen the reader's understanding of the client's professional identity?`;

    // Call Claude API with retry for rate limits
    log(`Calling Claude API to generate LinkedIn content drafts`, "claude");
    const response = await callWithRetry(
      () => anthropic.messages.create({
        model: CLAUDE_MODEL,
        system: systemPrompt,
        max_tokens: 4096,
        temperature: 0.7,
        messages: [{ role: "user", content: userPrompt }]
      }),
      5,  // max retries
      60000,  // initial backoff
      "LinkedIn content drafts generation"
    );

    if (!response.content || response.content.length === 0) {
      throw new Error("Empty response from Claude");
    }

    // Process Claude's response
    const responseText = response.content[0].text;
    
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
    
    // Save to database
    const savedContentDraft = await storage.createLinkedinContentDraft(contentDraft);
    return savedContentDraft;
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
      const contentDrafts = await storage.getLinkedinContentDrafts(userId);
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
      const contentDraft = await storage.getLatestLinkedinContentDraft(userId);
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
      
      const contentDraft = await storage.getLinkedinContentDraft(contentDraftId);
      if (!contentDraft) {
        res.status(404).json({ error: "LinkedIn content draft not found" });
        return;
      }
      
      // Check if the content draft belongs to the current user
      if (contentDraft.userId !== req.user!.id) {
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
      const userProfile = await storage.getUserProfile(userId);
      
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
      const hasSli = userProfile.slis?.some(sli => sli.selectedSliIndex !== null || sli.customSliText || sli.refinedSliText);
      
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
  app.post("/api/linkedin-content-drafts/:draftId/post/:postNumber", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const draftId = parseInt(req.params.draftId);
      const postNumber = parseInt(req.params.postNumber);
      const { content } = req.body;

      if (isNaN(draftId) || isNaN(postNumber)) {
        return res.status(400).json({ error: "Invalid draft ID or post number" });
      }

      if (postNumber !== 1 && postNumber !== 2) {
        return res.status(400).json({ error: "Post number must be 1 or 2" });
      }

      if (!content) {
        return res.status(400).json({ error: "Content is required" });
      }

      // Get the user to access their LinkedIn access token
      const user = await storage.getUser(userId);
      if (!user || !user.linkedinAccessToken) {
        return res.status(400).json({ error: "LinkedIn not connected. Please authenticate with LinkedIn first." });
      }

      // Check if token is expired
      if (user.linkedinTokenExpiry && new Date(user.linkedinTokenExpiry) < new Date()) {
        return res.status(401).json({ error: "LinkedIn token expired. Please re-authenticate with LinkedIn." });
      }

      // Verify the content draft belongs to the user
      const contentDraft = await storage.getLinkedinContentDraft(draftId);
      if (!contentDraft || contentDraft.userId !== userId) {
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

      // Increment share count
      await storage.incrementLinkedinPostShare(draftId, postNumber);

      res.json({ 
        success: true, 
        linkedinPostId: linkedinData.id,
        message: "Posted to LinkedIn successfully" 
      });
    } catch (error) {
      console.error("Error posting to LinkedIn:", error);
      res.status(500).json({ error: "Failed to post to LinkedIn" });
    }
  });

  // Get share count for a specific post
  app.get("/api/linkedin-content-drafts/:draftId/shares/:postNumber", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const draftId = parseInt(req.params.draftId);
      const postNumber = parseInt(req.params.postNumber);

      if (isNaN(draftId) || isNaN(postNumber)) {
        return res.status(400).json({ error: "Invalid draft ID or post number" });
      }

      // Verify the content draft belongs to the user
      const contentDraft = await storage.getLinkedinContentDraft(draftId);
      if (!contentDraft) {
        return res.status(404).json({ error: "Content draft not found" });
      }
      
      if (contentDraft.userId !== userId) {
        return res.status(403).json({ error: "Not authorized to access this content draft" });
      }

      const shareData = await storage.getLinkedinPostShare(draftId, postNumber);
      
      res.json({ 
        shareCount: shareData?.shareCount || 0,
        lastSharedAt: shareData?.lastSharedAt || null
      });
    } catch (error) {
      console.error("Error fetching share count:", error);
      res.status(500).json({ error: "Failed to fetch share count" });
    }
  });
}