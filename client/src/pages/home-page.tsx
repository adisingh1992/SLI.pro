import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { UserProfile } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  Loader2,
  FileQuestion,
  ArrowRight,
  CheckCircle,
  Calendar,
  User,
  FileText,
} from "lucide-react";
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
    error,
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
          <Loader2 className="h-8 w-8 animate-spin text-[#bed6d1]" />
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
            Congratulations on joining SLI.pro! Your professional brand journey
            starts with few key actions:
          </p>

          {/* Career Development Questionnaire Section */}
          <div
            className={
              userProfile?.questionnaire
                ? userProfile.questionnaire.isDraft === true
                  ? "bg-[#fffbeb] border border-amber-200 rounded-lg p-6"
                  : "bg-[#f5faf9] border border-[#dcede9] rounded-lg p-6"
                : "bg-[#fff7f0] border border-orange-200 rounded-lg p-6"
            }
          >
            <div className="flex items-start">
              <div
                className={
                  userProfile?.questionnaire
                    ? userProfile.questionnaire.isDraft === true
                      ? "p-3 rounded-full bg-amber-100 text-amber-600 mr-4"
                      : "p-3 rounded-full bg-[#dcede9] text-[#bed6d1] mr-4"
                    : "p-3 rounded-full bg-orange-100 text-orange-500 mr-4"
                }
              >
                {userProfile?.questionnaire 
                  ? userProfile.questionnaire.isDraft === true
                    ? <FileQuestion className="h-6 w-6" />
                    : <CheckCircle className="h-6 w-6" />
                  : <FileQuestion className="h-6 w-6" />
                }
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-medium text-[#333333] mb-2">
                  {userProfile?.questionnaire
                    ? userProfile.questionnaire.isDraft === true
                      ? "Questionnaire Draft Saved"
                      : "Initial Questionnaire Completed"
                    : "Complete the Professional Branding Assessment"}
                </h2>
                <p className="text-gray-600 mb-4">
                  {userProfile?.questionnaire
                    ? userProfile.questionnaire.isDraft === true
                      ? "You have a saved draft of your questionnaire. Continue where you left off to complete your professional branding assessment."
                      : "Thank you for completing the questionnaire. This information helps us understand your professional goals and aspirations better."
                    : "This comprehensive assessment helps customize your personal branding strategy and provide information to shape your Single Lasting Impression (SLI). The assessment will take ~5 minutes to complete"}
                </p>
                <Button
                  className={
                    userProfile?.questionnaire
                      ? userProfile.questionnaire.isDraft === true
                        ? "flex items-center bg-amber-500 hover:bg-amber-600"
                        : "flex items-center bg-[#bed6d1] hover:bg-opacity-90"
                      : "flex items-center bg-orange-500 hover:bg-opacity-90"
                  }
                  onClick={() => navigate("/questionnaire")}
                >
                  {userProfile?.questionnaire
                    ? userProfile.questionnaire.isDraft === true
                      ? "Continue Questionnaire"
                      : "Review Questionnaire"
                    : "Start Questionnaire"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Profile View Section - Only visible when questionnaire is present (completed or draft) */}
          {userProfile?.questionnaire && (
            <div className="mt-6 bg-[#f5faf9] border border-[#dcede9] rounded-lg p-6">
              <div className="flex items-start">
                <div className="p-3 rounded-full bg-[#dcede9] text-[#6c8083] mr-4">
                  <User className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-medium text-[#333333] mb-2">
                    Your Professional Profile
                  </h2>
                  <p className="text-gray-600 mb-4">
                    Review and manage your professional profile details and
                    uploaded documents. Your profile reflects information from
                    {userProfile.questionnaire.isDraft === true
                      ? " your draft questionnaire."
                      : " your completed questionnaire."
                    }
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      className="flex items-center bg-[#bed6d1] hover:bg-[#6c8083]"
                      onClick={() => navigate("/profile")}
                    >
                      View Profile
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      className="flex items-center border-[#bed6d1] text-[#6c8083] hover:bg-[#f5faf9]"
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
          
          {/* Document Upload Section - Only visible when questionnaire is completed */}
          {userProfile?.questionnaire && userProfile.questionnaire.isDraft !== true && (
            <div className="mt-6 bg-[#f7f9ff] border border-blue-100 rounded-lg p-6">
              <div className="flex items-start">
                <div className="p-3 rounded-full bg-blue-100 text-blue-600 mr-4">
                  <FileText className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-medium text-[#333333] mb-2">
                    Upload the Following Documents and Information
                  </h2>
                  <div className="text-gray-600 mb-4 space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center">
                        <span className="font-medium">1:</span>
                        <span className="ml-2">Most Recent Resume</span>
                        {userProfile.documents?.some(doc => doc.type === 'resume') && (
                          <CheckCircle className="ml-2 h-4 w-4 text-green-600" />
                        )}
                      </div>
                      
                      <div>
                        <div className="flex items-center">
                          <span className="font-medium">2:</span>
                          <span className="ml-2">Current LinkedIn Profile PDF</span>
                          {userProfile.documents?.some(doc => doc.type === 'linkedin') && (
                            <CheckCircle className="ml-2 h-4 w-4 text-green-600" />
                          )}
                        </div>
                        <div className="ml-6 mt-1 text-sm text-gray-600">
                          <div className="flex items-baseline">
                            <span className="font-medium text-xs">2a:</span>
                            <span className="ml-1">On your profile, below your headline click "Resources"</span>
                          </div>
                          <div className="flex items-baseline">
                            <span className="font-medium text-xs">2b:</span>
                            <span className="ml-1">Save to PDF</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="flex items-center border-blue-300 text-blue-700 hover:bg-blue-50"
                    onClick={() => navigate("/profile?tab=documents")}
                  >
                    Upload Documents
                    <FileText className="ml-2 h-4 w-4" />
                  </Button>
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
                    ? (userProfile.questionnaire.isDraft === true)
                      ? "Complete your questionnaire to unlock the ability to schedule a coaching session."
                      : "Book a one-on-one coaching session to discuss your career goals, get personalized advice, and develop strategies for professional growth."
                    : "Complete the initial questionnaire first to unlock the ability to schedule a coaching session."}
                </p>
                <Button
                  className="flex items-center bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() =>
                    window.open("https://calendly.com/dcara-sli/haas", "_blank")
                  }
                  disabled={!userProfile?.questionnaire || (userProfile?.questionnaire?.isDraft === true)}
                >
                  Schedule Coaching Session
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                {(!userProfile?.questionnaire || (userProfile?.questionnaire?.isDraft === true)) && (
                  <p className="text-sm text-gray-500 italic mt-2">
                    <span className="text-orange-500 font-medium">*</span> You
                    must complete the questionnaire before scheduling a coaching
                    session
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
