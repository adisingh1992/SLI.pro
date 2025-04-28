import React, { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Sli } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import NavBar from "@/components/nav-bar";
import { 
  ArrowLeft, 
  Award, 
  CheckCircle2,
  Edit
} from "lucide-react";

import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  RadioGroup, 
  RadioGroupItem 
} from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { scrollToTop } from "@/lib/utils";

export default function SliSelectionPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [selectedSliIndex, setSelectedSliIndex] = useState<number | null>(null);
  const [customSli, setCustomSli] = useState<string>("");
  const [showCustomTextField, setShowCustomTextField] = useState(false);

  // Fetch user's SLIs
  const { data: slis, isLoading: slisLoading } = useQuery<Sli[]>({
    queryKey: ["/api/user/slis"],
    queryFn: async () => {
      const res = await fetch(`/api/user/slis`);
      if (!res.ok) throw new Error("Failed to fetch SLIs");
      return res.json();
    },
    enabled: !!user,
  });

  // Update SLI selection
  const updateSliMutation = useMutation({
    mutationFn: async ({ id, selectedSliIndex, customSliText }: { id: number; selectedSliIndex: number | null; customSliText?: string }) => {
      const res = await fetch(`/api/user/slis/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          selectedSliIndex,
          customSliText,
        }),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to update SLI selection");
      }
      
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/slis"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/sli"] });
      
      toast({
        title: "Success",
        description: "Your SLI selection has been updated",
      });
      
      // Navigate back to home page after successful update
      setTimeout(() => {
        scrollToTop();
        navigate("/");
      }, 1500);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSliSelection = (value: string) => {
    if (value === "custom") {
      setSelectedSliIndex(null);
      setShowCustomTextField(true);
    } else {
      setSelectedSliIndex(parseInt(value));
      setShowCustomTextField(false);
    }
  };

  const handleSubmit = () => {
    if (!slis || slis.length === 0) {
      toast({
        title: "Error",
        description: "No SLIs found to select from",
        variant: "destructive",
      });
      return;
    }

    const sli = slis[0]; // Use the first SLI since that's the most recent one

    if (showCustomTextField && !customSli.trim()) {
      toast({
        title: "Error",
        description: "Please enter your custom SLI text",
        variant: "destructive",
      });
      return;
    }

    if (!showCustomTextField && selectedSliIndex === null) {
      toast({
        title: "Error",
        description: "Please select an SLI option",
        variant: "destructive",
      });
      return;
    }

    updateSliMutation.mutate({
      id: sli.id,
      selectedSliIndex,
      customSliText: showCustomTextField ? customSli : undefined,
    });
  };

  // Redirect to home if no SLIs are available
  if (!slisLoading && (!slis || slis.length === 0)) {
    toast({
      title: "No SLIs Available",
      description: "You don't have any SLIs available to select from.",
    });
    navigate("/");
    return null;
  }

  // Initialize selection based on existing data
  React.useEffect(() => {
    if (slis && slis.length > 0) {
      const sli = slis[0]; // Use the first SLI
      
      if (sli.selectedSliIndex !== null) {
        setSelectedSliIndex(sli.selectedSliIndex);
        setShowCustomTextField(false);
      } else if (sli.customSliText) {
        // If there's custom SLI text, show the custom field and populate it
        setCustomSli(sli.customSliText);
        setShowCustomTextField(true);
      }
    }
  }, [slis]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavBar />
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6 flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              scrollToTop();
              navigate("/");
            }}
            className="h-8 w-8"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Select Your SLI</h1>
        </div>

        {slisLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2">Loading your SLIs...</span>
          </div>
        ) : slis && slis.length > 0 ? (
          <div className="space-y-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-primary" />
                  <span>Single Lasting Impressions</span>
                </CardTitle>
                <CardDescription>
                  Select one of the following options as your Single Lasting Impression (SLI) or create your own custom SLI.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RadioGroup 
                  className="space-y-6" 
                  value={showCustomTextField ? "custom" : selectedSliIndex?.toString()}
                  onValueChange={handleSliSelection}
                >
                  {/* SLI Option 1 */}
                  <div className="border rounded-lg p-4 bg-white hover:bg-gray-50 transition-colors">
                    <div className="flex items-start space-x-2">
                      <RadioGroupItem value="1" id="sli-1" className="mt-1" />
                      <div className="space-y-2 flex-1">
                        <Label htmlFor="sli-1" className="text-base font-medium">
                          {slis[0].title1}
                        </Label>
                        <p className="text-lg font-semibold text-secondary">{slis[0].statement1}</p>
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <h4 className="text-sm font-medium text-primary mb-1">Why this works:</h4>
                          <p className="text-sm text-gray-600">{slis[0].rationale1}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* SLI Option 2 */}
                  <div className="border rounded-lg p-4 bg-white hover:bg-gray-50 transition-colors">
                    <div className="flex items-start space-x-2">
                      <RadioGroupItem value="2" id="sli-2" className="mt-1" />
                      <div className="space-y-2 flex-1">
                        <Label htmlFor="sli-2" className="text-base font-medium">
                          {slis[0].title2}
                        </Label>
                        <p className="text-lg font-semibold text-secondary">{slis[0].statement2}</p>
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <h4 className="text-sm font-medium text-primary mb-1">Why this works:</h4>
                          <p className="text-sm text-gray-600">{slis[0].rationale2}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* SLI Option 3 */}
                  <div className="border rounded-lg p-4 bg-white hover:bg-gray-50 transition-colors">
                    <div className="flex items-start space-x-2">
                      <RadioGroupItem value="3" id="sli-3" className="mt-1" />
                      <div className="space-y-2 flex-1">
                        <Label htmlFor="sli-3" className="text-base font-medium">
                          {slis[0].title3}
                        </Label>
                        <p className="text-lg font-semibold text-secondary">{slis[0].statement3}</p>
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <h4 className="text-sm font-medium text-primary mb-1">Why this works:</h4>
                          <p className="text-sm text-gray-600">{slis[0].rationale3}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Custom SLI Option */}
                  <div className="border rounded-lg p-4 bg-white hover:bg-gray-50 transition-colors">
                    <div className="flex items-start space-x-2">
                      <RadioGroupItem value="custom" id="sli-custom" className="mt-1" />
                      <div className="space-y-2 w-full">
                        <Label htmlFor="sli-custom" className="text-base font-medium flex items-center">
                          <Edit className="h-4 w-4 mr-1" />
                          Custom SLI
                        </Label>
                        {showCustomTextField && (
                          <Textarea
                            placeholder="Write your own SLI here..."
                            className="mt-2 w-full"
                            value={customSli}
                            onChange={(e) => setCustomSli(e.target.value)}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </RadioGroup>

                <div className="flex justify-between mt-8">
                  <Button
                    variant="outline"
                    onClick={() => {
                      scrollToTop();
                      navigate("/");
                    }}
                  >
                    Cancel
                  </Button>
                  <div className="space-x-3">
                    <Button
                      variant="secondary"
                      disabled={updateSliMutation.isPending}
                      onClick={() => {
                        toast({
                          title: "Refine SLI",
                          description: "This feature will be available soon.",
                        });
                      }}
                    >
                      Refine SLI
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      disabled={updateSliMutation.isPending}

                    >
                      {updateSliMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save Selection"
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card>
            <CardContent className="p-6">
              <div className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Award className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mt-3 text-lg font-medium">No SLIs Available</h3>
                <p className="mt-2 text-sm text-gray-500">
                  You currently don't have any SLIs to select from.
                </p>
                <Button
                  className="mt-4"
                  onClick={() => {
                    scrollToTop();
                    navigate("/");
                  }}
                >
                  Return to Home
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}