import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation, useParams } from "wouter";
import { ArrowLeft, Loader2, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getQueryFn } from "@/lib/queryClient";
import AdminLayout from "./layout";
import { UserProfile } from "@shared/schema";

type UserProfileWithoutPassword = Omit<UserProfile, "password">;

export default function UserDetailPage() {
  const { user, isLoading: authLoading } = useAuth();
  const params = useParams();
  const [_, navigate] = useLocation();
  const userId = params.id ? parseInt(params.id) : undefined;

  // Fetch user details
  const {
    data: userData,
    isLoading: isUserLoading,
    error: userError,
  } = useQuery<UserProfileWithoutPassword>({
    queryKey: [`/api/admin/users/${userId}`],
    queryFn: getQueryFn(),
    enabled: !!userId && !!user?.isAdmin,
  });

  // Redirect if not admin
  useEffect(() => {
    if (!authLoading && (!user || !user.isAdmin)) {
      navigate("/admin/login");
    }
  }, [user, authLoading, navigate]);

  if (authLoading || isUserLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user?.isAdmin) {
    return null; // Will redirect in useEffect
  }

  if (userError || !userData) {
    return (
      <AdminLayout>
        <div className="p-6">
          <div className="mb-6">
            <Link href="/admin/users">
              <Button variant="ghost" size="sm" className="mb-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Users
              </Button>
            </Link>
          </div>
          <div className="bg-red-50 border border-red-200 p-6 rounded-md text-center">
            <p className="text-red-600">
              Error loading user data. The user may not exist or there was a problem fetching the data.
            </p>
            <Button 
              variant="outline"
              onClick={() => navigate("/admin/users")}
              className="mt-4"
            >
              Return to Users List
            </Button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="mb-6">
          <Link href="/admin/users">
            <Button variant="ghost" size="sm" className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Users
            </Button>
          </Link>
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">User Details</h1>
            <Badge variant={userData.isAdmin ? "default" : "outline"}>
              {userData.isAdmin ? "Admin" : "User"}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Basic user information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-center">
                <div className="h-24 w-24 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                  <UserCircle className="h-16 w-16" />
                </div>
              </div>
              <div className="space-y-2">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Name</h3>
                  <p>
                    {userData.firstName} {userData.lastName}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Email</h3>
                  <p>{userData.username}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Phone</h3>
                  <p>{userData.phoneNumber}</p>
                </div>
                {userData.headline && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">
                      Headline
                    </h3>
                    <p>{userData.headline}</p>
                  </div>
                )}
                {userData.location && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">
                      Location
                    </h3>
                    <p>{userData.location}</p>
                  </div>
                )}
                {userData.bio && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Bio</h3>
                    <p className="text-sm">{userData.bio}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <Tabs defaultValue="experiences">
              <CardHeader className="pb-0">
                <div className="flex items-center justify-between">
                  <CardTitle>Profile Details</CardTitle>
                  <TabsList>
                    <TabsTrigger value="experiences">Experiences</TabsTrigger>
                    <TabsTrigger value="education">Education</TabsTrigger>
                    <TabsTrigger value="skills">Skills & Languages</TabsTrigger>
                  </TabsList>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <TabsContent value="experiences">
                  {!userData.experiences?.length ? (
                    <div className="text-center p-6 text-gray-500">
                      No experience information available.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Title</TableHead>
                          <TableHead>Company</TableHead>
                          <TableHead>Period</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {userData.experiences.map((exp) => (
                          <TableRow key={exp.id}>
                            <TableCell className="font-medium">
                              {exp.title}
                            </TableCell>
                            <TableCell>{exp.company}</TableCell>
                            <TableCell>
                              {exp.startDate} - {exp.current ? "Present" : exp.endDate}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>
                <TabsContent value="education">
                  {!userData.education?.length ? (
                    <div className="text-center p-6 text-gray-500">
                      No education information available.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Degree</TableHead>
                          <TableHead>Institution</TableHead>
                          <TableHead>Period</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {userData.education.map((edu) => (
                          <TableRow key={edu.id}>
                            <TableCell className="font-medium">
                              {edu.degree}
                            </TableCell>
                            <TableCell>{edu.institution}</TableCell>
                            <TableCell>
                              {edu.startYear} - {edu.endYear || "Present"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>
                <TabsContent value="skills">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 mb-2">
                        Skills
                      </h3>
                      {!userData.skills?.length ? (
                        <p className="text-gray-500 text-sm">
                          No skills added yet.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {userData.skills.map((skill) => (
                            <Badge key={skill.id} variant="outline">
                              {skill.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 mb-2">
                        Languages
                      </h3>
                      {!userData.languages?.length ? (
                        <p className="text-gray-500 text-sm">
                          No languages added yet.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {userData.languages.map((language) => (
                            <div
                              key={language.id}
                              className="flex justify-between"
                            >
                              <span>{language.name}</span>
                              <span className="text-sm text-gray-500">
                                {language.proficiency}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>
              </CardContent>
            </Tabs>
          </Card>
        </div>

        {/* Questionnaire Section */}
        <Card>
          <CardHeader>
            <CardTitle>Questionnaire</CardTitle>
            <CardDescription>
              User's questionnaire responses
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!userData.questionnaire ? (
              <div className="text-center p-6 text-gray-500">
                User has not completed the questionnaire.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">
                    Industry
                  </h3>
                  <p className="mb-4">
                    {userData.questionnaire.industry || "Not specified"}
                  </p>

                  <h3 className="text-sm font-medium text-gray-500 mb-2">
                    Background
                  </h3>
                  <p className="mb-4">
                    {userData.questionnaire.background || "Not specified"}
                  </p>

                  <h3 className="text-sm font-medium text-gray-500 mb-2">
                    Goals
                  </h3>
                  <p className="mb-4">
                    {userData.questionnaire.goals || "Not specified"}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">
                    Aspirations
                  </h3>
                  <p className="mb-4">
                    {userData.questionnaire.aspirations || "Not specified"}
                  </p>

                  <h3 className="text-sm font-medium text-gray-500 mb-2">
                    Challenges
                  </h3>
                  <p className="mb-4">
                    {userData.questionnaire.challenges || "Not specified"}
                  </p>

                  <h3 className="text-sm font-medium text-gray-500 mb-2">
                    Interests
                  </h3>
                  <p className="mb-4">
                    {userData.questionnaire.interests || "Not specified"}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}