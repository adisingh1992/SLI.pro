import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { UserProfile } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Loader2, Edit, MapPin, Clipboard, BookText, Target, AlertTriangle, Heart, Clock, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import NavBar from "@/components/nav-bar";
import UserAvatar from "@/components/user-avatar";
import DocumentUpload from "@/components/document-upload";

export default function ProfilePage() {
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

  if (isError) {
    toast({
      title: "Error",
      description: "Failed to load profile data. " + error?.message,
      variant: "destructive",
    });
  }

  if (!userProfile) {
    navigate("/profile/create");
    return null;
  }
  
  // Debug log to see if questionnaire data exists
  console.log("User Profile Data:", userProfile);

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col">
      <NavBar />
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white shadow-card rounded-lg overflow-hidden">
          {/* Profile Header */}
          <div className="relative">
            <div className="bg-gradient-to-r from-[#0077B5] to-[#70B5F9] p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <UserAvatar 
                    firstName={userProfile.firstName}
                    lastName={userProfile.lastName}
                    size="large"
                  />
                  <div className="ml-4">
                    <h1 className="text-2xl font-bold text-white">
                      {userProfile.firstName} {userProfile.lastName}
                    </h1>
                    <p className="text-white text-opacity-90">{userProfile.headline || "No headline set"}</p>
                  </div>
                </div>
                {/* Edit Profile button removed */}
              </div>
            </div>
          </div>
          
          {/* Profile Content */}
          <div className="p-6 border-t border-gray-200">
            <Tabs defaultValue="profile" className="mb-8">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="profile">Profile</TabsTrigger>
                <TabsTrigger value="documents">Documents</TabsTrigger>
              </TabsList>
              
              <TabsContent value="profile">
                <div className="pt-4">
                  {/* Profile Info - Only showing Name, Email, Phone Number and Career Development Summary */}
                  <div className="md:max-w-3xl mx-auto">
                    <div className="mb-8 bg-white rounded-lg p-6 shadow-sm">
                      <h2 className="text-xl font-medium text-[#333333] mb-4">Basic Information</h2>
                      
                      <div className="space-y-4">
                        {/* Name */}
                        <div className="flex flex-col md:flex-row md:items-center border-b border-gray-100 pb-3">
                          <div className="md:w-1/3 font-medium text-gray-700">Name:</div>
                          <div className="md:w-2/3 text-gray-900">{userProfile.firstName} {userProfile.lastName}</div>
                        </div>
                        
                        {/* Email */}
                        <div className="flex flex-col md:flex-row md:items-center border-b border-gray-100 pb-3">
                          <div className="md:w-1/3 font-medium text-gray-700">Email:</div>
                          <div className="md:w-2/3 text-gray-900">{userProfile.username}</div>
                        </div>
                        
                        {/* Phone Number */}
                        <div className="flex flex-col md:flex-row md:items-center border-b border-gray-100 pb-3">
                          <div className="md:w-1/3 font-medium text-gray-700">Phone Number:</div>
                          <div className="md:w-2/3 text-gray-900">{userProfile.phoneNumber || "Not provided"}</div>
                        </div>
                      </div>
                    </div>

                    {/* Career Questionnaire Results - Always show this section */}
                    <div className="mb-8 bg-[#f8fafc] p-6 rounded-lg border border-gray-100 shadow-sm">
                      <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-medium text-[#333333]">Career Development Summary</h2>
                        <Button
                          onClick={() => navigate("/questionnaire")}
                          variant="outline"
                          className="px-3 py-1 h-auto text-sm border-[#0077B5] text-[#0077B5] hover:bg-[#0077B5] hover:text-white"
                        >
                          <Edit className="h-3 w-3 mr-1" />
                          {userProfile.questionnaire ? 'Edit' : 'Complete'}
                        </Button>
                      </div>
                      
                      {userProfile.questionnaire ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {userProfile.questionnaire.background && (
                            <div className="border-l-2 border-[#0077B5] pl-4 py-1">
                              <h3 className="font-medium text-[#333333] flex items-center">
                                <Clipboard className="h-4 w-4 mr-2 text-[#0077B5]" />
                                Professional Background
                              </h3>
                              <p className="mt-1 text-gray-700 text-sm">
                                {userProfile.questionnaire.background}
                              </p>
                            </div>
                          )}
                          
                          {userProfile.questionnaire.timeframe && (
                            <div className="border-l-2 border-[#0077B5] pl-4 py-1">
                              <h3 className="font-medium text-[#333333] flex items-center">
                                <Clock className="h-4 w-4 mr-2 text-[#0077B5]" />
                                Current Industry & Function
                              </h3>
                              <p className="mt-1 text-gray-700 text-sm">
                                {userProfile.questionnaire.timeframe}
                              </p>
                            </div>
                          )}
                          
                          {userProfile.questionnaire.goals && (
                            <div className="border-l-2 border-[#0077B5] pl-4 py-1">
                              <h3 className="font-medium text-[#333333] flex items-center">
                                <Target className="h-4 w-4 mr-2 text-[#0077B5]" />
                                Career Goals
                              </h3>
                              <p className="mt-1 text-gray-700 text-sm">
                                {userProfile.questionnaire.goals}
                              </p>
                            </div>
                          )}
                          
                          {userProfile.questionnaire.aspirations && (
                            <div className="border-l-2 border-[#0077B5] pl-4 py-1">
                              <h3 className="font-medium text-[#333333] flex items-center">
                                <BookText className="h-4 w-4 mr-2 text-[#0077B5]" />
                                Professional Aspirations
                              </h3>
                              <p className="mt-1 text-gray-700 text-sm">
                                {userProfile.questionnaire.aspirations}
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <FileQuestion className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                          <p className="text-gray-600 mb-2">You haven't completed your career development questionnaire yet.</p>
                          <p className="text-gray-500 text-sm mb-4">Complete the questionnaire to see your career development summary.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="documents" className="pt-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="md:col-span-2">
                    <div className="flex items-center mb-6">
                      <FileText className="h-6 w-6 mr-2 text-[#0077B5]" />
                      <h2 className="text-xl font-medium text-[#333333]">My Documents</h2>
                    </div>
                    <DocumentUpload />
                  </div>
                  
                  {/* Empty column to maintain the same layout as profile tab */}
                  <div className="hidden md:block">
                    {/* This empty div preserves the grid layout */}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
    </div>
  );
}