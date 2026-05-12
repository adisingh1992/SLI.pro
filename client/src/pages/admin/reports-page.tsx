import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Loader2, Download, FileSpreadsheet, ClipboardList, MessageSquare, FileText, Users2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "./layout";

async function triggerDownload(url: string, filename: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    let message = "Export failed";
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

export default function AdminReportsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [_, navigate] = useLocation();
  const [isExportingUsers, setIsExportingUsers] = useState(false);
  const [isExportingIntake, setIsExportingIntake] = useState(false);
  const [isExportingQuestionnaire, setIsExportingQuestionnaire] = useState(false);
  const [isExportingSessions, setIsExportingSessions] = useState(false);
  const [transcriptSelection, setTranscriptSelection] = useState<string>("foundation:1");
  const [isExportingTranscripts, setIsExportingTranscripts] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && (!user || !user.isAdmin)) {
      navigate("/admin/login");
    }
  }, [user, authLoading, navigate]);

  async function handleExportUsers() {
    setIsExportingUsers(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      await triggerDownload("/api/admin/export/users", `users-export-${today}.xlsx`);
    } catch (err) {
      console.error("Users export error:", err);
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Could not generate the users report.",
        variant: "destructive",
      });
    } finally {
      setIsExportingUsers(false);
    }
  }

  async function handleExportIntake() {
    setIsExportingIntake(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      await triggerDownload("/api/admin/export/branding-intake", `branding-intake-export-${today}.xlsx`);
    } catch (err) {
      console.error("Intake export error:", err);
    } finally {
      setIsExportingIntake(false);
    }
  }

  async function handleExportQuestionnaire() {
    setIsExportingQuestionnaire(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      await triggerDownload("/api/admin/export/questionnaire", `questionnaire-export-${today}.xlsx`);
    } catch (err) {
      console.error("Questionnaire export error:", err);
    } finally {
      setIsExportingQuestionnaire(false);
    }
  }

  async function handleExportSessions() {
    setIsExportingSessions(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      await triggerDownload("/api/admin/export/chatbot-sessions", `chatbot-sessions-export-${today}.xlsx`);
    } catch (err) {
      console.error("Sessions export error:", err);
    } finally {
      setIsExportingSessions(false);
    }
  }

  async function handleExportTranscripts() {
    setIsExportingTranscripts(true);
    try {
      const [type, id] = transcriptSelection.split(":");
      const today = new Date().toISOString().split("T")[0];
      const slug = type === "foundation" ? `foundation-${id}` : `enhancement-${id.toLowerCase()}`;
      await triggerDownload(
        `/api/admin/export/transcripts?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`,
        `session-transcripts-${slug}-${today}.xlsx`,
      );
    } catch (err) {
      console.error("Transcripts export error:", err);
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Could not generate the transcripts report.",
        variant: "destructive",
      });
    } finally {
      setIsExportingTranscripts(false);
    }
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user?.isAdmin) {
    return null;
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center">
          <h1 className="text-3xl font-bold">Reports</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="flex flex-col">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Users2 className="h-5 w-5 text-primary" />
                <CardTitle className="text-base font-semibold">Users Export</CardTitle>
              </div>
              <CardDescription>
                Download a summary of all real users (excludes admins and test users). One row per user with profile basics, professional info, subscription, document counts, session/module progress, SLI status, and coaching activity.
              </CardDescription>
            </CardHeader>
            <CardContent className="mt-auto pt-4">
              <Button
                className="w-full"
                onClick={handleExportUsers}
                disabled={isExportingUsers}
              >
                {isExportingUsers ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                {isExportingUsers ? "Generating…" : "Download (.xlsx)"}
              </Button>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                <CardTitle className="text-base font-semibold">Branding Intake Export</CardTitle>
              </div>
              <CardDescription>
                Download all users' branding intake responses. One row per user with each question as its own column. Columns include email, name, phone, platform, account created date, and all intake questions.
              </CardDescription>
            </CardHeader>
            <CardContent className="mt-auto pt-4">
              <Button
                className="w-full"
                onClick={handleExportIntake}
                disabled={isExportingIntake}
              >
                {isExportingIntake ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                {isExportingIntake ? "Generating…" : "Download (.xlsx)"}
              </Button>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-primary" />
                <CardTitle className="text-base font-semibold">Questionnaire Export</CardTitle>
              </div>
              <CardDescription>
                Download all users' questionnaire responses. One row per user with each question as its own column. Columns: email, name, phone, platform, account created, and all 18 questionnaire questions.
              </CardDescription>
            </CardHeader>
            <CardContent className="mt-auto pt-4">
              <Button
                className="w-full"
                onClick={handleExportQuestionnaire}
                disabled={isExportingQuestionnaire}
              >
                {isExportingQuestionnaire ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                {isExportingQuestionnaire ? "Generating…" : "Download (.xlsx)"}
              </Button>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                <CardTitle className="text-base font-semibold">Chatbot Sessions Export</CardTitle>
              </div>
              <CardDescription>
                Download session progress for all users. One row per user. Columns: email, name, phone, platform, account created, then for each of the 3 Foundation Sessions and 3 Enhancement Modules: status, start date, completion date, and time spent.
              </CardDescription>
            </CardHeader>
            <CardContent className="mt-auto pt-4">
              <Button
                className="w-full"
                onClick={handleExportSessions}
                disabled={isExportingSessions}
              >
                {isExportingSessions ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                {isExportingSessions ? "Generating…" : "Download (.xlsx)"}
              </Button>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <CardTitle className="text-base font-semibold">Session Transcripts Export</CardTitle>
              </div>
              <CardDescription>
                Download full chat transcripts for a single Foundation Session or Enhancement Module. The workbook contains one sheet per user (named with their email) with columns: Message #, Date &amp; Time (PST), Sender (User/Chatbot), and Message.
              </CardDescription>
            </CardHeader>
            <CardContent className="mt-auto pt-4 space-y-3">
              <Select value={transcriptSelection} onValueChange={setTranscriptSelection}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a session or module" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="foundation:1">Foundation Session 1</SelectItem>
                  <SelectItem value="foundation:2">Foundation Session 2</SelectItem>
                  <SelectItem value="foundation:3">Foundation Session 3</SelectItem>
                  <SelectItem value="enhancement:A">Enhancement Module A</SelectItem>
                  <SelectItem value="enhancement:B">Enhancement Module B</SelectItem>
                  <SelectItem value="enhancement:C">Enhancement Module C</SelectItem>
                </SelectContent>
              </Select>
              <Button
                className="w-full"
                onClick={handleExportTranscripts}
                disabled={isExportingTranscripts}
              >
                {isExportingTranscripts ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                {isExportingTranscripts ? "Generating…" : "Download (.xlsx)"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
