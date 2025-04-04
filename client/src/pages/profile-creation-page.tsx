import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { UserProfile, UpdateProfile } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import NavBar from "@/components/nav-bar";
import { apiRequest, queryClient } from "@/lib/queryClient";
import ProfileStep1 from "@/components/profile-form/profile-step1";
import ProfileStep2 from "@/components/profile-form/profile-step2";
import ProfileStep3 from "@/components/profile-form/profile-step3";

export default function ProfileCreationPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [_, navigate] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);

  // Fetch user profile data
  const { 
    data: userProfile, 
    isLoading, 
    isError,
    error 
  } = useQuery<UserProfile>({
    queryKey: ["/api/user/profile"],
    enabled: !!user,
  });

  // Set the initial step based on profile completion
  useEffect(() => {
    if (userProfile?.profile) {
      setCurrentStep(userProfile.profile.completionStep || 1);
    }
  }, [userProfile]);

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (data: UpdateProfile) => {
      const res = await apiRequest("PATCH", "/api/profile", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update profile. " + error.message,
        variant: "destructive",
      });
    },
  });

  const handleStepChange = async (step: number) => {
    // Update the profile completion step in the backend
    await updateProfileMutation.mutateAsync({
      completionStep: step,
    });
    
    setCurrentStep(step);
  };

  const handleCompleteProfile = async () => {
    await updateProfileMutation.mutateAsync({
      completionStep: 3,
      isComplete: true,
    });
    
    toast({
      title: "Success",
      description: "Your profile has been created successfully!",
    });
    
    navigate("/profile");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex flex-col">
        <NavBar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#0077B5]" />
          <span className="ml-2 text-[#333333]">Loading your profile...</span>
        </div>
      </div>
    );
  }

  if (isError) {
    toast({
      title: "Error",
      description: "Failed to load profile data. " + error?.message,
      variant: "destructive",
    });
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col">
      <NavBar />
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white shadow-card rounded-lg overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-2xl font-medium text-[#333333]">Complete Your SLIPro Profile</h2>
            <p className="mt-1 text-gray-500">Please provide the following information to set up your professional profile</p>
          </div>
          
          {/* Progress Bar */}
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="w-full">
                <div className="flex mb-2 items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-[#0077B5] bg-[#0077B5] bg-opacity-10">
                      Step {currentStep} of 3: {
                        currentStep === 1 ? "Basic Information" :
                        currentStep === 2 ? "Experience & Education" :
                        "Skills & Languages"
                      }
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-semibold inline-block text-[#0077B5]">
                      {currentStep === 1 ? "33%" : currentStep === 2 ? "66%" : "100%"}
                    </span>
                  </div>
                </div>
                <div className="overflow-hidden h-2 mb-1 text-xs flex rounded bg-gray-200">
                  <div 
                    className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-[#0077B5] transition-all duration-500"
                    style={{ width: currentStep === 1 ? "33%" : currentStep === 2 ? "66%" : "100%" }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Step 1: Basic Information */}
          {currentStep === 1 && (
            <ProfileStep1 
              userProfile={userProfile} 
              onNext={() => handleStepChange(2)}
              updateProfileMutation={updateProfileMutation}
            />
          )}
          
          {/* Step 2: Experience & Education */}
          {currentStep === 2 && (
            <ProfileStep2
              userProfile={userProfile}
              onNext={() => handleStepChange(3)}
              onBack={() => handleStepChange(1)}
            />
          )}
          
          {/* Step 3: Skills & Languages */}
          {currentStep === 3 && (
            <ProfileStep3
              userProfile={userProfile}
              onBack={() => handleStepChange(2)}
              onComplete={handleCompleteProfile}
            />
          )}
        </div>
      </main>
    </div>
  );
}
