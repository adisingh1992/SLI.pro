import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Loader2, CheckCircle } from "lucide-react";

export default function QuestionnairePage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 3;
  
  // Refs for form fields to maintain independent values
  const backgroundRef = useRef<HTMLInputElement>(null);
  const goalsRef = useRef<HTMLInputElement>(null);
  const aspirationsRef = useRef<HTMLInputElement>(null);
  const challengesRef = useRef<HTMLInputElement>(null);
  const interestsRef = useRef<HTMLInputElement>(null);
  const timeframeRef = useRef<HTMLInputElement>(null);

  // State to track if current step fields are valid
  const [isCurrentStepValid, setIsCurrentStepValid] = useState(false);
  
  // Fetch user profile data
  const { data: userProfile, isLoading: profileLoading } = useQuery({
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
        title: "Questionnaire Submitted!",
        description: "Your career insights have been saved successfully.",
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
  
  // Validate current step
  const validateCurrentStep = () => {
    if (currentStep === 1) {
      const isValid = backgroundRef.current?.value.trim() !== "" && 
                      goalsRef.current?.value.trim() !== "";
      setIsCurrentStepValid(!!isValid);
      return isValid;
    } else if (currentStep === 2) {
      const isValid = aspirationsRef.current?.value.trim() !== "" && 
                      challengesRef.current?.value.trim() !== "";
      setIsCurrentStepValid(!!isValid);
      return isValid;
    } else if (currentStep === 3) {
      const isValid = interestsRef.current?.value.trim() !== "" && 
                      timeframeRef.current?.value.trim() !== "";
      setIsCurrentStepValid(!!isValid);
      return isValid;
    }
    return false;
  };

  // Set initial values if userProfile is loaded
  useEffect(() => {
    if (userProfile?.questionnaire) {
      const q = userProfile.questionnaire;
      
      // Update all field values
      if (backgroundRef.current) backgroundRef.current.value = q.background || "";
      if (goalsRef.current) goalsRef.current.value = q.goals || "";
      if (aspirationsRef.current) aspirationsRef.current.value = q.aspirations || "";
      if (challengesRef.current) challengesRef.current.value = q.challenges || "";
      if (interestsRef.current) interestsRef.current.value = q.interests || "";
      if (timeframeRef.current) timeframeRef.current.value = q.timeframe || "";
      
      // Validate current step fields
      validateCurrentStep();
    }
  }, [userProfile, currentStep]);
  
  // Revalidate when current step changes or fields update
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      validateCurrentStep();
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [currentStep]);

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
      const formData = {
        background: backgroundRef.current?.value || "",
        goals: goalsRef.current?.value || "",
        aspirations: aspirationsRef.current?.value || "",
        challenges: challengesRef.current?.value || "",
        interests: interestsRef.current?.value || "",
        timeframe: timeframeRef.current?.value || "",
      };
      
      questionnaireMutation.mutate(formData);
    } else {
      toast({
        title: "Please complete all fields",
        description: "All fields are required before submitting the questionnaire.",
        variant: "destructive",
      });
    }
  };

  // Helper to handle changes and continuously validate
  const handleInputChange = () => {
    validateCurrentStep();
  };

  // Render appropriate form based on current step
  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="mb-6">
              <Label htmlFor="background" className="text-gray-700 font-medium block mb-2">
                Professional Background
              </Label>
              <p className="text-sm text-gray-500 mb-3">
                Tell us about your professional journey so far. What roles have you held and in which industries?
              </p>
              <Input
                id="background"
                ref={backgroundRef}
                onChange={handleInputChange}
                className="w-full"
                placeholder="Share your professional background and experience..."
              />
            </div>
            
            <div className="mb-6">
              <Label htmlFor="goals" className="text-gray-700 font-medium block mb-2">
                Career Goals
              </Label>
              <p className="text-sm text-gray-500 mb-3">
                What are your short-term and long-term career objectives?
              </p>
              <Input
                id="goals"
                ref={goalsRef}
                onChange={handleInputChange}
                className="w-full"
                placeholder="Describe your career goals..."
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
              <Input
                id="aspirations"
                ref={aspirationsRef}
                onChange={handleInputChange}
                className="w-full"
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
              <Input
                id="challenges"
                ref={challengesRef}
                onChange={handleInputChange}
                className="w-full"
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
              <Input
                id="interests"
                ref={interestsRef}
                onChange={handleInputChange}
                className="w-full"
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
              <Input
                id="timeframe"
                ref={timeframeRef}
                onChange={handleInputChange}
                className="w-full"
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
        <Loader2 className="h-8 w-8 animate-spin text-[#bed6d1]" />
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="container py-10 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        <Card className="border-none shadow-md">
          <CardHeader className="bg-gradient-to-r from-[#bed6d1] to-[#dcede9] text-white rounded-t-lg">
            <CardTitle className="text-2xl font-bold">Career Development Questionnaire</CardTitle>
            <CardDescription className="text-white opacity-90">
              Help us understand your career journey and aspirations so we can provide personalized guidance.
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
                        ? "Background"
                        : index === 1
                        ? "Aspirations"
                        : "Interests"}
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}