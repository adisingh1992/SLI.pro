import { useState } from "react";
import { UserProfile, UpdateProfile } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { UseMutationResult } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

// Validation schema for step 1
const stepOneSchema = z.object({
  headline: z.string().min(1, "Professional headline is required"),
  bio: z
    .string()
    .min(1, "About Me is required")
    .max(500, "Bio must be less than 500 characters"),
  location: z.string().min(1, "Location is required"),
});

type StepOneValues = z.infer<typeof stepOneSchema>;

interface ProfileStep1Props {
  userProfile?: UserProfile;
  onNext: () => void;
  updateProfileMutation: UseMutationResult<any, Error, UpdateProfile>;
}

export default function ProfileStep1({ 
  userProfile, 
  onNext,
  updateProfileMutation
}: ProfileStep1Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize form with existing data if available
  const form = useForm<StepOneValues>({
    resolver: zodResolver(stepOneSchema),
    defaultValues: {
      headline: userProfile?.headline || "",
      bio: userProfile?.bio || "",
      location: userProfile?.location || "",
    },
  });

  const onSubmit = async (data: StepOneValues) => {
    setIsSubmitting(true);
    try {
      // Update the user profile with the form data
      await updateProfileMutation.mutateAsync({
        ...data,
        completionStep: 1,
      });
      
      // Move to the next step
      onNext();
    } catch (error) {
      console.error("Error updating profile:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="headline"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="block text-sm font-medium text-[#333333] mb-1">
                  Professional Headline
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    className="block w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#0077B5] focus:ring-opacity-50"
                    placeholder="e.g. Senior Software Engineer at Tech Corp"
                  />
                </FormControl>
                <FormMessage className="text-[#E34240]" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="bio"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="block text-sm font-medium text-[#333333] mb-1">
                  About Me
                </FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={4}
                    className="block w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#0077B5] focus:ring-opacity-50"
                    placeholder="Write a short bio about yourself"
                  />
                </FormControl>
                <div className="mt-1 text-sm text-gray-500">
                  Briefly describe your professional background and interests (max 500 characters)
                </div>
                <FormMessage className="text-[#E34240]" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="location"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="block text-sm font-medium text-[#333333] mb-1">
                  Location
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    className="block w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#0077B5] focus:ring-opacity-50"
                    placeholder="e.g. San Francisco, CA"
                  />
                </FormControl>
                <FormMessage className="text-[#E34240]" />
              </FormItem>
            )}
          />

          <div className="mt-8 flex justify-end">
            <Button
              type="submit"
              className="px-6 py-3 bg-[#0077B5] hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0077B5]"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Continue to Experience"
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
