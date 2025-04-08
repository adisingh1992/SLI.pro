import React, { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
  
  // Social media checkboxes state
  const [twitterChecked, setTwitterChecked] = useState(false);
  const [mediumChecked, setMediumChecked] = useState(false);
  const [blogChecked, setBlogChecked] = useState(false);
  const [otherChecked, setOtherChecked] = useState(false);
  const [otherSocialMedia, setOtherSocialMedia] = useState("");
  
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
      
      // Set other questionnaire fields
      setAspirations(q.aspirations || "");
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
      return aspirations.trim() !== "" && challenges.trim() !== "";
    } else if (currentStep === 3) {
      return interests.trim() !== "" && timeframe.trim() !== "";
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
      
      const formData = {
        background, // LinkedIn URL
        goals: socialMediaDetails, // Social media details
        aspirations,
        challenges,
        interests,
        timeframe,
        // Include these fields for potential future enhancement
        socialMedia: {
          twitter: twitterChecked,
          medium: mediumChecked,
          blog: blogChecked,
          other: otherChecked ? otherSocialMedia : null
        }
      };
      
      questionnaireMutation.mutate(formData);
    } else {
      toast({
        title: "Please complete all required fields",
        description: "LinkedIn URL is required to complete your profile.",
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
                Professional Aspirations
              </Label>
              <p className="text-sm text-gray-500 mb-3">
                What do you hope to achieve in your career? What impact do you want to make?
              </p>
              <Textarea
                id="aspirations"
                value={aspirations}
                onChange={(e) => setAspirations(e.target.value)}
                className="min-h-[120px] resize-y w-full"
                placeholder="Describe your professional aspirations..."
              />
            </div>
            
            <div className="mb-6">
              <Label htmlFor="challenges" className="text-gray-700 font-medium block mb-2">
                Current Challenges
              </Label>
              <p className="text-sm text-gray-500 mb-3">
                What obstacles or challenges are you currently facing in your career?
              </p>
              <Textarea
                id="challenges"
                value={challenges}
                onChange={(e) => setChallenges(e.target.value)}
                className="min-h-[120px] resize-y w-full"
                placeholder="Describe the challenges you're facing..."
              />
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-6">
            <div className="mb-6">
              <Label htmlFor="interests" className="text-gray-700 font-medium block mb-2">
                Professional Interests
              </Label>
              <p className="text-sm text-gray-500 mb-3">
                What areas, technologies, or disciplines are you most interested in?
              </p>
              <Textarea
                id="interests"
                value={interests}
                onChange={(e) => setInterests(e.target.value)}
                className="min-h-[120px] resize-y w-full"
                placeholder="Share your professional interests..."
              />
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
                        ? "Aspirations"
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