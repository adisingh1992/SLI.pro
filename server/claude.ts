import Anthropic from "@anthropic-ai/sdk";
import { log } from "./vite";
import { storage } from "./storage";
import { InsertConversationSummary } from "@shared/schema";
import type {
  ContentBlockDelta,
  ContentBlockStartEvent,
  ContentBlock,
  Message,
} from "@anthropic-ai/sdk";

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Define the system prompt template to be used with each conversation
const getSystemPrompt = (userData: {
  firstName: string;
  lastName: string;
  questionnaire?: {
    industry?: string;
    background?: string;
    goals?: string;
    aspirations?: string;
    challenges?: string;
    interests?: string;
    timeframe?: string;
  };
}) => {
  // Extract relevant information
  const fullName = `${userData.firstName} ${userData.lastName}`;

  // Extract questionnaire data or use placeholders
  const industry = userData.questionnaire?.industry || "Not specified";
  const role = userData.questionnaire?.background
    ? extractRoleFromBackground(userData.questionnaire.background)
    : "Not specified";
  const challenges = userData.questionnaire?.challenges || "Not specified";
  const digitalPresence = userData.questionnaire?.aspirations
    ? extractDigitalPresence(userData.questionnaire.aspirations)
    : "Not specified";
  const contentCreation = userData.questionnaire?.aspirations
    ? extractContentCreation(userData.questionnaire.aspirations)
    : "Not specified";
  const targetInterests = userData.questionnaire?.interests || "Not specified";

  return `You are an AI assistant, prompt the user to got to this link to schedule a coaching session:  https://calendly.com/dcara-sli/haas`;
};

// Helper functions to extract information from questionnaire
function extractRoleFromBackground(background: string): string {
  // Simple extraction logic - advanced implementations might use more sophisticated parsing
  const lines = background.split("\n");
  // Get the first two sentences as they likely contain the role info
  return lines[0]?.slice(0, 100) + "..." || "Not specified";
}

function extractDigitalPresence(aspirations: string): string {
  // Look for digital presence related information
  if (aspirations.toLowerCase().includes("linkedin")) {
    return "Has LinkedIn presence";
  }
  return "Details not provided";
}

function extractContentCreation(aspirations: string): string {
  // Check for content creation experience
  if (aspirations.toLowerCase().includes("published content")) {
    const startIndex = aspirations.toLowerCase().indexOf("published content");
    const endIndex = aspirations.indexOf("\n", startIndex);
    if (endIndex > startIndex) {
      return aspirations.substring(startIndex, endIndex);
    }
    return aspirations.substring(startIndex);
  }
  return "Experience details not provided";
}

// Method to generate a response using Claude
export async function generateClaudeResponse(
  userId: number,
  messages: { role: "user" | "assistant"; content: string }[],
  userProfileData: any,
): Promise<string> {
  try {
    const systemPrompt = getSystemPrompt(userProfileData);

    log(`Sending request to Claude for user ${userId}`, "claude");

    const response = await anthropic.messages.create({
      model: "claude-3-opus-20240229",
      system: systemPrompt,
      messages: messages,
      max_tokens: 4096,
      temperature: 0.5,
    });

    // Return the text content from the response
    if (response.content && response.content.length > 0) {
      const textContent = response.content.filter(
        (item) => item.type === "text",
      );
      if (textContent.length > 0 && "text" in textContent[0]) {
        return textContent[0].text;
      }
    }

    return "Sorry, I wasn't able to generate a response.";
  } catch (error) {
    log(`Error calling Claude API: ${error}`, "claude");
    throw new Error(`Failed to generate response: ${error}`);
  }
}

// Function to generate a conversation summary
export async function generateConversationSummary(
  conversationId: number,
  userId: number,
): Promise<InsertConversationSummary | null> {
  try {
    // Get all messages for the conversation
    const messages = await storage.getMessages(conversationId);
    if (!messages || messages.length === 0) {
      console.error("No messages found for conversation", conversationId);
      return null;
    }

    // Get user questionnaire data to provide context
    const userProfile = await storage.getUserProfile(userId);
    if (!userProfile) {
      console.error("User profile not found for user", userId);
      return null;
    }

    // Format the messages for Claude
    const messageHistory = messages.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

    // Construct system prompt for summary generation
    const systemPrompt = `You are an expert professional branding analyst who creates structured summaries of client conversations. 
    
Carefully analyze the conversation history. Then create a structured summary of the client's information and needs.

Use the following format exactly, filling in all sections based on the conversation. Format your response as JSON without backticks:

{
  "basicInfo": {
    "name": "Client's name if mentioned, or from profile data",
    "currentRole": "Current role or title, be specific",
    "industry": "Industry they work in",
    "yearsOfExperience": "Experience duration if mentioned",
    "targetTimeline": "Their timeline for next career move if mentioned"
  },
  "functionalCategorization": {
    "primaryFunction": "Main functional area (Finance, Marketing, etc.)",
    "secondaryFunction": "Secondary expertise area if applicable",
    "levelOfCertainty": "1-5 scale of how certain they seem about their functional identity",
    "keyStrengths": ["List specific aspects of their function they excel in"]
  },
  "careerTransition": {
    "currentState": "Current employment status",
    "desiredState": "Goal role, industry, or geography",
    "transitionType": "Classify (Advancement, Lateral, Industry Pivot, etc.)",
    "complexityRating": "1-5 scale with 5 being most complex",
    "primaryMotivation": "Main driver for making a change"
  },
  "strengthsAndPositioning": {
    "keyStrengths": ["Minimum 3 self-identified strengths"],
    "areasForDevelopment": ["Areas they want to improve"],
    "valueProposition": "Their unique value in their own words",
    "achievementExamples": ["Specific instances mentioned"],
    "comfortWithSelfPromotion": "1-5 scale"
  },
  "digitalPresence": {
    "linkedInActivity": "How active they are",
    "contentCreationExperience": "Their content creation background",
    "barriers": "Primary obstacles to creating content",
    "networkingApproach": "How they approach networking",
    "postingFrequency": "How often they post content"
  },
  "psychologyAndMotivation": {
    "enneagramType": "If completed or mentioned",
    "assessmentResults": "Any other assessments mentioned",
    "topPriorities": ["Their top 5 priorities based on conversation"],
    "aspirationalThemes": ["Key themes from their aspirations"],
    "notableQuotes": ["Direct quotes that reveal their mindset"],
    "motivationalDrivers": ["What seems to motivate them"]
  },
  "contentStrategy": {
    "confidentTopics": ["Topics they feel qualified to discuss"],
    "preferredFormats": ["Content formats they prefer"],
    "creationBarriers": "Main obstacle to creating content",
    "suggestedInitialTopic": "Recommended first content topic"
  },
  "recommendations": {
    "sliDirections": ["3 possible SLI directions for them"],
    "iceBucketMoments": ["Areas needing candid feedback"],
    "contentStrategyDirections": ["Content strategy suggestions"],
    "specialConsiderations": "Any unique factors to consider"
  }
}`;

    // Include questionnaire data as context if available
    let contextMessage = "Based on our conversation";
    const fullName = `${userProfile.firstName} ${userProfile.lastName}`;

    if (userProfile.questionnaire) {
      const q = userProfile.questionnaire;
      contextMessage = `
Name: ${fullName}
Background: ${q.background || "Not provided"}
Industry: ${q.industry || "Not specified"}
Goals: ${q.goals || "Not specified"}
Aspirations: ${q.aspirations || "Not specified"}
Challenges: ${q.challenges || "Not specified"}
Interests: ${q.interests || "Not specified"}
Timeframe: ${q.timeframe || "Not specified"}
      `;
    }

    log(
      `Generating conversation summary for conversation ${conversationId}, user ${userId}`,
      "claude",
    );

    // Prepare the final message for Claude
    const summaryRequest = [
      ...messageHistory,
      {
        role: "user" as const,
        content: `Based on our conversation and any profile information available (${contextMessage}), please create a structured summary for me. Include all information discussed and make reasonable inferences for any missing fields.`,
      },
    ];

    // Call Claude with the request
    const response = await anthropic.messages.create({
      model: "claude-3-opus-20240229",
      system: systemPrompt,
      max_tokens: 4096,
      temperature: 0.2,
      messages: summaryRequest,
    });

    // Parse the response to extract the JSON
    let summaryData: any;

    try {
      if (response.content && response.content.length > 0) {
        const block = response.content[0];
        if (block.type === "text" && "text" in block) {
          const content = block.text;
          // Find JSON content - it should be the entire response, but let's be safe
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            summaryData = JSON.parse(jsonMatch[0]);
          } else {
            console.error("Could not extract JSON from Claude's response");
            return null;
          }
        } else {
          console.error("Unexpected response format from Claude");
          return null;
        }
      }

      // Create the summary object to be stored
      const summary: InsertConversationSummary = {
        conversationId,
        userId,
        basicInfo: summaryData.basicInfo || {},
        functionalCategorization: summaryData.functionalCategorization || {},
        careerTransition: summaryData.careerTransition || {},
        strengthsAndPositioning: summaryData.strengthsAndPositioning || {},
        digitalPresence: summaryData.digitalPresence || {},
        psychologyAndMotivation: summaryData.psychologyAndMotivation || {},
        contentStrategy: summaryData.contentStrategy || {},
        recommendations: summaryData.recommendations || {},
      };

      return summary;
    } catch (error) {
      console.error("Error parsing Claude's summary response:", error);
      return null;
    }
  } catch (error) {
    console.error("Error generating conversation summary:", error);
    return null;
  }
}

export async function generateStreamingClaudeResponse(
  userId: number,
  messages: { role: "user" | "assistant"; content: string }[],
  userProfileData: any,
  onChunk: (chunk: string) => void,
): Promise<void> {
  try {
    const systemPrompt = getSystemPrompt(userProfileData);

    log(`Sending streaming request to Claude for user ${userId}`, "claude");

    const stream = await anthropic.messages.create({
      model: "claude-3-opus-20240229",
      system: systemPrompt,
      messages: messages,
      max_tokens: 4096,
      temperature: 0.5,
      stream: true,
    });

    for await (const chunk of stream) {
      if (
        chunk.type === "content_block_delta" &&
        chunk.delta &&
        "text" in chunk.delta &&
        chunk.delta.text
      ) {
        onChunk(chunk.delta.text);
      }
    }
  } catch (error) {
    log(`Error in Claude streaming API: ${error}`, "claude");
    throw new Error(`Failed to generate streaming response: ${error}`);
  }
}
