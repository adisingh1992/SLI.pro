import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Loader2, Users, UserCircle, Calendar, ExternalLink, Download } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getQueryFn } from "@/lib/queryClient";
import AdminLayout from "./layout";

export default function AdminDashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [_, navigate] = useLocation();
  const [isExporting, setIsExporting] = useState(false);

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

  // Fetch user count for the dashboard
  const {
    data: userCountData,
    isLoading: isCountLoading,
    error: countError,
  } = useQuery({
    queryKey: ["/api/admin/users/count"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!user?.isAdmin,
  });

  // Redirect if not admin
  useEffect(() => {
    if (!authLoading && (!user || !user.isAdmin)) {
      navigate("/admin/login");
    }
  }, [user, authLoading, navigate]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user?.isAdmin) {
    return null; // Will redirect in useEffect
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleExportIntake}
              disabled={isExporting}
            >
              {isExporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Download Intake Export (.xlsx)
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate("/admin/users")}
            >
              <Users className="mr-2 h-4 w-4" />
              Manage Users
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <CardDescription>
                Registered users in the platform
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow">
              {isCountLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : countError ? (
                <p className="text-red-500 text-sm">Error loading user count</p>
              ) : (
                <div>
                  <p className="text-3xl font-bold">{userCountData?.count || 0}</p>
                  <p className="text-xs text-gray-500 mt-1">* Admin users are excluded from this count</p>
                </div>
              )}
            </CardContent>
            <CardFooter className="mt-auto pt-0">
              <Button 
                className="w-full" 
                onClick={() => navigate("/admin/users")}
              >
                <Users className="mr-2 h-4 w-4" />
                View
              </Button>
            </CardFooter>
          </Card>

          <Card className="flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">My Schedule</CardTitle>
              <CardDescription>
                Manage your appointments and availability
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow">
              <div className="flex items-center justify-center py-4">
                <Calendar className="h-12 w-12 text-primary" />
              </div>
            </CardContent>
            <CardFooter className="mt-auto pt-0">
              <Button 
                className="w-full" 
                onClick={() => window.open("https://calendly.com/login", "_blank")}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                View
              </Button>
            </CardFooter>
          </Card>

          {/* More stats cards can be added here */}
        </div>

        <Tabs defaultValue="system">
          <TabsList>
            <TabsTrigger value="system">System Status</TabsTrigger>
          </TabsList>
          <TabsContent value="system" className="bg-white p-4 rounded-md border mt-2">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold">API Status</h3>
                <span className="text-green-500 text-sm">Operational</span>
              </div>
              <div className="flex justify-between items-center">
                <h3 className="font-semibold">Database</h3>
                <span className="text-green-500 text-sm">Connected</span>
              </div>
              <div className="flex justify-between items-center">
                <h3 className="font-semibold">Claude AI</h3>
                <span className="text-green-500 text-sm">Available</span>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}