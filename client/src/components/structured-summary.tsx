import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

// Props for the StructuredSummary component
interface StructuredSummaryProps {
  conversationId?: number;
  messageHistory?: Array<{ role: string; content: string }>;
  userProfile?: any;
  onClose?: () => void;
}

export default function StructuredSummary({
  conversationId,
  messageHistory,
  userProfile,
  onClose,
}: StructuredSummaryProps) {
  const { toast } = useToast();
  const [summary, setSummary] = useState<string>("");

  // Mutation for generating structured summary
  const structuredSummaryMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/chat/structured-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          messageHistory,
          userProfile,
        }),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to generate structured summary");
      }

      return await response.json();
    },
    onSuccess: (data) => {
      setSummary(data.structuredSummary);
    },
    onError: (error: Error) => {
      console.error("Error generating structured summary:", error);
      toast({
        title: "Error",
        description: `Failed to generate structured summary: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Generate summary if not already generated
  const handleGenerateSummary = () => {
    if (!summary && !structuredSummaryMutation.isPending) {
      structuredSummaryMutation.mutate();
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5">
        <CardTitle className="flex justify-between items-center">
          <span>Structured Client Information</span>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        {structuredSummaryMutation.isPending ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground text-center">
              Analyzing conversation and extracting structured information...
              <br />
              This may take a minute.
            </p>
          </div>
        ) : summary ? (
          <div className="whitespace-pre-wrap">
            {summary}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground text-center mb-4">
              Generate a structured summary of this conversation to capture key client information.
            </p>
            <Button onClick={handleGenerateSummary}>
              Generate Structured Summary
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}