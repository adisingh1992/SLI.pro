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
  /*
   * Kept in step with `server/auth.ts`'s schema, which is the one that decides. Three
   * fields the old long-form signup required are optional now — see that file for why
   * each; the short version is that the MyWing form asks the minimum and Wing establishes
   * professional status during intake, where the answer is better anyway.
   *
   * This copy exists so the client can show an error beside the field instead of after a
   * round trip. It must never be STRICTER than the server's: a rule only enforced here is
   * one an API client walks straight past, which is the more dangerous direction.
   */
  confirmPassword: z.string().optional(),
  phoneNumber: z.string().refine(val => !val || /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/.test(val), {
    message: "Please enter a valid phone number",
  }).optional(),
  professionalStatus: z.enum([
    "undergraduate_or_recent_grad",
    "early_career",
    "mid_career_or_senior",
    "career_break_or_transition",
  ]).optional(),
  discoverySource: z.enum([
    "university_partnership",
    "colleague_or_mentor",
    "linkedin",
    "web_search",
    "professional_network_or_conference",
    "other",
  ]).optional(),
  discoverySourceOther: z.string().optional(),
  /** Institutional reporting. Nested because it is stored apart — see migration 0035. */
  demographics: z.object({
    age: z.number().int().min(13).max(120).optional(),
    gender: z.string().nullable().optional(),
    genderSelfDescribe: z.string().nullable().optional(),
    ethnicities: z.array(z.string()).optional(),
    marketingOptIn: z.boolean().optional(),
  }).optional(),
}).refine(data => data.confirmPassword === undefined || data.password === data.confirmPassword, {
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
    /*
     * Mirrors `loginMutation`'s onSuccess. This was empty, which is why signup did not
     * redirect: `/api/register` creates the session server-side same as `/api/login` does,
     * but the client never told react-query about it, so `useAuth().user` stayed null,
     * the `<Redirect to="/" />` guard at the top of signup.tsx never had a user to redirect
     * on, and the page just sat there after a successful "Create my account".
     */
    onSuccess: (userData: User) => {
      queryClient.setQueryData(["/api/user"], userData);
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
       * ── WHY THE REDIRECT USED TO TAKE A WHILE ────────────────────────────
       * Nothing here ever navigated. `ProtectedRoute` redirects to `/auth`
       * purely reactively, off `useAuth().user` going null — and `user` comes
       * from the `["/api/user"]` query. The old code called `queryClient.clear()`
       * and stopped, which just EMPTIES the cache; it doesn't tell that query
       * the answer is "signed out". So every mounted query — `/api/user`
       * included — had to notice it had no data and independently REFETCH
       * before anything could react. That meant: a full extra `/api/user`
       * round trip just to discover `user: null`, run in parallel with every
       * other query on the page the student was still looking at (dashboard
       * tiles, chat threads, milestones...) doing the exact same thing against
       * a session the server had already ended — each one failing, most
       * retrying once (the app's default `retry: 1`) before settling. All of
       * that happened before `ProtectedRoute` ever got the `user: null` it was
       * waiting on to redirect.
       *
       * Cancel what's in flight, clear the cache, then WRITE the answer
       * directly rather than waiting for a fetch to discover it. `setQueryData`
       * is synchronous — React sees `user: null` in the very next render,
       * `ProtectedRoute` redirects immediately, and the old page's components
       * unmount before their queries get a chance to re-fire at all.
       */
      await queryClient.cancelQueries();
      queryClient.clear();
      queryClient.setQueryData(["/api/user"], null);
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
