import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Sli } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import Layout from "./layout";
import { ArrowLeft, RefreshCw, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import type { SliRecord } from "@/lib/sli";

export default function SliPage() {
  const { user } = useAuth();
  const { userId } = useParams();
  const [_, navigate] = useLocation();
  const { toast } = useToast();

  // Fetch user data
  const { data: userData } = useQuery({
    queryKey: [`/api/admin/users/${userId}`],
    queryFn: async () => {
      const res = await fetch(`/api/admin/users/${userId}`);
      if (!res.ok) throw new Error("Failed to fetch user");
      return res.json();
    },
    enabled: !!userId && !!user?.isAdmin,
  });

  // Fetch SLIs
  const { data: slis, isLoading: slisLoading, refetch: refetchSlis } = useQuery({
    queryKey: [`/api/admin/users/${userId}/slis`],
    queryFn: async () => {
      const res = await fetch(`/api/admin/users/${userId}/slis`);
      if (!res.ok) throw new Error("Failed to fetch SLIs");
      return res.json();
    },
    enabled: !!userId && !!user?.isAdmin,
  });

  // Generate SLIs
  const generateSliMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/users/${userId}/slis/generate`, {
        method: "POST",
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to generate SLIs");
      }
      
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/users/${userId}/slis`] });
      refetchSlis(); // Explicitly refetch to ensure UI updates
      toast({
        title: "Success",
        description: "SLIs generated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update SLI
  const updateSliMutation = useMutation({
    mutationFn: async ({ id }: { id: number }) => {
      const res = await fetch(`/api/admin/slis/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ activate: true }),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to update SLI");
      }
      
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/users/${userId}/slis`] });
      refetchSlis(); // Explicitly refetch to ensure UI updates
      toast({
        title: "Success",
        description: "SLI updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete SLI
  const deleteSliMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/slis/${id}`, {
        method: "DELETE",
      });
      
      if (!res.ok) {
        throw new Error("Failed to delete SLI");
      }
      
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/users/${userId}/slis`] });
      refetchSlis(); // Explicitly refetch to ensure UI updates
      toast({
        title: "Success",
        description: "SLI deleted successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Format a date string
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    } catch (error) {
      return 'Invalid date';
    }
  };

  return (
    <Layout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => navigate(`/admin/users/${userId}`)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold">
              SLIs for {userData?.firstName} {userData?.lastName}
            </h1>
          </div>
          <Button 
            variant="default" 
            onClick={() => generateSliMutation.mutate()}
            disabled={generateSliMutation.isPending}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${generateSliMutation.isPending ? 'animate-spin' : ''}`} />
            {generateSliMutation.isPending ? 'Generating...' : 'Generate SLIs'}
          </Button>
        </div>

        <div className="space-y-6">
          {slisLoading ? (
            <Card>
              <CardContent className="pt-6 flex justify-center">
                <p>Loading SLIs...</p>
              </CardContent>
            </Card>
          ) : !slis || slis.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center justify-center text-center p-6">
                  <div className="h-20 w-20 bg-muted rounded-full flex items-center justify-center mb-4">
                    <RefreshCw className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-xl font-medium mb-2">No SLIs Generated Yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Generate SLIs to provide single lasting impressions based on user data
                  </p>
                  <Button 
                    onClick={() => generateSliMutation.mutate()}
                    disabled={generateSliMutation.isPending}
                  >
                    {generateSliMutation.isPending ? 'Generating...' : 'Generate SLIs Now'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-8">
              {slis.map((sli: SliRecord) => (
                <Card key={sli.id} className="overflow-hidden">
                  <CardHeader className="bg-muted/50">
                    <div className="flex justify-between items-center">
                      <div>
                        <CardTitle className="text-xl">{sli.title}</CardTitle>
                        <CardDescription>
                          Created {formatDate(sli.createdAt.toString())} ({formatDistanceToNow(new Date(sli.createdAt), { addSuffix: true })})
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Source and status are first-class now, rather than
                            inferred from which column happened to be set. */}
                        <Badge variant="outline">{sli.source}</Badge>

                        {(sli.status === "active" || sli.status === "selected") && (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            In force
                          </Badge>
                        )}
                        {sli.status === "superseded" && (
                          <Badge variant="outline" className="bg-muted text-muted-foreground">
                            Superseded
                          </Badge>
                        )}

                        {sli.status !== "active" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateSliMutation.mutate({ id: sli.id })}
                          >
                            Make active
                          </Button>
                        )}

                        {/* Only candidates are deletable: selected and
                            superseded records are retained as part of the
                            longitudinal record (spec 12). */}
                        {sli.status === "candidate" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deleteSliMutation.mutate(sli.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <p className="mb-4 text-lg font-medium text-secondary">{sli.statement}</p>

                    {sli.rationale && (
                      <div className="bg-muted/40 p-3 rounded-md mb-3">
                        <h4 className="text-sm font-medium mb-1">Rationale:</h4>
                        <p className="text-sm text-muted-foreground">{sli.rationale}</p>
                      </div>
                    )}

                    {sli.parentSliId != null && (
                      <p className="text-xs text-muted-foreground">
                        Refinement #{sli.refinementCount} of SLI #{sli.parentSliId}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}