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
    mutationFn: async ({ id, selectedSliIndex }: { id: number; selectedSliIndex: number | null }) => {
      const res = await fetch(`/api/admin/slis/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          selectedSliIndex,
        }),
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
              {slis.map((sli: Sli) => (
                <Card key={sli.id} className="overflow-hidden">
                  <CardHeader className="bg-muted/50">
                    <div className="flex justify-between items-center">
                      <div>
                        <CardTitle className="text-xl">SLI Set</CardTitle>
                        <CardDescription>
                          Generated on {formatDate(sli.createdAt.toString())} ({formatDistanceToNow(new Date(sli.createdAt), { addSuffix: true })})
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        {sli.selectedSliIndex !== null && (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Selected
                          </Badge>
                        )}
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => deleteSliMutation.mutate(sli.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-6">
                    {sli.refinedSliText && (
                      <div className="mb-6">
                        <div className="p-5 rounded-lg border-2 border-primary bg-primary/5">
                          <div className="flex justify-between items-center mb-3">
                            <h3 className="text-lg font-semibold text-primary">Refined SLI</h3>
                            {sli.refinedAt && (
                              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                                Refined {formatDistanceToNow(new Date(sli.refinedAt), { addSuffix: true })}
                              </Badge>
                            )}
                          </div>
                          <p className="mb-4 font-medium">{sli.refinedSliText}</p>
                          
                          {sli.refinementRationale && (
                            <div className="bg-white p-3 rounded-md mb-3">
                              <h4 className="text-sm font-medium mb-1">Refinement Rationale:</h4>
                              <p className="text-sm text-muted-foreground">{sli.refinementRationale}</p>
                            </div>
                          )}
                          
                          {sli.implementationGuidance && (
                            <div className="bg-white p-3 rounded-md">
                              <h4 className="text-sm font-medium mb-1">Implementation Guidance:</h4>
                              <p className="text-sm text-muted-foreground">{sli.implementationGuidance}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-6">
                        <div className={`p-4 rounded-lg border ${sli.selectedSliIndex === 1 ? 'border-2 border-green-500 bg-green-50' : 'bg-card'}`}>
                          <div className="flex justify-between items-center">
                            <h3 className="text-lg font-medium text-secondary mb-2">{sli.title1}</h3>
                            {sli.selectedSliIndex === 1 ? (
                              <Badge className="bg-green-500">Selected</Badge>
                            ) : (
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => updateSliMutation.mutate({ id: sli.id, selectedSliIndex: 1 })}
                                disabled={updateSliMutation.isPending}
                              >
                                Select this SLI
                              </Button>
                            )}
                          </div>
                          <p className="mb-4">{sli.statement1}</p>
                          <div className="bg-muted/40 p-3 rounded-md">
                            <h4 className="text-sm font-medium mb-1">Rationale:</h4>
                            <p className="text-sm text-muted-foreground">{sli.rationale1}</p>
                          </div>
                        </div>
                        
                        <div className={`p-4 rounded-lg border ${sli.selectedSliIndex === 2 ? 'border-2 border-green-500 bg-green-50' : 'bg-card'}`}>
                          <div className="flex justify-between items-center">
                            <h3 className="text-lg font-medium text-secondary mb-2">{sli.title2}</h3>
                            {sli.selectedSliIndex === 2 ? (
                              <Badge className="bg-green-500">Selected</Badge>
                            ) : (
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => updateSliMutation.mutate({ id: sli.id, selectedSliIndex: 2 })}
                                disabled={updateSliMutation.isPending}
                              >
                                Select this SLI
                              </Button>
                            )}
                          </div>
                          <p className="mb-4">{sli.statement2}</p>
                          <div className="bg-muted/40 p-3 rounded-md">
                            <h4 className="text-sm font-medium mb-1">Rationale:</h4>
                            <p className="text-sm text-muted-foreground">{sli.rationale2}</p>
                          </div>
                        </div>
                        
                        <div className={`p-4 rounded-lg border ${sli.selectedSliIndex === 3 ? 'border-2 border-green-500 bg-green-50' : 'bg-card'}`}>
                          <div className="flex justify-between items-center">
                            <h3 className="text-lg font-medium text-secondary mb-2">{sli.title3}</h3>
                            {sli.selectedSliIndex === 3 ? (
                              <Badge className="bg-green-500">Selected</Badge>
                            ) : (
                              <Button 
                                variant="outline"
                                size="sm" 
                                onClick={() => updateSliMutation.mutate({ id: sli.id, selectedSliIndex: 3 })}
                                disabled={updateSliMutation.isPending}
                              >
                                Select this SLI
                              </Button>
                            )}
                          </div>
                          <p className="mb-4">{sli.statement3}</p>
                          <div className="bg-muted/40 p-3 rounded-md">
                            <h4 className="text-sm font-medium mb-1">Rationale:</h4>
                            <p className="text-sm text-muted-foreground">{sli.rationale3}</p>
                          </div>
                        </div>
                        
                        {sli.customSliText && (
                          <div className={`p-4 rounded-lg border ${sli.selectedSliIndex === null ? 'border-2 border-green-500 bg-green-50' : 'bg-card'}`}>
                            <div className="flex justify-between items-center">
                              <h3 className="text-lg font-medium text-secondary mb-2">Custom SLI</h3>
                              {sli.selectedSliIndex === null ? (
                                <Badge className="bg-green-500">Selected</Badge>
                              ) : (
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => updateSliMutation.mutate({ id: sli.id, selectedSliIndex: null })}
                                  disabled={updateSliMutation.isPending}
                                >
                                  Select Custom SLI
                                </Button>
                              )}
                            </div>
                            <p className="mb-4">{sli.customSliText}</p>
                          </div>
                        )}
                      </div>
                    </div>
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