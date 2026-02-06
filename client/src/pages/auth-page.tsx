import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
  FormMessage,
} from "@/components/ui/form";
import { useState, useEffect, useRef } from "react";
import { Loader2, CheckCircle } from "lucide-react";
import { SiLinkedin } from "react-icons/si";
import sliProLogo from "@/assets/sliPro-logos_aqua.png";
import "@/assets/css/auth-page.css";

const loginSchema = z.object({
  username: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Required"),
  rememberMe: z.boolean().optional(),
  isSubmitting: z.boolean().optional(),
});

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
        (pwd) => /[a-z]/.test(pwd),
        "Password must contain at least one lowercase letter",
      )
      .refine(
        (pwd) => /[A-Z]/.test(pwd),
        "Password must contain at least one uppercase letter",
      ),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema> & {
  isSubmitting?: boolean;
};

export default function AuthPage() {
  const [activeView, setActiveView] = useState<"login" | "signup" | "success">("login");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const { user, loginMutation, registerMutation } = useAuth();
  const [_, navigate] = useLocation();
  const justRegisteredRef = useRef(false);

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
      rememberMe: false,
      isSubmitting: false,
    },
  });

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

  useEffect(() => {
    if (user && activeView !== "success" && !justRegisteredRef.current) {
      navigate("/");
    }
  }, [user, navigate, activeView]);

  if (user && activeView !== "success" && !justRegisteredRef.current) {
    return null;
  }

  const onLoginSubmit = async (data: LoginFormValues) => {
    try {
      console.log("Logging in user...");
      await loginMutation.mutateAsync({
        username: data.username,
        password: data.password,
      });

      console.log("Login successful, redirecting to homepage");
      setTimeout(() => {
        navigate("/");
      }, 300);
    } catch (error) {
      console.error("Login error:", error);
    }
  };

  const onRegisterSubmit = async (data: RegisterFormValues) => {
    try {
      console.log("Registering user...");
      justRegisteredRef.current = true;

      await registerMutation.mutateAsync({
        firstName: data.firstName,
        lastName: data.lastName,
        username: data.username,
        phoneNumber: data.phoneNumber,
        password: data.password,
        confirmPassword: data.confirmPassword,
      });

      console.log("Registration successful, showing success view");
      setActiveView("success");
      justRegisteredRef.current = false;
    } catch (error) {
      console.error("Registration error:", error);
      justRegisteredRef.current = false;
    }
  };

  return (
    <div className="auth-container flex min-h-screen overflow-hidden antialiased">
      <aside className="manifesto-side hidden lg:flex flex-1 flex-col justify-center px-[100px] py-[60px] relative bg-[#202436] text-[#f8f9fa]">
        <div className="hero-text font-serif text-[52px] leading-tight max-w-[500px] font-normal">
          <span className="text-[#bed6d1]">Control</span> what you are known
          for.
        </div>
      </aside>

      <main className="access-pillar w-full lg:w-[540px] bg-[#f8f9fa] min-h-[106vh] flex flex-col justify-center px-5 sm:px-10 lg:px-20 relative shadow-[-20px_0_60px_rgba(0,0,0,0.2)]">
        <div className="absolute top-5 right-5 lg:top-10 lg:right-10 text-xs font-medium text-gray-500">
          {activeView === "signup" ? (
            <span>
              Already a member?{" "}
              <a
                onClick={() => setActiveView("login")}
                className="text-[#6c8083] no-underline font-semibold cursor-pointer transition-opacity duration-200 hover:opacity-70"
              >
                Log In
              </a>
            </span>
          ) : (
            <span>
              New here?{" "}
              <a
                onClick={() => setActiveView("signup")}
                className="text-[#6c8083] no-underline font-semibold cursor-pointer transition-opacity duration-200 hover:opacity-70"
              >
                Request Membership
              </a>
            </span>
          )}
        </div>

        <div className="w-full min-h-[500px] flex flex-col justify-center">
          {activeView === "login" && (
            <div className="flex flex-col w-full">
              <div className="mb-9">
                <div className="mb-12">
                  <img
                    src={sliProLogo}
                    alt="SLI.pro Logo"
                    className="h-10 w-auto"
                  />
                </div>
              </div>

              {loginMutation.error && (
                <div className="mb-5 p-3 bg-red-500/10 border border-red-500/20 rounded">
                  <p className="text-[#E34240] text-xs m-0">
                    We do not recognise this email or password
                  </p>
                </div>
              )}

              <Form {...loginForm}>
                <form onSubmit={loginForm.handleSubmit(onLoginSubmit)}>
                  <FormField
                    control={loginForm.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem className="mb-5">
                        <label className="text-[10px] uppercase tracking-[2px] font-semibold block mb-2 text-[#303454]">
                          Email Address
                        </label>
                        <FormControl>
                          <input
                            {...field}
                            type="email"
                            placeholder="name@university.edu"
                            className="w-full border-0 border-b border-gray-300 py-3 text-[15px] bg-transparent transition-colors duration-300 text-[#303454] outline-none rounded-none placeholder:text-gray-400 focus:border-[#bed6d1]"
                          />
                        </FormControl>
                        <FormMessage className="text-[#E34240] text-[11px] mt-1" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={loginForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem className="mb-5">
                        <label className="text-[10px] uppercase tracking-[2px] font-semibold block mb-2 text-[#303454]">
                          Password
                        </label>
                        <FormControl>
                          <input
                            {...field}
                            type="password"
                            placeholder="••••••••"
                            className="w-full border-0 border-b border-gray-300 py-3 text-[15px] bg-transparent transition-colors duration-300 text-[#303454] outline-none rounded-none placeholder:text-gray-400 focus:border-[#bed6d1]"
                          />
                        </FormControl>
                        <FormMessage className="text-[#E34240] text-[11px] mt-1" />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-between items-center text-[11px] mb-4 mt-2">
                    <FormField
                      control={loginForm.control}
                      name="rememberMe"
                      render={({ field }) => (
                        <div className="flex items-center gap-2 text-gray-500">
                          <input
                            type="checkbox"
                            checked={field.value}
                            onChange={field.onChange}
                            className="m-0 accent-[#bed6d1]"
                          />
                          <span>Remember me</span>
                        </div>
                      )}
                    />
                    <button
                      type="button"
                      className="text-gray-500 no-underline transition-colors duration-200 text-[11px] bg-transparent border-0 cursor-pointer p-0 hover:text-[#bed6d1]"
                      onClick={() => setShowForgotPassword(true)}
                    >
                      Forgot Password?
                    </button>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-5 px-6 bg-[#303454] text-white border-0 font-semibold tracking-[4px] cursor-pointer mt-4 uppercase transition-all duration-300 text-[11px] hover:bg-[#bed6d1] hover:translate-x-2 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:bg-[#303454]"
                    disabled={loginMutation.isPending}
                    data-testid="button-login"
                  >
                    {loginMutation.isPending && (
                      <Loader2 className="inline mr-2 h-4 w-4 animate-spin" />
                    )}
                    Log In
                  </button>

                  <button
                    type="button"
                    className="w-full bg-white border border-[#e6e8eb] py-4 mt-4 flex items-center justify-center gap-3 text-[11px] font-semibold uppercase tracking-wider cursor-pointer transition-all duration-300 text-[#303454] hover:border-[#bed6d1] hover:bg-[#fafafa]"
                    onClick={() =>
                      (window.location.href = "/api/auth/linkedin")
                    }
                    data-testid="button-linkedin-login"
                  >
                    <SiLinkedin className="h-4 w-4" />
                    Continue with LinkedIn
                  </button>
                </form>
              </Form>
            </div>
          )}

          {activeView === "signup" && (
            <div className="flex flex-col w-full">
              <div className="mb-9">
                <div className="mb-12">
                  <img
                    src={sliProLogo}
                    alt="SLI.pro Logo"
                    className="h-10 w-auto"
                  />
                </div>
                <h2 className="font-serif text-2xl m-0 text-[#303454]">
                  Membership Request
                </h2>
              </div>

              {registerMutation.error &&
                !registerMutation.error.message.includes(
                  "Username already exists",
                ) && (
                  <div className="mb-5 p-3 bg-red-500/10 border border-red-500/20 rounded">
                    <p className="text-[#E34240] text-xs m-0">
                      Welcome back! It looks like you already have an account
                      with us. Sign in to continue your journey.
                    </p>
                  </div>
                )}

              <Form {...registerForm}>
                <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-5">
                    <FormField
                      control={registerForm.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem className="mb-5">
                          <label className="text-[10px] uppercase tracking-[2px] font-semibold block mb-2 text-[#303454]">
                            First Name
                          </label>
                          <FormControl>
                            <input
                              {...field}
                              type="text"
                              placeholder="John"
                              className="w-full border-0 border-b border-gray-300 py-3 text-[15px] bg-transparent transition-colors duration-300 text-[#303454] outline-none rounded-none placeholder:text-gray-400 focus:border-[#bed6d1]"
                            />
                          </FormControl>
                          <FormMessage className="text-[#E34240] text-[11px] mt-1" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={registerForm.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem className="mb-5">
                          <label className="text-[10px] uppercase tracking-[2px] font-semibold block mb-2 text-[#303454]">
                            Last Name
                          </label>
                          <FormControl>
                            <input
                              {...field}
                              type="text"
                              placeholder="Doe"
                              className="w-full border-0 border-b border-gray-300 py-3 text-[15px] bg-transparent transition-colors duration-300 text-[#303454] outline-none rounded-none placeholder:text-gray-400 focus:border-[#bed6d1]"
                            />
                          </FormControl>
                          <FormMessage className="text-[#E34240] text-[11px] mt-1" />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={registerForm.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem className="mb-5">
                        <label className="text-[10px] uppercase tracking-[2px] font-semibold block mb-2 text-[#303454]">
                          Email Address
                        </label>
                        <FormControl>
                          <input
                            {...field}
                            type="email"
                            placeholder="name@university.edu"
                            className="w-full border-0 border-b border-gray-300 py-3 text-[15px] bg-transparent transition-colors duration-300 text-[#303454] outline-none rounded-none placeholder:text-gray-400 focus:border-[#bed6d1]"
                          />
                        </FormControl>
                        <FormMessage className="text-[#E34240] text-[11px] mt-1" />
                        {registerMutation.error &&
                          registerMutation.error.message.includes(
                            "Username already exists",
                          ) && (
                            <div className="text-[#E34240] text-[11px] mt-1">
                              This email address is already registered. Please
                              try logging in or use a different email.
                            </div>
                          )}
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={registerForm.control}
                    name="phoneNumber"
                    render={({ field }) => (
                      <FormItem className="mb-5">
                        <label className="text-[10px] uppercase tracking-[2px] font-semibold block mb-2 text-[#303454]">
                          Phone Number
                        </label>
                        <FormControl>
                          <input
                            {...field}
                            type="tel"
                            placeholder="(123) 456-7890"
                            className="w-full border-0 border-b border-gray-300 py-3 text-[15px] bg-transparent transition-colors duration-300 text-[#303454] outline-none rounded-none placeholder:text-gray-400 focus:border-[#bed6d1]"
                          />
                        </FormControl>
                        <FormMessage className="text-[#E34240] text-[11px] mt-1" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={registerForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem className="mb-5">
                        <label className="text-[10px] uppercase tracking-[2px] font-semibold block mb-2 text-[#303454]">
                          Password
                        </label>
                        <FormControl>
                          <input
                            {...field}
                            type="password"
                            placeholder="Create password"
                            className="w-full border-0 border-b border-gray-300 py-3 text-[15px] bg-transparent transition-colors duration-300 text-[#303454] outline-none rounded-none placeholder:text-gray-400 focus:border-[#bed6d1]"
                          />
                        </FormControl>
                        <div className="text-[9px] text-gray-400 mt-2 uppercase tracking-wider">
                          Min. 8 characters with mixed casing
                        </div>
                        <FormMessage className="text-[#E34240] text-[11px] mt-1" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={registerForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem className="mb-5">
                        <label className="text-[10px] uppercase tracking-[2px] font-semibold block mb-2 text-[#303454]">
                          Confirm Password
                        </label>
                        <FormControl>
                          <input
                            {...field}
                            type="password"
                            placeholder="Repeat password"
                            className="w-full border-0 border-b border-gray-300 py-3 text-[15px] bg-transparent transition-colors duration-300 text-[#303454] outline-none rounded-none placeholder:text-gray-400 focus:border-[#bed6d1]"
                          />
                        </FormControl>
                        <FormMessage className="text-[#E34240] text-[11px] mt-1" />
                      </FormItem>
                    )}
                  />

                  <button
                    type="submit"
                    className="w-full py-5 px-6 bg-[#303454] text-white border-0 font-semibold tracking-[4px] cursor-pointer mt-4 uppercase transition-all duration-300 text-[11px] hover:bg-[#bed6d1] hover:translate-x-2 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:bg-[#303454]"
                    disabled={registerMutation.isPending}
                  >
                    {registerMutation.isPending && (
                      <Loader2 className="inline mr-2 h-4 w-4 animate-spin" />
                    )}
                    Submit for Verification
                  </button>
                </form>
              </Form>
            </div>
          )}

          {activeView === "success" && (
            <div className="flex flex-col w-full">
              <div className="text-[#bed6d1] text-center mb-6">
                <CheckCircle className="h-14 w-14 mx-auto" strokeWidth={1.5} />
              </div>
              <div className="mb-5 text-center">
                <h2 className="font-serif text-2xl text-[#303454]">Request Submitted</h2>
                <p className="text-gray-500 text-[13px] leading-relaxed mt-3">
                  Your credentials are being validated. Please check back again later.
                </p>
              </div>
              <div className="font-bold text-xs tracking-wider uppercase mt-5 text-[#303454] text-center">
                Estimated Activation: 24–48 Hours
              </div>
              <button
                type="button"
                className="w-full py-5 px-6 bg-[#303454] text-white border-0 font-semibold tracking-[4px] cursor-pointer mt-10 uppercase transition-all duration-300 text-[11px] hover:bg-[#bed6d1] hover:translate-x-2"
                onClick={() => {
                  justRegisteredRef.current = false;
                  setActiveView("login");
                }}
              >
                Return
              </button>
            </div>
          )}
        </div>
      </main>

      <Dialog open={showForgotPassword} onOpenChange={setShowForgotPassword}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle className="text-left sr-only">
            Forgot Password
          </DialogTitle>
          <DialogDescription className="sr-only">
            Reset your password by providing your email address
          </DialogDescription>
          <ForgotPasswordForm onBack={() => setShowForgotPassword(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
