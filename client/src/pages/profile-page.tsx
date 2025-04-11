import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { UserProfile } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  Loader2,
  Edit,
  MapPin,
  Clipboard,
  BookText,
  Target,
  AlertTriangle,
  Heart,
  Clock,
  FileText,
  Home,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import NavBar from "@/components/nav-bar";
import UserAvatar from "@/components/user-avatar";
import DocumentUpload from "@/components/document-upload";
import { useEffect, useState } from "react";

export default function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [location, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<string>("profile");

  // Parse URL parameters to check for tab selection
  useEffect(() => {
    // Check if we have a tab parameter in the URL
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    
    // If tab parameter exists and is valid, set it as active tab
    if (tabParam === 'documents' || tabParam === 'profile') {
      setActiveTab(tabParam);
    }
  }, [location]);

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

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col">
      <NavBar />
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white shadow-card rounded-lg overflow-hidden">
          {/* Profile Header */}
          <div className="relative">
            <div className="bg-gradient-to-r from-[#bed6d1] to-[#dcede9] p-6">
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
                  </div>
                </div>
                <Button
                  onClick={() => navigate("/")}
                  variant="outline"
                  className="bg-white/10 border-white/20 hover:bg-white/20 text-white"
                >
                  <Home className="h-4 w-4 mr-2" />
                  Home Page
                </Button>
              </div>
            </div>
          </div>

          {/* Profile Content */}
          <div className="p-6 border-t border-gray-200">
            <div className="max-w-4xl mx-auto">
              <Tabs 
                value={activeTab} 
                onValueChange={setActiveTab}
                className="mb-8"
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="profile">Profile</TabsTrigger>
                  <TabsTrigger value="documents">Documents</TabsTrigger>
                </TabsList>

                <TabsContent value="profile">
                  <div className="pt-4">
                    {/* Profile Info - Only showing Name, Email, Phone Number and Career Development Summary */}
                    <div>
                      <div className="mb-8 bg-white rounded-lg p-6 shadow-sm">
                        <h2 className="text-xl font-medium text-[#333333] mb-4">
                          Basic Information
                        </h2>

                        <div className="space-y-4">
                          {/* Name */}
                          <div className="flex flex-col md:flex-row md:items-center border-b border-gray-100 pb-3">
                            <div className="md:w-1/3 font-medium text-gray-700">
                              Name:
                            </div>
                            <div className="md:w-2/3 text-gray-900">
                              {userProfile.firstName} {userProfile.lastName}
                            </div>
                          </div>

                          {/* Email */}
                          <div className="flex flex-col md:flex-row md:items-center border-b border-gray-100 pb-3">
                            <div className="md:w-1/3 font-medium text-gray-700">
                              Email:
                            </div>
                            <div className="md:w-2/3 text-gray-900">
                              {userProfile.username}
                            </div>
                          </div>

                          {/* Phone Number */}
                          <div className="flex flex-col md:flex-row md:items-center border-b border-gray-100 pb-3">
                            <div className="md:w-1/3 font-medium text-gray-700">
                              Phone Number:
                            </div>
                            <div className="md:w-2/3 text-gray-900">
                              {userProfile.phoneNumber || "Not provided"}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Career Questionnaire Results */}
                      {userProfile.questionnaire && (
                        <div className="mb-8 bg-[#f8fafc] p-6 rounded-lg border border-gray-100 shadow-sm">
                          <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-medium text-[#333333]">
                              Career Development Summary
                            </h2>
                            <Button
                              onClick={() => navigate("/questionnaire")}
                              variant="outline"
                              className="px-3 py-1 h-auto text-sm border-[#bed6d1] text-[#bed6d1] hover:bg-[#bed6d1] hover:text-white"
                            >
                              <Edit className="h-3 w-3 mr-1" />
                              Edit
                            </Button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {userProfile.questionnaire.background && (
                              <div className="border-l-2 border-[#bed6d1] pl-4 py-1">
                                <h3 className="font-medium text-[#333333] flex items-center">
                                  <Clipboard className="h-4 w-4 mr-2 text-[#bed6d1]" />
                                  Professional Background
                                </h3>
                                <p className="mt-1 text-gray-700 text-sm">
                                  {userProfile.questionnaire.background}
                                </p>
                              </div>
                            )}

                            {userProfile.questionnaire.timeframe && (
                              <div className="border-l-2 border-[#bed6d1] pl-4 py-1">
                                <h3 className="font-medium text-[#333333] flex items-center">
                                  <Clock className="h-4 w-4 mr-2 text-[#bed6d1]" />
                                  Current Industry & Function
                                </h3>
                                <p className="mt-1 text-gray-700 text-sm">
                                  {userProfile.questionnaire.timeframe}
                                </p>
                              </div>
                            )}

                            {userProfile.questionnaire.goals && (
                              <div className="border-l-2 border-[#bed6d1] pl-4 py-1">
                                <h3 className="font-medium text-[#333333] flex items-center">
                                  <Target className="h-4 w-4 mr-2 text-[#bed6d1]" />
                                  Career Goals
                                </h3>
                                <p className="mt-1 text-gray-700 text-sm">
                                  {userProfile.questionnaire.goals}
                                </p>
                              </div>
                            )}

                            {userProfile.questionnaire.aspirations && (
                              <div className="border-l-2 border-[#bed6d1] pl-4 py-1">
                                <h3 className="font-medium text-[#333333] flex items-center">
                                  <BookText className="h-4 w-4 mr-2 text-[#bed6d1]" />
                                  Professional Aspirations
                                </h3>
                                <p className="mt-1 text-gray-700 text-sm">
                                  {userProfile.questionnaire.aspirations}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="documents" className="pt-4">
                  <div className="pt-4">
                    <div>
                      <div className="mb-8 bg-white rounded-lg p-6 shadow-sm">
                        <div className="flex items-center mb-4">
                          <FileText className="h-6 w-6 mr-2 text-[#bed6d1]" />
                          <h2 className="text-xl font-medium text-[#333333]">
                            My Documents
                          </h2>
                        </div>
                        <DocumentUpload />
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
