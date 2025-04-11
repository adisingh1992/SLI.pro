import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, Mail, KeyRound, ExternalLink } from "lucide-react";

// Reset request schema
const resetRequestSchema = z.object({
  username: z.string().email("Please enter a valid email"),
});

// Reset password schema
const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  password: z.string().min(8, "Password must be at least 8 characters")
    .refine(pwd => /\d/.test(pwd), "Password must contain at least one number")
    .refine(pwd => /[!@#$%^&*(),.?":{}|<>]/.test(pwd), "Password must contain at least one special character"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type ResetRequestValues = z.infer<typeof resetRequestSchema>;
type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

interface ForgotPasswordFormProps {
  onBack: () => void;
}

export default function ForgotPasswordForm({ onBack }: ForgotPasswordFormProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<"request" | "reset">("request");
  const [resetToken, setResetToken] = useState<string | null>(null);

  // Request password reset form
  const requestForm = useForm<ResetRequestValues>({
    resolver: zodResolver(resetRequestSchema),
    defaultValues: {
      username: ""
    }
  });

  // Reset password form
  const resetForm = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      token: "",
      password: "",
      confirmPassword: ""
    }
  });

  // Request password reset mutation
  const requestResetMutation = useMutation({
    mutationFn: async (data: ResetRequestValues) => {
      const res = await apiRequest("POST", "/api/forgot-password", data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Reset link sent",
        description: "If an account with that email exists, a password reset link has been sent.",
      });
      
      // In a real application with email sending, we'd just display a message
      // For our demo, we'll just show the success message, but not automatically 
      // move to the reset form - the user needs to click on a link in their email
      if (data.resetToken) {
        setResetToken(data.resetToken);
        // We'll keep this for easy testing, but not automatically set the step
        resetForm.setValue("token", data.resetToken);
        // Don't automatically advance to the reset step
        // setStep("reset");
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Request failed",
        description: error.message || "Failed to send reset link. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: async (data: ResetPasswordValues) => {
      const res = await apiRequest("POST", "/api/reset-password", data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Password reset",
        description: "Your password has been reset successfully. You can now log in with your new password.",
      });
      onBack();
    },
    onError: (error: Error) => {
      toast({
        title: "Reset failed",
        description: error.message || "Failed to reset password. The link may have expired.",
        variant: "destructive",
      });
    }
  });

  // Handle reset request submission
  const onRequestSubmit = (data: ResetRequestValues) => {
    requestResetMutation.mutate(data);
  };

  // Handle reset password submission
  const onResetSubmit = (data: ResetPasswordValues) => {
    resetPasswordMutation.mutate(data);
  };

  return (
    <div className="w-full">
      <div className="mb-6">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="mb-2 px-0 text-[#6c8083] hover:text-[#6c8083]"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Login
        </Button>

        <h2 className="text-2xl font-medium text-[#333333]">
          {step === "request" ? "Reset Your Password" : "Create New Password"}
        </h2>
        
        <p className="text-[#666666] mt-2">
          {step === "request" 
            ? "Enter your email address below, and we'll send you a link to reset your password."
            : "Please enter your new password below."}
        </p>
      </div>

      {step === "request" ? (
        <Form {...requestForm}>
          <form onSubmit={requestForm.handleSubmit(onRequestSubmit)} className="space-y-6">
            <FormField
              control={requestForm.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[#333333]">Email Address</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Mail className="absolute left-3 top-2.5 h-5 w-5 text-[#6c8083]" />
                      <Input
                        {...field}
                        placeholder="Enter your email"
                        className="pl-10 border-gray-300 focus:ring-2 focus:ring-[#bed6d1]"
                      />
                    </div>
                  </FormControl>
                  <FormMessage className="text-[#E34240]" />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              className="w-full py-3 px-4 bg-[#bed6d1] hover:bg-opacity-90 focus:ring-2 focus:ring-offset-2 focus:ring-[#bed6d1]"
              disabled={requestResetMutation.isPending}
            >
              {requestResetMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Mail className="mr-2 h-4 w-4" />
              )}
              Send Reset Link
            </Button>
            
            {resetToken && (
              <div className="mt-4 p-4 bg-gray-50 rounded-md border border-gray-200">
                <p className="text-sm text-gray-600 mb-2">
                  In a real application, an email would be sent to your address. For demonstration purposes, you can use this button to simulate clicking the reset link in your email:
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep("reset")}
                  className="w-full mt-2"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Simulate Clicking Reset Link
                </Button>
              </div>
            )}
          </form>
        </Form>
      ) : (
        <Form {...resetForm}>
          <form onSubmit={resetForm.handleSubmit(onResetSubmit)} className="space-y-6">
            {!resetToken && (
              <FormField
                control={resetForm.control}
                name="token"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[#333333]">Reset Token</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Enter your reset token"
                        className="border-gray-300 focus:ring-2 focus:ring-[#bed6d1]"
                      />
                    </FormControl>
                    <FormMessage className="text-[#E34240]" />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={resetForm.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[#333333]">New Password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-2.5 h-5 w-5 text-[#6c8083]" />
                      <Input
                        {...field}
                        type="password"
                        placeholder="Create a new password"
                        className="pl-10 border-gray-300 focus:ring-2 focus:ring-[#bed6d1]"
                      />
                    </div>
                  </FormControl>
                  <FormMessage className="text-[#E34240]" />
                </FormItem>
              )}
            />

            <FormField
              control={resetForm.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[#333333]">Confirm Password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-2.5 h-5 w-5 text-[#6c8083]" />
                      <Input
                        {...field}
                        type="password"
                        placeholder="Confirm your password"
                        className="pl-10 border-gray-300 focus:ring-2 focus:ring-[#bed6d1]"
                      />
                    </div>
                  </FormControl>
                  <FormMessage className="text-[#E34240]" />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              className="w-full py-3 px-4 bg-[#bed6d1] hover:bg-opacity-90 focus:ring-2 focus:ring-offset-2 focus:ring-[#bed6d1]"
              disabled={resetPasswordMutation.isPending}
            >
              {resetPasswordMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="mr-2 h-4 w-4" />
              )}
              Reset Password
            </Button>
          </form>
        </Form>
      )}
    </div>
  );
}