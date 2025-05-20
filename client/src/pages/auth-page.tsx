import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useLocation } from "wouter";
import ForgotPasswordForm from "@/components/forgot-password-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useState, useEffect } from "react";
import { Loader2, UserPlus, LogIn } from "lucide-react";
import sliProLogo from "@/assets/sliPro-logos_aqua.png";

// Login schema
const loginSchema = z.object({
  username: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Required"),
  rememberMe: z.boolean().optional(),
  isSubmitting: z.boolean().optional(),
});

// Registration schema with extended validation
const registerSchema = z
  .object({
    firstName: z.string().min(1, "Required"),
    lastName: z.string().min(1, "Required"),
    username: z.string().email("Please enter a valid email"),
    phoneNumber: z
      .string()
      .min(1, "Required")
      .refine(
        (val) =>
          /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/.test(val),
        {
          message: "Please enter a valid phone number",
        },
      ),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .refine(
        (pwd) => /\d/.test(pwd),
        "Password must contain at least one number",
      )
      .refine(
        (pwd) => /[!@#$%^&*(),.?":{}|<>]/.test(pwd),
        "Password must contain at least one special character",
      ),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema> & { isSubmitting?: boolean };

export default function AuthPage() {
  const [activeTab, setActiveTab] = useState("login");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const { user, loginMutation, registerMutation } = useAuth();
  const [_, navigate] = useLocation();

  // Login form setup
  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
      rememberMe: false,
      isSubmitting: false,
    },
  });

  // Register form setup
  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      username: "",
      phoneNumber: "",
      password: "",
      confirmPassword: "",
    },
  });

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate("/");
    }
  }, [user, navigate]);

  if (user) {
    return null;
  }

  // Handle login submission
  const onLoginSubmit = async (data: LoginFormValues) => {
    try {
      console.log('Logging in user...');
      // Use the React Query mutation
      await loginMutation.mutateAsync({
        username: data.username,
        password: data.password,
      });
      
      console.log('Login successful, redirecting to homepage');
      
      // Manual navigation after successful login
      // We need a small delay to allow the mutation to complete and update the auth context
      setTimeout(() => {
        navigate("/");
      }, 300);

    } catch (error) {
      console.error('Login error:', error);
      // Error is handled by the mutation's onError callback
    }
  };

  // Handle registration submission
  const onRegisterSubmit = async (data: RegisterFormValues) => {
    try {
      console.log('Registering user...');
      
      // Use the React Query mutation
      await registerMutation.mutateAsync({
        firstName: data.firstName,
        lastName: data.lastName,
        username: data.username,
        phoneNumber: data.phoneNumber,
        password: data.password,
        confirmPassword: data.confirmPassword,
      });
      
      console.log('Registration successful, redirecting to homepage');
      
      // Manual navigation after successful registration
      // We need a small delay to allow the mutation to complete and update the auth context
      setTimeout(() => {
        navigate("/");
      }, 300);
      
    } catch (error) {
      console.error('Registration error:', error);
      // Error is handled by the mutation's onError callback
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      {/* Navbar */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <img
                  src={sliProLogo}
                  alt="SLI.pro Logo"
                  className="h-10 w-auto"
                />
              </div>
            </div>
            <div className="flex items-center">
              <Button
                variant="link"
                className="text-[#6c8083] hover:text-[#6c8083] font-medium px-4 py-2"
                onClick={() => setActiveTab("login")}
              >
                Log In
              </Button>
              <Button
                variant="outline"
                className="ml-3 text-[#6c8083] border-[#bed6d1] hover:bg-[#bed6d1] hover:bg-opacity-10 font-medium"
                onClick={() => setActiveTab("signup")}
              >
                Sign Up
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch min-h-[600px]">
          {/* Left Column - Authentication Forms */}
          <div className="slide-in h-full flex flex-col">
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="w-full h-full flex flex-col"
            >
              <TabsList className="mb-8 w-full border-b border-gray-200 bg-transparent p-0 flex">
                <TabsTrigger
                  value="login"
                  className="relative py-4 px-6 data-[state=active]:bg-transparent data-[state=active]:text-[#6c8083] font-medium text-gray-600 hover:text-[#6c8083] rounded-none border-b-2 border-transparent data-[state=active]:border-[#6c8083] transition-all"
                >
                  Log In
                </TabsTrigger>
                <TabsTrigger
                  value="signup"
                  className="relative py-4 px-6 data-[state=active]:bg-transparent data-[state=active]:text-[#6c8083] font-medium text-gray-600 hover:text-[#6c8083] rounded-none border-b-2 border-transparent data-[state=active]:border-[#6c8083] transition-all"
                >
                  Sign Up
                </TabsTrigger>
              </TabsList>

              {/* Login Form */}
              <TabsContent
                value="login"
                className="mt-0 flex-grow flex flex-col"
              >
                <Card className="border-none shadow-card h-full flex flex-col">
                  <CardContent className="p-6 md:p-8 h-full">
                    <div className="flex flex-col h-full">
                      <h2 className="text-2xl font-medium text-[#333333] mb-6">
                        Log in to your SLI.pro account
                      </h2>
                      {loginMutation.error && (
                        <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-md">
                          <p className="text-[#E34240] text-sm">
                            {loginMutation.error.message === "401: "
                              ? "We do not recognise this email or password"
                              : "We do not recognise this email or password"}
                          </p>
                        </div>
                      )}
                      <Form {...loginForm}>
                        <form
                          onSubmit={loginForm.handleSubmit(onLoginSubmit)}
                          className="space-y-6 flex-grow flex flex-col"
                        >
                          <FormField
                            control={loginForm.control}
                            name="username"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-gray-700 text-sm font-medium mb-1 block">
                                  Email Address
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#bed6d1]"
                                    type="email"
                                  />
                                </FormControl>
                                <FormMessage className="text-[#E34240]" />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={loginForm.control}
                            name="password"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-gray-700 text-sm font-medium mb-1 block">
                                  Password
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#bed6d1]"
                                    type="password"
                                  />
                                </FormControl>
                                <FormMessage className="text-[#E34240]" />
                              </FormItem>
                            )}
                          />

                          <div className="flex items-center justify-between">
                            <FormField
                              control={loginForm.control}
                              name="rememberMe"
                              render={({ field }) => (
                                <FormItem>
                                  <div className="flex items-center gap-2 h-5">
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                        className="h-4 w-4 text-[#bed6d1] focus:ring-[#bed6d1]"
                                      />
                                    </FormControl>
                                    <FormLabel className="text-sm text-[#333333] cursor-pointer m-0 leading-4">
                                      Remember Me
                                    </FormLabel>
                                  </div>
                                </FormItem>
                              )}
                            />
                            <div>
                              <button
                                type="button"
                                onClick={() => setShowForgotPassword(true)}
                                className="text-sm font-medium text-[#6c8083] hover:text-opacity-90"
                              >
                                Forgot Password?
                              </button>
                            </div>
                          </div>

                          <Button
                            type="submit"
                            className="w-full py-3 px-4 bg-[#bed6d1] hover:bg-opacity-90 focus:ring-2 focus:ring-offset-2 focus:ring-[#bed6d1]"
                            disabled={loginMutation.isPending}
                          >
                            {loginMutation.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <LogIn className="mr-2 h-4 w-4" />
                            )}
                            Log In
                          </Button>
                        </form>
                      </Form>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Signup Form */}
              <TabsContent
                value="signup"
                className="mt-0 flex-grow flex flex-col"
              >
                <Card className="border-none shadow-card h-full flex flex-col">
                  <CardContent className="p-6 md:p-8 h-full">
                    <div className="flex flex-col h-full">
                      <h2 className="text-2xl font-medium text-[#333333] mb-6">
                        Create your SLI.pro account
                      </h2>
                      {registerMutation.error &&
                        !registerMutation.error.message.includes(
                          "Username already exists",
                        ) && (
                          <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-md">
                            <p className="text-[#E34240] text-sm">
                              {"Welcome back! It looks like you already have an account with us. Sign in to continue your journey—we can't wait to see you again!"}
                            </p>
                          </div>
                        )}
                      <Form {...registerForm}>
                        <form
                          onSubmit={registerForm.handleSubmit(onRegisterSubmit)}
                          className="space-y-6 flex-grow flex flex-col"
                        >
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField
                              control={registerForm.control}
                              name="firstName"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-gray-700 text-sm font-medium mb-1 block">
                                    First Name
                                  </FormLabel>
                                  <FormControl>
                                    <Input
                                      {...field}
                                      className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#bed6d1]"
                                    />
                                  </FormControl>
                                  <FormMessage className="text-[#E34240]" />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={registerForm.control}
                              name="lastName"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-gray-700 text-sm font-medium mb-1 block">
                                    Last Name
                                  </FormLabel>
                                  <FormControl>
                                    <Input
                                      {...field}
                                      className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#bed6d1]"
                                    />
                                  </FormControl>
                                  <FormMessage className="text-[#E34240]" />
                                </FormItem>
                              )}
                            />
                          </div>

                          <FormField
                            control={registerForm.control}
                            name="username"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-gray-700 text-sm font-medium mb-1 block">
                                  Email Address
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#bed6d1]"
                                    type="email"
                                  />
                                </FormControl>
                                <FormMessage className="text-[#E34240]" />
                                {registerMutation.error &&
                                  registerMutation.error.message.includes(
                                    "Username already exists",
                                  ) && (
                                    <div className="text-[#E34240] text-sm mt-1">
                                      This email address is already registered.
                                      Please try logging in or use a different
                                      email.
                                    </div>
                                  )}
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={registerForm.control}
                            name="phoneNumber"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-gray-700 text-sm font-medium mb-1 block">
                                  Phone Number
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#bed6d1]"
                                    type="tel"
                                    placeholder="(123) 456-7890"
                                  />
                                </FormControl>
                                <FormMessage className="text-[#E34240]" />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={registerForm.control}
                            name="password"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-gray-700 text-sm font-medium mb-1 block">
                                  Password
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#bed6d1]"
                                    type="password"
                                  />
                                </FormControl>
                                <div className="mt-1 text-sm text-gray-500">
                                  Must be at least 8 characters with a number
                                  and a special character
                                </div>
                                <FormMessage className="text-[#E34240]" />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={registerForm.control}
                            name="confirmPassword"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-gray-700 text-sm font-medium mb-1 block">
                                  Confirm Password
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#bed6d1]"
                                    type="password"
                                  />
                                </FormControl>
                                <FormMessage className="text-[#E34240]" />
                              </FormItem>
                            )}
                          />



                          <Button
                            type="submit"
                            className="w-full py-3 px-4 bg-[#bed6d1] hover:bg-opacity-90 focus:ring-2 focus:ring-offset-2 focus:ring-[#bed6d1]"
                            disabled={registerMutation.isPending}
                          >
                            {registerMutation.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <UserPlus className="mr-2 h-4 w-4" />
                            )}
                            Create Account
                          </Button>
                        </form>
                      </Form>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Column - Hero Section */}
          <div className="p-8 bg-[#6c8083] rounded-lg text-white hidden md:flex md:flex-col h-full">
            <div>
              <h1 className="text-3xl font-bold mb-4">
                Shape How the Professional World Knows You
              </h1>
              <p className="mb-6">
                In a world where digital profiles and AI shape first
                impressions, your presence isn't just a profile – it's your
                professional identity. The question is: are you actively shaping
                what you’re known for?
              </p>

              <p className="mb-6">
                LinkedIn's own research confirms that optimized professional
                presence delivers:
              </p>

              <ul className="space-y-4">
                <li className="flex items-center">
                  <svg
                    className="h-5 w-5 mr-2 flex-shrink-0"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>
                    Expanded Opportunities: 2.7x higher likelihood of recruiter
                    discovery
                  </span>
                </li>
                <li className="flex items-center">
                  <svg
                    className="h-5 w-5 mr-2 flex-shrink-0"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>
                    Increased Visibility: 300% more profile visibility
                  </span>
                </li>
                <li className="flex items-center">
                  <svg
                    className="h-5 w-5 mr-2 flex-shrink-0"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>
                    More Possibilities: 3x more industry-relevant opportunities
                  </span>
                </li>
                <li className="flex items-center">
                  <svg
                    className="h-5 w-5 mr-2 flex-shrink-0"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>Network Growth: 40% more meaningful connections</span>
                </li>
                <li className="flex items-center">
                  <svg
                    className="h-5 w-5 mr-2 flex-shrink-0"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>
                    Thought Leadership: 4x increase in content recognition
                  </span>
                </li>
                <li className="flex items-center">
                  <svg
                    className="h-5 w-5 mr-2 flex-shrink-0"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>
                    Established Value: Enhanced professional credibility
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>
      {/* Forgot Password Dialog */}
      <Dialog open={showForgotPassword} onOpenChange={setShowForgotPassword}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle className="text-left sr-only">Forgot Password</DialogTitle>
          <DialogDescription className="sr-only">
            Reset your password by providing your email address
          </DialogDescription>
          <ForgotPasswordForm onBack={() => setShowForgotPassword(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
