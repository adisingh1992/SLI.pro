import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Loader2, Download, FileSpreadsheet } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import AdminLayout from "./layout";

export default function AdminReportsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [_, navigate] = useLocation();
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || !user.isAdmin)) {
      navigate("/admin/login");
    }
  }, [user, authLoading, navigate]);

  async function handleExportIntake() {
    setIsExporting(true);
    try {
      const res = await fetch("/api/admin/export/branding-intake", { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const today = new Date().toISOString().split("T")[0];
      a.download = `branding-intake-export-${today}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export error:", err);
    } finally {
      setIsExporting(false);
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
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                <CardTitle className="text-base font-semibold">Branding Intake Export</CardTitle>
              </div>
              <CardDescription>
                Download a spreadsheet of all users' branding intake responses. Each row is one question/answer pair. Columns: email, name, phone, question, answer, platform, and account created date.
              </CardDescription>
            </CardHeader>
            <CardContent className="mt-auto pt-4">
              <Button
                className="w-full"
                onClick={handleExportIntake}
                disabled={isExporting}
              >
                {isExporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                {isExporting ? "Generating…" : "Download (.xlsx)"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
