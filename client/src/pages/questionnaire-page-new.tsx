import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Loader2, CheckCircle } from "lucide-react";

// Define schemas for each step
const step1Schema = z.object({
  background: z.string().min(1, "Please share your professional background"),
  goals: z.string().min(1, "Please describe your career goals"),
});

const step2Schema = z.object({
  aspirations: z.string().min(1, "Please describe your aspirations"),
  challenges: z.string().min(1, "Please describe your challenges"),
});

const step3Schema = z.object({
  interests: z.string().min(1, "Please describe your professional interests"),
  timeframe: z.string().min(1, "Please specify your timeframe"),
});

// Combined schema for final submission
const questionnaireSchema = z.object({
  background: z.string().min(1, "Please share your professional background"),
  goals: z.string().min(1, "Please describe your career goals"),
  aspirations: z.string().min(1, "Please describe your aspirations"),
  challenges: z.string().min(1, "Please describe your challenges"),
  interests: z.string().min(1, "Please describe your professional interests"),
  timeframe: z.string().min(1, "Please specify your timeframe"),
});

type Step1Values = z.infer<typeof step1Schema>;
type Step2Values = z.infer<typeof step2Schema>;
type Step3Values = z.infer<typeof step3Schema>;
type QuestionnaireFormValues = z.infer<typeof questionnaireSchema>;

export default function QuestionnairePage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 3;
  
  // State to store form data for each step
  const [formData, setFormData] = useState<QuestionnaireFormValues>({
    background: "",
    goals: "",
    aspirations: "",
    challenges: "",
    interests: "",
    timeframe: "",
  });

  // Fetch user profile data
  const { data: userProfile, isLoading: profileLoading } = useQuery({
    queryKey: ["/api/user/profile"],
    enabled: !!user,
  });

  // Create/update questionnaire mutation
  const questionnaireMutation = useMutation({
    mutationFn: async (data: QuestionnaireFormValues) => {
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

  // Setup forms for each step
  const step1Form = useForm<Step1Values>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      background: "",
      goals: "",
    },
  });

  const step2Form = useForm<Step2Values>({
    resolver: zodResolver(step2Schema),
    defaultValues: {
      aspirations: "",
      challenges: "",
    },
  });

  const step3Form = useForm<Step3Values>({
    resolver: zodResolver(step3Schema),
    defaultValues: {
      interests: "",
      timeframe: "",
    },
  });

  // Update form values when userProfile is loaded
  useEffect(() => {
    if (userProfile?.questionnaire) {
      const q = userProfile.questionnaire;
      
      // Update all form states
      step1Form.reset({
        background: q.background || "",
        goals: q.goals || "",
      });
      
      step2Form.reset({
        aspirations: q.aspirations || "",
        challenges: q.challenges || "",
      });
      
      step3Form.reset({
        interests: q.interests || "",
        timeframe: q.timeframe || "",
      });
      
      // Update combined form data
      setFormData({
        background: q.background || "",
        goals: q.goals || "",
        aspirations: q.aspirations || "",
        challenges: q.challenges || "",
        interests: q.interests || "",
        timeframe: q.timeframe || "",
      });
    }
  }, [userProfile, step1Form, step2Form, step3Form]);

  const nextStep = () => {
    if (currentStep === 1) {
      step1Form.handleSubmit((data) => {
        setFormData(prev => ({ ...prev, ...data }));
        setCurrentStep(currentStep + 1);
      })();
    } else if (currentStep === 2) {
      step2Form.handleSubmit((data) => {
        setFormData(prev => ({ ...prev, ...data }));
        setCurrentStep(currentStep + 1);
      })();
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const onSubmit = () => {
    step3Form.handleSubmit((data) => {
      const finalData = {
        ...formData,
        ...data
      };
      questionnaireMutation.mutate(finalData);
    })();
  };

  // Render appropriate form based on current step
  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <Form {...step1Form}>
            <div className="space-y-6">
              <FormField
                control={step1Form.control}
                name="background"
                render={({ field }) => (
                  <FormItem className="mb-6">
                    <FormLabel className="text-gray-700 font-medium">
                      Professional Background
                    </FormLabel>
                    <FormDescription>
                      Tell us about your professional journey so far. What roles have you held and in which industries?
                    </FormDescription>
                    <FormControl>
                      <Textarea
                        className="min-h-[120px] resize-y"
                        placeholder="Share your professional background and experience..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={step1Form.control}
                name="goals"
                render={({ field }) => (
                  <FormItem className="mb-6">
                    <FormLabel className="text-gray-700 font-medium">
                      Career Goals
                    </FormLabel>
                    <FormDescription>
                      What are your short-term and long-term career objectives?
                    </FormDescription>
                    <FormControl>
                      <Textarea
                        className="min-h-[120px] resize-y"
                        placeholder="Describe your career goals..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </Form>
        );
      case 2:
        return (
          <Form {...step2Form}>
            <div className="space-y-6">
              <FormField
                control={step2Form.control}
                name="aspirations"
                render={({ field }) => (
                  <FormItem className="mb-6">
                    <FormLabel className="text-gray-700 font-medium">
                      Professional Aspirations
                    </FormLabel>
                    <FormDescription>
                      What do you hope to achieve in your career? What impact do you want to make?
                    </FormDescription>
                    <FormControl>
                      <Textarea
                        className="min-h-[120px] resize-y"
                        placeholder="Describe your professional aspirations..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={step2Form.control}
                name="challenges"
                render={({ field }) => (
                  <FormItem className="mb-6">
                    <FormLabel className="text-gray-700 font-medium">
                      Current Challenges
                    </FormLabel>
                    <FormDescription>
                      What obstacles or challenges are you currently facing in your career?
                    </FormDescription>
                    <FormControl>
                      <Textarea
                        className="min-h-[120px] resize-y"
                        placeholder="Describe the challenges you're facing..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </Form>
        );
      case 3:
        return (
          <Form {...step3Form}>
            <div className="space-y-6">
              <FormField
                control={step3Form.control}
                name="interests"
                render={({ field }) => (
                  <FormItem className="mb-6">
                    <FormLabel className="text-gray-700 font-medium">
                      Professional Interests
                    </FormLabel>
                    <FormDescription>
                      What areas, technologies, or disciplines are you most interested in?
                    </FormDescription>
                    <FormControl>
                      <Textarea
                        className="min-h-[120px] resize-y"
                        placeholder="Share your professional interests..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={step3Form.control}
                name="timeframe"
                render={({ field }) => (
                  <FormItem className="mb-6">
                    <FormLabel className="text-gray-700 font-medium">
                      Development Timeframe
                    </FormLabel>
                    <FormDescription>
                      What is your timeframe for achieving your next career milestone? Are you looking for immediate changes or planning for the future?
                    </FormDescription>
                    <FormControl>
                      <Textarea
                        className="min-h-[120px] resize-y"
                        placeholder="Describe your timeframe..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </Form>
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
                    onClick={onSubmit}
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