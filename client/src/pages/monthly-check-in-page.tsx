import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import NavBar from "@/components/nav-bar";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  Form, 
  FormControl, 
  FormDescription, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, ArrowLeft, Upload, X, Plus, Image, ArrowRight, CheckCircle } from "lucide-react";
import { scrollToTop } from "@/lib/utils";

// Form schema for monthly check-in
const checkInSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be in format YYYY-MM"),
  
  // Section 1: Content Creation
  contentPosts: z.coerce.number().min(0, "Cannot be negative"),
  contentLinks: z.array(z.string().url("Must be a valid URL")).optional().default([]),
  contentScreenshots: z.array(z.object({
    name: z.string(),
    data: z.string()
  })).optional().default([]),
  
  // Section 2: Engagement Activity
  engagementFrequency: z.enum(["daily", "3-5/week", "1-2/week", "less-than-1/week", "none"]),
  engagementScreenshot: z.string().optional(),
  
  // Section 3: Visual Brand
  updatedProfileVisuals: z.boolean().default(false),
  profileScreenshot: z.string().optional(),
  
  // Section 4: Network Growth
  newConnections: z.coerce.number().min(0, "Cannot be negative"),
  targetConnectionPercentage: z.enum(["0-25%", "26-50%", "51-75%", "76-100%"]),
  
  // Section 5: Recommendation Implementation
  recommendationImplementation: z.enum(["fully", "mostly", "partially", "minimally", "not-yet"]),
  implementationChallenges: z.string().optional()
});

type CheckInFormValues = z.infer<typeof checkInSchema>;

export default function MonthlyCheckInPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 5;
  const [fileInputKey, setFileInputKey] = useState(0); // For resetting file inputs

  // Current month in YYYY-MM format
  const getCurrentMonth = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  };

  // Create the form
  const form = useForm<CheckInFormValues>({
    resolver: zodResolver(checkInSchema),
    defaultValues: {
      month: getCurrentMonth(),
      contentPosts: 0,
      contentLinks: [],
      contentScreenshots: [],
      engagementFrequency: "none",
      updatedProfileVisuals: false,
      newConnections: 0,
      targetConnectionPercentage: "0-25%",
      recommendationImplementation: "not-yet",
    }
  });

  // Format month for display
  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  // Check if current step is valid
  const isCurrentStepValid = () => {
    const fieldsMap: Record<number, string[]> = {
      1: ['month', 'contentPosts', 'contentLinks', 'contentScreenshots'],
      2: ['engagementFrequency', 'engagementScreenshot'],
      3: ['updatedProfileVisuals', 'profileScreenshot'],
      4: ['newConnections', 'targetConnectionPercentage'],
      5: ['recommendationImplementation', 'implementationChallenges']
    };
    
    const currentFields = fieldsMap[currentStep] || [];

    return currentFields.every(field => {
      if (field === 'profileScreenshot') {
        return !form.getValues().updatedProfileVisuals || form.getValues().profileScreenshot;
      }
      return !form.getFieldState(field as any).invalid;
    });
  };

  // Handle file uploads for content screenshots
  const handleContentScreenshotUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) return;
    
    const file = event.target.files[0];
    const reader = new FileReader();
    
    reader.onload = (e) => {
      if (!e.target?.result) return;
      
      const contentScreenshots = form.getValues().contentScreenshots || [];
      contentScreenshots.push({
        name: file.name,
        data: e.target.result as string
      });
      
      form.setValue('contentScreenshots', contentScreenshots, { shouldValidate: true });
      setFileInputKey(prev => prev + 1); // Reset file input
    };
    
    reader.readAsDataURL(file);
  };

  // Handle file uploads for engagement screenshot
  const handleEngagementScreenshotUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) return;
    
    const file = event.target.files[0];
    const reader = new FileReader();
    
    reader.onload = (e) => {
      if (!e.target?.result) return;
      form.setValue('engagementScreenshot', e.target.result as string, { shouldValidate: true });
      setFileInputKey(prev => prev + 1); // Reset file input
    };
    
    reader.readAsDataURL(file);
  };

  // Handle file uploads for profile screenshot
  const handleProfileScreenshotUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) return;
    
    const file = event.target.files[0];
    const reader = new FileReader();
    
    reader.onload = (e) => {
      if (!e.target?.result) return;
      form.setValue('profileScreenshot', e.target.result as string, { shouldValidate: true });
      setFileInputKey(prev => prev + 1); // Reset file input
    };
    
    reader.readAsDataURL(file);
  };

  // Remove content screenshot
  const removeContentScreenshot = (index: number) => {
    const contentScreenshots = form.getValues().contentScreenshots || [];
    contentScreenshots.splice(index, 1);
    form.setValue('contentScreenshots', contentScreenshots, { shouldValidate: true });
  };

  // Remove content link
  const removeContentLink = (index: number) => {
    const contentLinks = form.getValues().contentLinks || [];
    contentLinks.splice(index, 1);
    form.setValue('contentLinks', contentLinks, { shouldValidate: true });
  };

  // Add content link
  const [newContentLink, setNewContentLink] = useState('');
  
  const addContentLink = () => {
    if (!newContentLink) return;
    
    try {
      // Validate URL
      new URL(newContentLink);
      
      const contentLinks = form.getValues().contentLinks || [];
      contentLinks.push(newContentLink);
      form.setValue('contentLinks', contentLinks, { shouldValidate: true });
      setNewContentLink('');
    } catch (e) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid URL",
        variant: "destructive"
      });
    }
  };

  // Navigation
  const nextStep = () => {
    if (currentStep < totalSteps && isCurrentStepValid()) {
      setCurrentStep(currentStep + 1);
      scrollToTop();
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      scrollToTop();
    }
  };

  // Check if we're at first or last step
  const isFirstStep = currentStep === 1;
  const isLastStep = currentStep === totalSteps;

  // Mutation for submitting form
  const checkInMutation = useMutation({
    mutationFn: async (data: CheckInFormValues) => {
      const response = await apiRequest("POST", "/api/monthly-check-ins", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Check-in Submitted!",
        description: "Your monthly professional brand check-in has been saved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/monthly-check-ins"] });
      navigate("/");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: "There was a problem submitting your check-in: " + error.message,
        variant: "destructive",
      });
    },
  });

  // Submit form handler
  const onSubmit = (data: CheckInFormValues) => {
    checkInMutation.mutate(data);
  };

  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <>
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2">Content Creation Activity</h2>
              <p className="text-gray-600">
                Track your content creation and engagement on LinkedIn for the month of {formatMonth(form.getValues().month)}
              </p>
            </div>
            
            <FormField
              control={form.control}
              name="contentPosts"
              render={({ field }) => (
                <FormItem className="mb-4">
                  <FormLabel>How many original LinkedIn posts did you publish in the past month?</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="mb-4">
              <FormLabel>Please provide links to your best 1-3 posts from this month</FormLabel>
              <div className="flex mt-2 mb-2">
                <Input 
                  placeholder="https://www.linkedin.com/post/..." 
                  value={newContentLink}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewContentLink(e.target.value)}
                  className="mr-2"
                />
                <Button type="button" onClick={addContentLink} size="sm">
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              </div>
              
              {form.getValues().contentLinks?.length > 0 && (
                <div className="mt-2 space-y-2">
                  {form.getValues().contentLinks.map((link, index) => (
                    <div key={index} className="flex items-center bg-gray-50 p-2 rounded">
                      <a href={link} target="_blank" rel="noopener noreferrer" className="text-blue-600 flex-1 truncate">
                        {link}
                      </a>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => removeContentLink(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="mb-4">
              <FormLabel>Upload screenshots of your best posts (optional)</FormLabel>
              <div className="mt-2">
                <Input
                  type="file"
                  accept="image/*"
                  key={`content-screenshot-${fileInputKey}`}
                  onChange={handleContentScreenshotUpload}
                />
              </div>
              
              {form.getValues().contentScreenshots?.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-4">
                  {form.getValues().contentScreenshots.map((screenshot, index) => (
                    <div key={index} className="relative">
                      <img 
                        src={screenshot.data}
                        alt={`Content screenshot ${index + 1}`}
                        className="w-full h-40 object-cover rounded border"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={() => removeContentScreenshot(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        );
      
      case 2:
        return (
          <>
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2">Engagement Activity</h2>
              <p className="text-gray-600">
                Track how actively you engage with others' content on LinkedIn
              </p>
            </div>
            
            <FormField
              control={form.control}
              name="engagementFrequency"
              render={({ field }) => (
                <FormItem className="mb-4">
                  <FormLabel>
                    Approximately how many times per week did you engage with others' content (comments, likes, shares)?
                  </FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select engagement frequency" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="daily">Daily (10+/week)</SelectItem>
                      <SelectItem value="3-5/week">3-5/week</SelectItem>
                      <SelectItem value="1-2/week">1-2/week</SelectItem>
                      <SelectItem value="less-than-1/week">Less than 1/week</SelectItem>
                      <SelectItem value="none">None</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="mb-4">
              <FormLabel>
                Please provide a screenshot example of a meaningful comment you made on someone else's post (optional)
              </FormLabel>
              <div className="mt-2">
                <Input
                  type="file"
                  accept="image/*"
                  key={`engagement-screenshot-${fileInputKey}`}
                  onChange={handleEngagementScreenshotUpload}
                />
              </div>
              
              {form.getValues().engagementScreenshot && (
                <div className="mt-4 relative max-w-md">
                  <img 
                    src={form.getValues().engagementScreenshot}
                    alt="Engagement screenshot"
                    className="w-full rounded border"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => form.setValue('engagementScreenshot', '', { shouldValidate: true })}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </>
        );
      
      case 3:
        return (
          <>
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2">Visual Brand Elements</h2>
              <p className="text-gray-600">
                Track changes to your LinkedIn profile visual elements
              </p>
            </div>
            
            <FormField
              control={form.control}
              name="updatedProfileVisuals"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 mb-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">
                      Have you updated your profile photo or banner image since the last check-in?
                    </FormLabel>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            
            {form.getValues().updatedProfileVisuals && (
              <div className="mb-4">
                <FormLabel>
                  Please upload a screenshot showing your current profile
                </FormLabel>
                <div className="mt-2">
                  <Input
                    type="file"
                    accept="image/*"
                    key={`profile-screenshot-${fileInputKey}`}
                    onChange={handleProfileScreenshotUpload}
                  />
                </div>
                
                {form.getValues().profileScreenshot && (
                  <div className="mt-4 relative max-w-md">
                    <img 
                      src={form.getValues().profileScreenshot}
                      alt="Profile screenshot"
                      className="w-full rounded border"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => form.setValue('profileScreenshot', '', { shouldValidate: true })}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        );
      
      case 4:
        return (
          <>
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2">Network Growth</h2>
              <p className="text-gray-600">
                Track the growth of your professional network on LinkedIn
              </p>
            </div>
            
            <FormField
              control={form.control}
              name="newConnections"
              render={({ field }) => (
                <FormItem className="mb-4">
                  <FormLabel>
                    Approximately how many new connections did you add to your network in the past month?
                  </FormLabel>
                  <FormControl>
                    <Input type="number" min="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="targetConnectionPercentage"
              render={({ field }) => (
                <FormItem className="mb-4">
                  <FormLabel>
                    What percentage of these new connections are in your target industry or role?
                  </FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select percentage range" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="0-25%">0-25%</SelectItem>
                      <SelectItem value="26-50%">26-50%</SelectItem>
                      <SelectItem value="51-75%">51-75%</SelectItem>
                      <SelectItem value="76-100%">76-100%</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        );
      
      case 5:
        return (
          <>
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2">Recommendation Implementation</h2>
              <p className="text-gray-600">
                Track your progress implementing previous professional profile recommendations
              </p>
            </div>
            
            <FormField
              control={form.control}
              name="recommendationImplementation"
              render={({ field }) => (
                <FormItem className="mb-4">
                  <FormLabel>
                    Have you implemented the profile optimization recommendations from your last assessment?
                  </FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select implementation level" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="fully">Fully</SelectItem>
                      <SelectItem value="mostly">Mostly</SelectItem>
                      <SelectItem value="partially">Partially</SelectItem>
                      <SelectItem value="minimally">Minimally</SelectItem>
                      <SelectItem value="not-yet">Not Yet</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {form.getValues().recommendationImplementation !== 'fully' && (
              <FormField
                control={form.control}
                name="implementationChallenges"
                render={({ field }) => (
                  <FormItem className="mb-4">
                    <FormLabel>
                      If not fully implemented, what prevented you from doing so?
                    </FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Please describe any challenges you faced..."
                        className="resize-none" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </>
        );
      
      default:
        return null;
    }
  };

  // Progress indicator
  const Progress = () => {
    return (
      <div className="flex mb-6">
        {Array.from({ length: totalSteps }).map((_, index) => (
          <div key={index} className="flex items-center">
            <div
              className={`rounded-full h-8 w-8 flex items-center justify-center ${
                currentStep > index + 1
                  ? "bg-[#bed6d1] text-white"
                  : currentStep === index + 1
                  ? "bg-[#6c8083] text-white"
                  : "bg-gray-200 text-gray-500"
              }`}
            >
              {currentStep > index + 1 ? (
                <CheckCircle className="h-5 w-5" />
              ) : (
                index + 1
              )}
            </div>
            {index < totalSteps - 1 && (
              <div
                className={`h-1 w-10 ${
                  currentStep > index + 1 ? "bg-[#bed6d1]" : "bg-gray-200"
                }`}
              ></div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col">
      <NavBar />
      <div className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate("/")}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <h1 className="text-2xl font-bold text-[#333333]">
            Monthly Professional Brand Check-In
          </h1>
          <p className="text-gray-600 mt-1">
            Track your professional branding activities for {formatMonth(form.getValues().month)}
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <Progress />
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                      disabled={checkInMutation.isPending}
                    >
                      {checkInMutation.isPending ? (
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
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}