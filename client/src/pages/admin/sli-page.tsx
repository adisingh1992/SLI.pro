import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Sli } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import Layout from "./layout";
import { ArrowLeft, RefreshCw, CheckCircle2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

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

  // Handle selecting an SLI
  const handleSelectSli = (sli: Sli, index: number | null) => {
    updateSliMutation.mutate({ id: sli.id, selectedSliIndex: index });
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
                    <Tabs defaultValue="statements" className="w-full">
                      <TabsList className="mb-4">
                        <TabsTrigger value="statements">SLI Statements</TabsTrigger>
                        <TabsTrigger value="selection">Selection</TabsTrigger>
                        <TabsTrigger value="sources">Document Analysis</TabsTrigger>
                      </TabsList>
                      <TabsContent value="statements" className="space-y-4">
                        <div className="grid grid-cols-1 gap-6">
                          <div className="p-4 rounded-lg border bg-card">
                            <h3 className="text-lg font-medium text-primary mb-2">{sli.title1}</h3>
                            <p className="mb-4">{sli.statement1}</p>
                            <div className="bg-muted/40 p-3 rounded-md">
                              <h4 className="text-sm font-medium mb-1">Rationale:</h4>
                              <p className="text-sm text-muted-foreground">{sli.rationale1}</p>
                            </div>
                          </div>
                          
                          <div className="p-4 rounded-lg border bg-card">
                            <h3 className="text-lg font-medium text-primary mb-2">{sli.title2}</h3>
                            <p className="mb-4">{sli.statement2}</p>
                            <div className="bg-muted/40 p-3 rounded-md">
                              <h4 className="text-sm font-medium mb-1">Rationale:</h4>
                              <p className="text-sm text-muted-foreground">{sli.rationale2}</p>
                            </div>
                          </div>
                          
                          <div className="p-4 rounded-lg border bg-card">
                            <h3 className="text-lg font-medium text-primary mb-2">{sli.title3}</h3>
                            <p className="mb-4">{sli.statement3}</p>
                            <div className="bg-muted/40 p-3 rounded-md">
                              <h4 className="text-sm font-medium mb-1">Rationale:</h4>
                              <p className="text-sm text-muted-foreground">{sli.rationale3}</p>
                            </div>
                          </div>
                        </div>
                      </TabsContent>
                      <TabsContent value="selection">
                        <div className="space-y-6">
                          <p className="text-muted-foreground">
                            Select the most impactful SLI statement to be used as the primary single lasting impression for this user:
                          </p>
                          <RadioGroup 
                            value={sli.selectedSliIndex !== null ? sli.selectedSliIndex.toString() : undefined}
                            onValueChange={(value) => handleSelectSli(sli, value ? parseInt(value) : null)}
                            className="space-y-6"
                          >
                            <div className="flex items-start space-x-3 p-4 rounded-lg border">
                              <RadioGroupItem value="0" id={`sli-${sli.id}-0`} className="mt-1" />
                              <div className="grid gap-1.5">
                                <Label htmlFor={`sli-${sli.id}-0`} className="font-medium text-primary">
                                  {sli.title1}
                                </Label>
                                <p className="text-sm text-muted-foreground mb-1">{sli.statement1}</p>
                              </div>
                            </div>
                            
                            <div className="flex items-start space-x-3 p-4 rounded-lg border">
                              <RadioGroupItem value="1" id={`sli-${sli.id}-1`} className="mt-1" />
                              <div className="grid gap-1.5">
                                <Label htmlFor={`sli-${sli.id}-1`} className="font-medium text-primary">
                                  {sli.title2}
                                </Label>
                                <p className="text-sm text-muted-foreground mb-1">{sli.statement2}</p>
                              </div>
                            </div>
                            
                            <div className="flex items-start space-x-3 p-4 rounded-lg border">
                              <RadioGroupItem value="2" id={`sli-${sli.id}-2`} className="mt-1" />
                              <div className="grid gap-1.5">
                                <Label htmlFor={`sli-${sli.id}-2`} className="font-medium text-primary">
                                  {sli.title3}
                                </Label>
                                <p className="text-sm text-muted-foreground mb-1">{sli.statement3}</p>
                              </div>
                            </div>
                          </RadioGroup>
                        </div>
                      </TabsContent>
                      
                      <TabsContent value="sources">
                        <div className="space-y-6">
                          <p className="text-muted-foreground mb-6">
                            The SLI generation process analyzed the following documents and user data to create personalized SLI options:
                          </p>
                          
                          {/* Document Analysis Section */}
                          <div className="space-y-6">
                            {/* Resume Analysis */}
                            {userData?.documents?.find(doc => doc.type === 'resume') ? (
                              <div className="rounded-lg border overflow-hidden">
                                <div className="bg-muted px-4 py-3">
                                  <h3 className="font-semibold flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-file-text"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>
                                    Resume Analysis
                                  </h3>
                                </div>
                                <div className="p-4 max-h-64 overflow-y-auto bg-card">
                                  <p className="whitespace-pre-wrap text-sm">
                                    {userData?.documents.find(doc => doc.type === 'resume')?.analysisContent || 
                                    "AI analyzed this resume to extract key professional information, including work experience, skills, education, and achievements. This information helped generate SLIs that reflect the user's professional background and qualifications."}
                                  </p>
                                </div>
                              </div>
                            ) : null}
                            
                            {/* LinkedIn Analysis */}
                            {userData?.documents?.find(doc => doc.type === 'linkedin') ? (
                              <div className="rounded-lg border overflow-hidden">
                                <div className="bg-muted px-4 py-3">
                                  <h3 className="font-semibold flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-linkedin"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/></svg>
                                    LinkedIn Profile Analysis
                                  </h3>
                                </div>
                                <div className="p-4 max-h-64 overflow-y-auto bg-card">
                                  <p className="whitespace-pre-wrap text-sm">
                                    {userData?.documents.find(doc => doc.type === 'linkedin')?.analysisContent || 
                                    "AI analyzed this LinkedIn profile to understand the user's professional network, endorsements, recommendations, and public professional presence. This information contributed to creating SLIs that align with the user's professional brand."}
                                  </p>
                                </div>
                              </div>
                            ) : null}
                            
                            {/* Additional Documents Analysis */}
                            {userData?.documents?.filter(doc => doc.type !== 'resume' && doc.type !== 'linkedin').length > 0 ? (
                              <div className="rounded-lg border overflow-hidden">
                                <div className="bg-muted px-4 py-3">
                                  <h3 className="font-semibold flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-files"><path d="M15.5 2H8.6c-.4 0-.8.2-1.1.5-.3.3-.5.7-.5 1.1v12.8c0 .4.2.8.5 1.1.3.3.7.5 1.1.5h9.8c.4 0 .8-.2 1.1-.5.3-.3.5-.7.5-1.1V6.5L15.5 2z"/><path d="M3 7.6v12.8c0 .4.2.8.5 1.1.3.3.7.5 1.1.5h9.8"/><path d="M15 2v5h5"/></svg>
                                    Additional Documents Analysis
                                  </h3>
                                </div>
                                <div className="p-4 max-h-64 overflow-y-auto bg-card">
                                  {userData?.documents?.filter(doc => doc.type !== 'resume' && doc.type !== 'linkedin').map((doc, i) => (
                                    <div key={i} className="mb-4 pb-4 border-b last:border-b-0 last:mb-0 last:pb-0">
                                      <h4 className="font-medium mb-1">{doc.name}</h4>
                                      <p className="whitespace-pre-wrap text-sm">
                                        {doc.analysisContent || 
                                        "AI analyzed this document to extract relevant information for SLI generation, complementing insights from the resume and LinkedIn profile."}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            
                            {/* Questionnaire Analysis */}
                            {userData?.questionnaire ? (
                              <div className="rounded-lg border overflow-hidden">
                                <div className="bg-muted px-4 py-3">
                                  <h3 className="font-semibold flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-clipboard-list"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>
                                    Questionnaire Analysis
                                  </h3>
                                </div>
                                <div className="p-4 max-h-64 overflow-y-auto bg-card">
                                  <p className="whitespace-pre-wrap text-sm">
                                    The AI analyzed the following questionnaire responses:
                                  </p>
                                  <div className="mt-2 space-y-2">
                                    {userData.questionnaire.industry && (
                                      <div className="bg-muted/40 p-2 rounded">
                                        <span className="font-medium">Industry:</span> {userData.questionnaire.industry}
                                      </div>
                                    )}
                                    {userData.questionnaire.background && (
                                      <div className="bg-muted/40 p-2 rounded">
                                        <span className="font-medium">Background:</span> {userData.questionnaire.background}
                                      </div>
                                    )}
                                    {userData.questionnaire.goals && (
                                      <div className="bg-muted/40 p-2 rounded">
                                        <span className="font-medium">Goals:</span> {userData.questionnaire.goals}
                                      </div>
                                    )}
                                    {userData.questionnaire.aspirations && (
                                      <div className="bg-muted/40 p-2 rounded">
                                        <span className="font-medium">Aspirations:</span> {userData.questionnaire.aspirations}
                                      </div>
                                    )}
                                    {userData.questionnaire.challenges && (
                                      <div className="bg-muted/40 p-2 rounded">
                                        <span className="font-medium">Challenges:</span> {userData.questionnaire.challenges}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ) : null}
                            
                            {/* Conversation Summary */}
                            {userData?.conversationSummaries && userData.conversationSummaries.length > 0 ? (
                              <div className="rounded-lg border overflow-hidden">
                                <div className="bg-muted px-4 py-3">
                                  <h3 className="font-semibold flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-message-square"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                                    Conversation Insights
                                  </h3>
                                </div>
                                <div className="p-4 max-h-64 overflow-y-auto bg-card">
                                  <p className="whitespace-pre-wrap text-sm">
                                    The AI incorporated insights from the user's conversations with the platform, including career aspirations, strengths, challenges, and specific goals discussed during those interactions.
                                  </p>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </TabsContent>
                    </Tabs>
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