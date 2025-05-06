import React, { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { UserProfile } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Loader2, CheckCircle } from "lucide-react";

// Industry options array
const INDUSTRY_OPTIONS = [
  "Accounting - General",
  "Consulting - Biotechnology / Healthcare",
  "Consulting - Design",
  "Consulting - Energy",
  "Consulting - General",
  "Consulting - Nonprofit",
  "Consulting - Other",
  "Consulting - Strategy",
  "Consulting - Technology",
  "Consumer Products - Alcohol",
  "Consumer Products - Apparel / Textiles",
  "Consumer Products - Automotive",
  "Consumer Products - Beverages / Food",
  "Consumer Products - Electronics",
  "Consumer Products - General",
  "Consumer Products - Household / Personal",
  "Consumer Products - Luxury Goods",
  "Consumer Products - Other",
  "Consumer Products - Services",
  "Consumer Products - Tobacco",
  "Economic Development / Microfinanace - General",
  "Energy / Utilities - Alternative Energy",
  "Energy / Utilities - Energy Trading",
  "Energy / Utilities - General",
  "Energy / Utilities - Infrastructure / Hardware",
  "Energy / Utilities - Oil / Gas",
  "Energy / Utilities - Other",
  "Energy / Utilities - Utility Services (Electric/ Water/ etc.)",
  "Entertainment - Film / Media",
  "Entertainment - General",
  "Entertainment - Leisure / Recreation",
  "Entertainment - Other",
  "Entertainment - Sports & Sports Management",
  "Financial - Commercial Banking",
  "Financial - Diversified Financial Services",
  "Financial - Fin Tech",
  "Financial - General",
  "Financial - Hedge Funds",
  "Financial - Insurance",
  "Financial - Investment Banking / Brokerage",
  "Financial - Investment Management",
  "Financial - Other",
  "Financial - Private Equity",
  "Financial - Research & Ratings",
  "Financial - Venture Capital",
  "Government - Local / State / Federal",
  "Government - Military",
  "Government - Other",
  "Healthcare - Biotechnology",
  "Healthcare - General",
  "Healthcare - Health Tech",
  "Healthcare - Medical Devices",
  "Healthcare - Other",
  "Healthcare - Payors, Providers & Services",
  "Manufacturing - Automotive",
  "Manufacturing - Chemical",
  "Manufacturing - General",
  "Manufacturing - Other",
  "Media - Advertising",
  "Media - Other",
  "Media - Publishing (Print / Web)",
  "Media - Radio / TV / Cable / Film",
  "Natural Resources - General",
  "Natural Resources - Metals / Mining",
  "Natural Resources - Other",
  "Natural Resources - Renewable",
  "Other - Aerospace / Aviation / Defense",
  "Other - Agribusiness",
  "Other - Construction",
  "Other - Engineering Services",
  "Other - Hospitality / Tourism",
  "Other - Law / Legal Services",
  "Other - Retail",
  "Other -Unspecified / Other",
  "Pharmaceutical - General",
  "Pharmaceutical - Manufacturers",
  "Pharmaceutical - Other",
  "Public Sector / Non-Profit - Education",
  "Public Sector / Non-Profit - Environmental Services & Sustainability",
  "Public Sector / Non-Profit - Nonprofits & Social Enterprises",
  "Real Estate - Commercial",
  "Real Estate - General",
  "Real Estate - Other",
  "Real Estate - Residential",
  "Real Estate - Services",
  "Technology - Ed Tech",
  "Technology - Equipment / Hardware / Networking",
  "Technology - General",
  "Technology - Internet Services / E-Commerce",
  "Technology - Multimedia Products & Services",
  "Technology - Other",
  "Technology - Software",
  "Technology - Telecom",
  "Transportation / Logistics - General",
];

// Function options array
const FUNCTION_OPTIONS = [
  "Accounting - Advisory",
  "Accounting - Audit",
  "Accounting - General",
  "Accounting - Other",
  "Consulting - Change Management / HR",
  "Consulting - Financial",
  "Consulting - General",
  "Consulting - Healthcare",
  "Consulting - Management / Strategy",
  "Consulting - Other",
  "Consulting - Social Impact/Enterprise",
  "Consulting - Technology",
  "Corporate - Business Analysis and Planning",
  "Corporate - Business Development",
  "Corporate - Financial Analysis",
  "Corporate - General Management",
  "Corporate - Management Information Systems",
  "Corporate - Operations",
  "Corporate - Project Management",
  "Corporate - Social Responsibility / Sustainability / Compliance",
  "Corporate - Strategy",
  "Corporate - Supply Chain",
  "Corporate - Treasury",
  "Finance - Banking / M&A / Corporate Finance",
  "Finance - Commercial Lending",
  "Finance - Economic Analysis / Research",
  "Finance - General",
  "Finance - Investment / Portfolio Management",
  "Finance - Other",
  "Finance - Private Client Services / Wealth Management",
  "Finance - Public Finance",
  "Finance - Research",
  "Finance - Restructure / Turnaround",
  "Finance - Risk Management",
  "Finance - Sales & Trading",
  "Finance - Venture Capital",
  "Human Resources - Generalist",
  "Human Resources - Organizational Design / Development",
  "Human Resources - Recruiter / Executive Search",
  "Manufacturing - General",
  "Manufacturing - Other",
  "Manufacturing - Plant / Facility Management",
  "Marketing - Advertising",
  "Marketing - Brand / Product Management",
  "Marketing - Communications / Public Relations",
  "Marketing - General",
  "Marketing - Market Research / Market Intelligence",
  "Marketing - Merchandising / Retail",
  "Marketing - Online / Social",
  "Marketing - Other",
  "Marketing - Product Development / Design",
  "Operations/Logistics",
  "Other - Administration",
  "Other - Community Relations",
  "Other - Customer Relations",
  "Other - Education (Administrator / Faculty)",
  "Other - Entrepreneurship",
  "Other - Fundraising / Development",
  "Other - Health Care / Medical Professional",
  "Other - Lawyer / Legal Professional",
  "Other - Military - Officer",
  "Other - Multiple Positions",
  "Other - Relationship / Partnership / Client Management",
  "Other - Research & Development",
  "Other - Sales",
  "Other - Unspecified / Other",
  "Real Estate - Asset / Property Management",
  "Real Estate - Development / Construction",
  "Real Estate - Finance",
  "Real Estate - General",
  "Real Estate - Other",
  "Rotational Program - Finance",
  "Rotational Program - General Management",
  "Rotational Program - Marketing",
  "Rotational Program - Other",
  "Technical - Ecommerce / Internet / Web Site Mgmt",
  "Technical - Engineering",
  "Technical - General",
  "Technical - Integration / Implementation",
  "Technical - Other",
  "Technical - Product Management",
  "Technical - Systems Management",
];

export default function QuestionnairePage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 5; // Updated to 5 steps to include the industry selection

  // Add state for industry and function selection
  const [industry, setIndustry] = useState("");
  const [jobFunction, setJobFunction] = useState("");

  // Define separate state variables for each field
  const [background, setBackground] = useState(""); // LinkedIn URL
  const [goals, setGoals] = useState(""); // Other social media details
  const [aspirations, setAspirations] = useState("");
  const [challenges, setChallenges] = useState("");
  const [interests, setInterests] = useState("");
  const [timeframe, setTimeframe] = useState("");

  // Industry Interests checkboxes state
  const [consultingChecked, setConsultingChecked] = useState(false);
  const [consumerRetailChecked, setConsumerRetailChecked] = useState(false);
  const [financialServicesChecked, setFinancialServicesChecked] =
    useState(false);
  const [globalMarketsChecked, setGlobalMarketsChecked] = useState(false);
  const [governmentChecked, setGovernmentChecked] = useState(false);
  const [healthcareChecked, setHealthcareChecked] = useState(false);
  const [innovationChecked, setInnovationChecked] = useState(false);
  const [manufacturingChecked, setManufacturingChecked] = useState(false);
  const [socialImpactChecked, setSocialImpactChecked] = useState(false);
  const [technologyChecked, setTechnologyChecked] = useState(false);

  // Cross-Cutting & Societal Interests checkboxes state
  const [climateChecked, setClimateChecked] = useState(false);
  const [consumerBehaviorChecked, setConsumerBehaviorChecked] = useState(false);
  const [crimeJusticeChecked, setCrimeJusticeChecked] = useState(false);
  const [digitalTransformationAIChecked, setDigitalTransformationAIChecked] =
    useState(false);
  const [educationLearningChecked, setEducationLearningChecked] =
    useState(false);

  // Content Creation Format preferences
  const [sharingNewsChecked, setSharingNewsChecked] = useState(false);
  const [writingExperiencesChecked, setWritingExperiencesChecked] =
    useState(false);
  const [analyzingTrendsChecked, setAnalyzingTrendsChecked] = useState(false);
  const [commentingPostsChecked, setCommentingPostsChecked] = useState(false);
  const [howToContentChecked, setHowToContentChecked] = useState(false);
  const [eventTakeawaysChecked, setEventTakeawaysChecked] = useState(false);
  const [personalAnecdoteChecked, setPersonalAnecdoteChecked] = useState(false);
  const [digitalCommunitiesChecked, setDigitalCommunitiesChecked] =
    useState(false);
  const [otherContentFormatChecked, setOtherContentFormatChecked] =
    useState(false);
  const [otherContentFormat, setOtherContentFormat] = useState("");

  // Posting Barriers
  const [unsureWhatToSayChecked, setUnsureWhatToSayChecked] = useState(false);
  const [fearOfJudgmentChecked, setFearOfJudgmentChecked] = useState(false);
  const [timeManagementChecked, setTimeManagementChecked] = useState(false);
  const [dontKnowHowToStartChecked, setDontKnowHowToStartChecked] =
    useState(false);
  const [unclearProfessionalVoiceChecked, setUnclearProfessionalVoiceChecked] =
    useState(false);
  const [otherBarrierChecked, setOtherBarrierChecked] = useState(false);
  const [otherBarrier, setOtherBarrier] = useState("");
  const [emergingMarketsChecked, setEmergingMarketsChecked] = useState(false);
  const [entertainmentArtsChecked, setEntertainmentArtsChecked] =
    useState(false);
  const [financialInnovationChecked, setFinancialInnovationChecked] =
    useState(false);
  const [futureOfWorkChecked, setFutureOfWorkChecked] = useState(false);
  const [globalEconomyChecked, setGlobalEconomyChecked] = useState(false);
  const [geopoliticsChecked, setGeopoliticsChecked] = useState(false);
  const [healthWellnessChecked, setHealthWellnessChecked] = useState(false);
  const [healthcareInnovationChecked, setHealthcareInnovationChecked] =
    useState(false);
  const [socialImpactDEIChecked, setSocialImpactDEIChecked] = useState(false);
  const [sportsRecreationChecked, setSportsRecreationChecked] = useState(false);
  const [travelTourismChecked, setTravelTourismChecked] = useState(false);
  const [urbanDevelopmentChecked, setUrbanDevelopmentChecked] = useState(false);
  const [usPoliticsChecked, setUsPoliticsChecked] = useState(false);

  // Professional areas for thought leadership
  const [professionalAreas, setProfessionalAreas] = useState("");

  // Technology & Digital Media subcategories state
  const [aiConsumerChecked, setAiConsumerChecked] = useState(false);
  const [aiComputerVisionChecked, setAiComputerVisionChecked] = useState(false);
  const [aiEthicsChecked, setAiEthicsChecked] = useState(false);
  const [aiInfrastructureChecked, setAiInfrastructureChecked] = useState(false);
  const [aiNlpChecked, setAiNlpChecked] = useState(false);
  const [aiPredictiveChecked, setAiPredictiveChecked] = useState(false);
  const [aiRoboticsChecked, setAiRoboticsChecked] = useState(false);
  const [aiScientificChecked, setAiScientificChecked] = useState(false);
  const [aiLearningChecked, setAiLearningChecked] = useState(false);
  const [consumerDevicesChecked, setConsumerDevicesChecked] = useState(false);
  const [consumerGamingChecked, setConsumerGamingChecked] = useState(false);
  const [consumerMobileChecked, setConsumerMobileChecked] = useState(false);
  const [consumerSmartHomeChecked, setConsumerSmartHomeChecked] =
    useState(false);
  const [cybersecuritySolutionsChecked, setCybersecuritySolutionsChecked] =
    useState(false);
  const [dataPrivacyChecked, setDataPrivacyChecked] = useState(false);
  const [regulatoryComplianceChecked, setRegulatoryComplianceChecked] =
    useState(false);
  const [riskManagementChecked, setRiskManagementChecked] = useState(false);
  const [cloudComputingChecked, setCloudComputingChecked] = useState(false);
  const [dataCentersChecked, setDataCentersChecked] = useState(false);
  const [networksChecked, setNetworksChecked] = useState(false);
  const [web3BlockchainChecked, setWeb3BlockchainChecked] = useState(false);
  const [contentDistributionChecked, setContentDistributionChecked] =
    useState(false);
  const [creatorEconomyChecked, setCreatorEconomyChecked] = useState(false);
  const [digitalMarketingChecked, setDigitalMarketingChecked] = useState(false);
  const [socialMediaPlatformsChecked, setSocialMediaPlatformsChecked] =
    useState(false);
  const [arVrXrChecked, setArVrXrChecked] = useState(false);
  const [biotechHealthChecked, setBiotechHealthChecked] = useState(false);
  const [quantumComputingChecked, setQuantumComputingChecked] = useState(false);
  const [emergingRoboticsChecked, setEmergingRoboticsChecked] = useState(false);
  const [businessAppsChecked, setBusinessAppsChecked] = useState(false);
  const [
    enterpriseDigitalTransformationChecked,
    setEnterpriseDigitalTransformationChecked,
  ] = useState(false);
  const [integrationApisChecked, setIntegrationApisChecked] = useState(false);
  const [saasEnterpriseChecked, setSaasEnterpriseChecked] = useState(false);

  // Social media checkboxes state
  const [twitterChecked, setTwitterChecked] = useState(false);
  const [mediumChecked, setMediumChecked] = useState(false);
  const [blogChecked, setBlogChecked] = useState(false);
  const [otherChecked, setOtherChecked] = useState(false);
  const [otherSocialMedia, setOtherSocialMedia] = useState("");

  // Branding challenges checkboxes state
  const [consistentNarrativeChecked, setConsistentNarrativeChecked] =
    useState(false);
  const [valuePropositionChecked, setValuePropositionChecked] = useState(false);
  const [engagingContentChecked, setEngagingContentChecked] = useState(false);
  const [findingTimeChecked, setFindingTimeChecked] = useState(false);
  const [growingNetworkChecked, setGrowingNetworkChecked] = useState(false);
  const [sharingInsightsChecked, setSharingInsightsChecked] = useState(false);
  const [engagingNetworkChecked, setEngagingNetworkChecked] = useState(false);
  const [industryEventsChecked, setIndustryEventsChecked] = useState(false);
  const [otherBrandingChecked, setOtherBrandingChecked] = useState(false);
  const [otherBrandingChallenge, setOtherBrandingChallenge] = useState("");

  // Published content checkboxes state
  const [linkedInPostsChecked, setLinkedInPostsChecked] = useState(false);
  const [blogArticlesChecked, setBlogArticlesChecked] = useState(false);
  const [industryPresentationsChecked, setIndustryPresentationsChecked] =
    useState(false);
  const [academicPapersChecked, setAcademicPapersChecked] = useState(false);
  const [neverPublishedChecked, setNeverPublishedChecked] = useState(false);
  const [otherPublishedContentChecked, setOtherPublishedContentChecked] =
    useState(false);
  const [otherPublishedContent, setOtherPublishedContent] = useState("");

  // LinkedIn profile update timing state
  const [lastWeekChecked, setLastWeekChecked] = useState(false);
  const [lastMonthChecked, setLastMonthChecked] = useState(false);
  const [businessSchoolChecked, setBusinessSchoolChecked] = useState(false);
  const [careerCoachChecked, setCareerCoachChecked] = useState(false);
  const [jobChangeChecked, setJobChangeChecked] = useState(false);
  const [cantRememberChecked, setCantRememberChecked] = useState(false);
  const [neverUpdatedChecked, setNeverUpdatedChecked] = useState(false);
  const [otherUpdateTimeChecked, setOtherUpdateTimeChecked] = useState(false);
  const [otherUpdateTime, setOtherUpdateTime] = useState("");

  // LinkedIn activity state
  const [readNewsfeedChecked, setReadNewsfeedChecked] = useState(false);
  const [acceptedConnectionsChecked, setAcceptedConnectionsChecked] =
    useState(false);
  const [notActiveChecked, setNotActiveChecked] = useState(false);
  const [postedNeverChecked, setPostedNeverChecked] = useState(false);
  const [posted12TimesChecked, setPosted12TimesChecked] = useState(false);
  const [posted35TimesChecked, setPosted35TimesChecked] = useState(false);
  const [posted6PlusTimesChecked, setPosted6PlusTimesChecked] = useState(false);
  const [sharedNeverChecked, setSharedNeverChecked] = useState(false);
  const [shared12TimesChecked, setShared12TimesChecked] = useState(false);
  const [shared35TimesChecked, setShared35TimesChecked] = useState(false);
  const [shared6PlusTimesChecked, setShared6PlusTimesChecked] = useState(false);
  const [commentedNeverChecked, setCommentedNeverChecked] = useState(false);
  const [commented12TimesPerMonthChecked, setCommented12TimesPerMonthChecked] =
    useState(false);
  const [commented12TimesPerWeekChecked, setCommented12TimesPerWeekChecked] =
    useState(false);
  const [
    commented3PlusTimesPerWeekChecked,
    setCommented3PlusTimesPerWeekChecked,
  ] = useState(false);
  const [reactedNeverChecked, setReactedNeverChecked] = useState(false);
  const [reactedFewTimesMonthChecked, setReactedFewTimesMonthChecked] =
    useState(false);
  const [reactedFewTimesWeekChecked, setReactedFewTimesWeekChecked] =
    useState(false);
  const [reactedDailyChecked, setReactedDailyChecked] = useState(false);

  // Brand positioning rating (scale 1-5)
  const [brandPositioningRating, setBrandPositioningRating] = useState<
    number | null
  >(null);

  // Content creation comfort rating (scale 1-5)
  const [contentCreationComfort, setContentCreationComfort] = useState<
    number | null
  >(null);

  // Professional brand optimization goals
  const [brandOptimizationGoals, setBrandOptimizationGoals] = useState("");

  // Professional Goals - Step 4
  const [careerGoals, setCareerGoals] = useState(""); // For 2-5 year career goals

  // LinkedIn connections in target industry
  const [industryConnectionsPercentage, setIndustryConnectionsPercentage] =
    useState<string | undefined>(undefined);

  // Personality assessments
  const [mbtiChecked, setMbtiChecked] = useState(false);
  const [strengthsFinderChecked, setStrengthsFinderChecked] = useState(false);
  const [viaChecked, setViaChecked] = useState(false);
  const [enneagramChecked, setEnneagramChecked] = useState(false);
  const [threeSixtyChecked, setThreeSixtyChecked] = useState(false);
  const [otherAssessmentChecked, setOtherAssessmentChecked] = useState(false);
  const [otherAssessment, setOtherAssessment] = useState("");

  // Files and additional information for Step 4
  const [files, setFiles] = useState<File[]>([]);
  const [additionalInfo, setAdditionalInfo] = useState("");
  
  // Add state for auto-save status
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  // Fetch user profile data
  const { data: userProfile, isLoading: profileLoading } =
    useQuery<UserProfile>({
      queryKey: ["/api/user/profile"],
      enabled: !!user,
    });

  // Create/update questionnaire mutation
  const questionnaireMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/questionnaire", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Registration Complete!",
        description:
          "Your account setup is now complete. Thank you for providing your career insights!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
      navigate("/profile");
    },
    onError: () => {
      toast({
        title: "Error",
        description:
          "There was a problem submitting your questionnaire. Please try again.",
        variant: "destructive",
      });
    },
  });
  
  // Save questionnaire as draft mutation
  const saveAsDraftMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/questionnaire/draft", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Draft Saved",
        description:
          "Your questionnaire has been saved as a draft. You can return to complete it later.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description:
          "There was a problem saving your draft. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Auto-save when navigating away from the page
  React.useEffect(() => {
    // Create a function that will be called when the component unmounts
    return () => {
      // Don't auto-save if we're submitting the form (which would redirect anyway)
      if (!questionnaireMutation.isPending) {
        // Since this runs during unmount, we can't use async/await directly
        // We'll use the auto-save function but won't wait for it
        autoSaveQuestionnaire().catch(err => {
          console.error("Error auto-saving on page leave:", err);
        });
      }
    };
  }, []);

  // Initialize form data from user profile if available
  React.useEffect(() => {
    console.log("UserProfile loaded:", userProfile);
    
    if (userProfile?.questionnaire) {
      console.log("Questionnaire data found:", userProfile.questionnaire);
      const q = userProfile.questionnaire;

      // Step 1: Industry & Function
      // Set industry directly from the industry field
      if (q.industry) {
        setIndustry(q.industry);
      }
      // Fallback to the old method if industry field doesn't exist
      else if (q.timeframe && q.timeframe.includes("Industry:")) {
        const industryMatch = q.timeframe.match(/Industry: (.*?)(?:,|$)/);
        if (industryMatch && industryMatch[1]) {
          setIndustry(industryMatch[1].trim());
        }
      }

      // Try to extract job function from timeframe field
      if (q.timeframe && q.timeframe.includes("Function:")) {
        const functionMatch = q.timeframe.match(/Function: (.*?)(?:,|$)/);
        if (functionMatch && functionMatch[1]) {
          setJobFunction(functionMatch[1].trim());
        }
      }

      // Set LinkedIn URL (which is saved in 'background' field)
      setBackground(q.background || "");

      // Set social media details (which is saved in 'goals' field)
      setGoals(q.goals || "");

      // Try to parse social media selections from goals field if it contains our format
      if (q.goals && q.goals.includes("Selected platforms:")) {
        const platformsText = q.goals.split("Selected platforms:")[1].trim();
        setTwitterChecked(platformsText.includes("Twitter/X"));
        setMediumChecked(platformsText.includes("Medium"));
        setBlogChecked(platformsText.includes("Personal blog/Website"));

        // Check for "Other:" entries
        if (platformsText.includes("Other:")) {
          setOtherChecked(true);
          // Try to extract the other value
          const otherMatch = platformsText.match(/Other: (.*?)(?:,|$)/);
          if (otherMatch && otherMatch[1]) {
            setOtherSocialMedia(otherMatch[1].trim());
          }
        }
      }

      // Set branding challenges (stored in aspirations field)
      setAspirations(q.aspirations || "");

      // Try to parse branding challenges from aspirations field if it contains our format
      if (q.aspirations && q.aspirations.includes("Branding challenges:")) {
        const challengesText = q.aspirations
          .split("Branding challenges:")[1]
          .trim();

        // Check each branding challenge and set state accordingly
        setConsistentNarrativeChecked(
          challengesText.includes(
            "Building a consistent professional narrative",
          ),
        );
        setValuePropositionChecked(
          challengesText.includes("Identifying my unique value proposition"),
        );
        setEngagingContentChecked(
          challengesText.includes("Creating engaging content"),
        );
        setFindingTimeChecked(
          challengesText.includes("Finding time to maintain online presence"),
        );
        setGrowingNetworkChecked(
          challengesText.includes("Growing my professional network"),
        );
        setSharingInsightsChecked(
          challengesText.includes(
            "Sharing industry insights and work experiences",
          ),
        );
        setEngagingNetworkChecked(
          challengesText.includes("Engaging with my professional network"),
        );
        setIndustryEventsChecked(
          challengesText.includes(
            "Participating in industry discussions and events",
          ),
        );

        // Check for "Other:" entries in branding challenges
        if (challengesText.includes("Other:")) {
          setOtherBrandingChecked(true);
          // Try to extract the other value
          const otherMatch = challengesText.match(/Other: (.*?)(?:,|$)/);
          if (otherMatch && otherMatch[1]) {
            setOtherBrandingChallenge(otherMatch[1].trim());
          }
        }
      }

      // Try to parse published content data from aspirations field
      if (q.aspirations && q.aspirations.includes("Published content:")) {
        const publishedContentText = q.aspirations
          .split("Published content:")[1]
          .trim()
          .split("\n")[0];

        // Check each published content type and set state accordingly
        setLinkedInPostsChecked(
          publishedContentText.includes("LinkedIn posts"),
        );
        setBlogArticlesChecked(publishedContentText.includes("Blog articles"));
        setIndustryPresentationsChecked(
          publishedContentText.includes("Industry presentations"),
        );
        setAcademicPapersChecked(
          publishedContentText.includes("Academic papers"),
        );
        setNeverPublishedChecked(
          publishedContentText.includes("Never published professional content"),
        );

        // Check for "Other:" entries in published content
        if (publishedContentText.includes("Other:")) {
          setOtherPublishedContentChecked(true);
          // Try to extract the other value
          const otherMatch = publishedContentText.match(/Other: (.*?)(?:,|$)/);
          if (otherMatch && otherMatch[1]) {
            setOtherPublishedContent(otherMatch[1].trim());
          }
        }
      }

      // Try to parse LinkedIn profile update timing data from aspirations field
      if (
        q.aspirations &&
        q.aspirations.includes("LinkedIn profile update timing:")
      ) {
        const updateTimingText = q.aspirations
          .split("LinkedIn profile update timing:")[1]
          .trim()
          .split("\n")[0];

        // Check each update timing option and set state accordingly
        setLastWeekChecked(updateTimingText.includes("Within the last week"));
        setLastMonthChecked(updateTimingText.includes("Within the last month"));
        setBusinessSchoolChecked(
          updateTimingText.includes("For / during business school"),
        );
        setCareerCoachChecked(
          updateTimingText.includes("After I spoke with a career coach"),
        );
        setJobChangeChecked(
          updateTimingText.includes("When I last changed jobs"),
        );
        setCantRememberChecked(updateTimingText.includes("I can't remember"));
        setNeverUpdatedChecked(
          updateTimingText.includes(
            "I've never really updated it beyond creating the profile",
          ),
        );

        // Check for "Other:" entries in update timing
        if (updateTimingText.includes("Other:")) {
          setOtherUpdateTimeChecked(true);
          // Try to extract the other value
          const otherMatch = updateTimingText.match(/Other: (.*?)(?:,|$)/);
          if (otherMatch && otherMatch[1]) {
            setOtherUpdateTime(otherMatch[1].trim());
          }
        }
      }

      // Try to parse LinkedIn activity data from aspirations field
      if (q.aspirations && q.aspirations.includes("LinkedIn activity:")) {
        const activityText = q.aspirations
          .split("LinkedIn activity:")[1]
          .trim()
          .split("\n")[0];

        // Check each activity option and set state accordingly
        setReadNewsfeedChecked(activityText.includes("Read your Newsfeed"));
        setAcceptedConnectionsChecked(
          activityText.includes("Accepted Connections"),
        );
        setNotActiveChecked(
          activityText.includes("Not Active in the Last Month"),
        );
        setPostedNeverChecked(
          activityText.includes("Posted Original Content - Never"),
        );
        setPosted12TimesChecked(
          activityText.includes("Posted Original Content - 1-2 times"),
        );
        setPosted35TimesChecked(
          activityText.includes("Posted Original Content - 3-5 times"),
        );
        setPosted6PlusTimesChecked(
          activityText.includes("Posted Original Content - 6+ times"),
        );
        setSharedNeverChecked(
          activityText.includes("Shared Others' Posts - Never"),
        );
        setShared12TimesChecked(
          activityText.includes("Shared Others' Posts - 1-2 times"),
        );
        setShared35TimesChecked(
          activityText.includes("Shared Others' Posts - 3-5 times"),
        );
        setShared6PlusTimesChecked(
          activityText.includes("Shared Others' Posts - 6+ times"),
        );
        setCommentedNeverChecked(
          activityText.includes("Commented on Posts - Never"),
        );
        setCommented12TimesPerMonthChecked(
          activityText.includes("Commented on Posts - 1-2 times per month"),
        );
        setCommented12TimesPerWeekChecked(
          activityText.includes("Commented on Posts - 1-2 times per week"),
        );
        setCommented3PlusTimesPerWeekChecked(
          activityText.includes("Commented on Posts - 3+ times per week"),
        );
        setReactedNeverChecked(
          activityText.includes("Reacted to Posts (likes, etc.) - Never"),
        );
        setReactedFewTimesMonthChecked(
          activityText.includes(
            "Reacted to Posts (likes, etc.) - A few times a month",
          ),
        );
        setReactedFewTimesWeekChecked(
          activityText.includes(
            "Reacted to Posts (likes, etc.) - A few times a week",
          ),
        );
        setReactedDailyChecked(
          activityText.includes("Reacted to Posts (likes, etc.) - Daily"),
        );
      }

      // Try to parse brand positioning rating from aspirations field
      if (
        q.aspirations &&
        q.aspirations.includes("Brand positioning rating:")
      ) {
        const ratingText = q.aspirations
          .split("Brand positioning rating:")[1]
          .trim()
          .split("\n")[0];
        if (ratingText.includes("1")) setBrandPositioningRating(1);
        else if (ratingText.includes("2")) setBrandPositioningRating(2);
        else if (ratingText.includes("3")) setBrandPositioningRating(3);
        else if (ratingText.includes("4")) setBrandPositioningRating(4);
        else if (ratingText.includes("5")) setBrandPositioningRating(5);
      }

      // Try to parse content creation comfort from aspirations field
      if (
        q.aspirations &&
        q.aspirations.includes("Content creation comfort:")
      ) {
        const comfortText = q.aspirations
          .split("Content creation comfort:")[1]
          .trim()
          .split("\n")[0];
        if (comfortText.includes("1")) setContentCreationComfort(1);
        else if (comfortText.includes("2")) setContentCreationComfort(2);
        else if (comfortText.includes("3")) setContentCreationComfort(3);
        else if (comfortText.includes("4")) setContentCreationComfort(4);
        else if (comfortText.includes("5")) setContentCreationComfort(5);
      }

      // Try to parse brand optimization goals from aspirations field
      if (
        q.aspirations &&
        q.aspirations.includes("Brand optimization goals:")
      ) {
        const goalsText = q.aspirations
          .split("Brand optimization goals:")[1]
          .trim();
        // If there's another section after this one, only get the text up to that section
        if (goalsText.includes("\n\n")) {
          setBrandOptimizationGoals(goalsText.split("\n\n")[0].trim());
        } else {
          setBrandOptimizationGoals(goalsText);
        }
      }

      // Set other questionnaire fields
      setChallenges(q.challenges || "");
      setInterests(q.interests || "");
      setTimeframe(q.timeframe || "");

      // Step 5: Load professional goals
      // Try to parse career goals from aspirations field
      if (q.aspirations && q.aspirations.includes("Career goals:")) {
        const careerGoalsText = q.aspirations
          .split("Career goals:")[1]
          .trim()
          .split("\n\n")[0];
        setCareerGoals(careerGoalsText || "");
      }

      // Try to parse professional areas for thought leadership
      if (
        q.aspirations &&
        q.aspirations.includes("Professional areas for thought leadership:")
      ) {
        const areasText = q.aspirations
          .split("Professional areas for thought leadership:")[1]
          .trim()
          .split("\n\n")[0];
        if (areasText && areasText !== "Not specified") {
          setProfessionalAreas(areasText);
        }
      }

      // Try to parse additional info
      if (
        q.aspirations &&
        q.aspirations.includes("Additional professional journey information:")
      ) {
        // Extract additional info, but make sure to limit to just this section by splitting on newlines
        const fullText = q.aspirations.split(
          "Additional professional journey information:",
        )[1];
        if (fullText) {
          // If there's another section header after this one, only get text up to that point
          const nextSectionIndex = fullText.indexOf("\n\n");
          const additionalInfoText =
            nextSectionIndex > 0
              ? fullText.substring(0, nextSectionIndex).trim()
              : fullText.trim();

          setAdditionalInfo(additionalInfoText || "");
        }
      }

      // Try to parse industry connections percentage
      if (
        q.aspirations &&
        q.aspirations.includes("LinkedIn connections percentage:")
      ) {
        const connectionsText = q.aspirations
          .split("LinkedIn connections percentage:")[1]
          ?.trim()
          .split("\n")[0];
        if (connectionsText) {
          if (connectionsText.includes("0-10%"))
            setIndustryConnectionsPercentage("0-10%");
          else if (connectionsText.includes("10-25%"))
            setIndustryConnectionsPercentage("10-25%");
          else if (connectionsText.includes("25-50%"))
            setIndustryConnectionsPercentage("25-50%");
          else if (connectionsText.includes("50%+"))
            setIndustryConnectionsPercentage("50%+");
          else if (connectionsText.includes("not-sure"))
            setIndustryConnectionsPercentage("not-sure");
        }
      }

      // Step 4: Parse industry interests
      if (q.aspirations && q.aspirations.includes("Industry interests:")) {
        const industryInterestsText = q.aspirations
          .split("Industry interests:")[1]
          ?.trim()
          .split("\n")[0];
        if (industryInterestsText) {
          setConsultingChecked(industryInterestsText.includes("Consulting"));
          setConsumerRetailChecked(
            industryInterestsText.includes("Consumer Products / Retail"),
          );
          setFinancialServicesChecked(
            industryInterestsText.includes("Financial Services"),
          );
          setGlobalMarketsChecked(
            industryInterestsText.includes("Global Markets"),
          );
          setGovernmentChecked(
            industryInterestsText.includes("Government / Public Sector"),
          );
          setHealthcareChecked(industryInterestsText.includes("Healthcare"));
          setInnovationChecked(
            industryInterestsText.includes("Innovation / R&D"),
          );
          setManufacturingChecked(
            industryInterestsText.includes("Manufacturing"),
          );
          setSocialImpactChecked(
            industryInterestsText.includes("Social Impact / ESG"),
          );
          setTechnologyChecked(industryInterestsText.includes("Technology"));
        }
      }

      // Enhanced JSON parsing from aspirations field
      let jsonData = null;
      try {
        // Only attempt to parse if aspirations field exists
        if (q.aspirations) {
          console.log("Aspirations field exists, attempting to extract JSON");
          
          // Look for a JSON structure in the aspirations field using a reliable regex
          const jsonMatch = q.aspirations.match(/\{[\s\S]*?\}/);
          
          if (jsonMatch) {
            console.log("Found potential JSON match in aspirations");
            
            try {
              jsonData = JSON.parse(jsonMatch[0]);
              console.log("Successfully parsed JSON data with keys:", Object.keys(jsonData));
              
              // Step 4: Industry Interests - detailed logging for troubleshooting
              if (jsonData.industryInterests) {
                console.log("Loading industry interests from JSON:", 
                  Object.keys(jsonData.industryInterests).join(", "));
                
                // Direct mappings
                if (jsonData.industryInterests.consulting) {
                  console.log("Setting consulting interest");
                  setConsultingChecked(true);
                }
                if (jsonData.industryInterests.consumerRetail) {
                  console.log("Setting consumer retail interest");
                  setConsumerRetailChecked(true);
                }
                if (jsonData.industryInterests.financialServices) {
                  console.log("Setting financial services interest");
                  setFinancialServicesChecked(true);
                }
                if (jsonData.industryInterests.globalMarkets) {
                  console.log("Setting global markets interest");
                  setGlobalMarketsChecked(true);
                }
                if (jsonData.industryInterests.government) {
                  console.log("Setting government interest");
                  setGovernmentChecked(true);
                }
                if (jsonData.industryInterests.healthcare) {
                  console.log("Setting healthcare interest");
                  setHealthcareChecked(true);
                }
                if (jsonData.industryInterests.innovation) {
                  console.log("Setting innovation interest");
                  setInnovationChecked(true);
                }
                if (jsonData.industryInterests.manufacturing) {
                  console.log("Setting manufacturing interest");
                  setManufacturingChecked(true);
                }
                if (jsonData.industryInterests.socialImpact) {
                  console.log("Setting social impact interest");
                  setSocialImpactChecked(true);
                }
                if (jsonData.industryInterests.technology) {
                  console.log("Setting technology interest");
                  setTechnologyChecked(true);
                }
                
                // Additional mappings for compatibility
                if (jsonData.industryInterests.mediaEntertainment) setGlobalMarketsChecked(true);
                if (jsonData.industryInterests.nonprofit) setInnovationChecked(true);
              }
              
              // Step 4: Cross-cutting interests - detailed logging
              if (jsonData.crossCuttingInterests) {
                console.log("Loading cross-cutting interests from JSON:", 
                  Object.keys(jsonData.crossCuttingInterests).join(", "));
                
                // Set checkboxes based on JSON data with detailed logging
                if (jsonData.crossCuttingInterests.climate) {
                  console.log("Setting climate interest");
                  setClimateChecked(true);
                }
                if (jsonData.crossCuttingInterests.consumerBehavior) {
                  console.log("Setting consumer behavior interest");
                  setConsumerBehaviorChecked(true);
                }
                if (jsonData.crossCuttingInterests.crimeJustice) {
                  console.log("Setting crime justice interest");
                  setCrimeJusticeChecked(true);
                }
                if (jsonData.crossCuttingInterests.digitalTransformation) {
                  console.log("Setting digital transformation interest");
                  setDigitalTransformationAIChecked(true);
                }
                if (jsonData.crossCuttingInterests.education) {
                  console.log("Setting education interest");
                  setEducationLearningChecked(true);
                }
                if (jsonData.crossCuttingInterests.emergingMarkets) {
                  console.log("Setting emerging markets interest");
                  setEmergingMarketsChecked(true);
                }
                if (jsonData.crossCuttingInterests.entertainment) {
                  console.log("Setting entertainment interest");
                  setEntertainmentArtsChecked(true);
                }
                if (jsonData.crossCuttingInterests.financialInnovation) {
                  console.log("Setting financial innovation interest");
                  setFinancialInnovationChecked(true);
                }
                if (jsonData.crossCuttingInterests.futureOfWork) {
                  console.log("Setting future of work interest");
                  setFutureOfWorkChecked(true);
                }
                if (jsonData.crossCuttingInterests.globalEconomy) {
                  console.log("Setting global economy interest");
                  setGlobalEconomyChecked(true);
                }
                if (jsonData.crossCuttingInterests.geopolitics) {
                  console.log("Setting geopolitics interest");
                  setGeopoliticsChecked(true);
                }
                
                // Alternative field names for compatibility
                if (jsonData.crossCuttingInterests.dei) setSocialImpactDEIChecked(true);
                if (jsonData.crossCuttingInterests.economics) setGlobalEconomyChecked(true);
                if (jsonData.crossCuttingInterests.governance) setGeopoliticsChecked(true);
                if (jsonData.crossCuttingInterests.innovation) setFinancialInnovationChecked(true);
                if (jsonData.crossCuttingInterests.leadership) setFutureOfWorkChecked(true);
                if (jsonData.crossCuttingInterests.policy) setUsPoliticsChecked(true);
                if (jsonData.crossCuttingInterests.sustainability) setClimateChecked(true);
              }
              
              // Step 4: Content format preferences
              if (jsonData.contentFormatPreferences) {
                console.log("Loading content format preferences from JSON:", 
                  Object.keys(jsonData.contentFormatPreferences).join(", "));
                
                if (jsonData.contentFormatPreferences.sharingNews) setSharingNewsChecked(true);
                if (jsonData.contentFormatPreferences.writingExperiences) setWritingExperiencesChecked(true);
                if (jsonData.contentFormatPreferences.analyzingTrends) setAnalyzingTrendsChecked(true);
                if (jsonData.contentFormatPreferences.commentingPosts) setCommentingPostsChecked(true);
                if (jsonData.contentFormatPreferences.howToContent) setHowToContentChecked(true);
                if (jsonData.contentFormatPreferences.eventTakeaways) setEventTakeawaysChecked(true);
                if (jsonData.contentFormatPreferences.personalAnecdote) setPersonalAnecdoteChecked(true);
                if (jsonData.contentFormatPreferences.digitalCommunities) setDigitalCommunitiesChecked(true);
                
                if (jsonData.contentFormatPreferences.other) {
                  setOtherContentFormatChecked(true);
                  // Handle both formats of other content
                  if (typeof jsonData.contentFormatPreferences.other === 'string') {
                    setOtherContentFormat(jsonData.contentFormatPreferences.other);
                  } else if (jsonData.contentFormatPreferences.otherText) {
                    setOtherContentFormat(jsonData.contentFormatPreferences.otherText);
                  }
                }
              }
              
              // Step 4: Posting barriers
              if (jsonData.postingBarriers) {
                console.log("Loading posting barriers from JSON:", 
                  Object.keys(jsonData.postingBarriers).join(", "));
                
                if (jsonData.postingBarriers.unsureWhatToSay) setUnsureWhatToSayChecked(true);
                if (jsonData.postingBarriers.fearOfJudgment) setFearOfJudgmentChecked(true);
                if (jsonData.postingBarriers.timeManagement) setTimeManagementChecked(true);
                if (jsonData.postingBarriers.dontKnowHowToStart) setDontKnowHowToStartChecked(true);
                if (jsonData.postingBarriers.unclearProfessionalVoice) setUnclearProfessionalVoiceChecked(true);
                
                if (jsonData.postingBarriers.other) {
                  setOtherBarrierChecked(true);
                  // Handle both formats of other barrier
                  if (typeof jsonData.postingBarriers.other === 'string') {
                    setOtherBarrier(jsonData.postingBarriers.other);
                  } else if (jsonData.postingBarriers.otherText) {
                    setOtherBarrier(jsonData.postingBarriers.otherText);
                  }
                }
              }
              
              // Step 5: LinkedIn connections percentage
              if (jsonData.linkedinConnectionsPercentage !== undefined) {
                console.log("Setting LinkedIn connections percentage:", jsonData.linkedinConnectionsPercentage);
                setIndustryConnectionsPercentage(jsonData.linkedinConnectionsPercentage);
              }
              
              // Step 5: LinkedIn activity - detailed logging for troubleshooting
              if (jsonData.linkedinActivity) {
                console.log("Loading LinkedIn activity from JSON:", 
                  Object.keys(jsonData.linkedinActivity).join(", "));
                
                if (jsonData.linkedinActivity.readNewsfeed) {
                  console.log("Setting read newsfeed checked");
                  setReadNewsfeedChecked(true);
                }
                if (jsonData.linkedinActivity.acceptedConnections) {
                  console.log("Setting accepted connections checked");
                  setAcceptedConnectionsChecked(true);
                }
                if (jsonData.linkedinActivity.notActive) {
                  console.log("Setting not active checked");
                  setNotActiveChecked(true);
                }
                if (jsonData.linkedinActivity.postedNever) {
                  console.log("Setting posted never checked");
                  setPostedNeverChecked(true);
                }
                if (jsonData.linkedinActivity.posted12Times) {
                  console.log("Setting posted 1-2 times checked");
                  setPosted12TimesChecked(true);
                }
                if (jsonData.linkedinActivity.posted35Times) {
                  console.log("Setting posted 3-5 times checked");
                  setPosted35TimesChecked(true);
                }
                // Skip fields not present in this version of the app
                // Fields like posted612Times, posted12PlusMonthly, postedRegularly may exist
                // in the saved data but we don't have state variables for them in this version
              }
              
              // Step 5: Other fields
              if (jsonData.careerGoals) {
                console.log("Setting career goals");
                setCareerGoals(jsonData.careerGoals);
              }
              
              if (jsonData.brandOptimizationGoals) {
                console.log("Setting brand optimization goals");
                setBrandOptimizationGoals(jsonData.brandOptimizationGoals);
              }
              
              // Step 5: Personality assessments
              if (jsonData.personalityAssessments) {
                console.log("Loading personality assessments from JSON:", 
                  Object.keys(jsonData.personalityAssessments).join(", "));
                
                if (jsonData.personalityAssessments.mbti) {
                  console.log("Setting MBTI checked");
                  setMbtiChecked(true);
                }
                if (jsonData.personalityAssessments.strengthsFinder) {
                  console.log("Setting Strengths Finder checked");
                  setStrengthsFinderChecked(true);
                }
                if (jsonData.personalityAssessments.via) {
                  console.log("Setting VIA checked");
                  setViaChecked(true);
                }
                if (jsonData.personalityAssessments.enneagram) {
                  console.log("Setting Enneagram checked");
                  setEnneagramChecked(true);
                }
                if (jsonData.personalityAssessments.threeSixty) {
                  console.log("Setting 360* checked");
                  setThreeSixtyChecked(true);
                }
                
                if (jsonData.personalityAssessments.other) {
                  setOtherAssessmentChecked(true);
                  // Handle both formats of other assessment
                  if (typeof jsonData.personalityAssessments.other === 'string') {
                    setOtherAssessment(jsonData.personalityAssessments.other);
                  } else if (jsonData.personalityAssessments.otherText) {
                    setOtherAssessment(jsonData.personalityAssessments.otherText);
                  }
                }
              }
              
              // Step 5: Update time
              if (jsonData.updateTime) {
                console.log("Loading update time from JSON:", 
                  Object.keys(jsonData.updateTime).join(", "));
                
                if (jsonData.updateTime.lastWeek) {
                  console.log("Setting last week checked");
                  setLastWeekChecked(true);
                }
                if (jsonData.updateTime.lastMonth) {
                  console.log("Setting last month checked");
                  setLastMonthChecked(true);
                }
                if (jsonData.updateTime.businessSchool) {
                  console.log("Setting business school checked");
                  setBusinessSchoolChecked(true);
                }
                if (jsonData.updateTime.careerCoach) {
                  console.log("Setting career coach checked");
                  setCareerCoachChecked(true);
                }
                if (jsonData.updateTime.jobChange) {
                  console.log("Setting job change checked");
                  setJobChangeChecked(true);
                }
                if (jsonData.updateTime.cantRemember) {
                  console.log("Setting can't remember checked");
                  setCantRememberChecked(true);
                }
                if (jsonData.updateTime.neverUpdated) {
                  console.log("Setting never updated checked");
                  setNeverUpdatedChecked(true);
                }
                
                if (jsonData.updateTime.other) {
                  setOtherUpdateTimeChecked(true);
                  // Handle both formats of other update time
                  if (typeof jsonData.updateTime.other === 'string') {
                    setOtherUpdateTime(jsonData.updateTime.other);
                  } else if (jsonData.updateTime.otherText) {
                    setOtherUpdateTime(jsonData.updateTime.otherText);
                  }
                }
              }
            } catch (innerErr) {
              console.error("Error parsing JSON from questionnaire:", innerErr);
            }
          } else {
            console.log("No JSON structure found in aspirations");
          }
        } else {
          console.log("No aspirations field in questionnaire");
        }
      } catch (err) {
        console.error("Error in JSON parsing process:", err);
      }
        
      // Parse societal interests from text format if JSON data wasn't already loaded
      if (
        q.aspirations &&
        q.aspirations.includes("Cross-cutting & societal interests:") &&
        // Only try this if we don't have crossCuttingInterests data from JSON parse already
        !(jsonData && jsonData.crossCuttingInterests)
      ) {
        console.log("Attempting to load cross-cutting interests from text format");
        const societalInterestsText = q.aspirations
          .split("Cross-cutting & societal interests:")[1]
          ?.trim()
          .split("\n")[0];
        if (societalInterestsText) {
          setClimateChecked(
            societalInterestsText.includes("Climate Change & Sustainability"),
          );
          setConsumerBehaviorChecked(
            societalInterestsText.includes("Consumer Behavior & Culture"),
          );
          setCrimeJusticeChecked(
            societalInterestsText.includes("Crime & Justice"),
          );
          setDigitalTransformationAIChecked(
            societalInterestsText.includes("Digital Transformation/AI"),
          );
          setEducationLearningChecked(
            societalInterestsText.includes("Education & Learning"),
          );
          setEmergingMarketsChecked(
            societalInterestsText.includes("Emerging Markets"),
          );
          setEntertainmentArtsChecked(
            societalInterestsText.includes("Entertainment & Arts"),
          );
          setFinancialInnovationChecked(
            societalInterestsText.includes("Financial Innovation"),
          );
          setFutureOfWorkChecked(
            societalInterestsText.includes("Future of Work"),
          );
          setGlobalEconomyChecked(
            societalInterestsText.includes("Global Economy"),
          );
          setGeopoliticsChecked(
            societalInterestsText.includes(
              "Geopolitics & International Relations",
            ),
          );
          setHealthWellnessChecked(
            societalInterestsText.includes("Health & Wellness"),
          );
          setHealthcareInnovationChecked(
            societalInterestsText.includes("Healthcare Innovation"),
          );
          setSocialImpactDEIChecked(
            societalInterestsText.includes("Social Impact & DEI"),
          );
          setSportsRecreationChecked(
            societalInterestsText.includes("Sports & Recreation"),
          );
          setTravelTourismChecked(
            societalInterestsText.includes("Travel & Tourism"),
          );
          setUrbanDevelopmentChecked(
            societalInterestsText.includes("Urban Development"),
          );
          setUsPoliticsChecked(
            societalInterestsText.includes("US Politics & Governance"),
          );
        }
      }

      // Parse technology subcategories if technology is selected
      if (
        technologyChecked &&
        q.aspirations &&
        q.aspirations.includes("Technology subcategories:")
      ) {
        const techSubcategoriesText = q.aspirations
          .split("Technology subcategories:")[1]
          ?.trim()
          .split("\n")[0];
        if (techSubcategoriesText) {
          // AI/ML
          setAiConsumerChecked(
            techSubcategoriesText.includes("AI - Consumer Applications"),
          );
          setAiComputerVisionChecked(
            techSubcategoriesText.includes("AI - Computer Vision"),
          );
          setAiEthicsChecked(
            techSubcategoriesText.includes("AI - Ethics & Governance"),
          );
          setAiInfrastructureChecked(
            techSubcategoriesText.includes("AI - Infrastructure"),
          );
          setAiNlpChecked(
            techSubcategoriesText.includes("AI - Natural Language Processing"),
          );
          setAiPredictiveChecked(
            techSubcategoriesText.includes("AI - Predictive Analytics"),
          );
          setAiRoboticsChecked(
            techSubcategoriesText.includes("AI - Robotics & Automation"),
          );
          setAiScientificChecked(
            techSubcategoriesText.includes("AI - Scientific Applications"),
          );
          setAiLearningChecked(
            techSubcategoriesText.includes("ML - Machine Learning"),
          );

          // Consumer Technology
          setConsumerDevicesChecked(
            techSubcategoriesText.includes("Consumer Devices"),
          );
          setConsumerGamingChecked(
            techSubcategoriesText.includes("Consumer Gaming"),
          );
          setConsumerMobileChecked(
            techSubcategoriesText.includes("Consumer Mobile Tech"),
          );
          setConsumerSmartHomeChecked(
            techSubcategoriesText.includes("Consumer Smart Home"),
          );

          // Cybersecurity & Privacy
          setCybersecuritySolutionsChecked(
            techSubcategoriesText.includes("Cybersecurity Solutions"),
          );
          setDataPrivacyChecked(techSubcategoriesText.includes("Data Privacy"));
          setRegulatoryComplianceChecked(
            techSubcategoriesText.includes("Regulatory Compliance"),
          );
          setRiskManagementChecked(
            techSubcategoriesText.includes("Risk Management"),
          );

          // Digital Infrastructure
          setCloudComputingChecked(
            techSubcategoriesText.includes("Cloud Computing"),
          );
          setDataCentersChecked(techSubcategoriesText.includes("Data Centers"));
          setNetworksChecked(techSubcategoriesText.includes("Networks"));
          setWeb3BlockchainChecked(
            techSubcategoriesText.includes("Web3 / Blockchain"),
          );

          // Digital Media & Content
          setContentDistributionChecked(
            techSubcategoriesText.includes("Content Distribution"),
          );
          setCreatorEconomyChecked(
            techSubcategoriesText.includes("Creator Economy"),
          );
          setDigitalMarketingChecked(
            techSubcategoriesText.includes("Digital Marketing"),
          );
          setSocialMediaPlatformsChecked(
            techSubcategoriesText.includes("Social Media Platforms"),
          );

          // Emerging Technology
          setArVrXrChecked(techSubcategoriesText.includes("AR / VR / XR"));
          setBiotechHealthChecked(
            techSubcategoriesText.includes("Biotech / Health Tech"),
          );
          setQuantumComputingChecked(
            techSubcategoriesText.includes("Quantum Computing"),
          );
          setEmergingRoboticsChecked(
            techSubcategoriesText.includes("Robotics & Automation"),
          );

          // Enterprise Technology
          setBusinessAppsChecked(
            techSubcategoriesText.includes("Business Applications"),
          );
          setEnterpriseDigitalTransformationChecked(
            techSubcategoriesText.includes("Digital Transformation"),
          );
          setIntegrationApisChecked(
            techSubcategoriesText.includes("Integration & APIs"),
          );
          setSaasEnterpriseChecked(
            techSubcategoriesText.includes("SaaS / Enterprise Software"),
          );
        }
      }

      // Json data was fully processed above
      
      // Try to parse personality assessments as before
      if (q.aspirations && q.aspirations.includes("Personality assessments:")) {
        const assessmentsText = q.aspirations
          .split("Personality assessments:")[1]
          ?.trim()
          .split("\n")[0];
        if (assessmentsText) {
          setMbtiChecked(assessmentsText.includes("MBTI"));
          setStrengthsFinderChecked(
            assessmentsText.includes("Strengths Finder"),
          );
          setViaChecked(assessmentsText.includes("VIA"));
          setEnneagramChecked(assessmentsText.includes("Enneagram"));
          setThreeSixtyChecked(assessmentsText.includes("360*"));

          if (assessmentsText.includes("Other:")) {
            setOtherAssessmentChecked(true);
            const otherMatch = assessmentsText.match(/Other: (.*?)(?:,|$)/);
            if (otherMatch && otherMatch[1]) {
              setOtherAssessment(otherMatch[1].trim());
            }
          }
        }
      }

      // Parse content format preferences
      if (
        q.aspirations &&
        q.aspirations.includes("Content creation format preferences:")
      ) {
        const formatText = q.aspirations
          .split("Content creation format preferences:")[1]
          ?.trim()
          .split("\n")[0];
        if (formatText) {
          setSharingNewsChecked(formatText.includes("Sharing industry news"));
          setWritingExperiencesChecked(
            formatText.includes("Writing about your learned experiences"),
          );
          setAnalyzingTrendsChecked(formatText.includes("Analyzing trends"));
          setCommentingPostsChecked(
            formatText.includes("Commenting on others"),
          );
          setHowToContentChecked(
            formatText.includes("Creating how-to content"),
          );
          setEventTakeawaysChecked(
            formatText.includes("Sharing event takeaways"),
          );
          setPersonalAnecdoteChecked(formatText.includes("Personal anecdote"));
          setDigitalCommunitiesChecked(
            formatText.includes("Digital communities"),
          );

          if (formatText.includes("Other:")) {
            setOtherContentFormatChecked(true);
            const otherMatch = formatText.match(/Other: (.*?)(?:,|$)/);
            if (otherMatch && otherMatch[1]) {
              setOtherContentFormat(otherMatch[1].trim());
            }
          }
        }
      }

      // Parse posting barriers
      if (q.aspirations && q.aspirations.includes("Posting barriers:")) {
        const barriersText = q.aspirations
          .split("Posting barriers:")[1]
          ?.trim()
          .split("\n")[0];
        if (barriersText) {
          setUnsureWhatToSayChecked(
            barriersText.includes("Unsure what to say"),
          );
          setFearOfJudgmentChecked(barriersText.includes("Fear of judgment"));
          setTimeManagementChecked(barriersText.includes("Time management"));
          setDontKnowHowToStartChecked(
            barriersText.includes("Don't know how to start"),
          );
          setUnclearProfessionalVoiceChecked(
            barriersText.includes("Unclear on professional voice"),
          );

          if (barriersText.includes("Other:")) {
            setOtherBarrierChecked(true);
            const otherMatch = barriersText.match(/Other: (.*?)(?:,|$)/);
            if (otherMatch && otherMatch[1]) {
              setOtherBarrier(otherMatch[1].trim());
            }
          }
        }
      }
    }
  }, [userProfile]);

  // Validate current step fields
  const validateCurrentStep = () => {
    if (currentStep === 1) {
      // Step 1: Require industry and function selection
      const hasIndustry = industry.trim() !== "";
      const hasFunction = jobFunction.trim() !== "";

      // Show toast for missing fields
      if (!hasIndustry || !hasFunction) {
        toast({
          title: "Required Fields Missing",
          description: !hasIndustry
            ? "Please select your current or prior industry"
            : "Please select your current or prior function",
          variant: "destructive",
        });
      }

      return hasIndustry && hasFunction;
    } else if (currentStep === 2) {
      // Step 2: Require only LinkedIn URL (social media platforms are optional now)
      const hasLinkedInUrl = background.trim() !== "";

      // Show toast for missing fields
      if (!hasLinkedInUrl) {
        toast({
          title: "Required Field Missing",
          description: "Please enter your LinkedIn URL",
          variant: "destructive",
        });
      }

      return hasLinkedInUrl;
    } else if (currentStep === 3) {
      // Step 3: Require branding challenges, published content, and content creation comfort
      const hasBrandingChallengeSelected =
        consistentNarrativeChecked ||
        valuePropositionChecked ||
        engagingContentChecked ||
        findingTimeChecked ||
        growingNetworkChecked ||
        sharingInsightsChecked ||
        engagingNetworkChecked ||
        industryEventsChecked ||
        (otherBrandingChecked && otherBrandingChallenge.trim() !== "");

      const hasPublishedContentSelected =
        linkedInPostsChecked ||
        blogArticlesChecked ||
        industryPresentationsChecked ||
        academicPapersChecked ||
        neverPublishedChecked ||
        (otherPublishedContentChecked && otherPublishedContent.trim() !== "");

      const hasContentComfortSelected = contentCreationComfort !== null;

      // Show toast for missing fields
      if (
        !hasBrandingChallengeSelected ||
        !hasPublishedContentSelected ||
        !hasContentComfortSelected
      ) {
        toast({
          title: "Required Fields Missing",
          description: !hasBrandingChallengeSelected
            ? "Please select at least one branding challenge"
            : !hasPublishedContentSelected
              ? "Please select at least one type of content you've published"
              : "Please rate your comfort level with creating professional content",
          variant: "destructive",
        });
      }

      return (
        hasBrandingChallengeSelected &&
        hasPublishedContentSelected &&
        hasContentComfortSelected
      );
    } else if (currentStep === 4) {
      // Step 4: Require at least one industry interest, one societal interest,
      // one content creation format preference, and one posting barrier
      const hasIndustryInterestSelected =
        consultingChecked ||
        consumerRetailChecked ||
        financialServicesChecked ||
        globalMarketsChecked ||
        governmentChecked ||
        healthcareChecked ||
        innovationChecked ||
        manufacturingChecked ||
        socialImpactChecked ||
        technologyChecked;

      const hasSocietalInterestSelected =
        climateChecked ||
        consumerBehaviorChecked ||
        crimeJusticeChecked ||
        digitalTransformationAIChecked ||
        educationLearningChecked ||
        emergingMarketsChecked ||
        entertainmentArtsChecked ||
        financialInnovationChecked ||
        futureOfWorkChecked ||
        globalEconomyChecked ||
        geopoliticsChecked ||
        healthWellnessChecked ||
        healthcareInnovationChecked ||
        socialImpactDEIChecked ||
        sportsRecreationChecked ||
        travelTourismChecked ||
        urbanDevelopmentChecked ||
        usPoliticsChecked;

      // Check if at least one content creation format is selected
      const hasContentFormatSelected =
        sharingNewsChecked ||
        writingExperiencesChecked ||
        analyzingTrendsChecked ||
        commentingPostsChecked ||
        howToContentChecked ||
        eventTakeawaysChecked ||
        personalAnecdoteChecked ||
        digitalCommunitiesChecked ||
        otherContentFormatChecked;

      // Check if at least one posting barrier is selected
      const hasPostingBarrierSelected =
        unsureWhatToSayChecked ||
        fearOfJudgmentChecked ||
        timeManagementChecked ||
        dontKnowHowToStartChecked ||
        unclearProfessionalVoiceChecked ||
        otherBarrierChecked;

      // Show toast for missing fields
      if (
        !hasIndustryInterestSelected ||
        !hasSocietalInterestSelected ||
        !hasContentFormatSelected ||
        !hasPostingBarrierSelected
      ) {
        let missingField = "";
        if (!hasIndustryInterestSelected) {
          missingField = "Please select at least one industry interest";
        } else if (!hasSocietalInterestSelected) {
          missingField = "Please select at least one societal interest";
        } else if (!hasContentFormatSelected) {
          missingField =
            "Please select at least one content format that feels natural to you";
        } else if (!hasPostingBarrierSelected) {
          missingField = "Please select at least one posting barrier";
        }

        toast({
          title: "Required Fields Missing",
          description: missingField,
          variant: "destructive",
        });
      }

      return (
        hasIndustryInterestSelected &&
        hasSocietalInterestSelected &&
        hasContentFormatSelected &&
        hasPostingBarrierSelected
      );
    } else if (currentStep === 5) {
      // Step 5: Only require industry connections percentage
      // Career goals and file upload are NOT required
      const hasConnectionsPercentage =
        industryConnectionsPercentage !== undefined;

      // Show toast for missing fields
      if (!hasConnectionsPercentage) {
        toast({
          title: "Required Fields Missing",
          description: "Please select your LinkedIn connections percentage",
          variant: "destructive",
        });
      }

      return hasConnectionsPercentage;
    }
    return false;
  };

  // Function to prepare form data for saving
  const prepareFormData = () => {
    // Prepare social media data
    const socialMediaOptions = [];
    if (twitterChecked) socialMediaOptions.push("Twitter/X");
    if (mediumChecked) socialMediaOptions.push("Medium");
    if (blogChecked) socialMediaOptions.push("Personal blog/Website");
    if (otherChecked && otherSocialMedia.trim() !== "") {
      socialMediaOptions.push(`Other: ${otherSocialMedia.trim()}`);
    }

    // Update goals field to include selected social media options
    const socialMediaDetails =
      goals.trim() !== ""
        ? `${goals}\n\nSelected platforms: ${socialMediaOptions.join(", ")}`
        : `Selected platforms: ${socialMediaOptions.join(", ")}`;
        
    // Prepare branding challenges data
    const brandingChallenges = [];
    if (consistentNarrativeChecked)
      brandingChallenges.push("Building a consistent professional narrative");
    if (valuePropositionChecked)
      brandingChallenges.push("Identifying my unique value proposition");
    if (engagingContentChecked)
      brandingChallenges.push("Creating engaging content");
    if (findingTimeChecked)
      brandingChallenges.push("Finding time to maintain online presence");
    if (growingNetworkChecked)
      brandingChallenges.push("Growing my professional network");
    if (sharingInsightsChecked)
      brandingChallenges.push("Sharing industry insights and work experiences");
    if (engagingNetworkChecked)
      brandingChallenges.push("Engaging with my professional network");
    if (industryEventsChecked)
      brandingChallenges.push("Participating in industry discussions and events");
    if (otherBrandingChecked && otherBrandingChallenge.trim() !== "") {
      brandingChallenges.push(`Other: ${otherBrandingChallenge.trim()}`);
    }
    
    // Prepare content format preferences
    const contentFormatPreferences = [];
    if (sharingNewsChecked) contentFormatPreferences.push("Sharing industry news with your perspective");
    if (writingExperiencesChecked) contentFormatPreferences.push("Writing about your learned experiences");
    if (analyzingTrendsChecked) contentFormatPreferences.push("Analyzing trends");
    if (commentingPostsChecked) contentFormatPreferences.push("Commenting on others' posts");
    if (howToContentChecked) contentFormatPreferences.push("Creating how-to content");
    if (eventTakeawaysChecked) contentFormatPreferences.push("Sharing event takeaways");
    if (personalAnecdoteChecked) contentFormatPreferences.push("Personal anecdote");
    if (digitalCommunitiesChecked) contentFormatPreferences.push("Digital communities");
    if (otherContentFormatChecked && otherContentFormat.trim() !== "") {
      contentFormatPreferences.push(`Other: ${otherContentFormat.trim()}`);
    }
    
    // Prepare posting barriers
    const postingBarriers = [];
    if (unsureWhatToSayChecked) postingBarriers.push("Unsure what to say");
    if (fearOfJudgmentChecked) postingBarriers.push("Fear of judgment");
    if (timeManagementChecked) postingBarriers.push("Time management");
    if (dontKnowHowToStartChecked) postingBarriers.push("Don't know how to start");
    if (unclearProfessionalVoiceChecked) postingBarriers.push("Unclear on professional voice");
    if (otherBarrierChecked && otherBarrier.trim() !== "") {
      postingBarriers.push(`Other: ${otherBarrier.trim()}`);
    }
    
    // Format branding details
    const brandingDetails = formatBrandingDetails(
      brandingChallenges,
      contentFormatPreferences,
      postingBarriers
    );
    
    // Format interests data
    const industryInterests = [];
    if (consultingChecked) industryInterests.push("Consulting");
    if (consumerRetailChecked) industryInterests.push("Consumer & Retail");
    if (financialServicesChecked) industryInterests.push("Financial Services");
    if (globalMarketsChecked) industryInterests.push("Global Markets");
    if (governmentChecked) industryInterests.push("Government / Public Sector");
    if (healthcareChecked) industryInterests.push("Healthcare");
    if (innovationChecked) industryInterests.push("Innovation / R&D");
    if (manufacturingChecked) industryInterests.push("Manufacturing");
    if (socialImpactChecked) industryInterests.push("Social Impact / ESG");
    if (technologyChecked) industryInterests.push("Technology");
    
    const societalInterests = [];
    if (climateChecked) societalInterests.push("Climate Change & Sustainability");
    if (consumerBehaviorChecked) societalInterests.push("Consumer Behavior & Culture");
    if (crimeJusticeChecked) societalInterests.push("Crime & Justice");
    if (digitalTransformationAIChecked) societalInterests.push("Digital Transformation/AI");
    if (educationLearningChecked) societalInterests.push("Education & Learning");
    if (emergingMarketsChecked) societalInterests.push("Emerging Markets");
    if (entertainmentArtsChecked) societalInterests.push("Entertainment & Arts");
    if (financialInnovationChecked) societalInterests.push("Financial Innovation");
    if (futureOfWorkChecked) societalInterests.push("Future of Work");
    if (globalEconomyChecked) societalInterests.push("Global Economy");
    if (geopoliticsChecked) societalInterests.push("Geopolitics & International Relations");
    if (healthWellnessChecked) societalInterests.push("Health & Wellness");
    if (healthcareInnovationChecked) societalInterests.push("Healthcare Innovation");
    if (socialImpactDEIChecked) societalInterests.push("Social Impact & DEI");
    if (sportsRecreationChecked) societalInterests.push("Sports & Recreation");
    if (travelTourismChecked) societalInterests.push("Travel & Tourism");
    if (urbanDevelopmentChecked) societalInterests.push("Urban Development");
    if (usPoliticsChecked) societalInterests.push("US Politics & Governance");
    
    // Format interests as JSON for better structure and easier parsing
    const interestsData = {
      industryInterests: industryInterests.length > 0 ? industryInterests : [],
      societalInterests: societalInterests.length > 0 ? societalInterests : [],
      contentFormatPreferences: contentFormatPreferences.length > 0 ? contentFormatPreferences : [],
      postingBarriers: postingBarriers.length > 0 ? postingBarriers : []
    };
    
    // Create form data
    return {
      background, // LinkedIn URL
      goals: socialMediaDetails, // Social media details
      aspirations: brandingDetails, // Branding challenges and all other data
      challenges: "", // No longer using this field
      interests: JSON.stringify(interestsData), // Store interests as structured JSON
      timeframe: `Industry: ${industry}, Function: ${jobFunction}`, // Store both industry and function
      industry, // Current/Prior industry
      isDraft: true, // Default to draft, can be overridden when calling this function
    };
  };
  
  // Auto-save the questionnaire as draft
  const autoSaveQuestionnaire = async (): Promise<boolean> => {
    if (!validateCurrentStep()) return false;
    
    try {
      // Show saving indicator
      setSaveStatus("saving");
      
      // Get the form data
      const formData = prepareFormData();
      
      // Check if the questionnaire is already published (not a draft)
      if (userProfile?.questionnaire && userProfile.questionnaire.isDraft === false) {
        // For published questionnaires, we don't allow auto-saving
        // Just simulate a successful save
        setSaveStatus("saved");
        setTimeout(() => {
          setSaveStatus("idle");
        }, 2000);
        return true;
      } else {
        // For drafts or new questionnaires, save as draft
        // Always save as draft during auto-save
        formData.isDraft = true;
        
        // Save the questionnaire
        await saveAsDraftMutation.mutateAsync(formData);
        
        // Update save status to saved
        setSaveStatus("saved");
        
        // Reset status after 2 seconds
        setTimeout(() => {
          setSaveStatus("idle");
        }, 2000);
        
        // Invalidate the user profile query to refresh data
        queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
        
        return true;
      }
    } catch (error) {
      console.error("Error auto-saving questionnaire:", error);
      setSaveStatus("idle");
      toast({
        title: "Auto-save failed",
        description: "Unable to save your progress automatically. Please try manually saving as draft.",
        variant: "destructive",
      });
      return false;
    }
  };

  const nextStep = async () => {
    if (validateCurrentStep() && currentStep < totalSteps) {
      // Auto-save the current step data
      const saveSuccessful = await autoSaveQuestionnaire();
      
      if (saveSuccessful) {
        // Only proceed to next step if auto-save was successful
        setCurrentStep(currentStep + 1);
      }
    } else if (!validateCurrentStep()) {
      toast({
        title: "Please complete all fields",
        description:
          "All fields are required before proceeding to the next step.",
        variant: "destructive",
      });
    }
  };

  const prevStep = async () => {
    if (currentStep > 1) {
      // Auto-save data when navigating to previous step
      await autoSaveQuestionnaire();
      setCurrentStep(currentStep - 1);
    }
  };

  // Helper function to convert a file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        if (!reader.result) {
          reject(new Error("Failed to read file"));
          return;
        }

        // Extract the base64 data part from the data URL
        const base64String = reader.result.toString();
        const base64Data = base64String.split(",")[1];
        resolve(base64Data);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  // Function to upload assessment files
  const uploadAssessmentFiles = async () => {
    if (files.length === 0) return;

    try {
      for (const file of files) {
        const fileData = await fileToBase64(file);

        // Determine file type
        const fileType = file.name.toLowerCase().endsWith(".pdf")
          ? "assessment-pdf"
          : file.name.toLowerCase().match(/\.(jpg|jpeg|png)$/)
            ? "assessment-image"
            : "assessment-doc";

        await apiRequest("POST", "/api/documents", {
          name: `Assessment: ${file.name}`,
          type: fileType,
          fileName: file.name,
          fileData: fileData,
        });
      }

      toast({
        title: "Files Uploaded",
        description: `Successfully uploaded ${files.length} file${files.length > 1 ? "s" : ""}.`,
      });
    } catch (error) {
      console.error("Error uploading files:", error);
      toast({
        title: "Upload Error",
        description:
          "There was a problem uploading one or more files. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Helper function to format branding details for API submission
  const formatBrandingDetails = (
    brandingChallenges: string[],
    contentFormatPreferences: string[] = [],
    postingBarriers: string[] = []
  ) => {
    // Start with existing aspirations if any
    let brandingDetails = aspirations.trim() !== ""
      ? `${aspirations}\n\nBranding challenges: ${brandingChallenges.join(", ")}`
      : `Branding challenges: ${brandingChallenges.join(", ")}`;
    
    // Add content format preferences
    if (contentFormatPreferences.length > 0) {
      brandingDetails += `\n\nContent format preferences: ${contentFormatPreferences.join(", ")}`;
    }
    
    // Add posting barriers
    if (postingBarriers.length > 0) {
      brandingDetails += `\n\nPosting barriers: ${postingBarriers.join(", ")}`;
    }
    
    // Add published content
    const publishedContent: string[] = [];
    if (linkedInPostsChecked) publishedContent.push("LinkedIn posts");
    if (blogArticlesChecked) publishedContent.push("Blog articles");
    if (industryPresentationsChecked) publishedContent.push("Industry presentations");
    if (academicPapersChecked) publishedContent.push("Academic papers");
    if (neverPublishedChecked) publishedContent.push("Never published professional content");
    if (otherPublishedContentChecked && otherPublishedContent.trim() !== "") {
      publishedContent.push(`Other: ${otherPublishedContent.trim()}`);
    }
    brandingDetails += `\n\nPublished content: ${publishedContent.length > 0 ? publishedContent.join(", ") : "None"}`;
    
    // Add LinkedIn profile update timing
    const profileUpdateTiming: string[] = [];
    if (lastWeekChecked) profileUpdateTiming.push("Within the last week");
    if (lastMonthChecked) profileUpdateTiming.push("Within the last month");
    if (businessSchoolChecked) profileUpdateTiming.push("For / during business school");
    if (careerCoachChecked) profileUpdateTiming.push("After I spoke with a career coach");
    if (jobChangeChecked) profileUpdateTiming.push("When I last changed jobs");
    if (cantRememberChecked) profileUpdateTiming.push("I can't remember");
    if (neverUpdatedChecked) profileUpdateTiming.push("I've never really updated it beyond creating the profile");
    if (otherUpdateTimeChecked && otherUpdateTime.trim() !== "") {
      profileUpdateTiming.push(`Other: ${otherUpdateTime.trim()}`);
    }
    brandingDetails += `\n\nLinkedIn profile update timing: ${profileUpdateTiming.length > 0 ? profileUpdateTiming.join(", ") : "Not specified"}`;
    
    // Add Career goals
    brandingDetails += `\n\nCareer goals: ${careerGoals.trim() !== "" ? careerGoals : "Not specified"}`;
    
    // Add Professional areas
    brandingDetails += `\n\nProfessional areas for thought leadership: ${professionalAreas.trim() !== "" ? professionalAreas : "Not specified"}`;
    
    // Add Additional info
    brandingDetails += `\n\nAdditional professional journey information: ${additionalInfo.trim() !== "" ? additionalInfo : "Not specified"}`;
    
    // Add industry connections percentage
    brandingDetails += `\n\nLinkedIn connections percentage: ${industryConnectionsPercentage || "Not specified"}`;
    
    // Add other ratings and fields
    brandingDetails += `\n\nBrand positioning rating: ${brandPositioningRating !== null ? brandPositioningRating : "Not specified"}`;
    brandingDetails += `\n\nContent creation comfort: ${contentCreationComfort !== null ? contentCreationComfort : "Not specified"}`;
    brandingDetails += `\n\nBrand optimization goals: ${brandOptimizationGoals.trim() !== "" ? brandOptimizationGoals : "Not specified"}`;
    
    return brandingDetails;
  };

  const handleSaveAsDraft = async () => {
    try {
      // Use the prepareFormData function to get the form data
      const formData = prepareFormData();
      
      setSaveStatus("saving");
      await saveAsDraftMutation.mutateAsync(formData);
      
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
      
      toast({
        title: "Draft Saved",
        description: "Your questionnaire draft has been saved successfully.",
      });
      
      // Redirect to home page after saving draft
      navigate("/");
    } catch (error) {
      console.error("Error saving draft:", error);
      setSaveStatus("idle");
      toast({
        title: "Error",
        description: "Failed to save draft. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  const handleSubmit = async () => {
    if (validateCurrentStep()) {
      // First upload any assessment files
      if (files.length > 0) {
        await uploadAssessmentFiles();
      }
      
      // Show saving indicator
      setSaveStatus("saving");

      // Prepare social media data
      const socialMediaOptions = [];
      if (twitterChecked) socialMediaOptions.push("Twitter/X");
      if (mediumChecked) socialMediaOptions.push("Medium");
      if (blogChecked) socialMediaOptions.push("Personal blog/Website");
      if (otherChecked && otherSocialMedia.trim() !== "") {
        socialMediaOptions.push(`Other: ${otherSocialMedia.trim()}`);
      }

      // Update goals field to include selected social media options
      const socialMediaDetails =
        goals.trim() !== ""
          ? `${goals}\n\nSelected platforms: ${socialMediaOptions.join(", ")}`
          : `Selected platforms: ${socialMediaOptions.join(", ")}`;

      // Prepare branding challenges data
      const brandingChallenges = [];
      if (consistentNarrativeChecked)
        brandingChallenges.push("Building a consistent professional narrative");
      if (valuePropositionChecked)
        brandingChallenges.push("Identifying my unique value proposition");
      if (engagingContentChecked)
        brandingChallenges.push("Creating engaging content");
      if (findingTimeChecked)
        brandingChallenges.push("Finding time to maintain online presence");
      if (growingNetworkChecked)
        brandingChallenges.push("Growing my professional network");
      if (sharingInsightsChecked)
        brandingChallenges.push(
          "Sharing industry insights and work experiences",
        );
      if (engagingNetworkChecked)
        brandingChallenges.push("Engaging with my professional network");
      if (industryEventsChecked)
        brandingChallenges.push(
          "Participating in industry discussions and events",
        );
      if (otherBrandingChecked && otherBrandingChallenge.trim() !== "") {
        brandingChallenges.push(`Other: ${otherBrandingChallenge.trim()}`);
      }

      // Prepare published content data
      const publishedContent = [];
      if (linkedInPostsChecked) publishedContent.push("LinkedIn posts");
      if (blogArticlesChecked) publishedContent.push("Blog articles");
      if (industryPresentationsChecked)
        publishedContent.push("Industry presentations");
      if (academicPapersChecked) publishedContent.push("Academic papers");
      if (neverPublishedChecked)
        publishedContent.push("Never published professional content");
      if (otherPublishedContentChecked && otherPublishedContent.trim() !== "") {
        publishedContent.push(`Other: ${otherPublishedContent.trim()}`);
      }

      // Prepare LinkedIn profile update timing data
      const profileUpdateTiming = [];
      if (lastWeekChecked) profileUpdateTiming.push("Within the last week");
      if (lastMonthChecked) profileUpdateTiming.push("Within the last month");
      if (businessSchoolChecked)
        profileUpdateTiming.push(
          "For / during business school (if applicable)",
        );
      if (careerCoachChecked)
        profileUpdateTiming.push("After I spoke with a career coach");
      if (jobChangeChecked)
        profileUpdateTiming.push("When I last changed jobs");
      if (cantRememberChecked) profileUpdateTiming.push("I can't remember");
      if (neverUpdatedChecked)
        profileUpdateTiming.push(
          "I've never really updated it beyond creating the profile",
        );
      if (otherUpdateTimeChecked && otherUpdateTime.trim() !== "") {
        profileUpdateTiming.push(`Other: ${otherUpdateTime.trim()}`);
      }

      // Prepare LinkedIn activity data
      const linkedInActivity = [];
      if (readNewsfeedChecked) linkedInActivity.push("Read your Newsfeed");
      if (acceptedConnectionsChecked)
        linkedInActivity.push("Accepted Connections");
      if (notActiveChecked)
        linkedInActivity.push("Not Active in the Last Month");
      if (postedNeverChecked)
        linkedInActivity.push("Posted Original Content - Never");
      if (posted12TimesChecked)
        linkedInActivity.push("Posted Original Content - 1-2 times");
      if (posted35TimesChecked)
        linkedInActivity.push("Posted Original Content - 3-5 times");
      if (posted6PlusTimesChecked)
        linkedInActivity.push("Posted Original Content - 6+ times");
      if (sharedNeverChecked)
        linkedInActivity.push("Shared Others' Posts - Never");
      if (shared12TimesChecked)
        linkedInActivity.push("Shared Others' Posts - 1-2 times");
      if (shared35TimesChecked)
        linkedInActivity.push("Shared Others' Posts - 3-5 times");
      if (shared6PlusTimesChecked)
        linkedInActivity.push("Shared Others' Posts - 6+ times");
      if (commentedNeverChecked)
        linkedInActivity.push("Commented on Posts - Never");
      if (commented12TimesPerMonthChecked)
        linkedInActivity.push("Commented on Posts - 1-2 times per month");
      if (commented12TimesPerWeekChecked)
        linkedInActivity.push("Commented on Posts - 1-2 times per week");
      if (commented3PlusTimesPerWeekChecked)
        linkedInActivity.push("Commented on Posts - 3+ times per week");
      if (reactedNeverChecked)
        linkedInActivity.push("Reacted to Posts (likes, etc.) - Never");
      if (reactedFewTimesMonthChecked)
        linkedInActivity.push(
          "Reacted to Posts (likes, etc.) - A few times a month",
        );
      if (reactedFewTimesWeekChecked)
        linkedInActivity.push(
          "Reacted to Posts (likes, etc.) - A few times a week",
        );
      if (reactedDailyChecked)
        linkedInActivity.push("Reacted to Posts (likes, etc.) - Daily");

      // Prepare industry interests
      const industryInterests = [];
      if (consultingChecked) industryInterests.push("Consulting");
      if (consumerRetailChecked)
        industryInterests.push("Consumer Products / Retail");
      if (financialServicesChecked)
        industryInterests.push("Financial Services");
      if (globalMarketsChecked) industryInterests.push("Global Markets");
      if (governmentChecked)
        industryInterests.push("Government / Public Sector");
      if (healthcareChecked) industryInterests.push("Healthcare");
      if (innovationChecked) industryInterests.push("Innovation / R&D");
      if (manufacturingChecked) industryInterests.push("Manufacturing");
      if (socialImpactChecked) industryInterests.push("Social Impact / ESG");
      if (technologyChecked) industryInterests.push("Technology");

      // Prepare cross-cutting & societal interests data
      const crossCuttingInterests = [];
      if (climateChecked)
        crossCuttingInterests.push("Climate Change & Sustainability");
      if (consumerBehaviorChecked)
        crossCuttingInterests.push("Consumer Behavior & Culture");
      if (crimeJusticeChecked) crossCuttingInterests.push("Crime & Justice");
      if (digitalTransformationAIChecked)
        crossCuttingInterests.push("Digital Transformation/AI");
      if (educationLearningChecked)
        crossCuttingInterests.push("Education & Learning");
      if (emergingMarketsChecked)
        crossCuttingInterests.push("Emerging Markets");
      if (entertainmentArtsChecked)
        crossCuttingInterests.push("Entertainment & Arts");
      if (financialInnovationChecked)
        crossCuttingInterests.push("Financial Innovation & Markets");
      if (futureOfWorkChecked) crossCuttingInterests.push("Future of Work");
      if (globalEconomyChecked)
        crossCuttingInterests.push("Global Markets & Economy");
      if (geopoliticsChecked)
        crossCuttingInterests.push("Global Politics & Geopolitics");
      if (healthWellnessChecked)
        crossCuttingInterests.push("Health & Wellness");
      if (healthcareInnovationChecked)
        crossCuttingInterests.push("Healthcare Innovation");
      if (socialImpactDEIChecked)
        crossCuttingInterests.push("Social Impact & DEI");
      if (sportsRecreationChecked)
        crossCuttingInterests.push("Sports & Recreation");
      if (travelTourismChecked) crossCuttingInterests.push("Travel & Tourism");
      if (urbanDevelopmentChecked)
        crossCuttingInterests.push("Urban Development & Infrastructure");
      if (usPoliticsChecked)
        crossCuttingInterests.push("U.S. Politics & Policy");

      // Prepare content creation format preferences data
      const contentFormatPreferences = [];
      if (sharingNewsChecked)
        contentFormatPreferences.push(
          "Sharing industry news with your perspective",
        );
      if (writingExperiencesChecked)
        contentFormatPreferences.push("Writing about your learned experiences");
      if (analyzingTrendsChecked)
        contentFormatPreferences.push("Analyzing trends");
      if (commentingPostsChecked)
        contentFormatPreferences.push("Commenting on others' posts");
      if (howToContentChecked)
        contentFormatPreferences.push("Creating how-to content");
      if (eventTakeawaysChecked)
        contentFormatPreferences.push("Sharing event takeaways");
      if (personalAnecdoteChecked)
        contentFormatPreferences.push("Personal anecdote");
      if (digitalCommunitiesChecked)
        contentFormatPreferences.push("Digital communities");
      if (otherContentFormatChecked && otherContentFormat.trim() !== "") {
        contentFormatPreferences.push(`Other: ${otherContentFormat.trim()}`);
      }

      // Prepare posting barriers data
      const postingBarriers = [];
      if (unsureWhatToSayChecked) postingBarriers.push("Unsure what to say");
      if (fearOfJudgmentChecked) postingBarriers.push("Fear of judgment");
      if (timeManagementChecked) postingBarriers.push("Time management");
      if (dontKnowHowToStartChecked)
        postingBarriers.push("Don't know how to start");
      if (unclearProfessionalVoiceChecked)
        postingBarriers.push("Unclear on professional voice");
      if (otherBarrierChecked && otherBarrier.trim() !== "") {
        postingBarriers.push(`Other: ${otherBarrier.trim()}`);
      }

      // Update aspirations field to include selected branding challenges and published content
      let brandingDetails =
        aspirations.trim() !== ""
          ? `${aspirations}\n\nBranding challenges: ${brandingChallenges.join(", ")}`
          : `Branding challenges: ${brandingChallenges.join(", ")}`;

      // Add published content to aspirations field
      brandingDetails += `\n\nPublished content: ${publishedContent.length > 0 ? publishedContent.join(", ") : "None"}`;

      // Add LinkedIn profile update timing to aspirations field
      brandingDetails += `\n\nLinkedIn profile update timing: ${profileUpdateTiming.length > 0 ? profileUpdateTiming.join(", ") : "Not specified"}`;

      // Add LinkedIn activity to aspirations field
      brandingDetails += `\n\nLinkedIn activity: ${linkedInActivity.length > 0 ? linkedInActivity.join(", ") : "Not specified"}`;

      // Add brand positioning rating to aspirations field
      brandingDetails += `\n\nBrand positioning rating: ${brandPositioningRating !== null ? brandPositioningRating : "Not specified"}`;

      // Add content creation comfort to aspirations field
      brandingDetails += `\n\nContent creation comfort: ${contentCreationComfort !== null ? contentCreationComfort : "Not specified"}`;

      // Add brand optimization goals to aspirations field
      brandingDetails += `\n\nBrand optimization goals: ${brandOptimizationGoals.trim() !== "" ? brandOptimizationGoals : "Not specified"}`;

      // Add industry interests to aspirations field
      brandingDetails += `\n\nIndustry interests: ${industryInterests.length > 0 ? industryInterests.join(", ") : "None"}`;

      // Add technology subcategories if technology is selected
      if (technologyChecked) {
        const techSubcategories = [];

        // AI/ML
        if (aiConsumerChecked)
          techSubcategories.push("AI - Consumer Applications");
        if (aiComputerVisionChecked)
          techSubcategories.push("AI - Computer Vision");
        if (aiEthicsChecked) techSubcategories.push("AI - Ethics & Governance");
        if (aiInfrastructureChecked)
          techSubcategories.push("AI - Infrastructure");
        if (aiNlpChecked)
          techSubcategories.push("AI - Natural Language Processing");
        if (aiPredictiveChecked)
          techSubcategories.push("AI - Predictive Analytics");
        if (aiRoboticsChecked)
          techSubcategories.push("AI - Robotics & Automation");
        if (aiScientificChecked)
          techSubcategories.push("AI - Scientific Applications");
        if (aiLearningChecked) techSubcategories.push("ML - Machine Learning");

        // Consumer Technology
        if (consumerDevicesChecked) techSubcategories.push("Consumer Devices");
        if (consumerGamingChecked) techSubcategories.push("Consumer Gaming");
        if (consumerMobileChecked)
          techSubcategories.push("Consumer Mobile Tech");
        if (consumerSmartHomeChecked)
          techSubcategories.push("Consumer Smart Home");

        // Cybersecurity & Privacy
        if (cybersecuritySolutionsChecked)
          techSubcategories.push("Cybersecurity Solutions");
        if (dataPrivacyChecked) techSubcategories.push("Data Privacy");
        if (regulatoryComplianceChecked)
          techSubcategories.push("Regulatory Compliance");
        if (riskManagementChecked) techSubcategories.push("Risk Management");

        // Digital Infrastructure
        if (cloudComputingChecked) techSubcategories.push("Cloud Computing");
        if (dataCentersChecked) techSubcategories.push("Data Centers");
        if (networksChecked) techSubcategories.push("Networks");
        if (web3BlockchainChecked) techSubcategories.push("Web3 / Blockchain");

        // Digital Media & Content
        if (contentDistributionChecked)
          techSubcategories.push("Content Distribution");
        if (creatorEconomyChecked) techSubcategories.push("Creator Economy");
        if (digitalMarketingChecked)
          techSubcategories.push("Digital Marketing");
        if (socialMediaPlatformsChecked)
          techSubcategories.push("Social Media Platforms");

        // Emerging Technology
        if (arVrXrChecked) techSubcategories.push("AR / VR / XR");
        if (biotechHealthChecked)
          techSubcategories.push("Biotech / Health Tech");
        if (quantumComputingChecked)
          techSubcategories.push("Quantum Computing");
        if (emergingRoboticsChecked)
          techSubcategories.push("Robotics & Automation");

        // Enterprise Technology
        if (businessAppsChecked)
          techSubcategories.push("Business Applications");
        if (enterpriseDigitalTransformationChecked)
          techSubcategories.push("Digital Transformation");
        if (integrationApisChecked)
          techSubcategories.push("Integration & APIs");
        if (saasEnterpriseChecked)
          techSubcategories.push("SaaS / Enterprise Software");

        // Add to branding details
        brandingDetails += `\n\nTechnology subcategories: ${techSubcategories.length > 0 ? techSubcategories.join(", ") : "None"}`;
      }

      // Add cross-cutting & societal interests to aspirations field
      brandingDetails += `\n\nCross-cutting & societal interests: ${crossCuttingInterests.length > 0 ? crossCuttingInterests.join(", ") : "None"}`;

      // Add professional areas for thought leadership to aspirations field
      brandingDetails += `\n\nProfessional areas for thought leadership: ${professionalAreas.trim() !== "" ? professionalAreas : "Not specified"}`;

      // Add content format preferences to aspirations field
      brandingDetails += `\n\nContent creation format preferences: ${contentFormatPreferences.length > 0 ? contentFormatPreferences.join(", ") : "None"}`;

      // Add posting barriers to aspirations field
      brandingDetails += `\n\nPosting barriers: ${postingBarriers.length > 0 ? postingBarriers.join(", ") : "None"}`;

      // Add LinkedIn connections percentage to aspirations field
      brandingDetails += `\n\nLinkedIn connections percentage: ${industryConnectionsPercentage || "Not specified"}`;

      // Add personality assessments to aspirations field
      const assessments = [];
      if (mbtiChecked) assessments.push("MBTI");
      if (strengthsFinderChecked) assessments.push("Strengths Finder");
      if (viaChecked) assessments.push("VIA");
      if (enneagramChecked) assessments.push("Enneagram");
      if (threeSixtyChecked) assessments.push("360*");
      if (otherAssessmentChecked && otherAssessment.trim() !== "") {
        assessments.push(`Other: ${otherAssessment.trim()}`);
      }
      brandingDetails += `\n\nPersonality assessments: ${assessments.length > 0 ? assessments.join(", ") : "None"}`;

      // Add career goals
      brandingDetails += `\n\nCareer goals: ${careerGoals.trim() !== "" ? careerGoals : "Not specified"}`;

      // Add additional info to aspirations field if provided, but clean it first
      // to avoid any special characters that might cause parsing issues
      if (additionalInfo.trim() !== "") {
        // Replace any newlines with spaces to avoid multi-line issues in parsing
        const cleanAdditionalInfo = additionalInfo.trim().replace(/\n/g, " ");
        brandingDetails += `\n\nAdditional professional journey information: ${cleanAdditionalInfo}`;
      }

      const formData = {
        background, // LinkedIn URL
        goals: socialMediaDetails, // Social media details
        aspirations: brandingDetails, // Branding challenges and all other data
        challenges: "", // No longer using this field
        interests: "",
        timeframe: `Industry: ${industry}, Function: ${jobFunction}`, // Store both industry and function
        industry, // Current/Prior industry
        // Include these fields for potential future enhancement
        contentFormatPreferences: {
          sharingNews: sharingNewsChecked,
          writingExperiences: writingExperiencesChecked,
          analyzingTrends: analyzingTrendsChecked,
          commentingPosts: commentingPostsChecked,
          howToContent: howToContentChecked,
          eventTakeaways: eventTakeawaysChecked,
          personalAnecdote: personalAnecdoteChecked,
          digitalCommunities: digitalCommunitiesChecked,
          other: otherContentFormatChecked ? otherContentFormat : null,
        },
        postingBarriers: {
          unsureWhatToSay: unsureWhatToSayChecked,
          fearOfJudgment: fearOfJudgmentChecked,
          timeManagement: timeManagementChecked,
          dontKnowHowToStart: dontKnowHowToStartChecked,
          unclearProfessionalVoice: unclearProfessionalVoiceChecked,
          other: otherBarrierChecked ? otherBarrier : null,
        },
        socialMedia: {
          twitter: twitterChecked,
          medium: mediumChecked,
          blog: blogChecked,
          other: otherChecked ? otherSocialMedia : null,
        },
        brandingChallenges: {
          consistentNarrative: consistentNarrativeChecked,
          valueProposition: valuePropositionChecked,
          engagingContent: engagingContentChecked,
          findingTime: findingTimeChecked,
          growingNetwork: growingNetworkChecked,
          sharingInsights: sharingInsightsChecked,
          engagingNetwork: engagingNetworkChecked,
          industryEvents: industryEventsChecked,
          other: otherBrandingChecked ? otherBrandingChallenge : null,
        },
        publishedContent: {
          linkedInPosts: linkedInPostsChecked,
          blogArticles: blogArticlesChecked,
          industryPresentations: industryPresentationsChecked,
          academicPapers: academicPapersChecked,
          neverPublished: neverPublishedChecked,
          other: otherPublishedContentChecked ? otherPublishedContent : null,
        },
        linkedInProfileUpdate: {
          lastWeek: lastWeekChecked,
          lastMonth: lastMonthChecked,
          businessSchool: businessSchoolChecked,
          careerCoach: careerCoachChecked,
          jobChange: jobChangeChecked,
          cantRemember: cantRememberChecked,
          neverUpdated: neverUpdatedChecked,
          other: otherUpdateTimeChecked ? otherUpdateTime : null,
        },
        linkedInActivity: {
          readNewsfeed: readNewsfeedChecked,
          acceptedConnections: acceptedConnectionsChecked,
          notActive: notActiveChecked,
          postedNever: postedNeverChecked,
          posted12Times: posted12TimesChecked,
          posted35Times: posted35TimesChecked,
          posted6PlusTimes: posted6PlusTimesChecked,
          sharedNever: sharedNeverChecked,
          shared12Times: shared12TimesChecked,
          shared35Times: shared35TimesChecked,
          shared6PlusTimes: shared6PlusTimesChecked,
          commentedNever: commentedNeverChecked,
          commented12TimesPerMonth: commented12TimesPerMonthChecked,
          commented12TimesPerWeek: commented12TimesPerWeekChecked,
          commented3PlusTimesPerWeek: commented3PlusTimesPerWeekChecked,
          reactedNever: reactedNeverChecked,
          reactedFewTimesMonth: reactedFewTimesMonthChecked,
          reactedFewTimesWeek: reactedFewTimesWeekChecked,
          reactedDaily: reactedDailyChecked,
        },
        brandPositioning: brandPositioningRating,
        contentCreationComfort: contentCreationComfort,
        brandOptimizationGoals: brandOptimizationGoals,
        industryInterests: {
          consulting: consultingChecked,
          consumerRetail: consumerRetailChecked,
          financialServices: financialServicesChecked,
          globalMarkets: globalMarketsChecked,
          government: governmentChecked,
          healthcare: healthcareChecked,
          innovation: innovationChecked,
          manufacturing: manufacturingChecked,
          socialImpact: socialImpactChecked,
          technology: technologyChecked,
        },
        crossCuttingInterests: {
          climate: climateChecked,
          consumerBehavior: consumerBehaviorChecked,
          crimeJustice: crimeJusticeChecked,
          digitalTransformationAI: digitalTransformationAIChecked,
          educationLearning: educationLearningChecked,
          emergingMarkets: emergingMarketsChecked,
          entertainmentArts: entertainmentArtsChecked,
          financialInnovation: financialInnovationChecked,
          futureOfWork: futureOfWorkChecked,
          globalEconomy: globalEconomyChecked,
          geopolitics: geopoliticsChecked,
          healthWellness: healthWellnessChecked,
          healthcareInnovation: healthcareInnovationChecked,
          socialImpactDEI: socialImpactDEIChecked,
          sportsRecreation: sportsRecreationChecked,
          travelTourism: travelTourismChecked,
          urbanDevelopment: urbanDevelopmentChecked,
          usPolitics: usPoliticsChecked,
        },

        professionalAreasForThoughtLeadership: professionalAreas,

        technologySubcategories: technologyChecked
          ? {
              // AI/ML
              aiConsumer: aiConsumerChecked,
              aiComputerVision: aiComputerVisionChecked,
              aiEthics: aiEthicsChecked,
              aiInfrastructure: aiInfrastructureChecked,
              aiNlp: aiNlpChecked,
              aiPredictive: aiPredictiveChecked,
              aiRobotics: aiRoboticsChecked,
              aiScientific: aiScientificChecked,
              aiLearning: aiLearningChecked,

              // Consumer Technology
              consumerDevices: consumerDevicesChecked,
              consumerGaming: consumerGamingChecked,
              consumerMobile: consumerMobileChecked,
              consumerSmartHome: consumerSmartHomeChecked,

              // Cybersecurity & Privacy
              cybersecuritySolutions: cybersecuritySolutionsChecked,
              dataPrivacy: dataPrivacyChecked,
              regulatoryCompliance: regulatoryComplianceChecked,
              riskManagement: riskManagementChecked,

              // Digital Infrastructure
              cloudComputing: cloudComputingChecked,
              dataCenters: dataCentersChecked,
              networks: networksChecked,
              web3Blockchain: web3BlockchainChecked,

              // Digital Media & Content
              contentDistribution: contentDistributionChecked,
              creatorEconomy: creatorEconomyChecked,
              digitalMarketing: digitalMarketingChecked,
              socialMediaPlatforms: socialMediaPlatformsChecked,

              // Emerging Technology
              arVrXr: arVrXrChecked,
              biotechHealth: biotechHealthChecked,
              quantumComputing: quantumComputingChecked,
              emergingRobotics: emergingRoboticsChecked,

              // Enterprise Technology
              businessApps: businessAppsChecked,
              digitalTransformation: enterpriseDigitalTransformationChecked,
              integrationApis: integrationApisChecked,
              saasEnterprise: saasEnterpriseChecked,
            }
          : null,
        // Step 4: Professional Goals
        professionalGoals: {
          careerGoals: careerGoals,
          industryConnectionsPercentage: industryConnectionsPercentage,
          personalityAssessments: {
            mbti: mbtiChecked,
            strengthsFinder: strengthsFinderChecked,
            via: viaChecked,
            enneagram: enneagramChecked,
            threeSixty: threeSixtyChecked,
            other: otherAssessmentChecked ? otherAssessment : null,
          },
          additionalInfo: additionalInfo,
        },
      };

      // Show saving indicator
      setSaveStatus("saving");
      
      // Use the prepareFormData function to get the form data without duplicating all that logic
      const autoFormData = prepareFormData();
      
      // Mark as not a draft when submitting the final version
      autoFormData.isDraft = false;
      
      // Submit the questionnaire
      await questionnaireMutation.mutateAsync(autoFormData);
      
      // Update save status
      setSaveStatus("saved");
      
      // Reset status to idle after 2 seconds
      setTimeout(() => {
        setSaveStatus("idle");
      }, 2000);
    } else {
      toast({
        title: "Please complete all required fields",
        description:
          currentStep === 1
            ? "Please select your current or prior industry and function."
            : currentStep === 2
              ? "LinkedIn URL is required to complete your profile."
              : currentStep === 3
                ? "Please select at least one branding challenge."
                : currentStep === 4
                  ? "Please select at least one industry interest."
                  : currentStep === 5
                    ? "Please select a percentage of connections in your target industry."
                    : "Please complete all required fields before proceeding.",
        variant: "destructive",
      });
    }
  };

  // Render appropriate fields based on current step
  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="mb-6">
              <Label
                htmlFor="industry"
                className="text-gray-700 font-medium block mb-2"
              >
                Current / Prior Industry <span className="text-red-500">*</span>
              </Label>
              <p className="text-sm text-gray-500 mb-3">
                Please select your current or most recent industry
              </p>
              <Select value={industry} onValueChange={setIndustry}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select an industry" />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRY_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="mb-6">
              <Label
                htmlFor="function"
                className="text-gray-700 font-medium block mb-2"
              >
                Current / Prior Function <span className="text-red-500">*</span>
              </Label>
              <p className="text-sm text-gray-500 mb-3">
                Please select your current or most recent job function
              </p>
              <Select value={jobFunction} onValueChange={setJobFunction}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a function" />
                </SelectTrigger>
                <SelectContent>
                  {FUNCTION_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-6">
            <div className="mb-6">
              <Label
                htmlFor="background"
                className="text-gray-700 font-medium block mb-2"
              >
                LinkedIn URL <span className="text-red-500">*</span>
              </Label>
              <p className="text-sm text-gray-500 mb-3">
                Please provide the URL to your LinkedIn profile
              </p>
              <Input
                id="background"
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                className="w-full"
                placeholder="https://www.linkedin.com/in/yourprofile"
              />
            </div>

            <div className="mb-6">
              <Label
                htmlFor="goals"
                className="text-gray-700 font-medium block mb-2"
              >
                Other Professional Social Media Presence
              </Label>
              <p className="text-sm text-gray-500 mb-3">
                Select the platforms where you have a professional presence
              </p>

              <div className="space-y-4 mt-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="twitter"
                    checked={twitterChecked}
                    onCheckedChange={(checked) =>
                      setTwitterChecked(checked === true)
                    }
                  />
                  <Label htmlFor="twitter" className="cursor-pointer">
                    Twitter/X
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="medium"
                    checked={mediumChecked}
                    onCheckedChange={(checked) =>
                      setMediumChecked(checked === true)
                    }
                  />
                  <Label htmlFor="medium" className="cursor-pointer">
                    Medium
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="blog"
                    checked={blogChecked}
                    onCheckedChange={(checked) =>
                      setBlogChecked(checked === true)
                    }
                  />
                  <Label htmlFor="blog" className="cursor-pointer">
                    Personal blog/Website
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="other"
                    checked={otherChecked}
                    onCheckedChange={(checked) =>
                      setOtherChecked(checked === true)
                    }
                  />
                  <Label htmlFor="other" className="cursor-pointer">
                    Other
                  </Label>
                </div>

                {otherChecked && (
                  <div className="ml-6 mt-2">
                    <Input
                      value={otherSocialMedia}
                      onChange={(e) => setOtherSocialMedia(e.target.value)}
                      placeholder="Please specify other social media platforms"
                      className="w-full"
                    />
                  </div>
                )}
              </div>

              <Input
                id="goals"
                value={goals}
                onChange={(e) => setGoals(e.target.value)}
                className="w-full mt-4"
                placeholder="Add any additional details about your social media presence..."
              />
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-6">
            <div className="mb-6">
              <Label
                htmlFor="aspirations"
                className="text-gray-700 font-medium block mb-2"
              >
                Branding and Content Creation{" "}
                <span className="text-red-500">*</span>
              </Label>
              <p className="text-sm text-gray-500 mb-3">
                What are your biggest professional branding challenges? (Check
                all that apply)
              </p>

              <div className="space-y-3 mt-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="consistentNarrative"
                    checked={consistentNarrativeChecked}
                    onCheckedChange={(checked) =>
                      setConsistentNarrativeChecked(checked === true)
                    }
                  />
                  <Label
                    htmlFor="consistentNarrative"
                    className="cursor-pointer"
                  >
                    Building a consistent professional narrative
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="valueProposition"
                    checked={valuePropositionChecked}
                    onCheckedChange={(checked) =>
                      setValuePropositionChecked(checked === true)
                    }
                  />
                  <Label htmlFor="valueProposition" className="cursor-pointer">
                    Identifying my unique value proposition
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="engagingContent"
                    checked={engagingContentChecked}
                    onCheckedChange={(checked) =>
                      setEngagingContentChecked(checked === true)
                    }
                  />
                  <Label htmlFor="engagingContent" className="cursor-pointer">
                    Creating engaging content
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="findingTime"
                    checked={findingTimeChecked}
                    onCheckedChange={(checked) =>
                      setFindingTimeChecked(checked === true)
                    }
                  />
                  <Label htmlFor="findingTime" className="cursor-pointer">
                    Finding time to maintain online presence
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="growingNetwork"
                    checked={growingNetworkChecked}
                    onCheckedChange={(checked) =>
                      setGrowingNetworkChecked(checked === true)
                    }
                  />
                  <Label htmlFor="growingNetwork" className="cursor-pointer">
                    Growing my professional network
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="sharingInsights"
                    checked={sharingInsightsChecked}
                    onCheckedChange={(checked) =>
                      setSharingInsightsChecked(checked === true)
                    }
                  />
                  <Label htmlFor="sharingInsights" className="cursor-pointer">
                    Sharing industry insights and work experiences
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="engagingNetwork"
                    checked={engagingNetworkChecked}
                    onCheckedChange={(checked) =>
                      setEngagingNetworkChecked(checked === true)
                    }
                  />
                  <Label htmlFor="engagingNetwork" className="cursor-pointer">
                    Engaging with my professional network
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="industryEvents"
                    checked={industryEventsChecked}
                    onCheckedChange={(checked) =>
                      setIndustryEventsChecked(checked === true)
                    }
                  />
                  <Label htmlFor="industryEvents" className="cursor-pointer">
                    Participating in industry discussions and events
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="otherBranding"
                    checked={otherBrandingChecked}
                    onCheckedChange={(checked) =>
                      setOtherBrandingChecked(checked === true)
                    }
                  />
                  <Label htmlFor="otherBranding" className="cursor-pointer">
                    Other
                  </Label>
                </div>

                {otherBrandingChecked && (
                  <div className="ml-6 mt-2">
                    <Input
                      value={otherBrandingChallenge}
                      onChange={(e) =>
                        setOtherBrandingChallenge(e.target.value)
                      }
                      placeholder="Please specify your other branding challenge"
                      className="w-full"
                    />
                  </div>
                )}
              </div>
            </div>

            <hr className="my-6" />

            <div className="mb-6">
              <Label
                htmlFor="publishedContent"
                className="text-gray-700 font-medium block mb-2"
              >
                Published Digital Content{" "}
                <span className="text-red-500">*</span>
              </Label>
              <p className="text-sm text-gray-500 mb-3">
                Have you published digital professional content before? (Check
                all that apply)
              </p>

              <div className="space-y-3 mt-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="linkedInPosts"
                    checked={linkedInPostsChecked}
                    onCheckedChange={(checked) =>
                      setLinkedInPostsChecked(checked === true)
                    }
                  />
                  <Label htmlFor="linkedInPosts" className="cursor-pointer">
                    LinkedIn posts
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="blogArticles"
                    checked={blogArticlesChecked}
                    onCheckedChange={(checked) =>
                      setBlogArticlesChecked(checked === true)
                    }
                  />
                  <Label htmlFor="blogArticles" className="cursor-pointer">
                    Blog articles
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="industryPresentations"
                    checked={industryPresentationsChecked}
                    onCheckedChange={(checked) =>
                      setIndustryPresentationsChecked(checked === true)
                    }
                  />
                  <Label
                    htmlFor="industryPresentations"
                    className="cursor-pointer"
                  >
                    Industry presentations
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="academicPapers"
                    checked={academicPapersChecked}
                    onCheckedChange={(checked) =>
                      setAcademicPapersChecked(checked === true)
                    }
                  />
                  <Label htmlFor="academicPapers" className="cursor-pointer">
                    Academic papers
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="neverPublished"
                    checked={neverPublishedChecked}
                    onCheckedChange={(checked) =>
                      setNeverPublishedChecked(checked === true)
                    }
                  />
                  <Label htmlFor="neverPublished" className="cursor-pointer">
                    Never published professional content
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="otherPublishedContent"
                    checked={otherPublishedContentChecked}
                    onCheckedChange={(checked) =>
                      setOtherPublishedContentChecked(checked === true)
                    }
                  />
                  <Label
                    htmlFor="otherPublishedContent"
                    className="cursor-pointer"
                  >
                    Other
                  </Label>
                </div>

                {otherPublishedContentChecked && (
                  <div className="ml-6 mt-2">
                    <Input
                      value={otherPublishedContent}
                      onChange={(e) => setOtherPublishedContent(e.target.value)}
                      placeholder="Please specify other published content"
                      className="w-full"
                    />
                  </div>
                )}
              </div>
            </div>

            <hr className="my-6" />

            <div className="mb-6">
              <Label
                htmlFor="profileUpdateTime"
                className="text-gray-700 font-medium block mb-2"
              >
                LinkedIn Profile Updates
              </Label>
              <p className="text-sm text-gray-500 mb-3">
                When was the most recent time you updated your LinkedIn profile?
              </p>

              <div className="space-y-3 mt-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="lastWeek"
                    checked={lastWeekChecked}
                    onCheckedChange={(checked) =>
                      setLastWeekChecked(checked === true)
                    }
                  />
                  <Label htmlFor="lastWeek" className="cursor-pointer">
                    Within the last week
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="lastMonth"
                    checked={lastMonthChecked}
                    onCheckedChange={(checked) =>
                      setLastMonthChecked(checked === true)
                    }
                  />
                  <Label htmlFor="lastMonth" className="cursor-pointer">
                    Within the last month
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="businessSchool"
                    checked={businessSchoolChecked}
                    onCheckedChange={(checked) =>
                      setBusinessSchoolChecked(checked === true)
                    }
                  />
                  <Label htmlFor="businessSchool" className="cursor-pointer">
                    For / during business school (if applicable)
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="careerCoach"
                    checked={careerCoachChecked}
                    onCheckedChange={(checked) =>
                      setCareerCoachChecked(checked === true)
                    }
                  />
                  <Label htmlFor="careerCoach" className="cursor-pointer">
                    After I spoke with a career coach
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="jobChange"
                    checked={jobChangeChecked}
                    onCheckedChange={(checked) =>
                      setJobChangeChecked(checked === true)
                    }
                  />
                  <Label htmlFor="jobChange" className="cursor-pointer">
                    When I last changed jobs
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="cantRemember"
                    checked={cantRememberChecked}
                    onCheckedChange={(checked) =>
                      setCantRememberChecked(checked === true)
                    }
                  />
                  <Label htmlFor="cantRemember" className="cursor-pointer">
                    I can't remember
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="neverUpdated"
                    checked={neverUpdatedChecked}
                    onCheckedChange={(checked) =>
                      setNeverUpdatedChecked(checked === true)
                    }
                  />
                  <Label htmlFor="neverUpdated" className="cursor-pointer">
                    I've never really updated it beyond creating the profile
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="otherUpdateTime"
                    checked={otherUpdateTimeChecked}
                    onCheckedChange={(checked) =>
                      setOtherUpdateTimeChecked(checked === true)
                    }
                  />
                  <Label htmlFor="otherUpdateTime" className="cursor-pointer">
                    Other
                  </Label>
                </div>

                {otherUpdateTimeChecked && (
                  <div className="ml-6 mt-2">
                    <Input
                      value={otherUpdateTime}
                      onChange={(e) => setOtherUpdateTime(e.target.value)}
                      placeholder="Please specify when you last updated your profile"
                      className="w-full"
                    />
                  </div>
                )}
              </div>
            </div>

            <hr className="my-6" />

            <div className="mb-6">
              <Label
                htmlFor="linkedInActivity"
                className="text-gray-700 font-medium block mb-2"
              >
                LinkedIn Activity
              </Label>
              <p className="text-sm text-gray-500 mb-3">
                In the last month, how active have you been on LinkedIn? (check
                all that apply)
              </p>

              <div className="space-y-3 mt-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="readNewsfeed"
                    checked={readNewsfeedChecked}
                    onCheckedChange={(checked) =>
                      setReadNewsfeedChecked(checked === true)
                    }
                  />
                  <Label htmlFor="readNewsfeed" className="cursor-pointer">
                    Read your Newsfeed
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="acceptedConnections"
                    checked={acceptedConnectionsChecked}
                    onCheckedChange={(checked) =>
                      setAcceptedConnectionsChecked(checked === true)
                    }
                  />
                  <Label
                    htmlFor="acceptedConnections"
                    className="cursor-pointer"
                  >
                    Accepted Connections
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="notActive"
                    checked={notActiveChecked}
                    onCheckedChange={(checked) =>
                      setNotActiveChecked(checked === true)
                    }
                  />
                  <Label htmlFor="notActive" className="cursor-pointer">
                    Not Active in the Last Month
                  </Label>
                </div>

                <p className="text-sm font-medium text-gray-600 mt-5 mb-2">
                  Original Content
                </p>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="postedNever"
                    checked={postedNeverChecked}
                    onCheckedChange={(checked) =>
                      setPostedNeverChecked(checked === true)
                    }
                  />
                  <Label htmlFor="postedNever" className="cursor-pointer">
                    Posted Original Content - Never
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="posted12Times"
                    checked={posted12TimesChecked}
                    onCheckedChange={(checked) =>
                      setPosted12TimesChecked(checked === true)
                    }
                  />
                  <Label htmlFor="posted12Times" className="cursor-pointer">
                    Posted Original Content - 1-2 times
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="posted35Times"
                    checked={posted35TimesChecked}
                    onCheckedChange={(checked) =>
                      setPosted35TimesChecked(checked === true)
                    }
                  />
                  <Label htmlFor="posted35Times" className="cursor-pointer">
                    Posted Original Content - 3-5 times
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="posted6PlusTimes"
                    checked={posted6PlusTimesChecked}
                    onCheckedChange={(checked) =>
                      setPosted6PlusTimesChecked(checked === true)
                    }
                  />
                  <Label htmlFor="posted6PlusTimes" className="cursor-pointer">
                    Posted Original Content - 6+ times
                  </Label>
                </div>

                <p className="text-sm font-medium text-gray-600 mt-5 mb-2">
                  Sharing Content
                </p>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="sharedNever"
                    checked={sharedNeverChecked}
                    onCheckedChange={(checked) =>
                      setSharedNeverChecked(checked === true)
                    }
                  />
                  <Label htmlFor="sharedNever" className="cursor-pointer">
                    Shared Others' Posts - Never
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="shared12Times"
                    checked={shared12TimesChecked}
                    onCheckedChange={(checked) =>
                      setShared12TimesChecked(checked === true)
                    }
                  />
                  <Label htmlFor="shared12Times" className="cursor-pointer">
                    Shared Others' Posts - 1-2 times
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="shared35Times"
                    checked={shared35TimesChecked}
                    onCheckedChange={(checked) =>
                      setShared35TimesChecked(checked === true)
                    }
                  />
                  <Label htmlFor="shared35Times" className="cursor-pointer">
                    Shared Others' Posts - 3-5 times
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="shared6PlusTimes"
                    checked={shared6PlusTimesChecked}
                    onCheckedChange={(checked) =>
                      setShared6PlusTimesChecked(checked === true)
                    }
                  />
                  <Label htmlFor="shared6PlusTimes" className="cursor-pointer">
                    Shared Others' Posts - 6+ times
                  </Label>
                </div>

                <p className="text-sm font-medium text-gray-600 mt-5 mb-2">
                  Commenting
                </p>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="commentedNever"
                    checked={commentedNeverChecked}
                    onCheckedChange={(checked) =>
                      setCommentedNeverChecked(checked === true)
                    }
                  />
                  <Label htmlFor="commentedNever" className="cursor-pointer">
                    Commented on Posts - Never
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="commented12TimesPerMonth"
                    checked={commented12TimesPerMonthChecked}
                    onCheckedChange={(checked) =>
                      setCommented12TimesPerMonthChecked(checked === true)
                    }
                  />
                  <Label
                    htmlFor="commented12TimesPerMonth"
                    className="cursor-pointer"
                  >
                    Commented on Posts - 1-2 times per month
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="commented12TimesPerWeek"
                    checked={commented12TimesPerWeekChecked}
                    onCheckedChange={(checked) =>
                      setCommented12TimesPerWeekChecked(checked === true)
                    }
                  />
                  <Label
                    htmlFor="commented12TimesPerWeek"
                    className="cursor-pointer"
                  >
                    Commented on Posts - 1-2 times per week
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="commented3PlusTimesPerWeek"
                    checked={commented3PlusTimesPerWeekChecked}
                    onCheckedChange={(checked) =>
                      setCommented3PlusTimesPerWeekChecked(checked === true)
                    }
                  />
                  <Label
                    htmlFor="commented3PlusTimesPerWeek"
                    className="cursor-pointer"
                  >
                    Commented on Posts - 3+ times per week
                  </Label>
                </div>

                <p className="text-sm font-medium text-gray-600 mt-5 mb-2">
                  Reactions
                </p>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="reactedNever"
                    checked={reactedNeverChecked}
                    onCheckedChange={(checked) =>
                      setReactedNeverChecked(checked === true)
                    }
                  />
                  <Label htmlFor="reactedNever" className="cursor-pointer">
                    Reacted to Posts (likes, etc.) - Never
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="reactedFewTimesMonth"
                    checked={reactedFewTimesMonthChecked}
                    onCheckedChange={(checked) =>
                      setReactedFewTimesMonthChecked(checked === true)
                    }
                  />
                  <Label
                    htmlFor="reactedFewTimesMonth"
                    className="cursor-pointer"
                  >
                    Reacted to Posts (likes, etc.) - A few times a month
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="reactedFewTimesWeek"
                    checked={reactedFewTimesWeekChecked}
                    onCheckedChange={(checked) =>
                      setReactedFewTimesWeekChecked(checked === true)
                    }
                  />
                  <Label
                    htmlFor="reactedFewTimesWeek"
                    className="cursor-pointer"
                  >
                    Reacted to Posts (likes, etc.) - A few times a week
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="reactedDaily"
                    checked={reactedDailyChecked}
                    onCheckedChange={(checked) =>
                      setReactedDailyChecked(checked === true)
                    }
                  />
                  <Label htmlFor="reactedDaily" className="cursor-pointer">
                    Reacted to Posts (likes, etc.) - Daily
                  </Label>
                </div>
              </div>
            </div>

            <hr className="my-6" />

            <div className="mb-6">
              <Label
                htmlFor="brandPositioning"
                className="text-gray-700 font-medium block mb-2"
              >
                Digital Professional Brand Positioning
              </Label>
              <p className="text-sm text-gray-500 mb-3">
                On a scale of 1-5, how well do you feel your current digital
                professional brand positions you for your target roles?
              </p>

              <div className="space-y-3 mt-4">
                <RadioGroup
                  value={brandPositioningRating?.toString() || ""}
                  onValueChange={(value) =>
                    setBrandPositioningRating(parseInt(value))
                  }
                  className="flex flex-col space-y-3"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="1" id="bp-1" />
                    <Label htmlFor="bp-1" className="cursor-pointer">
                      1 - Needs Significant Work
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="2" id="bp-2" />
                    <Label htmlFor="bp-2" className="cursor-pointer">
                      2
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="3" id="bp-3" />
                    <Label htmlFor="bp-3" className="cursor-pointer">
                      3
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="4" id="bp-4" />
                    <Label htmlFor="bp-4" className="cursor-pointer">
                      4
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="5" id="bp-5" />
                    <Label htmlFor="bp-5" className="cursor-pointer">
                      5 - Strongly Positioned
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            <hr className="my-6" />

            <div className="mb-6">
              <Label
                htmlFor="contentComfort"
                className="text-gray-700 font-medium block mb-2"
              >
                Content Creation Comfort <span className="text-red-500">*</span>
              </Label>
              <p className="text-sm text-gray-500 mb-3">
                How comfortable are you with creating professional content?
              </p>

              <div className="space-y-3 mt-4">
                <RadioGroup
                  value={contentCreationComfort?.toString() || ""}
                  onValueChange={(value) =>
                    setContentCreationComfort(parseInt(value))
                  }
                  className="flex flex-col space-y-3"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="1" id="cc-1" />
                    <Label htmlFor="cc-1" className="cursor-pointer">
                      1 - Not at all comfortable
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="2" id="cc-2" />
                    <Label htmlFor="cc-2" className="cursor-pointer">
                      2
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="3" id="cc-3" />
                    <Label htmlFor="cc-3" className="cursor-pointer">
                      3
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="4" id="cc-4" />
                    <Label htmlFor="cc-4" className="cursor-pointer">
                      4
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="5" id="cc-5" />
                    <Label htmlFor="cc-5" className="cursor-pointer">
                      5 - Very comfortable
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            <hr className="my-6" />

            <div className="mb-6">
              <Label
                htmlFor="brandOptimizationGoals"
                className="text-gray-700 font-medium block mb-2"
              >
                Professional Brand Optimization Goals
              </Label>
              <p className="text-sm text-gray-500 mb-3">
                What do you hope to gain from optimizing your professional
                brand?
              </p>
              <Input
                id="brandOptimizationGoals"
                value={brandOptimizationGoals}
                onChange={(e) => setBrandOptimizationGoals(e.target.value)}
                className="w-full"
                placeholder="Describe your goals for your professional brand..."
              />
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-6">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-3">
                Content & Thought Leadership Interests
              </h2>
              <p className="text-sm text-gray-500 mb-5">
                Help us understand the topics you're passionate about or
                knowledgeable in as this will guide our discussions about your
                professional brand and thought leadership. Select any areas
                where you either have expertise or actively follow industry
                developments. Don't feel limited - this is a starting point for
                our conversation.
              </p>

              <div className="mb-6">
                <Label className="text-gray-700 font-medium block mb-3">
                  Industry Interests <span className="text-red-500">*</span>
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="consulting"
                      checked={consultingChecked}
                      onCheckedChange={(checked) =>
                        setConsultingChecked(checked === true)
                      }
                    />
                    <Label htmlFor="consulting" className="text-gray-700">
                      Consulting
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="consumer-retail"
                      checked={consumerRetailChecked}
                      onCheckedChange={(checked) =>
                        setConsumerRetailChecked(checked === true)
                      }
                    />
                    <Label htmlFor="consumer-retail" className="text-gray-700">
                      Consumer & Retail
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="financial-services"
                      checked={financialServicesChecked}
                      onCheckedChange={(checked) =>
                        setFinancialServicesChecked(checked === true)
                      }
                    />
                    <Label
                      htmlFor="financial-services"
                      className="text-gray-700"
                    >
                      Financial Services
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="global-markets"
                      checked={globalMarketsChecked}
                      onCheckedChange={(checked) =>
                        setGlobalMarketsChecked(checked === true)
                      }
                    />
                    <Label htmlFor="global-markets" className="text-gray-700">
                      Global Markets & Trade
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="government"
                      checked={governmentChecked}
                      onCheckedChange={(checked) =>
                        setGovernmentChecked(checked === true)
                      }
                    />
                    <Label htmlFor="government" className="text-gray-700">
                      Government and Public Sector
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="healthcare"
                      checked={healthcareChecked}
                      onCheckedChange={(checked) =>
                        setHealthcareChecked(checked === true)
                      }
                    />
                    <Label htmlFor="healthcare" className="text-gray-700">
                      Healthcare & Life Sciences
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="innovation"
                      checked={innovationChecked}
                      onCheckedChange={(checked) =>
                        setInnovationChecked(checked === true)
                      }
                    />
                    <Label htmlFor="innovation" className="text-gray-700">
                      Innovation & Entrepreneurship
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="manufacturing"
                      checked={manufacturingChecked}
                      onCheckedChange={(checked) =>
                        setManufacturingChecked(checked === true)
                      }
                    />
                    <Label htmlFor="manufacturing" className="text-gray-700">
                      Manufacturing & Industry
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="social-impact"
                      checked={socialImpactChecked}
                      onCheckedChange={(checked) =>
                        setSocialImpactChecked(checked === true)
                      }
                    />
                    <Label htmlFor="social-impact" className="text-gray-700">
                      Social Impact & Sustainability
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="technology"
                      checked={technologyChecked}
                      onCheckedChange={(checked) =>
                        setTechnologyChecked(checked === true)
                      }
                    />
                    <Label htmlFor="technology" className="text-gray-700">
                      Technology & Digital Media
                    </Label>
                  </div>
                </div>
              </div>

              <hr className="my-6" />

              {/* Cross-Cutting & Societal Interests Section */}
              <div className="mb-6">
                <Label className="text-gray-700 font-medium block mb-3">
                  Cross-Cutting & Societal Interests{" "}
                  <span className="text-red-500">*</span>
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="climate"
                      checked={climateChecked}
                      onCheckedChange={(checked) =>
                        setClimateChecked(checked === true)
                      }
                    />
                    <Label htmlFor="climate" className="text-gray-700">
                      Climate Change & Sustainability
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="consumer-behavior"
                      checked={consumerBehaviorChecked}
                      onCheckedChange={(checked) =>
                        setConsumerBehaviorChecked(checked === true)
                      }
                    />
                    <Label
                      htmlFor="consumer-behavior"
                      className="text-gray-700"
                    >
                      Consumer Behavior & Culture
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="crime-justice"
                      checked={crimeJusticeChecked}
                      onCheckedChange={(checked) =>
                        setCrimeJusticeChecked(checked === true)
                      }
                    />
                    <Label htmlFor="crime-justice" className="text-gray-700">
                      Crime & Justice
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="digital-transformation-ai"
                      checked={digitalTransformationAIChecked}
                      onCheckedChange={(checked) =>
                        setDigitalTransformationAIChecked(checked === true)
                      }
                    />
                    <Label
                      htmlFor="digital-transformation-ai"
                      className="text-gray-700"
                    >
                      Digital Transformation/AI
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="education-learning"
                      checked={educationLearningChecked}
                      onCheckedChange={(checked) =>
                        setEducationLearningChecked(checked === true)
                      }
                    />
                    <Label
                      htmlFor="education-learning"
                      className="text-gray-700"
                    >
                      Education & Learning
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="emerging-markets"
                      checked={emergingMarketsChecked}
                      onCheckedChange={(checked) =>
                        setEmergingMarketsChecked(checked === true)
                      }
                    />
                    <Label htmlFor="emerging-markets" className="text-gray-700">
                      Emerging Markets
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="entertainment-arts"
                      checked={entertainmentArtsChecked}
                      onCheckedChange={(checked) =>
                        setEntertainmentArtsChecked(checked === true)
                      }
                    />
                    <Label
                      htmlFor="entertainment-arts"
                      className="text-gray-700"
                    >
                      Entertainment & Arts
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="financial-innovation"
                      checked={financialInnovationChecked}
                      onCheckedChange={(checked) =>
                        setFinancialInnovationChecked(checked === true)
                      }
                    />
                    <Label
                      htmlFor="financial-innovation"
                      className="text-gray-700"
                    >
                      Financial Innovation & Markets
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="future-of-work"
                      checked={futureOfWorkChecked}
                      onCheckedChange={(checked) =>
                        setFutureOfWorkChecked(checked === true)
                      }
                    />
                    <Label htmlFor="future-of-work" className="text-gray-700">
                      Future of Work
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="global-economy"
                      checked={globalEconomyChecked}
                      onCheckedChange={(checked) =>
                        setGlobalEconomyChecked(checked === true)
                      }
                    />
                    <Label htmlFor="global-economy" className="text-gray-700">
                      Global Markets & Economy
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="geopolitics"
                      checked={geopoliticsChecked}
                      onCheckedChange={(checked) =>
                        setGeopoliticsChecked(checked === true)
                      }
                    />
                    <Label htmlFor="geopolitics" className="text-gray-700">
                      Global Politics & Geopolitics
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="health-wellness"
                      checked={healthWellnessChecked}
                      onCheckedChange={(checked) =>
                        setHealthWellnessChecked(checked === true)
                      }
                    />
                    <Label htmlFor="health-wellness" className="text-gray-700">
                      Health & Wellness
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="healthcare-innovation"
                      checked={healthcareInnovationChecked}
                      onCheckedChange={(checked) =>
                        setHealthcareInnovationChecked(checked === true)
                      }
                    />
                    <Label
                      htmlFor="healthcare-innovation"
                      className="text-gray-700"
                    >
                      Healthcare Innovation
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="social-impact-dei"
                      checked={socialImpactDEIChecked}
                      onCheckedChange={(checked) =>
                        setSocialImpactDEIChecked(checked === true)
                      }
                    />
                    <Label
                      htmlFor="social-impact-dei"
                      className="text-gray-700"
                    >
                      Social Impact & DEI
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="sports-recreation"
                      checked={sportsRecreationChecked}
                      onCheckedChange={(checked) =>
                        setSportsRecreationChecked(checked === true)
                      }
                    />
                    <Label
                      htmlFor="sports-recreation"
                      className="text-gray-700"
                    >
                      Sports & Recreation
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="travel-tourism"
                      checked={travelTourismChecked}
                      onCheckedChange={(checked) =>
                        setTravelTourismChecked(checked === true)
                      }
                    />
                    <Label htmlFor="travel-tourism" className="text-gray-700">
                      Travel & Tourism
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="urban-development"
                      checked={urbanDevelopmentChecked}
                      onCheckedChange={(checked) =>
                        setUrbanDevelopmentChecked(checked === true)
                      }
                    />
                    <Label
                      htmlFor="urban-development"
                      className="text-gray-700"
                    >
                      Urban Development & Infrastructure
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="us-politics"
                      checked={usPoliticsChecked}
                      onCheckedChange={(checked) =>
                        setUsPoliticsChecked(checked === true)
                      }
                    />
                    <Label htmlFor="us-politics" className="text-gray-700">
                      U.S. Politics & Policy
                    </Label>
                  </div>
                </div>
              </div>

              <hr className="my-6" />

              {/* Thought Leadership Areas */}
              <div className="mb-6">
                <Label
                  htmlFor="professionalAreas"
                  className="text-gray-700 font-medium block mb-2"
                >
                  In what professional areas do you seek to become a thought
                  leader?
                </Label>
                <p className="text-sm text-gray-500 mb-3">
                  Consider both your current expertise and areas where you
                  aspire to build credibility. Professional areas might include
                  any business topics, functions, market segments, verticals,
                  etc. An example might be: AI/ML applications in healthcare
                  delivery, ESG integration in private equity
                </p>
                <Input
                  id="professionalAreas"
                  value={professionalAreas}
                  onChange={(e) => setProfessionalAreas(e.target.value)}
                  className="w-full"
                  placeholder="Describe your professional focus areas..."
                />
              </div>

              <hr className="my-6" />

              {/* Content Creation Format Preferences */}
              <div className="mb-6">
                <Label className="text-gray-700 font-medium block mb-3">
                  As you think about content creation, are there any formats
                  that feel more natural to you? (Select all that apply){" "}
                  <span className="text-red-500">*</span>
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="sharing-news"
                      checked={sharingNewsChecked}
                      onCheckedChange={(checked) =>
                        setSharingNewsChecked(checked === true)
                      }
                    />
                    <Label htmlFor="sharing-news" className="text-gray-700">
                      Sharing industry news with your perspective
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="writing-experiences"
                      checked={writingExperiencesChecked}
                      onCheckedChange={(checked) =>
                        setWritingExperiencesChecked(checked === true)
                      }
                    />
                    <Label
                      htmlFor="writing-experiences"
                      className="text-gray-700"
                    >
                      Writing about your learned experiences
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="analyzing-trends"
                      checked={analyzingTrendsChecked}
                      onCheckedChange={(checked) =>
                        setAnalyzingTrendsChecked(checked === true)
                      }
                    />
                    <Label htmlFor="analyzing-trends" className="text-gray-700">
                      Analyzing trends
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="commenting-posts"
                      checked={commentingPostsChecked}
                      onCheckedChange={(checked) =>
                        setCommentingPostsChecked(checked === true)
                      }
                    />
                    <Label htmlFor="commenting-posts" className="text-gray-700">
                      Commenting on others' posts
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="how-to-content"
                      checked={howToContentChecked}
                      onCheckedChange={(checked) =>
                        setHowToContentChecked(checked === true)
                      }
                    />
                    <Label htmlFor="how-to-content" className="text-gray-700">
                      Creating how-to content
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="event-takeaways"
                      checked={eventTakeawaysChecked}
                      onCheckedChange={(checked) =>
                        setEventTakeawaysChecked(checked === true)
                      }
                    />
                    <Label htmlFor="event-takeaways" className="text-gray-700">
                      Sharing event takeaways
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="personal-anecdote"
                      checked={personalAnecdoteChecked}
                      onCheckedChange={(checked) =>
                        setPersonalAnecdoteChecked(checked === true)
                      }
                    />
                    <Label
                      htmlFor="personal-anecdote"
                      className="text-gray-700"
                    >
                      Personal anecdote
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="digital-communities"
                      checked={digitalCommunitiesChecked}
                      onCheckedChange={(checked) =>
                        setDigitalCommunitiesChecked(checked === true)
                      }
                    />
                    <Label
                      htmlFor="digital-communities"
                      className="text-gray-700"
                    >
                      Digital communities
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="other-content-format"
                      checked={otherContentFormatChecked}
                      onCheckedChange={(checked) =>
                        setOtherContentFormatChecked(checked === true)
                      }
                    />
                    <Label
                      htmlFor="other-content-format"
                      className="text-gray-700"
                    >
                      Other
                    </Label>
                  </div>

                  {otherContentFormatChecked && (
                    <div className="ml-6 mt-2 md:col-span-2">
                      <Input
                        value={otherContentFormat}
                        onChange={(e) => setOtherContentFormat(e.target.value)}
                        placeholder="Please specify other content format"
                        className="w-full"
                      />
                    </div>
                  )}
                </div>
              </div>

              <hr className="my-6" />

              {/* Posting Barriers */}
              <div className="mb-6">
                <Label className="text-gray-700 font-medium block mb-3">
                  What holds you back from posting more frequently? (Select all
                  that apply) <span className="text-red-500">*</span>
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="unsure-what-to-say"
                      checked={unsureWhatToSayChecked}
                      onCheckedChange={(checked) =>
                        setUnsureWhatToSayChecked(checked === true)
                      }
                    />
                    <Label
                      htmlFor="unsure-what-to-say"
                      className="text-gray-700"
                    >
                      Unsure what to say
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="fear-of-judgment"
                      checked={fearOfJudgmentChecked}
                      onCheckedChange={(checked) =>
                        setFearOfJudgmentChecked(checked === true)
                      }
                    />
                    <Label htmlFor="fear-of-judgment" className="text-gray-700">
                      Fear of judgment
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="time-management"
                      checked={timeManagementChecked}
                      onCheckedChange={(checked) =>
                        setTimeManagementChecked(checked === true)
                      }
                    />
                    <Label htmlFor="time-management" className="text-gray-700">
                      Time management
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="dont-know-how-to-start"
                      checked={dontKnowHowToStartChecked}
                      onCheckedChange={(checked) =>
                        setDontKnowHowToStartChecked(checked === true)
                      }
                    />
                    <Label
                      htmlFor="dont-know-how-to-start"
                      className="text-gray-700"
                    >
                      Don't know how to start
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="unclear-professional-voice"
                      checked={unclearProfessionalVoiceChecked}
                      onCheckedChange={(checked) =>
                        setUnclearProfessionalVoiceChecked(checked === true)
                      }
                    />
                    <Label
                      htmlFor="unclear-professional-voice"
                      className="text-gray-700"
                    >
                      Unclear on professional voice
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="other-barrier"
                      checked={otherBarrierChecked}
                      onCheckedChange={(checked) =>
                        setOtherBarrierChecked(checked === true)
                      }
                    />
                    <Label htmlFor="other-barrier" className="text-gray-700">
                      Other
                    </Label>
                  </div>

                  {otherBarrierChecked && (
                    <div className="ml-6 mt-2 md:col-span-2">
                      <Input
                        value={otherBarrier}
                        onChange={(e) => setOtherBarrier(e.target.value)}
                        placeholder="Please specify other barriers"
                        className="w-full"
                      />
                    </div>
                  )}
                </div>
              </div>

              <hr className="my-6" />

              {/* Technology Subcategories - Only show when Technology is checked */}
              {technologyChecked && (
                <div className="mb-6">
                  <Label className="text-gray-700 font-medium block mb-3">
                    If you selected, Technology & Digital Media, please
                    elaborate:
                  </Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* AI/ML Section */}
                    <div className="space-y-2">
                      <p className="font-medium text-gray-700">AI / ML</p>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="ai-consumer"
                          checked={aiConsumerChecked}
                          onCheckedChange={(checked) =>
                            setAiConsumerChecked(checked === true)
                          }
                        />
                        <Label htmlFor="ai-consumer" className="text-gray-700">
                          Consumer Applications
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="ai-vision"
                          checked={aiComputerVisionChecked}
                          onCheckedChange={(checked) =>
                            setAiComputerVisionChecked(checked === true)
                          }
                        />
                        <Label htmlFor="ai-vision" className="text-gray-700">
                          Computer Vision & Generation
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="ai-ethics"
                          checked={aiEthicsChecked}
                          onCheckedChange={(checked) =>
                            setAiEthicsChecked(checked === true)
                          }
                        />
                        <Label htmlFor="ai-ethics" className="text-gray-700">
                          Ethics & Governance
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="ai-infrastructure"
                          checked={aiInfrastructureChecked}
                          onCheckedChange={(checked) =>
                            setAiInfrastructureChecked(checked === true)
                          }
                        />
                        <Label
                          htmlFor="ai-infrastructure"
                          className="text-gray-700"
                        >
                          Infrastructure & Platforms
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="ai-nlp"
                          checked={aiNlpChecked}
                          onCheckedChange={(checked) =>
                            setAiNlpChecked(checked === true)
                          }
                        />
                        <Label htmlFor="ai-nlp" className="text-gray-700">
                          Natural Language Processing
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="ai-predictive"
                          checked={aiPredictiveChecked}
                          onCheckedChange={(checked) =>
                            setAiPredictiveChecked(checked === true)
                          }
                        />
                        <Label
                          htmlFor="ai-predictive"
                          className="text-gray-700"
                        >
                          Predictive Analytics
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="ai-robotics"
                          checked={aiRoboticsChecked}
                          onCheckedChange={(checked) =>
                            setAiRoboticsChecked(checked === true)
                          }
                        />
                        <Label htmlFor="ai-robotics" className="text-gray-700">
                          Robotics & Automation
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="ai-scientific"
                          checked={aiScientificChecked}
                          onCheckedChange={(checked) =>
                            setAiScientificChecked(checked === true)
                          }
                        />
                        <Label
                          htmlFor="ai-scientific"
                          className="text-gray-700"
                        >
                          Scientific Applications
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="ai-learning"
                          checked={aiLearningChecked}
                          onCheckedChange={(checked) =>
                            setAiLearningChecked(checked === true)
                          }
                        />
                        <Label htmlFor="ai-learning" className="text-gray-700">
                          Supervised/Unsupervised Learning
                        </Label>
                      </div>
                    </div>

                    {/* Consumer Technology Section */}
                    <div className="space-y-2">
                      <p className="font-medium text-gray-700">
                        Consumer Technology
                      </p>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="consumer-devices"
                          checked={consumerDevicesChecked}
                          onCheckedChange={(checked) =>
                            setConsumerDevicesChecked(checked === true)
                          }
                        />
                        <Label
                          htmlFor="consumer-devices"
                          className="text-gray-700"
                        >
                          Devices & Gadgets
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="consumer-gaming"
                          checked={consumerGamingChecked}
                          onCheckedChange={(checked) =>
                            setConsumerGamingChecked(checked === true)
                          }
                        />
                        <Label
                          htmlFor="consumer-gaming"
                          className="text-gray-700"
                        >
                          Gaming, Esports & Entertainment
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="consumer-mobile"
                          checked={consumerMobileChecked}
                          onCheckedChange={(checked) =>
                            setConsumerMobileChecked(checked === true)
                          }
                        />
                        <Label
                          htmlFor="consumer-mobile"
                          className="text-gray-700"
                        >
                          Mobile & Apps
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="consumer-smart-home"
                          checked={consumerSmartHomeChecked}
                          onCheckedChange={(checked) =>
                            setConsumerSmartHomeChecked(checked === true)
                          }
                        />
                        <Label
                          htmlFor="consumer-smart-home"
                          className="text-gray-700"
                        >
                          Smart Home & IoT
                        </Label>
                      </div>
                    </div>

                    {/* Cybersecurity & Privacy Section */}
                    <div className="space-y-2">
                      <p className="font-medium text-gray-700">
                        Cybersecurity & Privacy
                      </p>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="cybersecurity-solutions"
                          checked={cybersecuritySolutionsChecked}
                          onCheckedChange={(checked) =>
                            setCybersecuritySolutionsChecked(checked === true)
                          }
                        />
                        <Label
                          htmlFor="cybersecurity-solutions"
                          className="text-gray-700"
                        >
                          Cybersecurity Solutions
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="data-privacy"
                          checked={dataPrivacyChecked}
                          onCheckedChange={(checked) =>
                            setDataPrivacyChecked(checked === true)
                          }
                        />
                        <Label htmlFor="data-privacy" className="text-gray-700">
                          Data Privacy
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="regulatory-compliance"
                          checked={regulatoryComplianceChecked}
                          onCheckedChange={(checked) =>
                            setRegulatoryComplianceChecked(checked === true)
                          }
                        />
                        <Label
                          htmlFor="regulatory-compliance"
                          className="text-gray-700"
                        >
                          Regulatory Compliance
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="risk-management"
                          checked={riskManagementChecked}
                          onCheckedChange={(checked) =>
                            setRiskManagementChecked(checked === true)
                          }
                        />
                        <Label
                          htmlFor="risk-management"
                          className="text-gray-700"
                        >
                          Risk Management
                        </Label>
                      </div>
                    </div>

                    {/* Digital Infrastructure Section */}
                    <div className="space-y-2">
                      <p className="font-medium text-gray-700">
                        Digital Infrastructure
                      </p>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="cloud-computing"
                          checked={cloudComputingChecked}
                          onCheckedChange={(checked) =>
                            setCloudComputingChecked(checked === true)
                          }
                        />
                        <Label
                          htmlFor="cloud-computing"
                          className="text-gray-700"
                        >
                          Cloud Computing
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="data-centers"
                          checked={dataCentersChecked}
                          onCheckedChange={(checked) =>
                            setDataCentersChecked(checked === true)
                          }
                        />
                        <Label htmlFor="data-centers" className="text-gray-700">
                          Data Centers
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="networks"
                          checked={networksChecked}
                          onCheckedChange={(checked) =>
                            setNetworksChecked(checked === true)
                          }
                        />
                        <Label htmlFor="networks" className="text-gray-700">
                          Networks & Connectivity
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="web3-blockchain"
                          checked={web3BlockchainChecked}
                          onCheckedChange={(checked) =>
                            setWeb3BlockchainChecked(checked === true)
                          }
                        />
                        <Label
                          htmlFor="web3-blockchain"
                          className="text-gray-700"
                        >
                          Web3 & Blockchain
                        </Label>
                      </div>
                    </div>

                    {/* Digital Media & Content Section */}
                    <div className="space-y-2">
                      <p className="font-medium text-gray-700">
                        Digital Media & Content
                      </p>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="content-distribution"
                          checked={contentDistributionChecked}
                          onCheckedChange={(checked) =>
                            setContentDistributionChecked(checked === true)
                          }
                        />
                        <Label
                          htmlFor="content-distribution"
                          className="text-gray-700"
                        >
                          Content Distribution
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="creator-economy"
                          checked={creatorEconomyChecked}
                          onCheckedChange={(checked) =>
                            setCreatorEconomyChecked(checked === true)
                          }
                        />
                        <Label
                          htmlFor="creator-economy"
                          className="text-gray-700"
                        >
                          Creator Economy
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="digital-marketing"
                          checked={digitalMarketingChecked}
                          onCheckedChange={(checked) =>
                            setDigitalMarketingChecked(checked === true)
                          }
                        />
                        <Label
                          htmlFor="digital-marketing"
                          className="text-gray-700"
                        >
                          Digital Marketing
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="social-media-platforms"
                          checked={socialMediaPlatformsChecked}
                          onCheckedChange={(checked) =>
                            setSocialMediaPlatformsChecked(checked === true)
                          }
                        />
                        <Label
                          htmlFor="social-media-platforms"
                          className="text-gray-700"
                        >
                          Social Media & Platforms
                        </Label>
                      </div>
                    </div>

                    {/* Emerging Technology Section */}
                    <div className="space-y-2">
                      <p className="font-medium text-gray-700">
                        Emerging Technology
                      </p>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="ar-vr-xr"
                          checked={arVrXrChecked}
                          onCheckedChange={(checked) =>
                            setArVrXrChecked(checked === true)
                          }
                        />
                        <Label htmlFor="ar-vr-xr" className="text-gray-700">
                          AR / VR / XR
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="biotech-health"
                          checked={biotechHealthChecked}
                          onCheckedChange={(checked) =>
                            setBiotechHealthChecked(checked === true)
                          }
                        />
                        <Label
                          htmlFor="biotech-health"
                          className="text-gray-700"
                        >
                          Biotech & Digital Health
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="quantum-computing"
                          checked={quantumComputingChecked}
                          onCheckedChange={(checked) =>
                            setQuantumComputingChecked(checked === true)
                          }
                        />
                        <Label
                          htmlFor="quantum-computing"
                          className="text-gray-700"
                        >
                          Quantum Computing
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="emerging-robotics"
                          checked={emergingRoboticsChecked}
                          onCheckedChange={(checked) =>
                            setEmergingRoboticsChecked(checked === true)
                          }
                        />
                        <Label
                          htmlFor="emerging-robotics"
                          className="text-gray-700"
                        >
                          Robotics & Automation
                        </Label>
                      </div>
                    </div>

                    {/* Enterprise Technology Section */}
                    <div className="space-y-2">
                      <p className="font-medium text-gray-700">
                        Enterprise Technology
                      </p>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="business-apps"
                          checked={businessAppsChecked}
                          onCheckedChange={(checked) =>
                            setBusinessAppsChecked(checked === true)
                          }
                        />
                        <Label
                          htmlFor="business-apps"
                          className="text-gray-700"
                        >
                          Business Applications
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="digital-transformation"
                          checked={enterpriseDigitalTransformationChecked}
                          onCheckedChange={(checked) =>
                            setEnterpriseDigitalTransformationChecked(
                              checked === true,
                            )
                          }
                        />
                        <Label
                          htmlFor="digital-transformation"
                          className="text-gray-700"
                        >
                          Digital Transformation
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="integration-apis"
                          checked={integrationApisChecked}
                          onCheckedChange={(checked) =>
                            setIntegrationApisChecked(checked === true)
                          }
                        />
                        <Label
                          htmlFor="integration-apis"
                          className="text-gray-700"
                        >
                          Integration & APIs
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="saas-enterprise"
                          checked={saasEnterpriseChecked}
                          onCheckedChange={(checked) =>
                            setSaasEnterpriseChecked(checked === true)
                          }
                        />
                        <Label
                          htmlFor="saas-enterprise"
                          className="text-gray-700"
                        >
                          SaaS & Enterprise Software
                        </Label>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <hr className="my-6" />
            </div>
          </div>
        );
      case 5:
        return (
          <div className="space-y-6">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-3">
                Professional Goals
              </h2>

              <div className="mb-8">
                <Label
                  htmlFor="careerGoals"
                  className="text-gray-700 font-medium block mb-2"
                >
                  Beyond your immediate next job, what are your career goals
                  within the next 2-5 years?
                </Label>
                <p className="text-sm text-gray-500 mb-3">
                  What roles, industries, or impact do you want to have?
                </p>
                <Input
                  id="careerGoals"
                  value={careerGoals}
                  onChange={(e) => setCareerGoals(e.target.value)}
                  className="w-full"
                  placeholder="Describe your career goals..."
                />
              </div>

              <hr className="my-6" />

              <div className="mb-8">
                <Label className="text-gray-700 font-medium block mb-3">
                  What percentage of your LinkedIn connections are in your
                  target industry? <span className="text-red-500">*</span>
                </Label>

                <div className="space-y-3 mt-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroup
                      value={industryConnectionsPercentage}
                      onValueChange={setIndustryConnectionsPercentage}
                      className="space-y-3"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem
                          value="0-10%"
                          id="connections-very-few"
                        />
                        <Label
                          htmlFor="connections-very-few"
                          className="cursor-pointer"
                        >
                          Very Few (0-10%)
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="10-25%" id="connections-some" />
                        <Label
                          htmlFor="connections-some"
                          className="cursor-pointer"
                        >
                          Some (10-25%)
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="25-50%" id="connections-half" />
                        <Label
                          htmlFor="connections-half"
                          className="cursor-pointer"
                        >
                          About Half (25-50%)
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <RadioGroupItem
                          value="50%+"
                          id="connections-majority"
                        />
                        <Label
                          htmlFor="connections-majority"
                          className="cursor-pointer"
                        >
                          Majority (50%+)
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <RadioGroupItem
                          value="not-sure"
                          id="connections-not-sure"
                        />
                        <Label
                          htmlFor="connections-not-sure"
                          className="cursor-pointer"
                        >
                          Not Sure / Still Exploring Target Industry
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                </div>
              </div>

              <hr className="my-6" />

              <div className="mb-6">
                <Label className="text-gray-700 font-medium block mb-3">
                  What personality / strength assessments have you taken?
                  (Select all that apply)
                </Label>

                <div className="space-y-3 mt-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="mbti"
                      checked={mbtiChecked}
                      onCheckedChange={(checked) =>
                        setMbtiChecked(checked === true)
                      }
                    />
                    <Label htmlFor="mbti" className="cursor-pointer">
                      Myer's Briggs (MBTI)
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="strengths-finder"
                      checked={strengthsFinderChecked}
                      onCheckedChange={(checked) =>
                        setStrengthsFinderChecked(checked === true)
                      }
                    />
                    <Label
                      htmlFor="strengths-finder"
                      className="cursor-pointer"
                    >
                      Strengths Finder
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="via"
                      checked={viaChecked}
                      onCheckedChange={(checked) =>
                        setViaChecked(checked === true)
                      }
                    />
                    <Label htmlFor="via" className="cursor-pointer">
                      VIA - Values in Action
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="enneagram"
                      checked={enneagramChecked}
                      onCheckedChange={(checked) =>
                        setEnneagramChecked(checked === true)
                      }
                    />
                    <Label htmlFor="enneagram" className="cursor-pointer">
                      Enneagram
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="threeSixty"
                      checked={threeSixtyChecked}
                      onCheckedChange={(checked) =>
                        setThreeSixtyChecked(checked === true)
                      }
                    />
                    <Label htmlFor="threeSixty" className="cursor-pointer">
                      360* Leadership, Managerial, or Team Assessment
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="other-assessment"
                      checked={otherAssessmentChecked}
                      onCheckedChange={(checked) =>
                        setOtherAssessmentChecked(checked === true)
                      }
                    />
                    <Label
                      htmlFor="other-assessment"
                      className="cursor-pointer"
                    >
                      Other
                    </Label>
                  </div>

                  {otherAssessmentChecked && (
                    <div className="ml-6 mt-2">
                      <Input
                        value={otherAssessment}
                        onChange={(e) => setOtherAssessment(e.target.value)}
                        placeholder="Please specify other assessments"
                        className="w-full"
                      />
                    </div>
                  )}
                </div>
              </div>

              <hr className="my-6" />

              <div className="mb-6">
                <Label className="text-gray-700 font-medium block mb-3">
                  Please upload the personality / strength assessments you have
                  taken
                </Label>
                <p className="text-sm text-gray-500 mb-3">
                  You can upload up to 10 files. PDF, PNG, JPEG, and DOC/DOCX
                  formats are supported.
                </p>

                <div className="mt-4 border-2 border-dashed border-gray-300 p-6 rounded-md">
                  <Input
                    id="file-upload"
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    onChange={(e) => {
                      if (e.target.files) {
                        const fileList = Array.from(e.target.files);
                        if (fileList.length > 10) {
                          toast({
                            title: "Too many files",
                            description:
                              "You can upload a maximum of 10 files.",
                            variant: "destructive",
                          });
                          return;
                        }
                        setFiles(fileList);
                      }
                    }}
                    className="cursor-pointer"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Max file size: 5MB per file
                  </p>

                  {files.length > 0 && (
                    <div className="mt-4">
                      <h4 className="font-medium mb-2">
                        Selected Files ({files.length}):
                      </h4>
                      <ul className="list-disc pl-5 space-y-1">
                        {files.map((file, index) => (
                          <li key={index} className="text-sm">
                            {file.name} ({(file.size / 1024 / 1024).toFixed(2)}{" "}
                            MB)
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              <hr className="my-6" />

              <div className="mb-6">
                <Label
                  htmlFor="additionalInfo"
                  className="text-gray-700 font-medium block mb-3"
                >
                  Is there anything else you want to share about your
                  professional journey and brand?
                </Label>
                <p className="text-sm text-gray-500 mb-3">
                  Please provide any additional information that might be
                  relevant
                </p>
                <Input
                  id="additionalInfo"
                  value={additionalInfo}
                  onChange={(e) => setAdditionalInfo(e.target.value)}
                  className="w-full"
                  placeholder="Share any additional thoughts, experiences, or information about your professional journey that you'd like us to know..."
                />
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const isFirstStep = currentStep === 1;
  const isLastStep = currentStep === totalSteps;

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[#bed6d1]" />
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="container py-10 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        <Card className="border-none shadow-md">
          <CardHeader className="bg-gradient-to-r from-[#6c8083] to-[#bed6d1] text-white rounded-t-lg">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-2xl font-bold">
                  Initial Questionnaire
                  {userProfile?.questionnaire?.isDraft && (
                    <span className="ml-2 inline-flex items-center rounded-md bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800 ring-1 ring-inset ring-yellow-600/20">
                      Draft
                    </span>
                  )}
                </CardTitle>
                <CardDescription className="text-white opacity-90">
                  {userProfile?.questionnaire
                    ? "Review or update your career insights to receive personalized guidance."
                    : "Last step! Help us understand your career journey and aspirations so we can provide personalized guidance."}
                </CardDescription>
              </div>
              <Button 
                variant="outline" 
                className="bg-white text-[#6c8083] hover:bg-gray-100 hover:text-[#4c5c5e]"
                onClick={() => navigate("/")}
              >
                Back to Home
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-6 lg:p-8">
            {/* Progress indicator */}
            <div className="mb-8">
              <div className="flex items-center justify-between">
                {Array.from({ length: totalSteps }).map((_, index) => (
                  <div key={index} className="flex flex-col items-center">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${
                        index + 1 === currentStep
                          ? "bg-[#bed6d1] text-white"
                          : index + 1 < currentStep
                            ? "bg-green-500 text-white"
                            : "bg-gray-200 text-gray-500"
                      }`}
                    >
                      {index + 1 < currentStep ? (
                        <CheckCircle className="h-5 w-5" />
                      ) : (
                        index + 1
                      )}
                    </div>
                    <span className="text-xs text-gray-500">
                      {index === 0
                        ? "Industry"
                        : index === 1
                          ? "Digital Presence"
                          : index === 2
                            ? "Branding & Content"
                            : index === 3
                              ? "Interests"
                              : "Professional Goals"}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-2 h-1 bg-gray-200 w-full rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#bed6d1] transition-all duration-300 ease-in-out"
                  style={{ width: `${(currentStep / totalSteps) * 100}%` }}
                ></div>
              </div>
            </div>

            <div className="space-y-6">
              {renderStepContent()}

              <div className="flex justify-between mt-8">
                <Button
                  type="button"
                  variant="outline"
                  onClick={prevStep}
                  disabled={isFirstStep}
                  className="w-[120px]"
                >
                  Previous
                </Button>

                <div className="flex items-center gap-2">
                  {/* Auto-save indicator */}
                  {saveStatus === "saving" && (
                    <div className="text-xs text-muted-foreground flex items-center mr-2">
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      Saving...
                    </div>
                  )}
                  {saveStatus === "saved" && (
                    <div className="text-xs text-green-600 flex items-center mr-2">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Saved
                    </div>
                  )}
                  
                  {/* Save as Draft button - only shown if questionnaire doesn't exist or is a draft */}
                  {(!userProfile?.questionnaire || userProfile?.questionnaire?.isDraft) && (
                    <Button
                      type="button"
                      onClick={handleSaveAsDraft}
                      className="w-[120px]"
                      variant="outline"
                      disabled={saveAsDraftMutation.isPending}
                    >
                      {saveAsDraftMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      Save as Draft
                    </Button>
                  )}
                
                  {/* Submit or Next button */}
                  {isLastStep ? (
                    <Button
                      type="button"
                      onClick={handleSubmit}
                      className="w-[120px] bg-[#bed6d1] hover:bg-[#6c8083]"
                      disabled={questionnaireMutation.isPending}
                    >
                      {questionnaireMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      Submit
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={nextStep}
                      className="w-[120px] bg-[#bed6d1] hover:bg-[#6c8083]"
                    >
                      Next
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
