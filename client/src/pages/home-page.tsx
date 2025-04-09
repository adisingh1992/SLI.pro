import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { UserProfile } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Loader2, FileQuestion, ArrowRight, CheckCircle, Calendar } from "lucide-react";
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

  // Redirect to questionnaire if user hasn't completed it
  useEffect(() => {
    if (!isLoading && userProfile) {
      const questionnaireNotCompleted = !userProfile.questionnaire;
      
      if (questionnaireNotCompleted) {
        navigate("/questionnaire");
      }
    }
  }, [userProfile, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#dcede9] flex flex-col">
        <NavBar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#bed6d1]" />
          <span className="ml-2 text-[#6c8083]">Loading your profile...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#dcede9] flex flex-col">
      <NavBar />
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white shadow-card rounded-lg p-6">
          <h1 className="text-2xl font-semibold text-[#6c8083] mb-4">
            Welcome, {user?.firstName}!
          </h1>
          <p className="text-gray-600 mb-6">
            From here you can view and manage your professional profile on SLIPro.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-[#dcede9] rounded-lg p-6">
              <h2 className="text-lg font-medium text-[#6c8083] mb-3">Your Profile</h2>
              <p className="text-gray-600 mb-4">
                View or edit your professional profile to keep it up to date.
              </p>
              <Button 
                className="bg-[#bed6d1] hover:bg-opacity-90 text-[#6c8083]"
                onClick={() => navigate("/profile")}
              >
                View Profile
              </Button>
            </div>
            
            <div className="bg-[#dcede9] rounded-lg p-6">
              <h2 className="text-lg font-medium text-[#6c8083] mb-3">Profile Settings</h2>
              <p className="text-gray-600 mb-4">
                Update your profile information and preferences.
              </p>
              <Button 
                variant="outline" 
                className="border-[#bed6d1] text-[#6c8083]"
                onClick={() => navigate("/profile/create")}
              >
                Edit Profile
              </Button>
            </div>
          </div>
          
          {/* Career Development Questionnaire Section */}
          <div className={userProfile?.questionnaire ? "bg-[#dcede9] border border-[#bed6d1] rounded-lg p-6" : "bg-[#dcede9] border border-[#bed6d1] rounded-lg p-6"}>
            <div className="flex items-start">
              <div className={userProfile?.questionnaire ? "p-3 rounded-full bg-[#bed6d1] text-[#6c8083] mr-4" : "p-3 rounded-full bg-[#bed6d1] text-[#6c8083] mr-4"}>
                {userProfile?.questionnaire ? (
                  <CheckCircle className="h-6 w-6" />
                ) : (
                  <FileQuestion className="h-6 w-6" />
                )}
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-medium text-[#6c8083] mb-2">
                  {userProfile?.questionnaire ? 'Career Development Questionnaire Completed' : 'Complete Your Career Development Questionnaire'}
                </h2>
                <p className="text-gray-600 mb-4">
                  {userProfile?.questionnaire 
                    ? 'Thank you for completing the career questionnaire. This information helps us understand your professional goals and aspirations better.'
                    : 'Take a few minutes to complete our career development questionnaire. This will help us understand your professional goals and provide better guidance.'}
                </p>
                <Button 
                  className={userProfile?.questionnaire ? "flex items-center bg-[#bed6d1] hover:bg-opacity-90 text-[#6c8083]" : "flex items-center bg-[#bed6d1] hover:bg-opacity-90 text-[#6c8083]"}
                  onClick={() => navigate("/questionnaire")}
                >
                  {userProfile?.questionnaire ? 'Review Questionnaire' : 'Start Questionnaire'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          
          {/* Coaching Session Section */}
          <div className="mt-6 bg-[#dcede9] border border-[#bed6d1] rounded-lg p-6">
            <div className="flex items-start">
              <div className="p-3 rounded-full bg-[#bed6d1] text-[#6c8083] mr-4">
                <Calendar className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-medium text-[#6c8083] mb-2">
                  Personal Coaching Session
                </h2>
                <p className="text-gray-600 mb-4">
                  Book a one-on-one coaching session to discuss your career goals, get personalized advice, and develop strategies for professional growth.
                </p>
                <Button 
                  className="flex items-center bg-[#bed6d1] hover:bg-opacity-90 text-[#6c8083]"
                  onClick={() => window.open("https://calendly.com/dcara-sli/haas", "_blank")}
                >
                  Schedule Coaching Session
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
