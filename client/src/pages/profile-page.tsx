import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { UserProfile } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Loader2, Edit, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import NavBar from "@/components/nav-bar";
import UserAvatar from "@/components/user-avatar";

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
                <div>
                  <Button
                    onClick={() => navigate("/profile/create")}
                    className="px-4 py-2 bg-white text-[#0077B5] hover:bg-opacity-90 flex items-center"
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit Profile
                  </Button>
                </div>
              </div>
            </div>
          </div>
          
          {/* Profile Content */}
          <div className="p-6 border-t border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Profile Info */}
              <div className="md:col-span-2">
                <div className="mb-8">
                  <h2 className="text-xl font-medium text-[#333333] mb-4">About</h2>
                  <p className="text-gray-700">
                    {userProfile.bio || "No bio information added yet."}
                  </p>
                </div>
                
                <div className="mb-8">
                  <h2 className="text-xl font-medium text-[#333333] mb-4">Experience</h2>
                  <div className="space-y-4">
                    {userProfile.experiences && userProfile.experiences.length > 0 ? (
                      userProfile.experiences.map((experience) => (
                        <div key={experience.id} className="border-l-2 border-gray-200 pl-4 py-1">
                          <h3 className="font-medium text-[#333333]">{experience.title}</h3>
                          <p className="text-gray-600">{experience.company}</p>
                          <p className="text-sm text-gray-500">
                            {experience.startDate} - {experience.endDate || "Present"}
                          </p>
                          <p className="mt-2 text-gray-700">{experience.description}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-500">No experience added yet.</p>
                    )}
                  </div>
                </div>
                
                <div className="mb-8">
                  <h2 className="text-xl font-medium text-[#333333] mb-4">Education</h2>
                  <div className="space-y-4">
                    {userProfile.education && userProfile.education.length > 0 ? (
                      userProfile.education.map((edu) => (
                        <div key={edu.id} className="border-l-2 border-gray-200 pl-4 py-1">
                          <h3 className="font-medium text-[#333333]">{edu.degree}</h3>
                          <p className="text-gray-600">{edu.institution}</p>
                          <p className="text-sm text-gray-500">
                            {edu.startYear} - {edu.endYear || "Present"}
                          </p>
                          <p className="mt-2 text-gray-700">{edu.description}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-500">No education added yet.</p>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Sidebar */}
              <div>
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <h3 className="font-medium text-[#333333] mb-3">Location</h3>
                  <p className="text-gray-700 flex items-center">
                    <MapPin className="h-5 w-5 mr-2 text-gray-500" />
                    <span>{userProfile.location || "No location set"}</span>
                  </p>
                </div>
                
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <h3 className="font-medium text-[#333333] mb-3">Skills</h3>
                  <div className="flex flex-wrap gap-2">
                    {userProfile.skills && userProfile.skills.length > 0 ? (
                      userProfile.skills.map((skill) => (
                        <span 
                          key={skill.id} 
                          className="inline-block px-3 py-1 rounded-full text-sm bg-[#70B5F9] bg-opacity-20 text-[#0077B5]"
                        >
                          {skill.name}
                        </span>
                      ))
                    ) : (
                      <p className="text-gray-500">No skills added yet.</p>
                    )}
                  </div>
                </div>
                
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-medium text-[#333333] mb-3">Languages</h3>
                  <ul className="space-y-2">
                    {userProfile.languages && userProfile.languages.length > 0 ? (
                      userProfile.languages.map((language) => (
                        <li key={language.id} className="flex justify-between">
                          <span>{language.name}</span>
                          <span className="text-sm text-gray-500">{language.proficiency}</span>
                        </li>
                      ))
                    ) : (
                      <p className="text-gray-500">No languages added yet.</p>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
