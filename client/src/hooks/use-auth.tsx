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
import { apiRequest, queryClient } from "../lib/query-client";
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
  } = useQuery<User | undefined, Error>({
    queryKey: ["/api/user"],
    queryFn: async () => {
      try {
        const response = await apiRequest<User>({ url: "/api/user" });
        return response as User;
      } catch (error) {
        if (error instanceof Error && error.message.includes("401")) {
          return undefined;
        }
        throw error;
      }
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      return await apiRequest<User>({
        url: "/api/login",
        method: "POST",
        body: credentials
      }) as User;
    },
    onSuccess: (userData: User) => {
      queryClient.setQueryData(["/api/user"], userData);
    },
    onError: (error: Error) => {
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (credentials: RegisterData) => {
      return await apiRequest<User>({
        url: "/api/register",
        method: "POST",
        body: credentials
      }) as User;
    },
    onSuccess: () => {
    },
    onError: (error: Error) => {
      // Check for specific error messages
    },
  });

  const logoutMutation = useMutation<void, Error, void>({
    mutationFn: async () => {
      try {
        // Make a direct fetch call for logout since it doesn't return JSON
        const response = await fetch('/api/logout', {
          method: 'POST',
          credentials: 'include',
        });
        
        if (!response.ok) {
          throw new Error(`Logout failed with status ${response.status}`);
        }
        
        // Explicitly clear query cache here to ensure it happens even on server error
        queryClient.clear();
        
        // Also invalidate the user query to force a refetch
        queryClient.invalidateQueries({ queryKey: ["/api/user"] });
        
        return;
      } catch (error) {
        console.error("Logout error:", error);
        throw error;
      }
    },
    onSuccess: () => {
      // Clear all query cache again for extra safety
      queryClient.clear();
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
