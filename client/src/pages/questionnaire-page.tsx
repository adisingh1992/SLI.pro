import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Loader2, CheckCircle } from "lucide-react";
import { scrollToTop } from "@/lib/utils";

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

// Create schema for questionnaire
const questionnaireSchema = z.object({
  industry: z.string().min(1, "Please select your current or prior industry"),
  background: z.string().min(1, "Please share your professional background"),
  goals: z.string().min(1, "Please describe your career goals"),
  aspirations: z.string().min(1, "Please describe your aspirations"),
  challenges: z.string().min(1, "Please describe your challenges"),
  interests: z.string().min(1, "Please describe your professional interests"),
  timeframe: z.string().min(1, "Please specify your timeframe"),
});

type QuestionnaireFormValues = z.infer<typeof questionnaireSchema>;

export default function QuestionnairePage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 4;

  // Fetch user profile data
  const { data: userProfile, isLoading: profileLoading } = useQuery({
    queryKey: ["/api/user/profile"],
    enabled: !!user,
  });

  // Create/update questionnaire mutation
  const questionnaireMutation = useMutation({
    mutationFn: async (data: QuestionnaireFormValues) => {
      // Check if user already has a questionnaire
      if (userProfile?.questionnaire) {
        const response = await apiRequest("PUT", "/api/questionnaire", data);
        return await response.json();
      } else {
        const response = await apiRequest("POST", "/api/questionnaire", data);
        return await response.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
      toast({
        title: "Success!",
        description: "Your questionnaire has been saved.",
        variant: "default",
      });
      // Navigate to profile page after successful submission
      setTimeout(() => {
        scrollToTop();
        navigate("/profile");
      }, 1500);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save questionnaire.",
        variant: "destructive",
      });
    },
  });

  const form = useForm<QuestionnaireFormValues>({
    resolver: zodResolver(questionnaireSchema),
    defaultValues: {
      industry: userProfile?.questionnaire?.industry || "",
      background: userProfile?.questionnaire?.background || "",
      goals: userProfile?.questionnaire?.goals || "",
      aspirations: userProfile?.questionnaire?.aspirations || "",
      challenges: userProfile?.questionnaire?.challenges || "",
      interests: userProfile?.questionnaire?.interests || "",
      timeframe: userProfile?.questionnaire?.timeframe || "",
    },
  });

  // Update form values when userProfile is loaded
  useEffect(() => {
    if (userProfile?.questionnaire) {
      form.reset({
        industry: userProfile.questionnaire.industry || "",
        background: userProfile.questionnaire.background || "",
        goals: userProfile.questionnaire.goals || "",
        aspirations: userProfile.questionnaire.aspirations || "",
        challenges: userProfile.questionnaire.challenges || "",
        interests: userProfile.questionnaire.interests || "",
        timeframe: userProfile.questionnaire.timeframe || "",
      });
    }
  }, [userProfile, form]);

  const onSubmit = (data: QuestionnaireFormValues) => {
    questionnaireMutation.mutate(data);
  };

  // Handle step navigation
  const nextStep = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Helper function to render current step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <>
            <FormField
              control={form.control}
              name="industry"
              render={({ field }) => (
                <FormItem className="mb-6">
                  <FormLabel className="text-gray-700 font-medium">
                    Current / Prior Industry
                  </FormLabel>
                  <FormDescription>
                    Select the industry that best represents your current or most recent work experience.
                  </FormDescription>
                  <FormControl>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select an industry" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {INDUSTRY_OPTIONS.map((industry) => (
                          <SelectItem key={industry} value={industry}>
                            {industry}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        );
      case 2:
        return (
          <>
            <FormField
              control={form.control}
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
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      ref={field.ref}
                      name={field.name}
                      className="min-h-[120px] resize-y"
                      placeholder="Share your professional background and experience..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
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
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      ref={field.ref}
                      name={field.name}
                      className="min-h-[120px] resize-y"
                      placeholder="Describe your career goals..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        );
      case 3:
        return (
          <>
            <FormField
              control={form.control}
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
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      ref={field.ref}
                      name={field.name}
                      className="min-h-[120px] resize-y"
                      placeholder="Describe your professional aspirations..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
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
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      ref={field.ref}
                      name={field.name}
                      className="min-h-[120px] resize-y"
                      placeholder="Describe the challenges you're facing..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        );
      case 4:
        return (
          <>
            <FormField
              control={form.control}
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
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      ref={field.ref}
                      name={field.name}
                      className="min-h-[120px] resize-y"
                      placeholder="Share your professional interests..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
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
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      ref={field.ref}
                      name={field.name}
                      className="min-h-[120px] resize-y"
                      placeholder="Describe your timeframe..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
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
                        ? "Industry"
                        : index === 1
                        ? "Background"
                        : index === 2
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

            <Form {...form}>
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
                      onClick={form.handleSubmit(onSubmit)}
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
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}