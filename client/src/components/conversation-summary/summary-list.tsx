import React from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { ConversationSummary } from '@shared/schema';
import { Eye, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function SummaryList() {
  const [, navigate] = useLocation();

  // Fetch the conversation summaries
  const { data: summaries, isLoading, isError, refetch } = useQuery<ConversationSummary[]>({
    queryKey: ['/api/conversation-summaries'],
    queryFn: () => fetch('/api/conversation-summaries').then(res => {
      if (!res.ok) throw new Error('Failed to load summaries');
      return res.json();
    }),
  });

  if (isLoading) {
    return <SummaryListSkeleton />;
  }

  if (isError) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          Failed to load conversation summaries. Please try again.
          <Button variant="outline" className="mt-2" onClick={() => refetch()}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!summaries || summaries.length === 0) {
    return (
      <div className="text-center py-10">
        <h2 className="text-xl font-semibold mb-4">No conversation summaries yet</h2>
        <p className="text-muted-foreground mb-6">
          Start a conversation and complete it to generate a summary.
        </p>
        <Button onClick={() => navigate('/chat')} variant="default">
          Start a Conversation
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Conversation Summaries</h2>
        <Button onClick={() => navigate('/chat')} variant="default">
          New Conversation
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {summaries.map((summary) => (
          <SummaryCard key={summary.id} summary={summary} />
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ summary }: { summary: ConversationSummary }) {
  const [, navigate] = useLocation();

  const formatDate = (dateString: string | Date) => {
    try {
      const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
      return formatDistanceToNow(date, { addSuffix: true });
    } catch (error) {
      return 'Unknown date';
    }
  };

  const getHighlights = (summary: ConversationSummary) => {
    const highlights = [];

    // Add client name if available
    if (summary.basicInfo?.name) {
      highlights.push(`Client: ${summary.basicInfo.name}`);
    }

    // Add role if available
    if (summary.basicInfo?.currentRole) {
      highlights.push(`Role: ${summary.basicInfo.currentRole}`);
    }

    // Add industry if available
    if (summary.basicInfo?.industry) {
      highlights.push(`Industry: ${summary.basicInfo.industry}`);
    }

    // Add function if available
    if (summary.functionalCategorization?.primaryFunction) {
      highlights.push(`Function: ${summary.functionalCategorization.primaryFunction}`);
    }

    // Add career goal if available
    if (summary.careerTransition?.desiredState) {
      highlights.push(`Goal: ${summary.careerTransition.desiredState}`);
    }

    return highlights.length > 0 ? highlights : ['No details available'];
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="truncate">
          {summary.basicInfo?.name || 'Unnamed Client'}'s Summary
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Created {formatDate(summary.createdAt)}
        </p>
      </CardHeader>
      <CardContent className="flex-grow">
        <ul className="space-y-1 text-sm">
          {getHighlights(summary).map((highlight, index) => (
            <li key={index} className="text-muted-foreground">
              {highlight}
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <div className="w-full flex justify-end">
          <Button 
            onClick={() => navigate(`/conversations/${summary.conversationId}/summary`)}
            variant="outline"
          >
            <Eye className="mr-2 h-4 w-4" /> View Details
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

function SummaryListSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-40" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i} className="h-full">
            <CardHeader>
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </CardContent>
            <CardFooter>
              <div className="w-full flex justify-end">
                <Skeleton className="h-10 w-32" />
              </div>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}