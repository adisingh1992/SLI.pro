import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useLocation } from "wouter";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useState } from "react";
import { Loader2, UserPlus, LogIn } from "lucide-react";

// Login schema
const loginSchema = z.object({
  username: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional(),
});

// Registration schema with extended validation
const registerSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  username: z.string().email("Please enter a valid email"),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .refine(pwd => /\d/.test(pwd), "Password must contain at least one number")
    .refine(pwd => /[!@#$%^&*(),.?":{}|<>]/.test(pwd), "Password must contain at least one special character"),
  confirmPassword: z.string(),
  termsAgreement: z.boolean().refine(val => val === true, {
    message: "You must accept the terms",
  }),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;

export default function AuthPage() {
  const [activeTab, setActiveTab] = useState("login");
  const { user, loginMutation, registerMutation } = useAuth();
  const [_, navigate] = useLocation();

  // Redirect if already logged in
  if (user) {
    navigate("/");
    return null;
  }

  // Login form setup
  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
      rememberMe: false,
    },
  });

  // Register form setup
  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      username: "",
      password: "",
      confirmPassword: "",
      termsAgreement: false,
    },
  });

  // Handle login submission
  const onLoginSubmit = (data: LoginFormValues) => {
    loginMutation.mutate({
      username: data.username,
      password: data.password,
    });
  };

  // Handle registration submission
  const onRegisterSubmit = (data: RegisterFormValues) => {
    registerMutation.mutate({
      firstName: data.firstName,
      lastName: data.lastName,
      username: data.username,
      password: data.password,
      confirmPassword: data.confirmPassword,
    });
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      {/* Navbar */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <svg className="h-8 w-auto text-[#0077B5]" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z" fill="currentColor"/>
                </svg>
                <span className="ml-2 text-xl font-semibold text-[#0077B5]">SLIPro</span>
              </div>
            </div>
            <div className="flex items-center">
              <Button 
                variant="ghost" 
                className="text-[#0077B5]"
                onClick={() => setActiveTab("login")}
              >
                Log In
              </Button>
              <Button 
                variant="default" 
                className="ml-4 bg-[#0077B5] hover:bg-opacity-90"
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
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col">
              <TabsList className="mb-8 w-full border-b border-gray-200 flex space-x-8">
                <TabsTrigger value="login" className="py-4 px-1 data-[state=active]:border-b-2 data-[state=active]:border-[#0077B5] data-[state=active]:text-[#0077B5] font-medium text-gray-500 hover:text-gray-700">
                  Log In
                </TabsTrigger>
                <TabsTrigger value="signup" className="py-4 px-1 data-[state=active]:border-b-2 data-[state=active]:border-[#0077B5] data-[state=active]:text-[#0077B5] font-medium text-gray-500 hover:text-gray-700">
                  Sign Up
                </TabsTrigger>
              </TabsList>

              {/* Login Form */}
              <TabsContent value="login" className="mt-0 flex-grow flex flex-col">
                <Card className="border-none shadow-card h-full flex flex-col">
                  <CardContent className="p-6 md:p-8 h-full">
                    <div className="flex flex-col h-full">
                      <h2 className="text-2xl font-medium text-[#333333] mb-6">Log in to your SLIPro account</h2>
                      <Form {...loginForm}>
                        <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-6 flex-grow flex flex-col">
                          <FormField
                            control={loginForm.control}
                            name="username"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-gray-700 text-sm font-medium mb-1 block">
                                  Email address
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0077B5]"
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
                                    className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0077B5]"
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
                                <FormItem className="flex items-center space-x-2">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                      className="h-4 w-4 text-[#0077B5] focus:ring-[#0077B5]"
                                    />
                                  </FormControl>
                                  <FormLabel className="text-sm text-[#333333] cursor-pointer">
                                    Remember me
                                  </FormLabel>
                                </FormItem>
                              )}
                            />
                            <div>
                              <a href="#" className="text-sm font-medium text-[#0077B5] hover:text-opacity-90">
                                Forgot password?
                              </a>
                            </div>
                          </div>

                          <Button
                            type="submit"
                            className="w-full py-3 px-4 bg-[#0077B5] hover:bg-opacity-90 focus:ring-2 focus:ring-offset-2 focus:ring-[#0077B5]"
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
              <TabsContent value="signup" className="mt-0 flex-grow flex flex-col">
                <Card className="border-none shadow-card h-full flex flex-col">
                  <CardContent className="p-6 md:p-8 h-full">
                    <div className="flex flex-col h-full">
                      <h2 className="text-2xl font-medium text-[#333333] mb-6">Create your SLIPro account</h2>
                      <Form {...registerForm}>
                        <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-6 flex-grow flex flex-col">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField
                              control={registerForm.control}
                              name="firstName"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-gray-700 text-sm font-medium mb-1 block">
                                    First name
                                  </FormLabel>
                                  <FormControl>
                                    <Input
                                      {...field}
                                      className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0077B5]"
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
                                    Last name
                                  </FormLabel>
                                  <FormControl>
                                    <Input
                                      {...field}
                                      className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0077B5]"
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
                                  Email address
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0077B5]"
                                    type="email"
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
                                    className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0077B5]"
                                    type="password"
                                  />
                                </FormControl>
                                <div className="mt-1 text-sm text-gray-500">
                                  Must be at least 8 characters with a number and a special character
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
                                  Confirm password
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0077B5]"
                                    type="password"
                                  />
                                </FormControl>
                                <FormMessage className="text-[#E34240]" />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={registerForm.control}
                            name="termsAgreement"
                            render={({ field }) => (
                              <FormItem className="flex items-start space-x-3">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    className="h-4 w-4 mt-1 text-[#0077B5] focus:ring-[#0077B5]"
                                  />
                                </FormControl>
                                <div className="space-y-1">
                                  <FormLabel className="text-sm text-[#333333] cursor-pointer">
                                    I agree to the <a href="#" className="text-[#0077B5] hover:text-opacity-90">Terms of Service</a> and <a href="#" className="text-[#0077B5] hover:text-opacity-90">Privacy Policy</a>
                                  </FormLabel>
                                  <FormMessage className="text-[#E34240]" />
                                </div>
                              </FormItem>
                            )}
                          />

                          <Button
                            type="submit"
                            className="w-full py-3 px-4 bg-[#0077B5] hover:bg-opacity-90 focus:ring-2 focus:ring-offset-2 focus:ring-[#0077B5]"
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
          <div className="p-8 bg-[#0077B5] rounded-lg text-white hidden md:flex md:flex-col h-full">
            <div>
              <h1 className="text-3xl font-bold mb-4">Manage Your Professional Profile with SLIPro</h1>
              <p className="mb-6">Create a compelling professional profile that showcases your skills, experience, and achievements. Stand out to recruiters and expand your professional network.</p>
              <ul className="space-y-4">
                <li className="flex items-center">
                  <svg className="h-5 w-5 mr-2 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Build a professional online presence</span>
                </li>
                <li className="flex items-center">
                  <svg className="h-5 w-5 mr-2 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Showcase your skills and experience</span>
                </li>
                <li className="flex items-center">
                  <svg className="h-5 w-5 mr-2 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Manage your professional information</span>
                </li>
                <li className="flex items-center">
                  <svg className="h-5 w-5 mr-2 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Keep your profile up-to-date easily</span>
                </li>
              </ul>
            </div>
            <div className="mt-auto pt-8 text-sm opacity-80">
              <p>Join thousands of professionals who trust SLIPro to manage their professional identity online.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}