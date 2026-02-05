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
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { SiLinkedin } from "react-icons/si";
import sliProLogo from "@/assets/sliPro-logos_aqua.png";
import "./auth-page.css";

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
  const [activeView, setActiveView] = useState<"login" | "signup">("login");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const { user, loginMutation, registerMutation } = useAuth();
  const [_, navigate] = useLocation();

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
    if (user) {
      navigate("/");
    }
  }, [user, navigate]);

  if (user) {
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

      await registerMutation.mutateAsync({
        firstName: data.firstName,
        lastName: data.lastName,
        username: data.username,
        phoneNumber: data.phoneNumber,
        password: data.password,
        confirmPassword: data.confirmPassword,
      });

      console.log("Registration successful, redirecting to homepage");
      setTimeout(() => {
        navigate("/");
      }, 300);
    } catch (error) {
      console.error("Registration error:", error);
    }
  };

  return (
    <div className="auth-container">
      <aside className="manifesto-side">
        <div className="hero-text">
          <span>Control</span> what you are known for.
        </div>
      </aside>

      <main className="access-pillar">
        <div className="top-nav">
          {activeView === "login" ? (
            <span>
              New here?{" "}
              <a onClick={() => setActiveView("signup")}>Request Membership</a>
            </span>
          ) : (
            <span>
              Already a member?{" "}
              <a onClick={() => setActiveView("login")}>Log In</a>
            </span>
          )}
        </div>

        <div className="pillar-content">
          {activeView === "login" && (
            <div className="view-wrapper">
              <div className="pillar-header">
                <div className="logo-box">
                  <img src={sliProLogo} alt="SLI.pro Logo" />
                </div>
              </div>

              {loginMutation.error && (
                <div className="error-banner">
                  <p>We do not recognise this email or password</p>
                </div>
              )}

              <Form {...loginForm}>
                <form onSubmit={loginForm.handleSubmit(onLoginSubmit)}>
                  <FormField
                    control={loginForm.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem className="auth-form-group">
                        <label>Email Address</label>
                        <FormControl>
                          <input
                            {...field}
                            type="email"
                            placeholder="name@university.edu"
                            className="auth-input"
                          />
                        </FormControl>
                        <FormMessage className="error-message" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={loginForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem className="auth-form-group">
                        <label>Password</label>
                        <FormControl>
                          <input
                            {...field}
                            type="password"
                            placeholder="••••••••"
                            className="auth-input"
                          />
                        </FormControl>
                        <FormMessage className="error-message" />
                      </FormItem>
                    )}
                  />

                  <div className="remember-row">
                    <FormField
                      control={loginForm.control}
                      name="rememberMe"
                      render={({ field }) => (
                        <div className="remember-check">
                          <input
                            type="checkbox"
                            checked={field.value}
                            onChange={field.onChange}
                          />
                          <span>Remember me</span>
                        </div>
                      )}
                    />
                    <button
                      type="button"
                      className="forgot-link"
                      onClick={() => setShowForgotPassword(true)}
                    >
                      Forgot Password?
                    </button>
                  </div>

                  <button
                    type="submit"
                    className="btn-enter"
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
                    className="btn-linkedin"
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
            <div className="view-wrapper">
              <div className="pillar-header">
                <div className="logo-box">
                  <img src={sliProLogo} alt="SLI.pro Logo" />
                </div>
                <h2>Membership Request</h2>
              </div>

              {registerMutation.error &&
                !registerMutation.error.message.includes(
                  "Username already exists",
                ) && (
                  <div className="error-banner">
                    <p>
                      Welcome back! It looks like you already have an account
                      with us. Sign in to continue your journey.
                    </p>
                  </div>
                )}

              <Form {...registerForm}>
                <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)}>
                  <div className="field-grid">
                    <FormField
                      control={registerForm.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem className="auth-form-group">
                          <label>First Name</label>
                          <FormControl>
                            <input
                              {...field}
                              type="text"
                              placeholder="John"
                              className="auth-input"
                            />
                          </FormControl>
                          <FormMessage className="error-message" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={registerForm.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem className="auth-form-group">
                          <label>Last Name</label>
                          <FormControl>
                            <input
                              {...field}
                              type="text"
                              placeholder="Doe"
                              className="auth-input"
                            />
                          </FormControl>
                          <FormMessage className="error-message" />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={registerForm.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem className="auth-form-group">
                        <label>Email Address</label>
                        <FormControl>
                          <input
                            {...field}
                            type="email"
                            placeholder="name@university.edu"
                            className="auth-input"
                          />
                        </FormControl>
                        <FormMessage className="error-message" />
                        {registerMutation.error &&
                          registerMutation.error.message.includes(
                            "Username already exists",
                          ) && (
                            <div className="error-message">
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
                      <FormItem className="auth-form-group">
                        <label>Phone Number</label>
                        <FormControl>
                          <input
                            {...field}
                            type="tel"
                            placeholder="(123) 456-7890"
                            className="auth-input"
                          />
                        </FormControl>
                        <FormMessage className="error-message" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={registerForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem className="auth-form-group">
                        <label>Password</label>
                        <FormControl>
                          <input
                            {...field}
                            type="password"
                            placeholder="Create password"
                            className="auth-input"
                          />
                        </FormControl>
                        <div className="helper-text">
                          Min. 8 characters with mixed casing
                        </div>
                        <FormMessage className="error-message" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={registerForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem className="auth-form-group">
                        <label>Confirm Password</label>
                        <FormControl>
                          <input
                            {...field}
                            type="password"
                            placeholder="Repeat password"
                            className="auth-input"
                          />
                        </FormControl>
                        <FormMessage className="error-message" />
                      </FormItem>
                    )}
                  />

                  <button
                    type="submit"
                    className="btn-enter"
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
