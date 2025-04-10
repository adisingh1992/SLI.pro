import React, { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  "Transportation / Logistics - General"
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
  "Technical - Systems Management"
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
  const [financialServicesChecked, setFinancialServicesChecked] = useState(false);
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
  const [digitalTransformationAIChecked, setDigitalTransformationAIChecked] = useState(false);
  const [educationLearningChecked, setEducationLearningChecked] = useState(false);
  
  // Content Creation Format preferences
  const [sharingNewsChecked, setSharingNewsChecked] = useState(false);
  const [writingExperiencesChecked, setWritingExperiencesChecked] = useState(false);
  const [analyzingTrendsChecked, setAnalyzingTrendsChecked] = useState(false);
  const [commentingPostsChecked, setCommentingPostsChecked] = useState(false);
  const [howToContentChecked, setHowToContentChecked] = useState(false);
  const [eventTakeawaysChecked, setEventTakeawaysChecked] = useState(false);
  const [personalAnecdoteChecked, setPersonalAnecdoteChecked] = useState(false);
  const [digitalCommunitiesChecked, setDigitalCommunitiesChecked] = useState(false);
  const [otherContentFormatChecked, setOtherContentFormatChecked] = useState(false);
  const [otherContentFormat, setOtherContentFormat] = useState("");
  
  // Posting Barriers
  const [unsureWhatToSayChecked, setUnsureWhatToSayChecked] = useState(false);
  const [fearOfJudgmentChecked, setFearOfJudgmentChecked] = useState(false);
  const [timeManagementChecked, setTimeManagementChecked] = useState(false);
  const [dontKnowHowToStartChecked, setDontKnowHowToStartChecked] = useState(false);
  const [unclearProfessionalVoiceChecked, setUnclearProfessionalVoiceChecked] = useState(false);
  const [otherBarrierChecked, setOtherBarrierChecked] = useState(false);
  const [otherBarrier, setOtherBarrier] = useState("");
  const [emergingMarketsChecked, setEmergingMarketsChecked] = useState(false);
  const [entertainmentArtsChecked, setEntertainmentArtsChecked] = useState(false);
  const [financialInnovationChecked, setFinancialInnovationChecked] = useState(false);
  const [futureOfWorkChecked, setFutureOfWorkChecked] = useState(false);
  const [globalEconomyChecked, setGlobalEconomyChecked] = useState(false);
  const [geopoliticsChecked, setGeopoliticsChecked] = useState(false);
  const [healthWellnessChecked, setHealthWellnessChecked] = useState(false);
  const [healthcareInnovationChecked, setHealthcareInnovationChecked] = useState(false);
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
  const [consumerSmartHomeChecked, setConsumerSmartHomeChecked] = useState(false);
  const [cybersecuritySolutionsChecked, setCybersecuritySolutionsChecked] = useState(false);
  const [dataPrivacyChecked, setDataPrivacyChecked] = useState(false);
  const [regulatoryComplianceChecked, setRegulatoryComplianceChecked] = useState(false);
  const [riskManagementChecked, setRiskManagementChecked] = useState(false);
  const [cloudComputingChecked, setCloudComputingChecked] = useState(false);
  const [dataCentersChecked, setDataCentersChecked] = useState(false);
  const [networksChecked, setNetworksChecked] = useState(false);
  const [web3BlockchainChecked, setWeb3BlockchainChecked] = useState(false);
  const [contentDistributionChecked, setContentDistributionChecked] = useState(false);
  const [creatorEconomyChecked, setCreatorEconomyChecked] = useState(false);
  const [digitalMarketingChecked, setDigitalMarketingChecked] = useState(false);
  const [socialMediaPlatformsChecked, setSocialMediaPlatformsChecked] = useState(false);
  const [arVrXrChecked, setArVrXrChecked] = useState(false);
  const [biotechHealthChecked, setBiotechHealthChecked] = useState(false);
  const [quantumComputingChecked, setQuantumComputingChecked] = useState(false);
  const [emergingRoboticsChecked, setEmergingRoboticsChecked] = useState(false);
  const [businessAppsChecked, setBusinessAppsChecked] = useState(false);
  const [enterpriseDigitalTransformationChecked, setEnterpriseDigitalTransformationChecked] = useState(false);
  const [integrationApisChecked, setIntegrationApisChecked] = useState(false);
  const [saasEnterpriseChecked, setSaasEnterpriseChecked] = useState(false);
  
  
  // Social media checkboxes state
  const [twitterChecked, setTwitterChecked] = useState(false);
  const [mediumChecked, setMediumChecked] = useState(false);
  const [blogChecked, setBlogChecked] = useState(false);
  const [otherChecked, setOtherChecked] = useState(false);
  const [otherSocialMedia, setOtherSocialMedia] = useState("");
  
  // Branding challenges checkboxes state
  const [consistentNarrativeChecked, setConsistentNarrativeChecked] = useState(false);
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
  const [industryPresentationsChecked, setIndustryPresentationsChecked] = useState(false);
  const [academicPapersChecked, setAcademicPapersChecked] = useState(false);
  const [neverPublishedChecked, setNeverPublishedChecked] = useState(false);
  const [otherPublishedContentChecked, setOtherPublishedContentChecked] = useState(false);
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
  const [acceptedConnectionsChecked, setAcceptedConnectionsChecked] = useState(false);
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
  const [commented12TimesPerMonthChecked, setCommented12TimesPerMonthChecked] = useState(false);
  const [commented12TimesPerWeekChecked, setCommented12TimesPerWeekChecked] = useState(false);
  const [commented3PlusTimesPerWeekChecked, setCommented3PlusTimesPerWeekChecked] = useState(false);
  const [reactedNeverChecked, setReactedNeverChecked] = useState(false);
  const [reactedFewTimesMonthChecked, setReactedFewTimesMonthChecked] = useState(false);
  const [reactedFewTimesWeekChecked, setReactedFewTimesWeekChecked] = useState(false);
  const [reactedDailyChecked, setReactedDailyChecked] = useState(false);
  
  // Brand positioning rating (scale 1-5)
  const [brandPositioningRating, setBrandPositioningRating] = useState<number | null>(null);
  
  // Content creation comfort rating (scale 1-5)
  const [contentCreationComfort, setContentCreationComfort] = useState<number | null>(null);
  
  // Professional brand optimization goals
  const [brandOptimizationGoals, setBrandOptimizationGoals] = useState("");
  
  // Professional Goals - Step 4
  const [careerGoals, setCareerGoals] = useState(""); // For 2-5 year career goals
  
  // LinkedIn connections in target industry
  const [industryConnectionsPercentage, setIndustryConnectionsPercentage] = useState<string | undefined>(undefined);
  
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
  
  // Fetch user profile data
  const { data: userProfile, isLoading: profileLoading } = useQuery<UserProfile>({
    queryKey: ["/api/user/profile"],
    enabled: !!user,
  });

  // Create/update questionnaire mutation
  const questionnaireMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest(
        "POST",
        "/api/questionnaire",
        data
      );
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Registration Complete!",
        description: "Your account setup is now complete. Thank you for providing your career insights!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
      navigate("/profile");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "There was a problem submitting your questionnaire. Please try again.",
        variant: "destructive",
      });
    },
  });
  
  // Initialize form data from user profile if available
  React.useEffect(() => {
    if (userProfile?.questionnaire) {
      const q = userProfile.questionnaire;
      
      // Set industry if available
      if (q.timeframe && q.timeframe.includes("Industry:")) {
        const industryMatch = q.timeframe.match(/Industry: (.*?)(?:,|$)/);
        if (industryMatch && industryMatch[1]) {
          setIndustry(industryMatch[1].trim());
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
        const challengesText = q.aspirations.split("Branding challenges:")[1].trim();
        
        // Check each branding challenge and set state accordingly
        setConsistentNarrativeChecked(challengesText.includes("Building a consistent professional narrative"));
        setValuePropositionChecked(challengesText.includes("Identifying my unique value proposition"));
        setEngagingContentChecked(challengesText.includes("Creating engaging content"));
        setFindingTimeChecked(challengesText.includes("Finding time to maintain online presence"));
        setGrowingNetworkChecked(challengesText.includes("Growing my professional network"));
        setSharingInsightsChecked(challengesText.includes("Sharing industry insights and work experiences"));
        setEngagingNetworkChecked(challengesText.includes("Engaging with my professional network"));
        setIndustryEventsChecked(challengesText.includes("Participating in industry discussions and events"));
        
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
        const publishedContentText = q.aspirations.split("Published content:")[1].trim().split('\n')[0];
        
        // Check each published content type and set state accordingly
        setLinkedInPostsChecked(publishedContentText.includes("LinkedIn posts"));
        setBlogArticlesChecked(publishedContentText.includes("Blog articles"));
        setIndustryPresentationsChecked(publishedContentText.includes("Industry presentations"));
        setAcademicPapersChecked(publishedContentText.includes("Academic papers"));
        setNeverPublishedChecked(publishedContentText.includes("Never published professional content"));
        
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
      if (q.aspirations && q.aspirations.includes("LinkedIn profile update timing:")) {
        const updateTimingText = q.aspirations.split("LinkedIn profile update timing:")[1].trim().split('\n')[0];
        
        // Check each update timing option and set state accordingly
        setLastWeekChecked(updateTimingText.includes("Within the last week"));
        setLastMonthChecked(updateTimingText.includes("Within the last month"));
        setBusinessSchoolChecked(updateTimingText.includes("For / during business school"));
        setCareerCoachChecked(updateTimingText.includes("After I spoke with a career coach"));
        setJobChangeChecked(updateTimingText.includes("When I last changed jobs"));
        setCantRememberChecked(updateTimingText.includes("I can't remember"));
        setNeverUpdatedChecked(updateTimingText.includes("I've never really updated it beyond creating the profile"));
        
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
        const activityText = q.aspirations.split("LinkedIn activity:")[1].trim().split('\n')[0];
        
        // Check each activity option and set state accordingly
        setReadNewsfeedChecked(activityText.includes("Read your Newsfeed"));
        setAcceptedConnectionsChecked(activityText.includes("Accepted Connections"));
        setNotActiveChecked(activityText.includes("Not Active in the Last Month"));
        setPostedNeverChecked(activityText.includes("Posted Original Content - Never"));
        setPosted12TimesChecked(activityText.includes("Posted Original Content - 1-2 times"));
        setPosted35TimesChecked(activityText.includes("Posted Original Content - 3-5 times"));
        setPosted6PlusTimesChecked(activityText.includes("Posted Original Content - 6+ times"));
        setSharedNeverChecked(activityText.includes("Shared Others' Posts - Never"));
        setShared12TimesChecked(activityText.includes("Shared Others' Posts - 1-2 times"));
        setShared35TimesChecked(activityText.includes("Shared Others' Posts - 3-5 times"));
        setShared6PlusTimesChecked(activityText.includes("Shared Others' Posts - 6+ times"));
        setCommentedNeverChecked(activityText.includes("Commented on Posts - Never"));
        setCommented12TimesPerMonthChecked(activityText.includes("Commented on Posts - 1-2 times per month"));
        setCommented12TimesPerWeekChecked(activityText.includes("Commented on Posts - 1-2 times per week"));
        setCommented3PlusTimesPerWeekChecked(activityText.includes("Commented on Posts - 3+ times per week"));
        setReactedNeverChecked(activityText.includes("Reacted to Posts (likes, etc.) - Never"));
        setReactedFewTimesMonthChecked(activityText.includes("Reacted to Posts (likes, etc.) - A few times a month"));
        setReactedFewTimesWeekChecked(activityText.includes("Reacted to Posts (likes, etc.) - A few times a week"));
        setReactedDailyChecked(activityText.includes("Reacted to Posts (likes, etc.) - Daily"));
      }
      
      // Try to parse brand positioning rating from aspirations field
      if (q.aspirations && q.aspirations.includes("Brand positioning rating:")) {
        const ratingText = q.aspirations.split("Brand positioning rating:")[1].trim().split('\n')[0];
        if (ratingText.includes("1")) setBrandPositioningRating(1);
        else if (ratingText.includes("2")) setBrandPositioningRating(2);
        else if (ratingText.includes("3")) setBrandPositioningRating(3);
        else if (ratingText.includes("4")) setBrandPositioningRating(4);
        else if (ratingText.includes("5")) setBrandPositioningRating(5);
      }
      
      // Try to parse content creation comfort from aspirations field
      if (q.aspirations && q.aspirations.includes("Content creation comfort:")) {
        const comfortText = q.aspirations.split("Content creation comfort:")[1].trim().split('\n')[0];
        if (comfortText.includes("1")) setContentCreationComfort(1);
        else if (comfortText.includes("2")) setContentCreationComfort(2);
        else if (comfortText.includes("3")) setContentCreationComfort(3);
        else if (comfortText.includes("4")) setContentCreationComfort(4);
        else if (comfortText.includes("5")) setContentCreationComfort(5);
      }
      
      // Try to parse brand optimization goals from aspirations field
      if (q.aspirations && q.aspirations.includes("Brand optimization goals:")) {
        const goalsText = q.aspirations.split("Brand optimization goals:")[1].trim();
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
      // Step 2: Require LinkedIn URL and at least one social media platform
      const hasLinkedInUrl = background.trim() !== "";
      const hasSocialMediaSelected = 
        twitterChecked || 
        mediumChecked || 
        blogChecked || 
        (otherChecked && otherSocialMedia.trim() !== "");
        
      // Show toast for missing fields
      if (!hasLinkedInUrl || !hasSocialMediaSelected) {
        toast({
          title: "Required Fields Missing",
          description: !hasLinkedInUrl 
            ? "Please enter your LinkedIn URL" 
            : "Please select at least one social media platform",
          variant: "destructive",
        });
      }
      
      return hasLinkedInUrl && hasSocialMediaSelected;
    } else if (currentStep === 3) {
      // Step 3: Require at least one branding challenge and published content
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
        
      // Show toast for missing fields
      if (!hasBrandingChallengeSelected || !hasPublishedContentSelected) {
        toast({
          title: "Required Fields Missing",
          description: !hasBrandingChallengeSelected 
            ? "Please select at least one branding challenge" 
            : "Please select at least one type of content you've published",
          variant: "destructive",
        });
      }
      
      return hasBrandingChallengeSelected && hasPublishedContentSelected;
    } else if (currentStep === 4) {
      // Step 4: Require at least one industry interest and one societal interest
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
        
      // Show toast for missing fields
      if (!hasIndustryInterestSelected || !hasSocietalInterestSelected) {
        toast({
          title: "Required Fields Missing",
          description: !hasIndustryInterestSelected 
            ? "Please select at least one industry interest" 
            : "Please select at least one societal interest",
          variant: "destructive",
        });
      }
      
      return hasIndustryInterestSelected && hasSocietalInterestSelected;
    } else if (currentStep === 5) {
      // Step 5: Require career goals and industry connections percentage
      // Note that file upload is NOT required
      const hasCareerGoals = careerGoals.trim() !== "";
      const hasConnectionsPercentage = industryConnectionsPercentage !== undefined;
        
      // Show toast for missing fields
      if (!hasCareerGoals || !hasConnectionsPercentage) {
        toast({
          title: "Required Fields Missing",
          description: !hasCareerGoals 
            ? "Please describe your career goals" 
            : "Please select your LinkedIn connections percentage",
          variant: "destructive",
        });
      }
      
      return hasCareerGoals && hasConnectionsPercentage;
    }
    return false;
  };

  const nextStep = () => {
    if (validateCurrentStep() && currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    } else if (!validateCurrentStep()) {
      toast({
        title: "Please complete all fields",
        description: "All fields are required before proceeding to the next step.",
        variant: "destructive",
      });
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
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
        const base64Data = base64String.split(',')[1];
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
        const fileType = file.name.toLowerCase().endsWith(".pdf") ? "assessment-pdf" : 
                         file.name.toLowerCase().match(/\.(jpg|jpeg|png)$/) ? "assessment-image" : 
                         "assessment-doc";
        
        await apiRequest("POST", "/api/documents", {
          name: `Assessment: ${file.name}`,
          type: fileType,
          fileName: file.name,
          fileData: fileData
        });
      }
      
      toast({
        title: "Files Uploaded",
        description: `Successfully uploaded ${files.length} file${files.length > 1 ? 's' : ''}.`,
      });
      
    } catch (error) {
      console.error("Error uploading files:", error);
      toast({
        title: "Upload Error",
        description: "There was a problem uploading one or more files. Please try again.",
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
      
      // Prepare social media data
      const socialMediaOptions = [];
      if (twitterChecked) socialMediaOptions.push('Twitter/X');
      if (mediumChecked) socialMediaOptions.push('Medium');
      if (blogChecked) socialMediaOptions.push('Personal blog/Website');
      if (otherChecked && otherSocialMedia.trim() !== '') {
        socialMediaOptions.push(`Other: ${otherSocialMedia.trim()}`);
      }
      
      // Update goals field to include selected social media options
      const socialMediaDetails = goals.trim() !== '' 
        ? `${goals}\n\nSelected platforms: ${socialMediaOptions.join(', ')}` 
        : `Selected platforms: ${socialMediaOptions.join(', ')}`;
      
      // Prepare branding challenges data
      const brandingChallenges = [];
      if (consistentNarrativeChecked) brandingChallenges.push('Building a consistent professional narrative');
      if (valuePropositionChecked) brandingChallenges.push('Identifying my unique value proposition');
      if (engagingContentChecked) brandingChallenges.push('Creating engaging content');
      if (findingTimeChecked) brandingChallenges.push('Finding time to maintain online presence');
      if (growingNetworkChecked) brandingChallenges.push('Growing my professional network');
      if (sharingInsightsChecked) brandingChallenges.push('Sharing industry insights and work experiences');
      if (engagingNetworkChecked) brandingChallenges.push('Engaging with my professional network');
      if (industryEventsChecked) brandingChallenges.push('Participating in industry discussions and events');
      if (otherBrandingChecked && otherBrandingChallenge.trim() !== '') {
        brandingChallenges.push(`Other: ${otherBrandingChallenge.trim()}`);
      }
      
      // Prepare published content data
      const publishedContent = [];
      if (linkedInPostsChecked) publishedContent.push('LinkedIn posts');
      if (blogArticlesChecked) publishedContent.push('Blog articles');
      if (industryPresentationsChecked) publishedContent.push('Industry presentations');
      if (academicPapersChecked) publishedContent.push('Academic papers');
      if (neverPublishedChecked) publishedContent.push('Never published professional content');
      if (otherPublishedContentChecked && otherPublishedContent.trim() !== '') {
        publishedContent.push(`Other: ${otherPublishedContent.trim()}`);
      }
      
      // Prepare LinkedIn profile update timing data
      const profileUpdateTiming = [];
      if (lastWeekChecked) profileUpdateTiming.push('Within the last week');
      if (lastMonthChecked) profileUpdateTiming.push('Within the last month');
      if (businessSchoolChecked) profileUpdateTiming.push('For / during business school (if applicable)');
      if (careerCoachChecked) profileUpdateTiming.push('After I spoke with a career coach');
      if (jobChangeChecked) profileUpdateTiming.push('When I last changed jobs');
      if (cantRememberChecked) profileUpdateTiming.push('I can\'t remember');
      if (neverUpdatedChecked) profileUpdateTiming.push('I\'ve never really updated it beyond creating the profile');
      if (otherUpdateTimeChecked && otherUpdateTime.trim() !== '') {
        profileUpdateTiming.push(`Other: ${otherUpdateTime.trim()}`);
      }
      
      // Prepare LinkedIn activity data
      const linkedInActivity = [];
      if (readNewsfeedChecked) linkedInActivity.push('Read your Newsfeed');
      if (acceptedConnectionsChecked) linkedInActivity.push('Accepted Connections');
      if (notActiveChecked) linkedInActivity.push('Not Active in the Last Month');
      if (postedNeverChecked) linkedInActivity.push('Posted Original Content - Never');
      if (posted12TimesChecked) linkedInActivity.push('Posted Original Content - 1-2 times');
      if (posted35TimesChecked) linkedInActivity.push('Posted Original Content - 3-5 times');
      if (posted6PlusTimesChecked) linkedInActivity.push('Posted Original Content - 6+ times');
      if (sharedNeverChecked) linkedInActivity.push('Shared Others\' Posts - Never');
      if (shared12TimesChecked) linkedInActivity.push('Shared Others\' Posts - 1-2 times');
      if (shared35TimesChecked) linkedInActivity.push('Shared Others\' Posts - 3-5 times');
      if (shared6PlusTimesChecked) linkedInActivity.push('Shared Others\' Posts - 6+ times');
      if (commentedNeverChecked) linkedInActivity.push('Commented on Posts - Never');
      if (commented12TimesPerMonthChecked) linkedInActivity.push('Commented on Posts - 1-2 times per month');
      if (commented12TimesPerWeekChecked) linkedInActivity.push('Commented on Posts - 1-2 times per week');
      if (commented3PlusTimesPerWeekChecked) linkedInActivity.push('Commented on Posts - 3+ times per week');
      if (reactedNeverChecked) linkedInActivity.push('Reacted to Posts (likes, etc.) - Never');
      if (reactedFewTimesMonthChecked) linkedInActivity.push('Reacted to Posts (likes, etc.) - A few times a month');
      if (reactedFewTimesWeekChecked) linkedInActivity.push('Reacted to Posts (likes, etc.) - A few times a week');
      if (reactedDailyChecked) linkedInActivity.push('Reacted to Posts (likes, etc.) - Daily');
      
      // Prepare cross-cutting & societal interests data
      const crossCuttingInterests = [];
      if (climateChecked) crossCuttingInterests.push('Climate Change & Sustainability');
      if (consumerBehaviorChecked) crossCuttingInterests.push('Consumer Behavior & Culture');
      if (crimeJusticeChecked) crossCuttingInterests.push('Crime & Justice');
      if (digitalTransformationAIChecked) crossCuttingInterests.push('Digital Transformation/AI');
      if (educationLearningChecked) crossCuttingInterests.push('Education & Learning');
      if (emergingMarketsChecked) crossCuttingInterests.push('Emerging Markets');
      if (entertainmentArtsChecked) crossCuttingInterests.push('Entertainment & Arts');
      if (financialInnovationChecked) crossCuttingInterests.push('Financial Innovation & Markets');
      if (futureOfWorkChecked) crossCuttingInterests.push('Future of Work');
      if (globalEconomyChecked) crossCuttingInterests.push('Global Markets & Economy');
      if (geopoliticsChecked) crossCuttingInterests.push('Global Politics & Geopolitics');
      if (healthWellnessChecked) crossCuttingInterests.push('Health & Wellness');
      if (healthcareInnovationChecked) crossCuttingInterests.push('Healthcare Innovation');
      if (socialImpactDEIChecked) crossCuttingInterests.push('Social Impact & DEI');
      if (sportsRecreationChecked) crossCuttingInterests.push('Sports & Recreation');
      if (travelTourismChecked) crossCuttingInterests.push('Travel & Tourism');
      if (urbanDevelopmentChecked) crossCuttingInterests.push('Urban Development & Infrastructure');
      if (usPoliticsChecked) crossCuttingInterests.push('U.S. Politics & Policy');
      
      // Prepare content creation format preferences data
      const contentFormatPreferences = [];
      if (sharingNewsChecked) contentFormatPreferences.push('Sharing industry news with your perspective');
      if (writingExperiencesChecked) contentFormatPreferences.push('Writing about your learned experiences');
      if (analyzingTrendsChecked) contentFormatPreferences.push('Analyzing trends');
      if (commentingPostsChecked) contentFormatPreferences.push('Commenting on others\' posts');
      if (howToContentChecked) contentFormatPreferences.push('Creating how-to content');
      if (eventTakeawaysChecked) contentFormatPreferences.push('Sharing event takeaways');
      if (personalAnecdoteChecked) contentFormatPreferences.push('Personal anecdote');
      if (digitalCommunitiesChecked) contentFormatPreferences.push('Digital communities');
      if (otherContentFormatChecked && otherContentFormat.trim() !== '') {
        contentFormatPreferences.push(`Other: ${otherContentFormat.trim()}`);
      }
      
      // Prepare posting barriers data
      const postingBarriers = [];
      if (unsureWhatToSayChecked) postingBarriers.push('Unsure what to say');
      if (fearOfJudgmentChecked) postingBarriers.push('Fear of judgment');
      if (timeManagementChecked) postingBarriers.push('Time management');
      if (dontKnowHowToStartChecked) postingBarriers.push('Don\'t know how to start');
      if (unclearProfessionalVoiceChecked) postingBarriers.push('Unclear on professional voice');
      if (otherBarrierChecked && otherBarrier.trim() !== '') {
        postingBarriers.push(`Other: ${otherBarrier.trim()}`);
      }

      // Update aspirations field to include selected branding challenges and published content
      let brandingDetails = aspirations.trim() !== '' 
        ? `${aspirations}\n\nBranding challenges: ${brandingChallenges.join(', ')}` 
        : `Branding challenges: ${brandingChallenges.join(', ')}`;
        
      // Add published content to aspirations field
      brandingDetails += `\n\nPublished content: ${publishedContent.length > 0 ? publishedContent.join(', ') : 'None'}`;
      
      // Add LinkedIn profile update timing to aspirations field
      brandingDetails += `\n\nLinkedIn profile update timing: ${profileUpdateTiming.length > 0 ? profileUpdateTiming.join(', ') : 'Not specified'}`;
      
      // Add LinkedIn activity to aspirations field
      brandingDetails += `\n\nLinkedIn activity: ${linkedInActivity.length > 0 ? linkedInActivity.join(', ') : 'Not specified'}`;
      
      // Add brand positioning rating to aspirations field
      brandingDetails += `\n\nBrand positioning rating: ${brandPositioningRating !== null ? brandPositioningRating : 'Not specified'}`;
      
      // Add content creation comfort to aspirations field
      brandingDetails += `\n\nContent creation comfort: ${contentCreationComfort !== null ? contentCreationComfort : 'Not specified'}`;
      
      // Add brand optimization goals to aspirations field
      brandingDetails += `\n\nBrand optimization goals: ${brandOptimizationGoals.trim() !== '' ? brandOptimizationGoals : 'Not specified'}`;
      
      // Add cross-cutting & societal interests to aspirations field
      brandingDetails += `\n\nCross-cutting & societal interests: ${crossCuttingInterests.length > 0 ? crossCuttingInterests.join(', ') : 'None'}`;
      
      // Add professional areas for thought leadership to aspirations field
      brandingDetails += `\n\nProfessional areas for thought leadership: ${professionalAreas.trim() !== '' ? professionalAreas : 'Not specified'}`;
      
      // Add content format preferences to aspirations field
      brandingDetails += `\n\nContent creation format preferences: ${contentFormatPreferences.length > 0 ? contentFormatPreferences.join(', ') : 'None'}`;
      
      // Add posting barriers to aspirations field
      brandingDetails += `\n\nPosting barriers: ${postingBarriers.length > 0 ? postingBarriers.join(', ') : 'None'}`;
      
      // Add additional info to aspirations field if provided
      if (additionalInfo.trim() !== '') {
        brandingDetails += `\n\nAdditional professional journey information: ${additionalInfo}`;
      }
      
      const formData = {
        background, // LinkedIn URL
        goals: socialMediaDetails, // Social media details
        aspirations: brandingDetails, // Branding challenges and all other data
        challenges: "", // No longer using this field
        interests: "",
        timeframe: "",
        industry, // Current/Prior industry
        jobFunction, // Current/Prior function
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
          other: otherContentFormatChecked ? otherContentFormat : null
        },
        postingBarriers: {
          unsureWhatToSay: unsureWhatToSayChecked,
          fearOfJudgment: fearOfJudgmentChecked,
          timeManagement: timeManagementChecked,
          dontKnowHowToStart: dontKnowHowToStartChecked,
          unclearProfessionalVoice: unclearProfessionalVoiceChecked,
          other: otherBarrierChecked ? otherBarrier : null
        },
        socialMedia: {
          twitter: twitterChecked,
          medium: mediumChecked,
          blog: blogChecked,
          other: otherChecked ? otherSocialMedia : null
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
          other: otherBrandingChecked ? otherBrandingChallenge : null
        },
        publishedContent: {
          linkedInPosts: linkedInPostsChecked,
          blogArticles: blogArticlesChecked,
          industryPresentations: industryPresentationsChecked,
          academicPapers: academicPapersChecked,
          neverPublished: neverPublishedChecked,
          other: otherPublishedContentChecked ? otherPublishedContent : null
        },
        linkedInProfileUpdate: {
          lastWeek: lastWeekChecked,
          lastMonth: lastMonthChecked,
          businessSchool: businessSchoolChecked,
          careerCoach: careerCoachChecked,
          jobChange: jobChangeChecked,
          cantRemember: cantRememberChecked,
          neverUpdated: neverUpdatedChecked,
          other: otherUpdateTimeChecked ? otherUpdateTime : null
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
          reactedDaily: reactedDailyChecked
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
          technology: technologyChecked
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
          usPolitics: usPoliticsChecked
        },
        
        professionalAreasForThoughtLeadership: professionalAreas,
        
        technologySubcategories: technologyChecked ? {
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
          saasEnterprise: saasEnterpriseChecked
        } : null,
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
            other: otherAssessmentChecked ? otherAssessment : null
          },
          additionalInfo: additionalInfo
        }
      };
      
      await questionnaireMutation.mutateAsync(formData);
    } else {
      toast({
        title: "Please complete all required fields",
        description: currentStep === 1 
          ? "Please select your current or prior industry and function." 
          : currentStep === 2 
          ? "LinkedIn URL is required to complete your profile." 
          : currentStep === 3 
          ? "Please select at least one branding challenge." 
          : currentStep === 4
          ? "Please select at least one industry interest."
          : currentStep === 5
          ? "Please fill in your career goals and select a percentage of connections in your target industry."
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
              <Label htmlFor="industry" className="text-gray-700 font-medium block mb-2">
                Current / Prior Industry <span className="text-red-500">*</span>
              </Label>
              <p className="text-sm text-gray-500 mb-3">
                Please select your current or most recent industry
              </p>
              <Select
                value={industry}
                onValueChange={setIndustry}
              >
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
              <Label htmlFor="function" className="text-gray-700 font-medium block mb-2">
                Current / Prior Function <span className="text-red-500">*</span>
              </Label>
              <p className="text-sm text-gray-500 mb-3">
                Please select your current or most recent job function
              </p>
              <Select
                value={jobFunction}
                onValueChange={setJobFunction}
              >
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
              <Label htmlFor="background" className="text-gray-700 font-medium block mb-2">
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
              <Label htmlFor="goals" className="text-gray-700 font-medium block mb-2">
                Other Professional Social Media Presence <span className="text-red-500">*</span>
              </Label>
              <p className="text-sm text-gray-500 mb-3">
                Select the platforms where you have a professional presence
              </p>
              
              <div className="space-y-4 mt-4">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="twitter" 
                    checked={twitterChecked}
                    onCheckedChange={(checked) => setTwitterChecked(checked === true)}
                  />
                  <Label htmlFor="twitter" className="cursor-pointer">Twitter/X</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="medium" 
                    checked={mediumChecked}
                    onCheckedChange={(checked) => setMediumChecked(checked === true)}
                  />
                  <Label htmlFor="medium" className="cursor-pointer">Medium</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="blog" 
                    checked={blogChecked}
                    onCheckedChange={(checked) => setBlogChecked(checked === true)}
                  />
                  <Label htmlFor="blog" className="cursor-pointer">Personal blog/Website</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="other" 
                    checked={otherChecked}
                    onCheckedChange={(checked) => setOtherChecked(checked === true)}
                  />
                  <Label htmlFor="other" className="cursor-pointer">Other</Label>
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
              
              <Textarea
                id="goals"
                value={goals}
                onChange={(e) => setGoals(e.target.value)}
                className="min-h-[80px] resize-y w-full mt-4"
                placeholder="Add any additional details about your social media presence..."
              />
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-6">
            <div className="mb-6">
              <Label htmlFor="aspirations" className="text-gray-700 font-medium block mb-2">
                Branding and Content Creation
              </Label>
              <p className="text-sm text-gray-500 mb-3">
                What are your biggest professional branding challenges? (Check all that apply)
              </p>
              
              <div className="space-y-3 mt-4">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="consistentNarrative" 
                    checked={consistentNarrativeChecked}
                    onCheckedChange={(checked) => setConsistentNarrativeChecked(checked === true)}
                  />
                  <Label htmlFor="consistentNarrative" className="cursor-pointer">Building a consistent professional narrative</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="valueProposition" 
                    checked={valuePropositionChecked}
                    onCheckedChange={(checked) => setValuePropositionChecked(checked === true)}
                  />
                  <Label htmlFor="valueProposition" className="cursor-pointer">Identifying my unique value proposition</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="engagingContent" 
                    checked={engagingContentChecked}
                    onCheckedChange={(checked) => setEngagingContentChecked(checked === true)}
                  />
                  <Label htmlFor="engagingContent" className="cursor-pointer">Creating engaging content</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="findingTime" 
                    checked={findingTimeChecked}
                    onCheckedChange={(checked) => setFindingTimeChecked(checked === true)}
                  />
                  <Label htmlFor="findingTime" className="cursor-pointer">Finding time to maintain online presence</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="growingNetwork" 
                    checked={growingNetworkChecked}
                    onCheckedChange={(checked) => setGrowingNetworkChecked(checked === true)}
                  />
                  <Label htmlFor="growingNetwork" className="cursor-pointer">Growing my professional network</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="sharingInsights" 
                    checked={sharingInsightsChecked}
                    onCheckedChange={(checked) => setSharingInsightsChecked(checked === true)}
                  />
                  <Label htmlFor="sharingInsights" className="cursor-pointer">Sharing industry insights and work experiences</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="engagingNetwork" 
                    checked={engagingNetworkChecked}
                    onCheckedChange={(checked) => setEngagingNetworkChecked(checked === true)}
                  />
                  <Label htmlFor="engagingNetwork" className="cursor-pointer">Engaging with my professional network</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="industryEvents" 
                    checked={industryEventsChecked}
                    onCheckedChange={(checked) => setIndustryEventsChecked(checked === true)}
                  />
                  <Label htmlFor="industryEvents" className="cursor-pointer">Participating in industry discussions and events</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="otherBranding" 
                    checked={otherBrandingChecked}
                    onCheckedChange={(checked) => setOtherBrandingChecked(checked === true)}
                  />
                  <Label htmlFor="otherBranding" className="cursor-pointer">Other</Label>
                </div>
                
                {otherBrandingChecked && (
                  <div className="ml-6 mt-2">
                    <Input
                      value={otherBrandingChallenge}
                      onChange={(e) => setOtherBrandingChallenge(e.target.value)}
                      placeholder="Please specify your other branding challenge"
                      className="w-full"
                    />
                  </div>
                )}
              </div>
            </div>
            
            <hr className="my-6" />
            
            <div className="mb-6">
              <Label htmlFor="publishedContent" className="text-gray-700 font-medium block mb-2">
                Published Digital Content
              </Label>
              <p className="text-sm text-gray-500 mb-3">
                Have you published digital professional content before? (Check all that apply)
              </p>
              
              <div className="space-y-3 mt-4">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="linkedInPosts" 
                    checked={linkedInPostsChecked}
                    onCheckedChange={(checked) => setLinkedInPostsChecked(checked === true)}
                  />
                  <Label htmlFor="linkedInPosts" className="cursor-pointer">LinkedIn posts</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="blogArticles" 
                    checked={blogArticlesChecked}
                    onCheckedChange={(checked) => setBlogArticlesChecked(checked === true)}
                  />
                  <Label htmlFor="blogArticles" className="cursor-pointer">Blog articles</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="industryPresentations" 
                    checked={industryPresentationsChecked}
                    onCheckedChange={(checked) => setIndustryPresentationsChecked(checked === true)}
                  />
                  <Label htmlFor="industryPresentations" className="cursor-pointer">Industry presentations</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="academicPapers" 
                    checked={academicPapersChecked}
                    onCheckedChange={(checked) => setAcademicPapersChecked(checked === true)}
                  />
                  <Label htmlFor="academicPapers" className="cursor-pointer">Academic papers</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="neverPublished" 
                    checked={neverPublishedChecked}
                    onCheckedChange={(checked) => setNeverPublishedChecked(checked === true)}
                  />
                  <Label htmlFor="neverPublished" className="cursor-pointer">Never published professional content</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="otherPublishedContent" 
                    checked={otherPublishedContentChecked}
                    onCheckedChange={(checked) => setOtherPublishedContentChecked(checked === true)}
                  />
                  <Label htmlFor="otherPublishedContent" className="cursor-pointer">Other</Label>
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
              <Label htmlFor="profileUpdateTime" className="text-gray-700 font-medium block mb-2">
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
                    onCheckedChange={(checked) => setLastWeekChecked(checked === true)}
                  />
                  <Label htmlFor="lastWeek" className="cursor-pointer">Within the last week</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="lastMonth" 
                    checked={lastMonthChecked}
                    onCheckedChange={(checked) => setLastMonthChecked(checked === true)}
                  />
                  <Label htmlFor="lastMonth" className="cursor-pointer">Within the last month</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="businessSchool" 
                    checked={businessSchoolChecked}
                    onCheckedChange={(checked) => setBusinessSchoolChecked(checked === true)}
                  />
                  <Label htmlFor="businessSchool" className="cursor-pointer">For / during business school (if applicable)</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="careerCoach" 
                    checked={careerCoachChecked}
                    onCheckedChange={(checked) => setCareerCoachChecked(checked === true)}
                  />
                  <Label htmlFor="careerCoach" className="cursor-pointer">After I spoke with a career coach</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="jobChange" 
                    checked={jobChangeChecked}
                    onCheckedChange={(checked) => setJobChangeChecked(checked === true)}
                  />
                  <Label htmlFor="jobChange" className="cursor-pointer">When I last changed jobs</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="cantRemember" 
                    checked={cantRememberChecked}
                    onCheckedChange={(checked) => setCantRememberChecked(checked === true)}
                  />
                  <Label htmlFor="cantRemember" className="cursor-pointer">I can't remember</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="neverUpdated" 
                    checked={neverUpdatedChecked}
                    onCheckedChange={(checked) => setNeverUpdatedChecked(checked === true)}
                  />
                  <Label htmlFor="neverUpdated" className="cursor-pointer">I've never really updated it beyond creating the profile</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="otherUpdateTime" 
                    checked={otherUpdateTimeChecked}
                    onCheckedChange={(checked) => setOtherUpdateTimeChecked(checked === true)}
                  />
                  <Label htmlFor="otherUpdateTime" className="cursor-pointer">Other</Label>
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
              <Label htmlFor="linkedInActivity" className="text-gray-700 font-medium block mb-2">
                LinkedIn Activity
              </Label>
              <p className="text-sm text-gray-500 mb-3">
                In the last month, how active have you been on LinkedIn? (check all that apply)
              </p>
              
              <div className="space-y-3 mt-4">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="readNewsfeed" 
                    checked={readNewsfeedChecked}
                    onCheckedChange={(checked) => setReadNewsfeedChecked(checked === true)}
                  />
                  <Label htmlFor="readNewsfeed" className="cursor-pointer">Read your Newsfeed</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="acceptedConnections" 
                    checked={acceptedConnectionsChecked}
                    onCheckedChange={(checked) => setAcceptedConnectionsChecked(checked === true)}
                  />
                  <Label htmlFor="acceptedConnections" className="cursor-pointer">Accepted Connections</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="notActive" 
                    checked={notActiveChecked}
                    onCheckedChange={(checked) => setNotActiveChecked(checked === true)}
                  />
                  <Label htmlFor="notActive" className="cursor-pointer">Not Active in the Last Month</Label>
                </div>
                
                <p className="text-sm font-medium text-gray-600 mt-5 mb-2">Original Content</p>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="postedNever" 
                    checked={postedNeverChecked}
                    onCheckedChange={(checked) => setPostedNeverChecked(checked === true)}
                  />
                  <Label htmlFor="postedNever" className="cursor-pointer">Posted Original Content - Never</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="posted12Times" 
                    checked={posted12TimesChecked}
                    onCheckedChange={(checked) => setPosted12TimesChecked(checked === true)}
                  />
                  <Label htmlFor="posted12Times" className="cursor-pointer">Posted Original Content - 1-2 times</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="posted35Times" 
                    checked={posted35TimesChecked}
                    onCheckedChange={(checked) => setPosted35TimesChecked(checked === true)}
                  />
                  <Label htmlFor="posted35Times" className="cursor-pointer">Posted Original Content - 3-5 times</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="posted6PlusTimes" 
                    checked={posted6PlusTimesChecked}
                    onCheckedChange={(checked) => setPosted6PlusTimesChecked(checked === true)}
                  />
                  <Label htmlFor="posted6PlusTimes" className="cursor-pointer">Posted Original Content - 6+ times</Label>
                </div>
                
                <p className="text-sm font-medium text-gray-600 mt-5 mb-2">Sharing Content</p>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="sharedNever" 
                    checked={sharedNeverChecked}
                    onCheckedChange={(checked) => setSharedNeverChecked(checked === true)}
                  />
                  <Label htmlFor="sharedNever" className="cursor-pointer">Shared Others' Posts - Never</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="shared12Times" 
                    checked={shared12TimesChecked}
                    onCheckedChange={(checked) => setShared12TimesChecked(checked === true)}
                  />
                  <Label htmlFor="shared12Times" className="cursor-pointer">Shared Others' Posts - 1-2 times</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="shared35Times" 
                    checked={shared35TimesChecked}
                    onCheckedChange={(checked) => setShared35TimesChecked(checked === true)}
                  />
                  <Label htmlFor="shared35Times" className="cursor-pointer">Shared Others' Posts - 3-5 times</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="shared6PlusTimes" 
                    checked={shared6PlusTimesChecked}
                    onCheckedChange={(checked) => setShared6PlusTimesChecked(checked === true)}
                  />
                  <Label htmlFor="shared6PlusTimes" className="cursor-pointer">Shared Others' Posts - 6+ times</Label>
                </div>
                
                <p className="text-sm font-medium text-gray-600 mt-5 mb-2">Commenting</p>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="commentedNever" 
                    checked={commentedNeverChecked}
                    onCheckedChange={(checked) => setCommentedNeverChecked(checked === true)}
                  />
                  <Label htmlFor="commentedNever" className="cursor-pointer">Commented on Posts - Never</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="commented12TimesPerMonth" 
                    checked={commented12TimesPerMonthChecked}
                    onCheckedChange={(checked) => setCommented12TimesPerMonthChecked(checked === true)}
                  />
                  <Label htmlFor="commented12TimesPerMonth" className="cursor-pointer">Commented on Posts - 1-2 times per month</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="commented12TimesPerWeek" 
                    checked={commented12TimesPerWeekChecked}
                    onCheckedChange={(checked) => setCommented12TimesPerWeekChecked(checked === true)}
                  />
                  <Label htmlFor="commented12TimesPerWeek" className="cursor-pointer">Commented on Posts - 1-2 times per week</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="commented3PlusTimesPerWeek" 
                    checked={commented3PlusTimesPerWeekChecked}
                    onCheckedChange={(checked) => setCommented3PlusTimesPerWeekChecked(checked === true)}
                  />
                  <Label htmlFor="commented3PlusTimesPerWeek" className="cursor-pointer">Commented on Posts - 3+ times per week</Label>
                </div>
                
                <p className="text-sm font-medium text-gray-600 mt-5 mb-2">Reactions</p>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="reactedNever" 
                    checked={reactedNeverChecked}
                    onCheckedChange={(checked) => setReactedNeverChecked(checked === true)}
                  />
                  <Label htmlFor="reactedNever" className="cursor-pointer">Reacted to Posts (likes, etc.) - Never</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="reactedFewTimesMonth" 
                    checked={reactedFewTimesMonthChecked}
                    onCheckedChange={(checked) => setReactedFewTimesMonthChecked(checked === true)}
                  />
                  <Label htmlFor="reactedFewTimesMonth" className="cursor-pointer">Reacted to Posts (likes, etc.) - A few times a month</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="reactedFewTimesWeek" 
                    checked={reactedFewTimesWeekChecked}
                    onCheckedChange={(checked) => setReactedFewTimesWeekChecked(checked === true)}
                  />
                  <Label htmlFor="reactedFewTimesWeek" className="cursor-pointer">Reacted to Posts (likes, etc.) - A few times a week</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="reactedDaily" 
                    checked={reactedDailyChecked}
                    onCheckedChange={(checked) => setReactedDailyChecked(checked === true)}
                  />
                  <Label htmlFor="reactedDaily" className="cursor-pointer">Reacted to Posts (likes, etc.) - Daily</Label>
                </div>
              </div>
            </div>
            
            <hr className="my-6" />
            
            <div className="mb-6">
              <Label htmlFor="brandPositioning" className="text-gray-700 font-medium block mb-2">
                Digital Professional Brand Positioning
              </Label>
              <p className="text-sm text-gray-500 mb-3">
                On a scale of 1-5, how well do you feel your current digital professional brand positions you for your target roles?
              </p>
              
              <div className="space-y-3 mt-4">
                <RadioGroup 
                  value={brandPositioningRating?.toString() || ""} 
                  onValueChange={(value) => setBrandPositioningRating(parseInt(value))}
                  className="flex flex-col space-y-3"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="1" id="bp-1" />
                    <Label htmlFor="bp-1" className="cursor-pointer">1 - Needs Significant Work</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="2" id="bp-2" />
                    <Label htmlFor="bp-2" className="cursor-pointer">2</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="3" id="bp-3" />
                    <Label htmlFor="bp-3" className="cursor-pointer">3</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="4" id="bp-4" />
                    <Label htmlFor="bp-4" className="cursor-pointer">4</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="5" id="bp-5" />
                    <Label htmlFor="bp-5" className="cursor-pointer">5 - Strongly Positioned</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
            
            <hr className="my-6" />
            
            <div className="mb-6">
              <Label htmlFor="contentComfort" className="text-gray-700 font-medium block mb-2">
                Content Creation Comfort
              </Label>
              <p className="text-sm text-gray-500 mb-3">
                How comfortable are you with creating professional content?
              </p>
              
              <div className="space-y-3 mt-4">
                <RadioGroup 
                  value={contentCreationComfort?.toString() || ""} 
                  onValueChange={(value) => setContentCreationComfort(parseInt(value))}
                  className="flex flex-col space-y-3"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="1" id="cc-1" />
                    <Label htmlFor="cc-1" className="cursor-pointer">1 - Not at all comfortable</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="2" id="cc-2" />
                    <Label htmlFor="cc-2" className="cursor-pointer">2</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="3" id="cc-3" />
                    <Label htmlFor="cc-3" className="cursor-pointer">3</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="4" id="cc-4" />
                    <Label htmlFor="cc-4" className="cursor-pointer">4</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="5" id="cc-5" />
                    <Label htmlFor="cc-5" className="cursor-pointer">5 - Very comfortable</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
            
            <hr className="my-6" />
            
            <div className="mb-6">
              <Label htmlFor="brandOptimizationGoals" className="text-gray-700 font-medium block mb-2">
                Professional Brand Optimization Goals
              </Label>
              <p className="text-sm text-gray-500 mb-3">
                What do you hope to gain from optimizing your professional brand?
              </p>
              <Textarea
                id="brandOptimizationGoals"
                value={brandOptimizationGoals}
                onChange={(e) => setBrandOptimizationGoals(e.target.value)}
                className="min-h-[120px] resize-y w-full"
                placeholder="Describe your goals for your professional brand..."
              />
            </div>

          </div>
        );
      case 4:
        return (
          <div className="space-y-6">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-3">Content & Thought Leadership Interests</h2>
              <p className="text-sm text-gray-500 mb-5">
                Help us understand the topics you're passionate about or knowledgeable in as this will guide our discussions about your professional brand and thought leadership. Select any areas where you either have expertise or actively follow industry developments. Don't feel limited - this is a starting point for our conversation.
              </p>
              
              <div className="mb-6">
                <Label className="text-gray-700 font-medium block mb-3">
                  Industry Interests
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="consulting"
                      checked={consultingChecked}
                      onCheckedChange={(checked) => setConsultingChecked(checked === true)}
                    />
                    <Label htmlFor="consulting" className="text-gray-700">Consulting</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="consumer-retail" 
                      checked={consumerRetailChecked}
                      onCheckedChange={(checked) => setConsumerRetailChecked(checked === true)}
                    />
                    <Label htmlFor="consumer-retail" className="text-gray-700">Consumer & Retail</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="financial-services" 
                      checked={financialServicesChecked}
                      onCheckedChange={(checked) => setFinancialServicesChecked(checked === true)}
                    />
                    <Label htmlFor="financial-services" className="text-gray-700">Financial Services</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="global-markets" 
                      checked={globalMarketsChecked}
                      onCheckedChange={(checked) => setGlobalMarketsChecked(checked === true)}
                    />
                    <Label htmlFor="global-markets" className="text-gray-700">Global Markets & Trade</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="government" 
                      checked={governmentChecked}
                      onCheckedChange={(checked) => setGovernmentChecked(checked === true)}
                    />
                    <Label htmlFor="government" className="text-gray-700">Government and Public Sector</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="healthcare" 
                      checked={healthcareChecked}
                      onCheckedChange={(checked) => setHealthcareChecked(checked === true)}
                    />
                    <Label htmlFor="healthcare" className="text-gray-700">Healthcare & Life Sciences</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="innovation" 
                      checked={innovationChecked}
                      onCheckedChange={(checked) => setInnovationChecked(checked === true)}
                    />
                    <Label htmlFor="innovation" className="text-gray-700">Innovation & Entrepreneurship</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="manufacturing" 
                      checked={manufacturingChecked}
                      onCheckedChange={(checked) => setManufacturingChecked(checked === true)}
                    />
                    <Label htmlFor="manufacturing" className="text-gray-700">Manufacturing & Industry</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="social-impact" 
                      checked={socialImpactChecked}
                      onCheckedChange={(checked) => setSocialImpactChecked(checked === true)}
                    />
                    <Label htmlFor="social-impact" className="text-gray-700">Social Impact & Sustainability</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="technology" 
                      checked={technologyChecked}
                      onCheckedChange={(checked) => setTechnologyChecked(checked === true)}
                    />
                    <Label htmlFor="technology" className="text-gray-700">Technology & Digital Media</Label>
                  </div>
                </div>
              </div>
              
              <hr className="my-6" />
              
              {/* Cross-Cutting & Societal Interests Section */}
              <div className="mb-6">
                <Label className="text-gray-700 font-medium block mb-3">
                  Cross-Cutting & Societal Interests
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="climate" 
                      checked={climateChecked}
                      onCheckedChange={(checked) => setClimateChecked(checked === true)}
                    />
                    <Label htmlFor="climate" className="text-gray-700">Climate Change & Sustainability</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="consumer-behavior" 
                      checked={consumerBehaviorChecked}
                      onCheckedChange={(checked) => setConsumerBehaviorChecked(checked === true)}
                    />
                    <Label htmlFor="consumer-behavior" className="text-gray-700">Consumer Behavior & Culture</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="crime-justice" 
                      checked={crimeJusticeChecked}
                      onCheckedChange={(checked) => setCrimeJusticeChecked(checked === true)}
                    />
                    <Label htmlFor="crime-justice" className="text-gray-700">Crime & Justice</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="digital-transformation-ai" 
                      checked={digitalTransformationAIChecked}
                      onCheckedChange={(checked) => setDigitalTransformationAIChecked(checked === true)}
                    />
                    <Label htmlFor="digital-transformation-ai" className="text-gray-700">Digital Transformation/AI</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="education-learning" 
                      checked={educationLearningChecked}
                      onCheckedChange={(checked) => setEducationLearningChecked(checked === true)}
                    />
                    <Label htmlFor="education-learning" className="text-gray-700">Education & Learning</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="emerging-markets" 
                      checked={emergingMarketsChecked}
                      onCheckedChange={(checked) => setEmergingMarketsChecked(checked === true)}
                    />
                    <Label htmlFor="emerging-markets" className="text-gray-700">Emerging Markets</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="entertainment-arts" 
                      checked={entertainmentArtsChecked}
                      onCheckedChange={(checked) => setEntertainmentArtsChecked(checked === true)}
                    />
                    <Label htmlFor="entertainment-arts" className="text-gray-700">Entertainment & Arts</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="financial-innovation" 
                      checked={financialInnovationChecked}
                      onCheckedChange={(checked) => setFinancialInnovationChecked(checked === true)}
                    />
                    <Label htmlFor="financial-innovation" className="text-gray-700">Financial Innovation & Markets</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="future-of-work" 
                      checked={futureOfWorkChecked}
                      onCheckedChange={(checked) => setFutureOfWorkChecked(checked === true)}
                    />
                    <Label htmlFor="future-of-work" className="text-gray-700">Future of Work</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="global-economy" 
                      checked={globalEconomyChecked}
                      onCheckedChange={(checked) => setGlobalEconomyChecked(checked === true)}
                    />
                    <Label htmlFor="global-economy" className="text-gray-700">Global Markets & Economy</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="geopolitics" 
                      checked={geopoliticsChecked}
                      onCheckedChange={(checked) => setGeopoliticsChecked(checked === true)}
                    />
                    <Label htmlFor="geopolitics" className="text-gray-700">Global Politics & Geopolitics</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="health-wellness" 
                      checked={healthWellnessChecked}
                      onCheckedChange={(checked) => setHealthWellnessChecked(checked === true)}
                    />
                    <Label htmlFor="health-wellness" className="text-gray-700">Health & Wellness</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="healthcare-innovation" 
                      checked={healthcareInnovationChecked}
                      onCheckedChange={(checked) => setHealthcareInnovationChecked(checked === true)}
                    />
                    <Label htmlFor="healthcare-innovation" className="text-gray-700">Healthcare Innovation</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="social-impact-dei" 
                      checked={socialImpactDEIChecked}
                      onCheckedChange={(checked) => setSocialImpactDEIChecked(checked === true)}
                    />
                    <Label htmlFor="social-impact-dei" className="text-gray-700">Social Impact & DEI</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="sports-recreation" 
                      checked={sportsRecreationChecked}
                      onCheckedChange={(checked) => setSportsRecreationChecked(checked === true)}
                    />
                    <Label htmlFor="sports-recreation" className="text-gray-700">Sports & Recreation</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="travel-tourism" 
                      checked={travelTourismChecked}
                      onCheckedChange={(checked) => setTravelTourismChecked(checked === true)}
                    />
                    <Label htmlFor="travel-tourism" className="text-gray-700">Travel & Tourism</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="urban-development" 
                      checked={urbanDevelopmentChecked}
                      onCheckedChange={(checked) => setUrbanDevelopmentChecked(checked === true)}
                    />
                    <Label htmlFor="urban-development" className="text-gray-700">Urban Development & Infrastructure</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="us-politics" 
                      checked={usPoliticsChecked}
                      onCheckedChange={(checked) => setUsPoliticsChecked(checked === true)}
                    />
                    <Label htmlFor="us-politics" className="text-gray-700">U.S. Politics & Policy</Label>
                  </div>
                </div>
              </div>
              
              <hr className="my-6" />
              
              {/* Thought Leadership Areas */}
              <div className="mb-6">
                <Label htmlFor="professionalAreas" className="text-gray-700 font-medium block mb-2">
                  In what professional areas do you seek to become a thought leader?
                </Label>
                <p className="text-sm text-gray-500 mb-3">
                  Consider both your current expertise and areas where you aspire to build credibility. Professional areas might include any business topics, functions, market segments, verticals, etc. An example might be: AI/ML applications in healthcare delivery, ESG integration in private equity
                </p>
                <Textarea
                  id="professionalAreas"
                  value={professionalAreas}
                  onChange={(e) => setProfessionalAreas(e.target.value)}
                  className="min-h-[120px] resize-y w-full"
                  placeholder="Describe your professional focus areas..."
                />
              </div>
              
              <hr className="my-6" />
              
              {/* Content Creation Format Preferences */}
              <div className="mb-6">
                <Label className="text-gray-700 font-medium block mb-3">
                  As you think about content creation, are there any formats that feel more natural to you? (Select all that apply)
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="sharing-news" 
                      checked={sharingNewsChecked}
                      onCheckedChange={(checked) => setSharingNewsChecked(checked === true)}
                    />
                    <Label htmlFor="sharing-news" className="text-gray-700">Sharing industry news with your perspective</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="writing-experiences" 
                      checked={writingExperiencesChecked}
                      onCheckedChange={(checked) => setWritingExperiencesChecked(checked === true)}
                    />
                    <Label htmlFor="writing-experiences" className="text-gray-700">Writing about your learned experiences</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="analyzing-trends" 
                      checked={analyzingTrendsChecked}
                      onCheckedChange={(checked) => setAnalyzingTrendsChecked(checked === true)}
                    />
                    <Label htmlFor="analyzing-trends" className="text-gray-700">Analyzing trends</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="commenting-posts" 
                      checked={commentingPostsChecked}
                      onCheckedChange={(checked) => setCommentingPostsChecked(checked === true)}
                    />
                    <Label htmlFor="commenting-posts" className="text-gray-700">Commenting on others' posts</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="how-to-content" 
                      checked={howToContentChecked}
                      onCheckedChange={(checked) => setHowToContentChecked(checked === true)}
                    />
                    <Label htmlFor="how-to-content" className="text-gray-700">Creating how-to content</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="event-takeaways" 
                      checked={eventTakeawaysChecked}
                      onCheckedChange={(checked) => setEventTakeawaysChecked(checked === true)}
                    />
                    <Label htmlFor="event-takeaways" className="text-gray-700">Sharing event takeaways</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="personal-anecdote" 
                      checked={personalAnecdoteChecked}
                      onCheckedChange={(checked) => setPersonalAnecdoteChecked(checked === true)}
                    />
                    <Label htmlFor="personal-anecdote" className="text-gray-700">Personal anecdote</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="digital-communities" 
                      checked={digitalCommunitiesChecked}
                      onCheckedChange={(checked) => setDigitalCommunitiesChecked(checked === true)}
                    />
                    <Label htmlFor="digital-communities" className="text-gray-700">Digital communities</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="other-content-format" 
                      checked={otherContentFormatChecked}
                      onCheckedChange={(checked) => setOtherContentFormatChecked(checked === true)}
                    />
                    <Label htmlFor="other-content-format" className="text-gray-700">Other</Label>
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
                  What holds you back from posting more frequently? (Select all that apply)
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="unsure-what-to-say" 
                      checked={unsureWhatToSayChecked}
                      onCheckedChange={(checked) => setUnsureWhatToSayChecked(checked === true)}
                    />
                    <Label htmlFor="unsure-what-to-say" className="text-gray-700">Unsure what to say</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="fear-of-judgment" 
                      checked={fearOfJudgmentChecked}
                      onCheckedChange={(checked) => setFearOfJudgmentChecked(checked === true)}
                    />
                    <Label htmlFor="fear-of-judgment" className="text-gray-700">Fear of judgment</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="time-management" 
                      checked={timeManagementChecked}
                      onCheckedChange={(checked) => setTimeManagementChecked(checked === true)}
                    />
                    <Label htmlFor="time-management" className="text-gray-700">Time management</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="dont-know-how-to-start" 
                      checked={dontKnowHowToStartChecked}
                      onCheckedChange={(checked) => setDontKnowHowToStartChecked(checked === true)}
                    />
                    <Label htmlFor="dont-know-how-to-start" className="text-gray-700">Don't know how to start</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="unclear-professional-voice" 
                      checked={unclearProfessionalVoiceChecked}
                      onCheckedChange={(checked) => setUnclearProfessionalVoiceChecked(checked === true)}
                    />
                    <Label htmlFor="unclear-professional-voice" className="text-gray-700">Unclear on professional voice</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="other-barrier" 
                      checked={otherBarrierChecked}
                      onCheckedChange={(checked) => setOtherBarrierChecked(checked === true)}
                    />
                    <Label htmlFor="other-barrier" className="text-gray-700">Other</Label>
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
                    If you selected, Technology & Digital Media, please elaborate:
                  </Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* AI/ML Section */}
                    <div className="space-y-2">
                      <p className="font-medium text-gray-700">AI / ML</p>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="ai-consumer" 
                          checked={aiConsumerChecked}
                          onCheckedChange={(checked) => setAiConsumerChecked(checked === true)}
                        />
                        <Label htmlFor="ai-consumer" className="text-gray-700">Consumer Applications</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="ai-vision" 
                          checked={aiComputerVisionChecked}
                          onCheckedChange={(checked) => setAiComputerVisionChecked(checked === true)}
                        />
                        <Label htmlFor="ai-vision" className="text-gray-700">Computer Vision & Generation</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="ai-ethics" 
                          checked={aiEthicsChecked}
                          onCheckedChange={(checked) => setAiEthicsChecked(checked === true)}
                        />
                        <Label htmlFor="ai-ethics" className="text-gray-700">Ethics & Governance</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="ai-infrastructure" 
                          checked={aiInfrastructureChecked}
                          onCheckedChange={(checked) => setAiInfrastructureChecked(checked === true)}
                        />
                        <Label htmlFor="ai-infrastructure" className="text-gray-700">Infrastructure & Platforms</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="ai-nlp" 
                          checked={aiNlpChecked}
                          onCheckedChange={(checked) => setAiNlpChecked(checked === true)}
                        />
                        <Label htmlFor="ai-nlp" className="text-gray-700">Natural Language Processing</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="ai-predictive" 
                          checked={aiPredictiveChecked}
                          onCheckedChange={(checked) => setAiPredictiveChecked(checked === true)}
                        />
                        <Label htmlFor="ai-predictive" className="text-gray-700">Predictive Analytics</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="ai-robotics" 
                          checked={aiRoboticsChecked}
                          onCheckedChange={(checked) => setAiRoboticsChecked(checked === true)}
                        />
                        <Label htmlFor="ai-robotics" className="text-gray-700">Robotics & Automation</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="ai-scientific" 
                          checked={aiScientificChecked}
                          onCheckedChange={(checked) => setAiScientificChecked(checked === true)}
                        />
                        <Label htmlFor="ai-scientific" className="text-gray-700">Scientific Applications</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="ai-learning" 
                          checked={aiLearningChecked}
                          onCheckedChange={(checked) => setAiLearningChecked(checked === true)}
                        />
                        <Label htmlFor="ai-learning" className="text-gray-700">Supervised/Unsupervised Learning</Label>
                      </div>
                    </div>
                    
                    {/* Consumer Technology Section */}
                    <div className="space-y-2">
                      <p className="font-medium text-gray-700">Consumer Technology</p>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="consumer-devices" 
                          checked={consumerDevicesChecked}
                          onCheckedChange={(checked) => setConsumerDevicesChecked(checked === true)}
                        />
                        <Label htmlFor="consumer-devices" className="text-gray-700">Devices & Gadgets</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="consumer-gaming" 
                          checked={consumerGamingChecked}
                          onCheckedChange={(checked) => setConsumerGamingChecked(checked === true)}
                        />
                        <Label htmlFor="consumer-gaming" className="text-gray-700">Gaming, Esports & Entertainment</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="consumer-mobile" 
                          checked={consumerMobileChecked}
                          onCheckedChange={(checked) => setConsumerMobileChecked(checked === true)}
                        />
                        <Label htmlFor="consumer-mobile" className="text-gray-700">Mobile & Apps</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="consumer-smart-home" 
                          checked={consumerSmartHomeChecked}
                          onCheckedChange={(checked) => setConsumerSmartHomeChecked(checked === true)}
                        />
                        <Label htmlFor="consumer-smart-home" className="text-gray-700">Smart Home & IoT</Label>
                      </div>
                    </div>
                    
                    {/* Cybersecurity & Privacy Section */}
                    <div className="space-y-2">
                      <p className="font-medium text-gray-700">Cybersecurity & Privacy</p>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="cybersecurity-solutions" 
                          checked={cybersecuritySolutionsChecked}
                          onCheckedChange={(checked) => setCybersecuritySolutionsChecked(checked === true)}
                        />
                        <Label htmlFor="cybersecurity-solutions" className="text-gray-700">Cybersecurity Solutions</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="data-privacy" 
                          checked={dataPrivacyChecked}
                          onCheckedChange={(checked) => setDataPrivacyChecked(checked === true)}
                        />
                        <Label htmlFor="data-privacy" className="text-gray-700">Data Privacy</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="regulatory-compliance" 
                          checked={regulatoryComplianceChecked}
                          onCheckedChange={(checked) => setRegulatoryComplianceChecked(checked === true)}
                        />
                        <Label htmlFor="regulatory-compliance" className="text-gray-700">Regulatory Compliance</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="risk-management" 
                          checked={riskManagementChecked}
                          onCheckedChange={(checked) => setRiskManagementChecked(checked === true)}
                        />
                        <Label htmlFor="risk-management" className="text-gray-700">Risk Management</Label>
                      </div>
                    </div>
                    
                    {/* Digital Infrastructure Section */}
                    <div className="space-y-2">
                      <p className="font-medium text-gray-700">Digital Infrastructure</p>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="cloud-computing" 
                          checked={cloudComputingChecked}
                          onCheckedChange={(checked) => setCloudComputingChecked(checked === true)}
                        />
                        <Label htmlFor="cloud-computing" className="text-gray-700">Cloud Computing</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="data-centers" 
                          checked={dataCentersChecked}
                          onCheckedChange={(checked) => setDataCentersChecked(checked === true)}
                        />
                        <Label htmlFor="data-centers" className="text-gray-700">Data Centers</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="networks" 
                          checked={networksChecked}
                          onCheckedChange={(checked) => setNetworksChecked(checked === true)}
                        />
                        <Label htmlFor="networks" className="text-gray-700">Networks & Connectivity</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="web3-blockchain" 
                          checked={web3BlockchainChecked}
                          onCheckedChange={(checked) => setWeb3BlockchainChecked(checked === true)}
                        />
                        <Label htmlFor="web3-blockchain" className="text-gray-700">Web3 & Blockchain</Label>
                      </div>
                    </div>
                    
                    {/* Digital Media & Content Section */}
                    <div className="space-y-2">
                      <p className="font-medium text-gray-700">Digital Media & Content</p>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="content-distribution" 
                          checked={contentDistributionChecked}
                          onCheckedChange={(checked) => setContentDistributionChecked(checked === true)}
                        />
                        <Label htmlFor="content-distribution" className="text-gray-700">Content Distribution</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="creator-economy" 
                          checked={creatorEconomyChecked}
                          onCheckedChange={(checked) => setCreatorEconomyChecked(checked === true)}
                        />
                        <Label htmlFor="creator-economy" className="text-gray-700">Creator Economy</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="digital-marketing" 
                          checked={digitalMarketingChecked}
                          onCheckedChange={(checked) => setDigitalMarketingChecked(checked === true)}
                        />
                        <Label htmlFor="digital-marketing" className="text-gray-700">Digital Marketing</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="social-media-platforms" 
                          checked={socialMediaPlatformsChecked}
                          onCheckedChange={(checked) => setSocialMediaPlatformsChecked(checked === true)}
                        />
                        <Label htmlFor="social-media-platforms" className="text-gray-700">Social Media & Platforms</Label>
                      </div>
                    </div>
                    
                    {/* Emerging Technology Section */}
                    <div className="space-y-2">
                      <p className="font-medium text-gray-700">Emerging Technology</p>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="ar-vr-xr" 
                          checked={arVrXrChecked}
                          onCheckedChange={(checked) => setArVrXrChecked(checked === true)}
                        />
                        <Label htmlFor="ar-vr-xr" className="text-gray-700">AR / VR / XR</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="biotech-health" 
                          checked={biotechHealthChecked}
                          onCheckedChange={(checked) => setBiotechHealthChecked(checked === true)}
                        />
                        <Label htmlFor="biotech-health" className="text-gray-700">Biotech & Digital Health</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="quantum-computing" 
                          checked={quantumComputingChecked}
                          onCheckedChange={(checked) => setQuantumComputingChecked(checked === true)}
                        />
                        <Label htmlFor="quantum-computing" className="text-gray-700">Quantum Computing</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="emerging-robotics" 
                          checked={emergingRoboticsChecked}
                          onCheckedChange={(checked) => setEmergingRoboticsChecked(checked === true)}
                        />
                        <Label htmlFor="emerging-robotics" className="text-gray-700">Robotics & Automation</Label>
                      </div>
                    </div>
                    
                    {/* Enterprise Technology Section */}
                    <div className="space-y-2">
                      <p className="font-medium text-gray-700">Enterprise Technology</p>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="business-apps" 
                          checked={businessAppsChecked}
                          onCheckedChange={(checked) => setBusinessAppsChecked(checked === true)}
                        />
                        <Label htmlFor="business-apps" className="text-gray-700">Business Applications</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="digital-transformation" 
                          checked={enterpriseDigitalTransformationChecked}
                          onCheckedChange={(checked) => setEnterpriseDigitalTransformationChecked(checked === true)}
                        />
                        <Label htmlFor="digital-transformation" className="text-gray-700">Digital Transformation</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="integration-apis" 
                          checked={integrationApisChecked}
                          onCheckedChange={(checked) => setIntegrationApisChecked(checked === true)}
                        />
                        <Label htmlFor="integration-apis" className="text-gray-700">Integration & APIs</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="saas-enterprise" 
                          checked={saasEnterpriseChecked}
                          onCheckedChange={(checked) => setSaasEnterpriseChecked(checked === true)}
                        />
                        <Label htmlFor="saas-enterprise" className="text-gray-700">SaaS & Enterprise Software</Label>
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
              <h2 className="text-xl font-semibold text-gray-800 mb-3">Professional Goals</h2>
              
              <div className="mb-8">
                <Label htmlFor="careerGoals" className="text-gray-700 font-medium block mb-2">
                  Beyond your immediate next job, what are your career goals within the next 2-5 years?
                </Label>
                <p className="text-sm text-gray-500 mb-3">
                  What roles, industries, or impact do you want to have?
                </p>
                <Textarea
                  id="careerGoals"
                  value={careerGoals}
                  onChange={(e) => setCareerGoals(e.target.value)}
                  className="min-h-[120px] resize-y w-full"
                  placeholder="Describe your career goals..."
                />
              </div>
              
              <hr className="my-6" />
              
              <div className="mb-8">
                <Label className="text-gray-700 font-medium block mb-3">
                  What percentage of your LinkedIn connections are in your target industry?
                </Label>
                
                <div className="space-y-3 mt-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroup
                      value={industryConnectionsPercentage}
                      onValueChange={setIndustryConnectionsPercentage}
                      className="space-y-3"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="0-10%" id="connections-very-few" />
                        <Label htmlFor="connections-very-few" className="cursor-pointer">Very Few (0-10%)</Label>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="10-25%" id="connections-some" />
                        <Label htmlFor="connections-some" className="cursor-pointer">Some (10-25%)</Label>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="25-50%" id="connections-half" />
                        <Label htmlFor="connections-half" className="cursor-pointer">About Half (25-50%)</Label>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="50%+" id="connections-majority" />
                        <Label htmlFor="connections-majority" className="cursor-pointer">Majority (50%+)</Label>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="not-sure" id="connections-not-sure" />
                        <Label htmlFor="connections-not-sure" className="cursor-pointer">Not Sure / Still Exploring Target Industry</Label>
                      </div>
                    </RadioGroup>
                  </div>
                </div>
              </div>
              
              <hr className="my-6" />
              
              <div className="mb-6">
                <Label className="text-gray-700 font-medium block mb-3">
                  What personality / strength assessments have you taken? (Select all that apply)
                </Label>
                
                <div className="space-y-3 mt-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="mbti" 
                      checked={mbtiChecked}
                      onCheckedChange={(checked) => setMbtiChecked(checked === true)}
                    />
                    <Label htmlFor="mbti" className="cursor-pointer">Myer's Briggs (MBTI)</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="strengths-finder" 
                      checked={strengthsFinderChecked}
                      onCheckedChange={(checked) => setStrengthsFinderChecked(checked === true)}
                    />
                    <Label htmlFor="strengths-finder" className="cursor-pointer">Strengths Finder</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="via" 
                      checked={viaChecked}
                      onCheckedChange={(checked) => setViaChecked(checked === true)}
                    />
                    <Label htmlFor="via" className="cursor-pointer">VIA - Values in Action</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="enneagram" 
                      checked={enneagramChecked}
                      onCheckedChange={(checked) => setEnneagramChecked(checked === true)}
                    />
                    <Label htmlFor="enneagram" className="cursor-pointer">Enneagram</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="threeSixty" 
                      checked={threeSixtyChecked}
                      onCheckedChange={(checked) => setThreeSixtyChecked(checked === true)}
                    />
                    <Label htmlFor="threeSixty" className="cursor-pointer">360* Leadership, Managerial, or Team Assessment</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="other-assessment" 
                      checked={otherAssessmentChecked}
                      onCheckedChange={(checked) => setOtherAssessmentChecked(checked === true)}
                    />
                    <Label htmlFor="other-assessment" className="cursor-pointer">Other</Label>
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
                  Please upload the personality / strength assessments you have taken
                </Label>
                <p className="text-sm text-gray-500 mb-3">
                  You can upload up to 10 files. PDF, PNG, JPEG, and DOC/DOCX formats are supported.
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
                            description: "You can upload a maximum of 10 files.",
                            variant: "destructive",
                          });
                          return;
                        }
                        setFiles(fileList);
                      }
                    }}
                    className="cursor-pointer"
                  />
                  <p className="text-xs text-gray-500 mt-2">Max file size: 5MB per file</p>
                  
                  {files.length > 0 && (
                    <div className="mt-4">
                      <h4 className="font-medium mb-2">Selected Files ({files.length}):</h4>
                      <ul className="list-disc pl-5 space-y-1">
                        {files.map((file, index) => (
                          <li key={index} className="text-sm">
                            {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
              
              <hr className="my-6" />
              
              <div className="mb-6">
                <Label htmlFor="additionalInfo" className="text-gray-700 font-medium block mb-3">
                  Is there anything else you want to share about your professional journey and brand?
                </Label>
                <p className="text-sm text-gray-500 mb-3">
                  Please provide any additional information that might be relevant
                </p>
                <Textarea
                  id="additionalInfo"
                  value={additionalInfo}
                  onChange={(e) => setAdditionalInfo(e.target.value)}
                  className="min-h-[150px] resize-y w-full"
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
        <Loader2 className="h-8 w-8 animate-spin text-[#0077B5]" />
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="container py-10 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        <Card className="border-none shadow-md">
          <CardHeader className="bg-gradient-to-r from-[#0077B5] to-[#70B5F9] text-white rounded-t-lg">
            <CardTitle className="text-2xl font-bold">Complete Your Registration</CardTitle>
            <CardDescription className="text-white opacity-90">
              {userProfile?.questionnaire 
                ? "Review or update your career insights to receive personalized guidance."
                : "Last step! Help us understand your career journey and aspirations so we can provide personalized guidance."}
            </CardDescription>
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
                          ? "bg-[#0077B5] text-white"
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
                  className="h-full bg-[#0077B5] transition-all duration-300 ease-in-out"
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
                
                {isLastStep ? (
                  <Button 
                    type="button"
                    onClick={handleSubmit}
                    className="w-[120px] bg-[#0077B5] hover:bg-[#006097]"
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
                    className="w-[120px] bg-[#0077B5] hover:bg-[#006097]"
                  >
                    Next
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}