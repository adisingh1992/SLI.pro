import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { UserProfile } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Loader2, FileQuestion, ArrowRight, CheckCircle, Calendar, User, FileText } from "lucide-react";
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

  // No longer automatically redirecting to questionnaire if it's not completed
  // User can choose to complete it from the home page

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
            From here you can view and manage your professional profile on SLI.pro.
          </p>
          
          {/* Career Development Questionnaire Section */}
          <div className={userProfile?.questionnaire ? "bg-[#f0f7ff] border border-blue-200 rounded-lg p-6" : "bg-[#fff7f0] border border-orange-200 rounded-lg p-6"}>
            <div className="flex items-start">
              <div className={userProfile?.questionnaire ? "p-3 rounded-full bg-blue-100 text-[#0077B5] mr-4" : "p-3 rounded-full bg-orange-100 text-orange-500 mr-4"}>
                {userProfile?.questionnaire ? (
                  <CheckCircle className="h-6 w-6" />
                ) : (
                  <FileQuestion className="h-6 w-6" />
                )}
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-medium text-[#333333] mb-2">
                  {userProfile?.questionnaire ? 'Career Development Questionnaire Completed' : 'Complete Your Career Development Questionnaire'}
                </h2>
                <p className="text-gray-600 mb-4">
                  {userProfile?.questionnaire 
                    ? 'Thank you for completing the career questionnaire. This information helps us understand your professional goals and aspirations better.'
                    : 'Take a few minutes to complete our career development questionnaire. This will help us understand your professional goals and provide better guidance.'}
                </p>
                <Button 
                  className={userProfile?.questionnaire ? "flex items-center bg-[#0077B5] hover:bg-opacity-90" : "flex items-center bg-orange-500 hover:bg-opacity-90"}
                  onClick={() => navigate("/questionnaire")}
                >
                  {userProfile?.questionnaire ? 'Review Questionnaire' : 'Start Questionnaire'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          
          {/* Profile View Section - Only visible when questionnaire is completed */}
          {userProfile?.questionnaire && (
            <div className="mt-6 bg-[#f0f4ff] border border-indigo-200 rounded-lg p-6">
              <div className="flex items-start">
                <div className="p-3 rounded-full bg-indigo-100 text-indigo-600 mr-4">
                  <User className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-medium text-[#333333] mb-2">
                    Your Professional Profile
                  </h2>
                  <p className="text-gray-600 mb-4">
                    Review and manage your professional profile details and uploaded documents. Your profile reflects information from your completed questionnaire.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button 
                      className="flex items-center bg-indigo-600 hover:bg-indigo-700"
                      onClick={() => navigate("/profile")}
                    >
                      View Profile
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                    <Button 
                      variant="outline"
                      className="flex items-center border-indigo-600 text-indigo-600 hover:bg-indigo-50"
                      onClick={() => navigate("/profile?tab=documents")}
                    >
                      View Documents
                      <FileText className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Coaching Session Section */}
          <div className="mt-6 bg-[#f0fff7] border border-green-200 rounded-lg p-6">
            <div className="flex items-start">
              <div className="p-3 rounded-full bg-green-100 text-green-600 mr-4">
                <Calendar className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-medium text-[#333333] mb-2">
                  Personal Coaching Session
                </h2>
                <p className="text-gray-600 mb-4">
                  {userProfile?.questionnaire 
                    ? "Book a one-on-one coaching session to discuss your career goals, get personalized advice, and develop strategies for professional growth."
                    : "Complete the career development questionnaire first to unlock the ability to schedule a coaching session."}
                </p>
                <Button 
                  className="flex items-center bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => window.open("https://calendly.com/dcara-sli/haas", "_blank")}
                  disabled={!userProfile?.questionnaire}
                >
                  Schedule Coaching Session
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                {!userProfile?.questionnaire && (
                  <p className="text-sm text-gray-500 italic mt-2">
                    <span className="text-orange-500 font-medium">*</span> You must complete the questionnaire before scheduling a coaching session
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
