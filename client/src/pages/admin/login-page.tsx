import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EyeIcon, EyeOffIcon, LoaderCircle, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  username: z.string().email({ message: "Please enter a valid email address" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
});

type FormValues = z.infer<typeof formSchema>;

export default function AdminLoginPage() {
  const { user, isLoading: authLoading, loginMutation } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [_, navigate] = useLocation();
  const { toast } = useToast();

  // Create form
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  // Redirect if already logged in as admin
  useEffect(() => {
    if (!authLoading && user?.isAdmin) {
      navigate("/admin/dashboard");
    }
  }, [user, authLoading, navigate]);

  // Form submission handler
  const onSubmit = async (values: FormValues) => {
    try {
      const user = await loginMutation.mutateAsync(values);
      
      if (user?.isAdmin) {
        toast({
          title: "Login successful",
          description: "Welcome back to the admin panel",
        });
        navigate("/admin/dashboard");
      } else {
        // User logged in but not an admin
        form.setError("username", {
          type: "manual",
          message: "You don't have administrative privileges",
        });
      }
    } catch (error) {
      // Handle login error
      toast({
        title: "Login failed",
        description: "Please check your credentials and try again",
        variant: "destructive",
      });
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user?.isAdmin) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="flex min-h-screen bg-background">
      <div className="flex flex-col w-full py-12 px-4 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-sm lg:w-96">
          <div className="flex justify-center mb-6">
            <Shield size={48} className="text-primary" />
          </div>
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl text-center">Admin Login</CardTitle>
              <CardDescription className="text-center">
                Enter your credentials to access the admin panel
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input placeholder="admin@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showPassword ? "text" : "password"}
                              placeholder="••••••••"
                              {...field}
                            />
                            <button
                              type="button"
                              className="absolute inset-y-0 right-0 pr-3 flex items-center"
                              onClick={() => setShowPassword(!showPassword)}
                            >
                              {showPassword ? (
                                <EyeOffIcon className="h-4 w-4 text-gray-400" />
                              ) : (
                                <EyeIcon className="h-4 w-4 text-gray-400" />
                              )}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={loginMutation.isPending}
                  >
                    {loginMutation.isPending ? (
                      <>
                        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                        Logging in...
                      </>
                    ) : (
                      "Login"
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>
      <div className="hidden lg:block relative w-0 flex-1">
        <div className="absolute inset-0 bg-gradient-to-br from-primary to-primary-foreground flex items-center justify-center">
          <div className="max-w-xl p-8 text-white">
            <h2 className="text-3xl font-bold mb-4">SLI Pro Admin Dashboard</h2>
            <p className="text-lg mb-6">
              Manage users, view statistics, and maintain the system from this secure admin interface.
            </p>
            <ul className="space-y-2">
              <li className="flex items-center">
                <span className="bg-white bg-opacity-20 rounded-full p-1 mr-2">
                  ✓
                </span>
                Complete user management
              </li>
              <li className="flex items-center">
                <span className="bg-white bg-opacity-20 rounded-full p-1 mr-2">
                  ✓
                </span>
                Track system performance
              </li>
              <li className="flex items-center">
                <span className="bg-white bg-opacity-20 rounded-full p-1 mr-2">
                  ✓
                </span>
                Monitor user engagement
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}