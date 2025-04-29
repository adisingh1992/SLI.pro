import { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { generateLinkedInOptimization } from "./linkedin-optimization";

// Middleware to check if user is authenticated
const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Not authenticated" });
};

export function registerLinkedinOptimizationRoutes(app: Express) {
  // Get all LinkedIn optimizations for the current user
  app.get("/api/linkedin-optimizations", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const optimizations = await storage.getLinkedinOptimizations(userId);
      res.json(optimizations);
    } catch (error) {
      console.error("Error fetching LinkedIn optimizations:", error);
      res.status(500).json({ error: "Failed to fetch LinkedIn optimizations" });
    }
  });

  // Get latest LinkedIn optimization for the current user
  app.get("/api/linkedin-optimizations/latest", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const optimization = await storage.getLatestLinkedinOptimization(userId);
      if (!optimization) {
        res.status(404).json({ error: "No LinkedIn optimization found" });
        return;
      }
      res.json(optimization);
    } catch (error) {
      console.error("Error fetching latest LinkedIn optimization:", error);
      res.status(500).json({ error: "Failed to fetch latest LinkedIn optimization" });
    }
  });

  // Get a specific LinkedIn optimization by ID
  app.get("/api/linkedin-optimizations/:id", isAuthenticated, async (req, res) => {
    try {
      const optimizationId = parseInt(req.params.id);
      if (isNaN(optimizationId)) {
        res.status(400).json({ error: "Invalid optimization ID" });
        return;
      }
      
      const optimization = await storage.getLinkedinOptimization(optimizationId);
      if (!optimization) {
        res.status(404).json({ error: "LinkedIn optimization not found" });
        return;
      }
      
      // Check if the optimization belongs to the current user
      if (optimization.userId !== req.user!.id) {
        res.status(403).json({ error: "Not authorized to access this optimization" });
        return;
      }
      
      res.json(optimization);
    } catch (error) {
      console.error("Error fetching LinkedIn optimization:", error);
      res.status(500).json({ error: "Failed to fetch LinkedIn optimization" });
    }
  });

  // Generate a new LinkedIn optimization - TEST VERSION (without Claude API call)
  app.post("/api/linkedin-optimizations/generate", isAuthenticated, async (req, res) => {
    console.log("[LinkedIn Optimization] Auth user:", req.user ? { id: req.user.id, username: req.user.username } : "No user");
    try {
      const userId = req.user!.id;
      console.log(`[LinkedIn Optimization] Starting generation for user ${userId}`);
      
      // Check if the user has the necessary documents
      const documents = await storage.getDocuments(userId);
      console.log(`[LinkedIn Optimization] User has ${documents.length} documents`);
      
      const resumeDoc = documents.find(doc => doc.type === "resume");
      const linkedinDoc = documents.find(doc => doc.type === "linkedin");
      
      if (!resumeDoc || !linkedinDoc) {
        const error = "Both resume and LinkedIn profile documents are required";
        console.log(`[LinkedIn Optimization] Error: ${error}`);
        res.status(400).json({ error });
        return;
      }
      
      console.log(`[LinkedIn Optimization] Found resume doc ID ${resumeDoc.id} and LinkedIn doc ID ${linkedinDoc.id}`);
      
      // Check if the user has a SLI
      const slis = await storage.getSlisByUserId(userId);
      console.log(`[LinkedIn Optimization] User has ${slis.length} SLIs`);
      
      const selectedSli = slis.find(sli => sli.selectedSliIndex !== null || sli.refinedSliText);
      
      if (!selectedSli) {
        const error = "A selected or refined SLI is required";
        console.log(`[LinkedIn Optimization] Error: ${error}`);
        res.status(400).json({ error });
        return;
      }
      
      console.log(`[LinkedIn Optimization] Found selected SLI ID ${selectedSli.id}`);
      
      // Check if the user has a freshness report
      const freshnessReport = await storage.getLatestFreshnessReport(userId);
      if (!freshnessReport) {
        const error = "A freshness report is required";
        console.log(`[LinkedIn Optimization] Error: ${error}`);
        res.status(400).json({ error });
        return;
      }
      
      console.log(`[LinkedIn Optimization] Found freshness report ID ${freshnessReport.id}`);
      
      // For testing: Use sample data instead of calling Claude API
      console.log("[LinkedIn Optimization] Using test data instead of calling Claude API");
      
      // Mock optimization data
      const sampleOptimizationData = {
        alignmentAssessment: "Your LinkedIn profile partially aligns with your SLI but needs strategic enhancement to fully showcase your identity as a technical leader with business acumen. Currently, your profile emphasizes technical skills but doesn't sufficiently highlight your strategic business perspective or thought leadership qualities. There's an opportunity to better demonstrate how you bridge technical expertise with business value creation.",
        headlineOptimization: {
          currentHeadline: "Senior Software Engineer",
          recommendedHeadline: "Technical Leader & Business Strategist | Driving Growth Through Innovation",
          rationale: "This headline directly incorporates elements of your SLI by positioning you as both a technical expert and business-minded professional, showcasing your unique value proposition."
        },
        aboutSection: {
          currentAnalysis: "Your current About section focuses primarily on technical skills and achievements without effectively connecting them to business outcomes. While it demonstrates your expertise, it doesn't fully communicate your strategic thinking or how you leverage technology to drive business results.",
          recommendations: "Reshape your narrative to emphasize how your technical expertise translates to business value. Include specific examples of how you've bridged technical solutions with business objectives, and showcase your thought leadership in technology strategy.",
          suggestedStructure: "Start with your professional identity and mission that reflects your SLI. Follow with specific examples that demonstrate both technical excellence and business impact. Close with forward-looking statements about your professional focus and what you bring to collaborations.",
          keyElements: "Technical leadership, business strategy alignment, innovation mindset, measured business outcomes, cross-functional collaboration, and industry perspective.",
          draftContent: "I'm a technical leader who combines deep software engineering expertise with business acumen to deliver solutions that directly impact organizational growth and efficiency. My approach bridges the gap between complex technical concepts and clear business outcomes.\n\nThroughout my career, I've led initiatives that transformed technical challenges into business opportunities, including developing a microservices architecture that reduced operational costs by 35% while enabling the business to launch products 50% faster. I excel at communicating technical concepts to business stakeholders and translating business requirements into elegant technical solutions.\n\nI'm passionate about leveraging emerging technologies to solve meaningful business problems and am always looking to connect with fellow professionals interested in the intersection of technology strategy and business growth."
        },
        profileEnhancements: {
          experienceSection: "Enhance job descriptions to quantify business impact of technical achievements. For example, instead of 'Developed microservices architecture,' say 'Architected microservices solution that reduced time-to-market by 50% and enabled $2M in new revenue streams.' Include action verbs like 'led,' 'strategized,' and 'transformed' to emphasize leadership. Highlight cross-functional collaboration and business stakeholder engagement.",
          skillsEndorsements: "Prioritize skills that reflect both technical expertise and business acumen: 'Technology Strategy,' 'Cross-functional Leadership,' 'Business Process Optimization,' and 'Technology ROI Analysis' alongside core technical skills. Remove excessive listings of specific programming languages and tools that aren't central to your SLI. Instead, group them under broader categories like 'Full-stack Development' or 'Cloud Architecture.'",
          activityEngagement: "Share or create content that demonstrates thought leadership at the intersection of technology and business. Comment on industry trends with insights that connect technical developments to business implications. Engage with content from both technology leaders and business executives to showcase your dual perspective.",
          visualImprovements: "Update your profile photo to present a professional image that balances technical credibility with business polish—business casual rather than too casual or overly formal. Consider a background image that subtly reinforces your SLI, such as a visual representing the bridge between technology and business outcomes."
        },
        contentStrategy: {
          themes: "1. Technology as a Business Enabler\n2. Bridging Technical and Business Communication\n3. Measuring ROI of Technical Investments\n4. Future Technology Trends and Business Implications\n5. Technical Leadership and Organizational Impact",
          postIdeas: "1. Article: 'Translating Technical Achievements into Business Metrics That Matter'\n2. Case study: How a Technical Architecture Decision Led to Unexpected Business Growth\n3. Reflection piece: Lessons Learned Leading Cross-functional Teams\n4. How-to: Communicating Technical Concepts to Non-Technical Stakeholders\n5. Industry analysis: Emerging Technologies That Will Transform Business Models in Your Industry\n6. Opinion piece: Why Technical Leaders Need Business Acumen in Today's Economy\n7. Comparison post: Technical Decision-Making With and Without Business Context",
          engagementTips: "Actively participate in groups that focus on technology leadership and business technology strategy. Thoughtfully comment on posts from business leaders to add technical perspective, and on technical posts to add business context. Ask thought-provoking questions that prompt discussions about the business impact of technical decisions. Share relevant industry reports with your own analysis of implications for both technical and business professionals."
        },
        implementationPriorities: "1. Immediate (Week 1): Update headline and skills section to align with your SLI\n2. Short-term (Weeks 2-3): Revise About section and enhance experience descriptions with quantified business impact\n3. Medium-term (Weeks 4-6): Update visual elements and begin strategic content posting (1-2 posts per week)\n4. Ongoing: Thoughtful engagement with your network and relevant groups 3-4 times weekly\n5. Quarterly: Review analytics on profile views and content engagement to refine your LinkedIn strategy"
      };
      
      // Save the optimization to the database
      console.log(`[LinkedIn Optimization] Saving test data to database...`);
      const newOptimization = await storage.createLinkedinOptimization({
        userId,
        contentStrategy: sampleOptimizationData.contentStrategy,
        alignmentAssessment: sampleOptimizationData.alignmentAssessment,
        headlineOptimization: sampleOptimizationData.headlineOptimization,
        aboutSection: sampleOptimizationData.aboutSection,
        profileEnhancements: sampleOptimizationData.profileEnhancements,
        implementationPriorities: sampleOptimizationData.implementationPriorities
      });
      
      console.log(`[LinkedIn Optimization] Created new optimization with ID ${newOptimization.id}`);
      
      res.status(201).json(newOptimization);
    } catch (error: any) {
      console.error("[LinkedIn Optimization] Error generating optimization:", error);
      console.error("[LinkedIn Optimization] Error details:", error.stack);
      
      // More specific error messages based on the type of error
      if (error.name === 'SyntaxError') {
        res.status(500).json({ error: "Failed to parse API response. Please try again." });
      } else if (error.status === 429) {
        res.status(429).json({ error: "API rate limit exceeded. Please try again in a few minutes." });
      } else if (error.status === 401 || error.status === 403) {
        res.status(error.status).json({ error: "Authentication error with AI service. Please contact support." });
      } else {
        res.status(500).json({ error: error.message || "Failed to generate LinkedIn optimization" });
      }
    }
  });
}