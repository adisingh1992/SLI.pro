import { createContext, ReactNode, useContext } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { insertUserSchema } from "@shared/schema";
// `User` describes public.users; /api/user returns a wing user. See the note
// in shared/auth-user.ts — the client was typed against the wrong table.
import type { AuthenticatedUser as User } from "@shared/auth-user";
import { apiRequest, getQueryFn, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<User, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<User, Error, RegisterData>;
};

// Login schema
const loginSchema = z.object({
  username: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginData = z.infer<typeof loginSchema>;

// Registration schema with extended validation
const registerSchema = insertUserSchema.extend({
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .refine(pwd => /\d/.test(pwd), "Password must contain at least one number")
    .refine(pwd => /[a-z]/.test(pwd), "Password must contain at least one lowercase letter")
    .refine(pwd => /[A-Z]/.test(pwd), "Password must contain at least one uppercase letter"),
  confirmPassword: z.string(),
  phoneNumber: z.string().min(1, "Phone number is required").refine(val => /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/.test(val), {
    message: "Please enter a valid phone number",
  }),
  professionalStatus: z.enum([
    "undergraduate_or_recent_grad",
    "early_career",
    "mid_career_or_senior",
    "career_break_or_transition",
  ], { required_error: "Please select your professional situation" }),
  discoverySource: z.enum([
    "university_partnership",
    "colleague_or_mentor",
    "linkedin",
    "web_search",
    "professional_network_or_conference",
    "other",
  ], { required_error: "Please select how you heard about us" }),
  discoverySourceOther: z.string().optional(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"]
}).refine(data => data.discoverySource !== "other" || (data.discoverySourceOther && data.discoverySourceOther.trim().length > 0), {
  message: "Please specify how you heard about us",
  path: ["discoverySourceOther"]
});

type RegisterData = z.infer<typeof registerSchema>;

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  
  const {
    data: user,
    error,
    isLoading,
  } = useQuery<User | null, Error>({
    queryKey: ["/api/user"],
    /*
     * `on401: "returnNull"` rather than a catch on the error text.
     *
     * The previous form tested `error.message.includes("401")`, but the request
     * helper builds its message from the response *body*, and /api/user answers
     * a signed-out browser with `{ error: "Not signed in" }`. The string "401"
     * never appeared, so that branch never ran and an ordinary signed-out visit
     * resolved to the query's error state instead of to "no user".
     */
    queryFn: getQueryFn<User | null>({ on401: "returnNull" }),
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      const res = await apiRequest("POST", "/api/login", credentials);
      return (await res.json()) as User;
    },
    onSuccess: (userData: User) => {
      queryClient.setQueryData(["/api/user"], userData);
    },
    onError: (error: Error) => {
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (credentials: RegisterData) => {
      const res = await apiRequest("POST", "/api/register", credentials);
      return (await res.json()) as User;
    },
    onSuccess: () => {
    },
    onError: (error: Error) => {
      // Check for specific error messages
    },
  });

  const logoutMutation = useMutation<void, Error, void>({
    mutationFn: async () => {
      /*
       * `apiRequest` rather than a bare fetch, so this call goes through
       * `apiUrl()` like every other request. The bare fetch ignored
       * VITE_API_BASE_URL, which means logout was the one call that would break
       * if the SPA were ever served from a different origin than the API — the
       * split-origin setup the Front Door architecture describes.
       */
      await apiRequest("POST", "/api/logout");

      /*
       * Clear, not invalidate. The cache holds the previous student's sessions,
       * SLI and intake answers, and now that there is a single client this
       * actually empties it — which matters on a shared library machine. The
       * follow-up invalidate that used to sit here was redundant after a clear.
       */
      queryClient.clear();
    },
    onSuccess: () => {
      toast({
        title: "Logout successful",
        description: "You have been logged out.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
        registerMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
