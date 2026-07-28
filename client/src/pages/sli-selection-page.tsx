import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import NavBar from "@/components/nav-bar";
import {
  ArrowLeft,
  Award,
  CheckCircle2,
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
import { Loader2 } from "lucide-react";
import { scrollToTop } from "@/lib/utils";

/**
 * Wing SLI record. Each candidate, custom statement and refinement is its own
 * row with lineage, replacing the MVP's single row of title1/statement1/…
 */
type SliRecord = {
  id: number;
  title: string;
  statement: string;
  rationale: string | null;
  source: "generated" | "custom" | "refined" | "refresh";
  status: "candidate" | "selected" | "active" | "superseded";
  parentSliId: number | null;
  refinementCount: number;
  createdAt: string;
};

export default function SliSelectionPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: slis, isLoading: slisLoading } = useQuery<SliRecord[]>({
    queryKey: ["/api/user/slis"],
    queryFn: async () => {
      const res = await fetch("/api/user/slis", { credentials: "include" });
      if (res.status === 404) return [];
      if (!res.ok) throw new Error("Failed to fetch SLIs");
      return res.json();
    },
    enabled: !!user,
  });

  const candidates = (slis ?? []).filter((s) => s.status === "candidate");
  const active = (slis ?? []).find(
    (s) => s.status === "active" || s.status === "selected",
  );
  // A refinement descends from a parent; showing both tells the story.
  const parentOfActive =
    active?.parentSliId != null
      ? (slis ?? []).find((s) => s.id === active.parentSliId)
      : undefined;

  /** Activation is now "mark this record active", not "set an index". */
  const selectSliMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/user/slis/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ activate: true }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
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
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!selectedId) {
      toast({
        title: "Error",
        description: "Please select an SLI option",
        variant: "destructive",
      });
      return;
    }
    selectSliMutation.mutate(selectedId);
  };

  // Pre-select whatever is currently in force.
  useEffect(() => {
    if (active) setSelectedId(active.id);
  }, [active?.id]);

  const hasAny = (slis ?? []).length > 0;
  const isRefined = active?.source === "refined";

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
        ) : hasAny ? (
          <div className="space-y-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-primary" />
                  <span>Single Lasting Impressions</span>
                </CardTitle>
                <CardDescription>
                  Select one of the following options as your Single Lasting Impression (SLI).
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isRefined ? (
                  <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-start">
                      <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 mr-2" />
                      <div>
                        <h3 className="font-medium text-green-800">SLI Already Refined</h3>
                        <p className="text-sm text-green-700 mt-1">
                          You've already selected and refined your SLI. You can view your refined SLI on the home page.
                        </p>

                        {parentOfActive && (
                          <div className="mt-3 mb-2">
                            <h4 className="text-xs font-medium uppercase text-green-700">Original SLI</h4>
                            <div className="mt-1 p-3 bg-white border border-green-100 rounded-md">
                              <p className="text-sm text-gray-600">{parentOfActive.statement}</p>
                            </div>
                          </div>
                        )}

                        <div>
                          <h4 className="text-xs font-medium uppercase text-green-700">Refined SLI</h4>
                          <div className="mt-1 p-3 bg-white border border-green-100 rounded-md">
                            <p className="font-medium text-secondary">{active?.statement}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <RadioGroup
                    className="space-y-6"
                    value={selectedId?.toString()}
                    onValueChange={(v) => setSelectedId(parseInt(v))}
                  >
                    {(candidates.length ? candidates : (slis ?? [])).map((sli, i) => (
                      <div
                        key={sli.id}
                        className="border rounded-lg p-4 bg-white hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-start space-x-2">
                          <RadioGroupItem
                            value={sli.id.toString()}
                            id={`sli-${sli.id}`}
                            className="mt-1"
                          />
                          <div className="space-y-2 flex-1">
                            <Label htmlFor={`sli-${sli.id}`} className="text-base font-medium">
                              {sli.title}
                            </Label>
                            <p className="text-lg font-semibold text-secondary">{sli.statement}</p>
                            {sli.rationale && (
                              <div className="mt-3 pt-3 border-t border-gray-100">
                                <h4 className="text-sm font-medium text-primary mb-1">Why this works:</h4>
                                <p className="text-sm text-gray-600">{sli.rationale}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </RadioGroup>
                )}

                <div className="flex justify-between mt-8">
                  <Button
                    variant="outline"
                    onClick={() => {
                      scrollToTop();
                      navigate("/");
                    }}
                  >
                    {isRefined ? "Return to Home" : "Cancel"}
                  </Button>

                  {!isRefined && (
                    <div className="space-x-3">
                      <Button
                        variant="secondary"
                        disabled={selectSliMutation.isPending || !selectedId}
                        onClick={() => {
                          if (!selectedId) {
                            toast({
                              title: "Selection Required",
                              description: "Please select an SLI first before refining.",
                              variant: "destructive",
                            });
                            return;
                          }
                          // Activate the choice, then move to refinement.
                          selectSliMutation.mutate(selectedId, {
                            onSuccess: () => {
                              scrollToTop();
                              navigate("/sli-refinement");
                            },
                          });
                        }}
                      >
                        Refine SLI
                      </Button>
                      <Button onClick={handleSubmit} disabled={selectSliMutation.isPending}>
                        {selectSliMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          "Save Selection"
                        )}
                      </Button>
                    </div>
                  )}
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
