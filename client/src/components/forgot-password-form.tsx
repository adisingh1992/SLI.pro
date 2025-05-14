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
  const [step, setStep] = useState<"request" | "check-email" | "reset">("request");
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
    onSuccess: () => {
      toast({
        title: "Reset link sent",
        description: "If an account with that email exists, a password reset link has been sent to your email.",
      });
      
      // Display message directing the user to check their email
      setStep("check-email");
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
          {step === "request" 
            ? "Reset Your Password" 
            : step === "check-email" 
              ? "Check Your Email"
              : "Create New Password"}
        </h2>
        
        <p className="text-[#666666] mt-2">
          {step === "request" 
            ? "Enter your email address below, and we'll send you a link to reset your password."
            : step === "check-email"
              ? "We've sent a password reset link to your email address. Please check your inbox and click on the link to reset your password."
              : "Please enter your new password below."}
        </p>
      </div>

      {step === "check-email" ? (
        <div className="flex flex-col items-center justify-center mt-8 space-y-6">
          <div className="bg-[#f5f8f7] p-6 rounded-lg text-center w-full">
            <Mail className="h-12 w-12 text-[#bed6d1] mx-auto mb-4" />
            <h3 className="text-lg font-medium text-[#333333] mb-2">Email Sent</h3>
            <p className="text-[#666666] mb-4">
              If an account exists with the email you provided, we've sent a password reset link.
            </p>
            <p className="text-[#666666] text-sm">
              Can't find the email? Check your spam folder or 
              <button
                type="button"
                onClick={() => setStep("request")}
                className="text-[#bed6d1] hover:underline ml-1"
              >
                try again
              </button>
            </p>
          </div>
          
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep("reset")}
            className="w-full py-3 px-4 border-[#bed6d1] text-[#6c8083] hover:bg-[#f5f8f7]"
          >
            <KeyRound className="mr-2 h-4 w-4" />
            I already have a reset token
          </Button>
        </div>
      ) : step === "request" ? (
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