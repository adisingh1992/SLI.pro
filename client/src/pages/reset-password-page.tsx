import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, KeyRound, CheckCircle2, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import sliProLogo from "@/assets/sliPro-logos_aqua.png";

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

type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

export default function ResetPasswordPage() {
  const { toast } = useToast();
  const [location] = useLocation();
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [token, setToken] = useState<string>("");

  // Get token from URL query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get("token");
    if (tokenParam) {
      setToken(tokenParam);
    } else {
      // If no token, show error
      setStatus("error");
    }
  }, [location]);

  // Reset password form
  const resetForm = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      token: "",
      password: "",
      confirmPassword: ""
    }
  });

  // Update token field when token is retrieved from URL
  useEffect(() => {
    if (token) {
      resetForm.setValue("token", token);
    }
  }, [token, resetForm]);

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: async (data: ResetPasswordValues) => {
      const res = await apiRequest("POST", "/api/reset-password", data);
      return res.json();
    },
    onSuccess: () => {
      setStatus("success");
      toast({
        title: "Password reset successful",
        description: "Your password has been reset successfully. You can now log in with your new password.",
      });
    },
    onError: (error: Error) => {
      setStatus("error");
      toast({
        title: "Reset failed",
        description: error.message || "Failed to reset password. The link may have expired.",
        variant: "destructive",
      });
    }
  });

  // Handle reset password submission
  const onResetSubmit = (data: ResetPasswordValues) => {
    resetPasswordMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-[#f5f8f7] flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex justify-center md:justify-between h-16 items-center">
            <div className="flex-shrink-0">
              <img
                src={sliProLogo}
                alt="SLI.pro"
                className="h-10 w-auto"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-grow flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <Card className="max-w-md w-full shadow-lg border-0">
          <CardContent className="p-8">
            {status === "success" ? (
              <div className="text-center">
                <CheckCircle2 className="mx-auto h-12 w-12 text-green-500 mb-4" />
                <h2 className="text-2xl font-medium text-[#333333] mb-2">Password Reset Successful</h2>
                <p className="text-[#666666] mb-6">Your password has been updated successfully.</p>
                <Button 
                  onClick={() => navigate("/auth")} 
                  className="w-full py-3 px-4 bg-[#bed6d1] hover:bg-opacity-90 focus:ring-2 focus:ring-offset-2 focus:ring-[#bed6d1]"
                >
                  Go to Login
                </Button>
              </div>
            ) : status === "error" ? (
              <div className="text-center">
                <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
                <h2 className="text-2xl font-medium text-[#333333] mb-2">Reset Link Invalid</h2>
                <p className="text-[#666666] mb-6">The reset link is invalid or has expired. Please request a new password reset.</p>
                <Button 
                  onClick={() => navigate("/auth")} 
                  className="w-full py-3 px-4 bg-[#bed6d1] hover:bg-opacity-90 focus:ring-2 focus:ring-offset-2 focus:ring-[#bed6d1]"
                >
                  Back to Login
                </Button>
              </div>
            ) : (
              <>
                <h2 className="text-2xl font-medium text-[#333333] mb-2">Reset Your Password</h2>
                <p className="text-[#666666] mb-6">Please enter your new password below.</p>
                
                <Form {...resetForm}>
                  <form onSubmit={resetForm.handleSubmit(onResetSubmit)} className="space-y-6">
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
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}