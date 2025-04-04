import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { UserProfile } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import NavBar from "@/components/nav-bar";

export default function HomePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [_, navigate] = useLocation();

  // Fetch user profile data
  const { 
    data: userProfile, 
    isLoading, 
    isError,
    error 
  } = useQuery<UserProfile>({
    queryKey: ["/api/user/profile"],
    enabled: !!user,
  });

  useEffect(() => {
    if (isError && error) {
      toast({
        title: "Error",
        description: "Failed to load profile data. " + error.message,
        variant: "destructive",
      });
    }
  }, [isError, error, toast]);

  // Redirect to profile creation if profile doesn't exist or is incomplete
  useEffect(() => {
    if (!isLoading && userProfile) {
      const profileIncomplete = !userProfile.profile || !userProfile.profile.isComplete;
      
      if (profileIncomplete) {
        navigate("/profile/create");
      }
    }
  }, [userProfile, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex flex-col">
        <NavBar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#0077B5]" />
          <span className="ml-2 text-[#333333]">Loading your profile...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col">
      <NavBar />
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white shadow-card rounded-lg p-6">
          <h1 className="text-2xl font-semibold text-[#333333] mb-4">
            Welcome, {user?.firstName}!
          </h1>
          <p className="text-gray-600 mb-6">
            From here you can view and manage your professional profile on SLIPro.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#F5F5F5] rounded-lg p-6">
              <h2 className="text-lg font-medium text-[#333333] mb-3">Your Profile</h2>
              <p className="text-gray-600 mb-4">
                View or edit your professional profile to keep it up to date.
              </p>
              <Button 
                className="bg-[#0077B5] hover:bg-opacity-90"
                onClick={() => navigate("/profile")}
              >
                View Profile
              </Button>
            </div>
            
            <div className="bg-[#F5F5F5] rounded-lg p-6">
              <h2 className="text-lg font-medium text-[#333333] mb-3">Profile Settings</h2>
              <p className="text-gray-600 mb-4">
                Update your account settings and preferences.
              </p>
              <Button variant="outline" className="border-[#0077B5] text-[#0077B5]">
                Account Settings
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
