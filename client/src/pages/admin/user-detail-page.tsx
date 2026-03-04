import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation, useParams } from "wouter";
import {
  ArrowLeft,
  Calendar,
  Download,
  ExternalLink,
  File,
  FileText,
  Loader2,
  MailIcon,
  MapPin,
  Phone,
  User,
  UserCircle,
  FileIcon,
  MessageSquare,
  Star,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getQueryFn } from "@/lib/queryClient";
import AdminLayout from "./layout";
import { UserProfile, CoachingNote } from "@shared/schema";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!userId && !!user?.isAdmin,
  });
  
  // Fetch coaching notes to check if there are any
  const {
    data: coachingNotes,
    isLoading: isCoachingNotesLoading,
  } = useQuery<CoachingNote[]>({
    queryKey: [`/api/admin/users/${userId}/coaching-notes`],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!userId && !!user?.isAdmin,
  });

  // Redirect if not admin
  useEffect(() => {
    if (!authLoading && (!user || !user.isAdmin)) {
      navigate("/admin/login");
    }
  }, [user, authLoading, navigate]);

  if (authLoading || isUserLoading || isCoachingNotesLoading) {
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
              Error loading user data. The user may not exist or there was a
              problem fetching the data.
            </p>
            <div className="flex justify-center gap-3 mt-4">
              <Button
                variant="outline"
                onClick={() => navigate("/admin/users")}
              >
                Return to Users List
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate(`/admin/users/${userId}/summary`)}
                className="flex items-center gap-2"
              >
                <MessageSquare className="h-4 w-4" />
                View Conversation Summary
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  navigate(`/admin/users/${userId}/coaching-notes`)
                }
                className="flex items-center gap-2"
              >
                <FileText className="h-4 w-4" />
                Coaching Notes
              </Button>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <Button
                        variant="outline"
                        className="flex items-center gap-2"
                        onClick={() => navigate(`/admin/users/${userId}/sli`)}
                        disabled={!coachingNotes?.length}
                      >
                        <Star className="h-4 w-4" />
                        Generate SLIs
                      </Button>
                    </div>
                  </TooltipTrigger>
                  {!coachingNotes?.length && (
                    <TooltipContent>
                      <p>At least one coaching note is required to generate SLIs</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>
      </AdminLayout>
    );
  }

  // Format a date string in a readable format (assuming ISO format)
  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // Find the most recent monthly check-in
  const mostRecentCheckIn =
    userData.monthlyCheckIns && userData.monthlyCheckIns.length > 0
      ? userData.monthlyCheckIns.reduce((latest, current) => {
          return new Date(latest.createdAt) > new Date(current.createdAt)
            ? latest
            : current;
        })
      : null;

  // ── Brand Assessment helpers ──────────────────────────────────────────────
  type RawEntry = {
    question: string;
    answer: unknown;
    other?: string | null;
    aiSubtopics?: string[] | null;
  };
  type RawAnswers = Record<string, RawEntry>;

  const rawAnswers = (userData.questionnaire?.rawAnswers ?? {}) as RawAnswers;

  const renderAnswer = (answer: unknown, isUrl = false) => {
    if (answer === null || answer === undefined) {
      return <span className="text-muted-foreground italic text-sm">Not answered</span>;
    }
    if (typeof answer === "string" && answer.trim() === "") {
      return <span className="text-muted-foreground italic text-sm">Not answered</span>;
    }
    if (Array.isArray(answer) && answer.length === 0) {
      return <span className="text-muted-foreground italic text-sm">Not answered</span>;
    }
    if (typeof answer === "number") {
      return (
        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className={`h-2 w-7 rounded-full ${i <= answer ? "bg-primary" : "bg-secondary"}`}
            />
          ))}
          <span className="text-sm text-muted-foreground ml-1">{answer} / 5</span>
        </div>
      );
    }
    if (typeof answer === "string" && (isUrl || answer.includes("linkedin.com") || answer.startsWith("http"))) {
      const href = answer.startsWith("http") ? answer : `https://${answer}`;
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline break-all">
          {answer}
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      );
    }
    if (typeof answer === "string") {
      return <p className="text-sm leading-relaxed">{answer}</p>;
    }
    if (Array.isArray(answer)) {
      return (
        <div className="flex flex-wrap gap-1.5">
          {(answer as string[]).map((item, i) => (
            <span key={i} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
              {item}
            </span>
          ))}
        </div>
      );
    }
    return <span className="text-sm">{String(answer)}</span>;
  };

  const QuestionRow = ({ qKey, isUrl = false }: { qKey: string; isUrl?: boolean }) => {
    const entry = rawAnswers[qKey];
    if (!entry) return null;
    return (
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground leading-snug">{entry.question}</p>
        {renderAnswer(entry.answer, isUrl)}
        {entry.aiSubtopics && entry.aiSubtopics.length > 0 && (
          <div className="mt-1.5 space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground/70">AI Suggested Subtopics</p>
            <div className="flex flex-wrap gap-1">
              {entry.aiSubtopics.map((t, i) => (
                <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const QuestionGroup = ({ title, keys, urlKeys = [] }: { title: string; keys: string[]; urlKeys?: string[] }) => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <div className="flex-1 h-px bg-border" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
        {keys.map((k) => (
          <QuestionRow key={k} qKey={k} isUrl={urlKeys.includes(k)} />
        ))}
      </div>
    </div>
  );
  // ── end helpers ───────────────────────────────────────────────────────────

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="mb-4">
          <Link href="/admin/users">
            <Button variant="ghost" size="sm" className="mb-2">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Users
            </Button>
          </Link>
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">User Profile</h1>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                className="flex items-center gap-2"
                onClick={() => navigate(`/admin/users/${userId}/summary`)}
              >
                <MessageSquare className="h-4 w-4" />
                View Conversation Summary
              </Button>
              <Button
                variant="outline"
                className="flex items-center gap-2"
                onClick={() =>
                  navigate(`/admin/users/${userId}/coaching-notes`)
                }
              >
                <FileText className="h-4 w-4" />
                Coaching Notes
              </Button>
              <Button
                variant="outline"
                className="flex items-center gap-2"
                onClick={() => navigate(`/admin/users/${userId}/homework`)}
              >
                <BookOpen className="h-4 w-4" />
                Assigned Homework
              </Button>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <Button
                        variant="outline"
                        className="flex items-center gap-2"
                        onClick={() => navigate(`/admin/users/${userId}/sli`)}
                        disabled={!coachingNotes?.length}
                      >
                        <Star className="h-4 w-4" />
                        Generate SLIs
                      </Button>
                    </div>
                  </TooltipTrigger>
                  {!coachingNotes?.length && (
                    <TooltipContent>
                      <p>At least one coaching note is required to generate SLIs</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
          <p className="text-muted-foreground mt-1">
            Viewing complete profile information for {userData.firstName}{" "}
            {userData.lastName}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Section 1: Basic Profile Information */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center text-xl">
                <User className="mr-2 h-5 w-5" />
                Basic Profile Information
              </CardTitle>
              <CardDescription>
                Essential user information and registration data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <UserCircle className="h-12 w-12" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">
                    {userData.firstName} {userData.lastName}
                  </h3>
                  {userData.headline && (
                    <p className="text-muted-foreground">{userData.headline}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center text-sm font-medium text-muted-foreground">
                    <MailIcon className="mr-2 h-4 w-4" />
                    Email Address
                  </div>
                  <p className="text-sm font-medium">{userData.username}</p>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center text-sm font-medium text-muted-foreground">
                    <Phone className="mr-2 h-4 w-4" />
                    Phone Number
                  </div>
                  <p className="text-sm font-medium">{userData.phoneNumber}</p>
                </div>

                {userData.location && (
                  <div className="space-y-1">
                    <div className="flex items-center text-sm font-medium text-muted-foreground">
                      <MapPin className="mr-2 h-4 w-4" />
                      Location
                    </div>
                    <p className="text-sm font-medium">{userData.location}</p>
                  </div>
                )}

                <div className="space-y-1">
                  <div className="flex items-center text-sm font-medium text-muted-foreground"></div>
                </div>
              </div>

              {userData.bio && (
                <div className="space-y-1 pt-2">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    Bio
                  </h3>
                  <p className="text-sm">{userData.bio}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 2: Uploaded Documents */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center text-xl">
                <FileText className="mr-2 h-5 w-5" />
                Uploaded Documents
              </CardTitle>
              <CardDescription>
                Documents uploaded by the user including resume and LinkedIn
                profile
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!userData.documents?.length ? (
                <div className="flex flex-col items-center justify-center border border-dashed rounded-lg p-8 text-center text-muted-foreground">
                  <FileIcon className="h-10 w-10 text-muted-foreground mb-2" />
                  <p>No documents have been uploaded yet</p>
                  <p className="text-sm mt-1">
                    When the user uploads documents, they will appear here
                  </p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {userData.documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between bg-secondary/30 rounded-md p-3"
                    >
                      <div className="flex items-center">
                        <div className="h-10 w-10 bg-secondary/50 rounded flex items-center justify-center mr-3">
                          <File className="h-5 w-5 text-secondary-foreground" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{doc.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Uploaded on {formatDate(doc.uploadedAt.toString())}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            try {
                              // Create a data URL directly from the base64 data
                              const dataUrl = `data:application/pdf;base64,${doc.fileData}`;

                              // Create a temporary link and trigger download
                              const downloadLink = document.createElement("a");
                              downloadLink.href = dataUrl;
                              downloadLink.download =
                                doc.fileName || `${doc.name}.pdf`;
                              document.body.appendChild(downloadLink);
                              downloadLink.click();
                              document.body.removeChild(downloadLink);
                            } catch (error) {
                              console.error(
                                "Error downloading document:",
                                error,
                              );
                              alert(
                                "Unable to download document. Please try again later.",
                              );
                            }
                          }}
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Download
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Section 3: Brand Assessment */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center text-xl">
              <FileText className="mr-2 h-5 w-5" />
              Brand Assessment
            </CardTitle>
            <CardDescription>
              User's responses to the brand assessment questionnaire
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!userData.questionnaire ? (
              <div className="flex flex-col items-center justify-center border border-dashed rounded-lg p-8 text-center text-muted-foreground">
                <FileText className="h-10 w-10 text-muted-foreground mb-2" />
                <p>No questionnaire data available</p>
                <p className="text-sm mt-1">
                  User has not completed the questionnaire yet
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                <QuestionGroup
                  title="LinkedIn & Online Presence"
                  keys={["Q1", "Q2", "Q3", "Q4"]}
                  urlKeys={["Q1"]}
                />
                <QuestionGroup
                  title="Self-Presentation"
                  keys={["Q5", "Q6", "Q7"]}
                />
                <QuestionGroup
                  title="Content Creation"
                  keys={["Q8", "Q9", "Q10"]}
                />
                <QuestionGroup
                  title="Networking"
                  keys={["Q11", "Q12"]}
                />
                <QuestionGroup
                  title="Topics & Interests"
                  keys={["Q13", "Q14"]}
                />
                <QuestionGroup
                  title="Career Vision"
                  keys={["Q15"]}
                />
                <QuestionGroup
                  title="Assessments"
                  keys={["Q16", "Q17"]}
                />
                <QuestionGroup
                  title="Additional Notes"
                  keys={["Q18"]}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 4: Monthly Check-In Data */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center text-xl">
              <Calendar className="mr-2 h-5 w-5" />
              Monthly Check-In Data
            </CardTitle>
            <CardDescription>
              User's monthly progress check-ins and engagement tracking
            </CardDescription>
            {mostRecentCheckIn && (
              <Badge variant="outline" className="mt-2 inline-flex w-auto">
                Most recent:{" "}
                {formatDate(mostRecentCheckIn.createdAt.toString())}
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            {!userData.monthlyCheckIns?.length ? (
              <div className="flex flex-col items-center justify-center border border-dashed rounded-lg p-8 text-center text-muted-foreground">
                <Calendar className="h-10 w-10 text-muted-foreground mb-2" />
                <p>No monthly check-in data available</p>
                <p className="text-sm mt-1">
                  User has not submitted any monthly check-ins yet
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[400px] rounded-md border">
                <Table className="min-w-[700px]">
                  <TableHeader className="bg-muted/50 sticky top-0">
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead>Content Posts</TableHead>
                      <TableHead>Engagement</TableHead>
                      <TableHead>New Connections</TableHead>
                      <TableHead>Recommendations</TableHead>
                      <TableHead>Submission Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userData.monthlyCheckIns
                      .sort(
                        (a, b) =>
                          new Date(b.createdAt).getTime() -
                          new Date(a.createdAt).getTime(),
                      )
                      .map((checkIn) => (
                        <TableRow
                          key={checkIn.id}
                          className={
                            mostRecentCheckIn?.id === checkIn.id
                              ? "bg-primary/5"
                              : ""
                          }
                        >
                          <TableCell className="font-medium">
                            {checkIn.month}
                          </TableCell>
                          <TableCell>{checkIn.contentPosts}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-normal">
                              {checkIn.engagementFrequency}
                            </Badge>
                          </TableCell>
                          <TableCell>{checkIn.newConnections}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                checkIn.recommendationImplementation === "fully"
                                  ? "default"
                                  : checkIn.recommendationImplementation ===
                                      "mostly"
                                    ? "secondary"
                                    : checkIn.recommendationImplementation ===
                                        "partially"
                                      ? "outline"
                                      : "destructive"
                              }
                              className="font-normal capitalize"
                            >
                              {checkIn.recommendationImplementation}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatDate(checkIn.createdAt.toString())}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
