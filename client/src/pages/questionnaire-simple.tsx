import React, { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { UserProfile } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Loader2, CheckCircle } from "lucide-react";

export default function QuestionnairePage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 3;
  
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
  const [digitalTransformationChecked, setDigitalTransformationChecked] = useState(false);
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
      navigate("/");
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
      // First step: LinkedIn URL is required
      return background.trim() !== "";
    } else if (currentStep === 2) {
      // At least one branding challenge must be selected
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
      
      return hasBrandingChallengeSelected;
    } else if (currentStep === 3) {
      // At least one industry interest must be selected
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
      
      // Timeframe is required
      return hasIndustryInterestSelected && timeframe.trim() !== "";
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

  const handleSubmit = () => {
    if (validateCurrentStep()) {
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
      
      const formData = {
        background, // LinkedIn URL
        goals: socialMediaDetails, // Social media details
        aspirations: brandingDetails, // Branding challenges and all other data
        challenges: "", // No longer using this field
        interests,
        timeframe,
        // Include these fields for potential future enhancement
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
        technologySubcategories: {
          aiConsumer: aiConsumerChecked,
          aiComputerVision: aiComputerVisionChecked,
          aiEthics: aiEthicsChecked,
          aiInfrastructure: aiInfrastructureChecked,
          aiNlp: aiNlpChecked,
          aiPredictive: aiPredictiveChecked,
          aiRobotics: aiRoboticsChecked,
          aiScientific: aiScientificChecked,
          aiLearning: aiLearningChecked,
          consumerDevices: consumerDevicesChecked,
          consumerGaming: consumerGamingChecked,
          consumerMobile: consumerMobileChecked,
          consumerSmartHome: consumerSmartHomeChecked,
          cybersecuritySolutions: cybersecuritySolutionsChecked,
          dataPrivacy: dataPrivacyChecked,
          regulatoryCompliance: regulatoryComplianceChecked,
          riskManagement: riskManagementChecked,
          cloudComputing: cloudComputingChecked,
          dataCenters: dataCentersChecked,
          networks: networksChecked,
          web3Blockchain: web3BlockchainChecked,
          contentDistribution: contentDistributionChecked,
          creatorEconomy: creatorEconomyChecked,
          digitalMarketing: digitalMarketingChecked,
          socialMediaPlatforms: socialMediaPlatformsChecked,
          arVrXr: arVrXrChecked,
          biotechHealth: biotechHealthChecked,
          quantumComputing: quantumComputingChecked,
          emergingRobotics: emergingRoboticsChecked,
          businessApps: businessAppsChecked,
          digitalTransformation: digitalTransformationChecked,
          integrationApis: integrationApisChecked,
          saasEnterprise: saasEnterpriseChecked
        }
      };
      
      questionnaireMutation.mutate(formData);
    } else {
      toast({
        title: "Please complete all required fields",
        description: currentStep === 1 
          ? "LinkedIn URL is required to complete your profile." 
          : currentStep === 2 
          ? "Please select at least one branding challenge." 
          : currentStep === 3
          ? "Please select at least one industry interest and complete the timeframe field."
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
              <Label htmlFor="background" className="text-gray-700 font-medium block mb-2">
                LinkedIn URL
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
      case 2:
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
      case 3:
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
              
              {technologyChecked && (
                <div className="mb-6 mt-8 p-4 border border-blue-200 bg-blue-50 rounded-md">
                  <Label className="text-gray-700 font-medium block mb-3">
                    If you selected Technology & Digital Media, please elaborate:
                  </Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="ai-consumer" 
                        checked={aiConsumerChecked}
                        onCheckedChange={(checked) => setAiConsumerChecked(checked === true)}
                      />
                      <Label htmlFor="ai-consumer" className="text-gray-700">AI / ML - Consumer Applications</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="ai-computer-vision" 
                        checked={aiComputerVisionChecked}
                        onCheckedChange={(checked) => setAiComputerVisionChecked(checked === true)}
                      />
                      <Label htmlFor="ai-computer-vision" className="text-gray-700">AI / ML - Computer Vision & Generation</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="ai-ethics" 
                        checked={aiEthicsChecked}
                        onCheckedChange={(checked) => setAiEthicsChecked(checked === true)}
                      />
                      <Label htmlFor="ai-ethics" className="text-gray-700">AI / ML - Ethics & Governance</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="ai-infrastructure" 
                        checked={aiInfrastructureChecked}
                        onCheckedChange={(checked) => setAiInfrastructureChecked(checked === true)}
                      />
                      <Label htmlFor="ai-infrastructure" className="text-gray-700">AI / ML - Infrastructure & Platforms</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="ai-nlp" 
                        checked={aiNlpChecked}
                        onCheckedChange={(checked) => setAiNlpChecked(checked === true)}
                      />
                      <Label htmlFor="ai-nlp" className="text-gray-700">AI / ML - Natural Language Processing</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="ai-predictive" 
                        checked={aiPredictiveChecked}
                        onCheckedChange={(checked) => setAiPredictiveChecked(checked === true)}
                      />
                      <Label htmlFor="ai-predictive" className="text-gray-700">AI / ML - Predictive Analytics</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="ai-robotics" 
                        checked={aiRoboticsChecked}
                        onCheckedChange={(checked) => setAiRoboticsChecked(checked === true)}
                      />
                      <Label htmlFor="ai-robotics" className="text-gray-700">AI / ML - Robotics & Automation</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="ai-scientific" 
                        checked={aiScientificChecked}
                        onCheckedChange={(checked) => setAiScientificChecked(checked === true)}
                      />
                      <Label htmlFor="ai-scientific" className="text-gray-700">AI / ML - Scientific Applications</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="ai-learning" 
                        checked={aiLearningChecked}
                        onCheckedChange={(checked) => setAiLearningChecked(checked === true)}
                      />
                      <Label htmlFor="ai-learning" className="text-gray-700">AI / ML - Supervised/Unsupervised Learning</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="consumer-devices" 
                        checked={consumerDevicesChecked}
                        onCheckedChange={(checked) => setConsumerDevicesChecked(checked === true)}
                      />
                      <Label htmlFor="consumer-devices" className="text-gray-700">Consumer Technology - Devices & Gadgets</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="consumer-gaming" 
                        checked={consumerGamingChecked}
                        onCheckedChange={(checked) => setConsumerGamingChecked(checked === true)}
                      />
                      <Label htmlFor="consumer-gaming" className="text-gray-700">Consumer Technology - Gaming, Esports & Entertainment</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="consumer-mobile" 
                        checked={consumerMobileChecked}
                        onCheckedChange={(checked) => setConsumerMobileChecked(checked === true)}
                      />
                      <Label htmlFor="consumer-mobile" className="text-gray-700">Consumer Technology - Mobile & Apps</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="consumer-smart-home" 
                        checked={consumerSmartHomeChecked}
                        onCheckedChange={(checked) => setConsumerSmartHomeChecked(checked === true)}
                      />
                      <Label htmlFor="consumer-smart-home" className="text-gray-700">Consumer Technology - Smart Home & IoT</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="cybersecurity-solutions" 
                        checked={cybersecuritySolutionsChecked}
                        onCheckedChange={(checked) => setCybersecuritySolutionsChecked(checked === true)}
                      />
                      <Label htmlFor="cybersecurity-solutions" className="text-gray-700">Cybersecurity & Privacy - Cybersecurity Solutions</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="data-privacy" 
                        checked={dataPrivacyChecked}
                        onCheckedChange={(checked) => setDataPrivacyChecked(checked === true)}
                      />
                      <Label htmlFor="data-privacy" className="text-gray-700">Cybersecurity & Privacy - Data Privacy</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="regulatory-compliance" 
                        checked={regulatoryComplianceChecked}
                        onCheckedChange={(checked) => setRegulatoryComplianceChecked(checked === true)}
                      />
                      <Label htmlFor="regulatory-compliance" className="text-gray-700">Cybersecurity & Privacy - Regulatory Compliance</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="risk-management" 
                        checked={riskManagementChecked}
                        onCheckedChange={(checked) => setRiskManagementChecked(checked === true)}
                      />
                      <Label htmlFor="risk-management" className="text-gray-700">Cybersecurity & Privacy - Risk Management</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="cloud-computing" 
                        checked={cloudComputingChecked}
                        onCheckedChange={(checked) => setCloudComputingChecked(checked === true)}
                      />
                      <Label htmlFor="cloud-computing" className="text-gray-700">Digital Infrastructure - Cloud Computing</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="data-centers" 
                        checked={dataCentersChecked}
                        onCheckedChange={(checked) => setDataCentersChecked(checked === true)}
                      />
                      <Label htmlFor="data-centers" className="text-gray-700">Digital Infrastructure - Data Centers</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="networks" 
                        checked={networksChecked}
                        onCheckedChange={(checked) => setNetworksChecked(checked === true)}
                      />
                      <Label htmlFor="networks" className="text-gray-700">Digital Infrastructure - Networks & Connectivity</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="web3-blockchain" 
                        checked={web3BlockchainChecked}
                        onCheckedChange={(checked) => setWeb3BlockchainChecked(checked === true)}
                      />
                      <Label htmlFor="web3-blockchain" className="text-gray-700">Digital Infrastructure - Web3 & Blockchain</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="content-distribution" 
                        checked={contentDistributionChecked}
                        onCheckedChange={(checked) => setContentDistributionChecked(checked === true)}
                      />
                      <Label htmlFor="content-distribution" className="text-gray-700">Digital Media & Content - Content Distribution</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="creator-economy" 
                        checked={creatorEconomyChecked}
                        onCheckedChange={(checked) => setCreatorEconomyChecked(checked === true)}
                      />
                      <Label htmlFor="creator-economy" className="text-gray-700">Digital Media & Content - Creator Economy</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="digital-marketing" 
                        checked={digitalMarketingChecked}
                        onCheckedChange={(checked) => setDigitalMarketingChecked(checked === true)}
                      />
                      <Label htmlFor="digital-marketing" className="text-gray-700">Digital Media & Content - Digital Marketing</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="social-media-platforms" 
                        checked={socialMediaPlatformsChecked}
                        onCheckedChange={(checked) => setSocialMediaPlatformsChecked(checked === true)}
                      />
                      <Label htmlFor="social-media-platforms" className="text-gray-700">Digital Media & Content - Social Media & Platforms</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="ar-vr-xr" 
                        checked={arVrXrChecked}
                        onCheckedChange={(checked) => setArVrXrChecked(checked === true)}
                      />
                      <Label htmlFor="ar-vr-xr" className="text-gray-700">Emerging Technology - AR / VR / XR</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="biotech-health" 
                        checked={biotechHealthChecked}
                        onCheckedChange={(checked) => setBiotechHealthChecked(checked === true)}
                      />
                      <Label htmlFor="biotech-health" className="text-gray-700">Emerging Technology - Biotech & Digital Health</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="quantum-computing" 
                        checked={quantumComputingChecked}
                        onCheckedChange={(checked) => setQuantumComputingChecked(checked === true)}
                      />
                      <Label htmlFor="quantum-computing" className="text-gray-700">Emerging Technology - Quantum Computing</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="emerging-robotics" 
                        checked={emergingRoboticsChecked}
                        onCheckedChange={(checked) => setEmergingRoboticsChecked(checked === true)}
                      />
                      <Label htmlFor="emerging-robotics" className="text-gray-700">Emerging Technology - Robotics & Automation</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="business-apps" 
                        checked={businessAppsChecked}
                        onCheckedChange={(checked) => setBusinessAppsChecked(checked === true)}
                      />
                      <Label htmlFor="business-apps" className="text-gray-700">Enterprise Technology - Business Applications</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="digital-transformation" 
                        checked={digitalTransformationChecked}
                        onCheckedChange={(checked) => setDigitalTransformationChecked(checked === true)}
                      />
                      <Label htmlFor="digital-transformation" className="text-gray-700">Enterprise Technology - Digital Transformation</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="integration-apis" 
                        checked={integrationApisChecked}
                        onCheckedChange={(checked) => setIntegrationApisChecked(checked === true)}
                      />
                      <Label htmlFor="integration-apis" className="text-gray-700">Enterprise Technology - Integration & APIs</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="saas-enterprise" 
                        checked={saasEnterpriseChecked}
                        onCheckedChange={(checked) => setSaasEnterpriseChecked(checked === true)}
                      />
                      <Label htmlFor="saas-enterprise" className="text-gray-700">Enterprise Technology - SaaS & Enterprise Software</Label>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="mb-6 mt-8">
                <Label htmlFor="interests" className="text-gray-700 font-medium block mb-2">
                  Additional Areas of Interest or Expertise
                </Label>
                <p className="text-sm text-gray-500 mb-3">
                  Please share any additional areas of interest or expertise not covered above:
                </p>
                <Textarea
                  id="interests"
                  value={interests}
                  onChange={(e) => setInterests(e.target.value)}
                  className="min-h-[120px] resize-y w-full"
                  placeholder="Share your professional interests or areas of expertise..."
                />
              </div>
            </div>
            
            <div className="mb-6">
              <Label htmlFor="timeframe" className="text-gray-700 font-medium block mb-2">
                Development Timeframe
              </Label>
              <p className="text-sm text-gray-500 mb-3">
                What is your timeframe for achieving your next career milestone? Are you looking for immediate changes or planning for the future?
              </p>
              <Textarea
                id="timeframe"
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="min-h-[120px] resize-y w-full"
                placeholder="Describe your timeframe..."
              />
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
                        ? "Digital Presence"
                        : index === 1
                        ? "Branding & Content"
                        : "Interests"}
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