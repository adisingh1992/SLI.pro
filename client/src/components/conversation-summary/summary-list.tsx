import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FoundationSession } from '@shared/schema';
import { 
  Target, 
  Award, 
  BookOpen, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  RefreshCw,
  Users,
  TrendingUp,
  MessageSquare,
  Lightbulb,
  Star
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatDistanceToNow } from 'date-fns';

interface SummaryListProps {
  userId?: number;
  isAdmin?: boolean;
}

export default function SummaryList({ userId, isAdmin = false }: SummaryListProps = {}) {
  // Determine API endpoint based on admin access and userId
  const endpoint = isAdmin && userId 
    ? `/api/admin/users/${userId}/foundation-sessions`
    : '/api/foundation-sessions';

  // Fetch the foundation sessions
  const { data: sessions, isLoading, isError, refetch } = useQuery<FoundationSession[]>({
    queryKey: [endpoint],
  });

  if (isLoading) {
    return <FoundationSessionsSkeleton />;
  }

  if (isError) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          Failed to load foundation sessions. Please try again.
          <Button variant="outline" className="mt-2" onClick={() => refetch()}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // Organize sessions by session number
  const sessionsByNumber = sessions?.reduce((acc, session) => {
    acc[session.sessionNumber] = session;
    return acc;
  }, {} as Record<number, FoundationSession>) || {};

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Foundation Sessions Summary</h1>
        <p className="text-muted-foreground">Your comprehensive professional development journey</p>
      </div>

      {/* Session 1: Functional Identity Mapping */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-blue-800 flex items-center gap-2">
          <Target className="h-6 w-6" />
          Foundation Session 1: Functional Identity Mapping Summary
        </h2>
        <Session1Card session={sessionsByNumber[1]} />
      </div>

      {/* Session 2: Professional Credibility Assessment */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-green-800 flex items-center gap-2">
          <Award className="h-6 w-6" />
          Foundation Session 2: Professional Credibility Assessment Summary
        </h2>
        <Session2Card session={sessionsByNumber[2]} />
      </div>

      {/* Session 3: Positioning Story Development */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-purple-800 flex items-center gap-2">
          <BookOpen className="h-6 w-6" />
          Foundation Session 3: Positioning Story Development Summary
        </h2>
        <Session3Card session={sessionsByNumber[3]} />
      </div>
    </div>
  );
}

// Session 1 Card Component
function Session1Card({ session }: { session?: FoundationSession }) {
  if (!session || session.status !== 'completed') {
    return (
      <Card className="border-blue-200 bg-blue-50/30">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center text-center py-8">
            <div>
              <Clock className="h-12 w-12 text-blue-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-blue-800 mb-2">Session Not Completed</h3>
              <p className="text-blue-600">Complete your functional identity mapping session to see your summary here.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const data = session.completionData;
  
  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardHeader className="bg-blue-100/50">
        <div className="flex justify-between items-center">
          <CardTitle className="text-blue-800 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-blue-600" />
            Functional Identity Mapping Complete
          </CardTitle>
          <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300">
            Completed {session.completedAt ? formatDistanceToNow(new Date(session.completedAt), { addSuffix: true }) : ''}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Primary Function */}
          {data?.primaryFunction && (
            <div className="space-y-2">
              <h4 className="font-semibold text-blue-800 flex items-center gap-2">
                <Target className="h-4 w-4" />
                Primary Function
              </h4>
              <Badge className="bg-blue-600 text-white">{data.primaryFunction}</Badge>
            </div>
          )}
          
          {/* Secondary Function */}
          {data?.secondaryFunction && (
            <div className="space-y-2">
              <h4 className="font-semibold text-blue-800 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Secondary Function
              </h4>
              <Badge variant="outline" className="border-blue-300 text-blue-700">{data.secondaryFunction}</Badge>
            </div>
          )}
          
          {/* Functional Split */}
          {data?.functionalSplit && (
            <div className="space-y-2 md:col-span-2">
              <h4 className="font-semibold text-blue-800 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Functional Split
              </h4>
              <div className="flex gap-4">
                <Badge className="bg-blue-600 text-white">
                  {data.functionalSplit.primary}% Primary
                </Badge>
                <Badge variant="outline" className="border-blue-300 text-blue-700">
                  {data.functionalSplit.secondary}% Secondary
                </Badge>
              </div>
            </div>
          )}
          
          {/* Commitment Statement */}
          {data?.commitmentStatement && (
            <div className="space-y-2 md:col-span-2">
              <h4 className="font-semibold text-blue-800 flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Commitment Statement
              </h4>
              <p className="text-sm text-blue-700 bg-blue-100/50 p-3 rounded-md">
                "{data.commitmentStatement}"
              </p>
            </div>
          )}
          
          {/* Key Insights */}
          {data?.keyInsights && data.keyInsights.length > 0 && (
            <div className="space-y-2 md:col-span-2">
              <h4 className="font-semibold text-blue-800 flex items-center gap-2">
                <Lightbulb className="h-4 w-4" />
                Key Insights
              </h4>
              <ul className="space-y-1">
                {data.keyInsights.map((insight, index) => (
                  <li key={index} className="text-sm text-blue-700 flex items-start gap-2">
                    <span className="text-blue-500 mt-1">•</span>
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Confidence Level */}
          {data?.confidence && (
            <div className="space-y-2">
              <h4 className="font-semibold text-blue-800 flex items-center gap-2">
                <Star className="h-4 w-4" />
                Confidence Level
              </h4>
              <Badge className="bg-blue-600 text-white">{data.confidence}/10</Badge>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Session 2 Card Component
function Session2Card({ session }: { session?: FoundationSession }) {
  if (!session || session.status !== 'completed') {
    return (
      <Card className="border-green-200 bg-green-50/30">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center text-center py-8">
            <div>
              <Clock className="h-12 w-12 text-green-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-green-800 mb-2">Session Not Completed</h3>
              <p className="text-green-600">Complete your credibility assessment session to see your summary here.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const data = session.completionData;
  
  return (
    <Card className="border-green-200 bg-green-50/30">
      <CardHeader className="bg-green-100/50">
        <div className="flex justify-between items-center">
          <CardTitle className="text-green-800 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Professional Credibility Assessment Complete
          </CardTitle>
          <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
            Completed {session.completedAt ? formatDistanceToNow(new Date(session.completedAt), { addSuffix: true }) : ''}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Credibility Tier */}
          {data?.credibilityTier && (
            <div className="space-y-2">
              <h4 className="font-semibold text-green-800 flex items-center gap-2">
                <Award className="h-4 w-4" />
                Credibility Tier
              </h4>
              <Badge className="bg-green-600 text-white">Tier {data.credibilityTier}/5</Badge>
            </div>
          )}
          
          {/* Brand Claim */}
          {data?.brandClaim && (
            <div className="space-y-2 md:col-span-2">
              <h4 className="font-semibold text-green-800 flex items-center gap-2">
                <Target className="h-4 w-4" />
                Brand Claim
              </h4>
              <p className="text-sm text-green-700 bg-green-100/50 p-3 rounded-md">
                "{data.brandClaim}"
              </p>
            </div>
          )}
          
          {/* Check-Worthy Reason */}
          {data?.checkWorthyReason && (
            <div className="space-y-2 md:col-span-2">
              <h4 className="font-semibold text-green-800 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Check-Worthy Reason
              </h4>
              <p className="text-sm text-green-700 bg-green-100/50 p-3 rounded-md">
                {data.checkWorthyReason}
              </p>
            </div>
          )}
          
          {/* Proof Bullets */}
          {data?.proofBullets && data.proofBullets.length > 0 && (
            <div className="space-y-2 md:col-span-2">
              <h4 className="font-semibold text-green-800 flex items-center gap-2">
                <Star className="h-4 w-4" />
                Proof Points
              </h4>
              <ol className="space-y-2">
                {data.proofBullets.map((bullet, index) => (
                  <li key={index} className="text-sm text-green-700 flex items-start gap-3">
                    <Badge variant="outline" className="border-green-300 text-green-700 text-xs mt-0.5">
                      {index + 1}
                    </Badge>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          
          {/* Next Steps */}
          {data?.nextSteps && data.nextSteps.length > 0 && (
            <div className="space-y-2 md:col-span-2">
              <h4 className="font-semibold text-green-800 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Next Steps
              </h4>
              <ul className="space-y-1">
                {data.nextSteps.map((step, index) => (
                  <li key={index} className="text-sm text-green-700 flex items-start gap-2">
                    <span className="text-green-500 mt-1">→</span>
                    {step}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Session 3 Card Component
function Session3Card({ session }: { session?: FoundationSession }) {
  if (!session || session.status !== 'completed') {
    return (
      <Card className="border-purple-200 bg-purple-50/30">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center text-center py-8">
            <div>
              <Clock className="h-12 w-12 text-purple-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-purple-800 mb-2">Session Not Completed</h3>
              <p className="text-purple-600">Complete your positioning story session to see your summary here.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const data = session.completionData;
  
  return (
    <Card className="border-purple-200 bg-purple-50/30">
      <CardHeader className="bg-purple-100/50">
        <div className="flex justify-between items-center">
          <CardTitle className="text-purple-800 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-purple-600" />
            Positioning Story Development Complete
          </CardTitle>
          <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-300">
            Completed {session.completedAt ? formatDistanceToNow(new Date(session.completedAt), { addSuffix: true }) : ''}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="space-y-6">
          {/* Signature Story */}
          {data?.signatureStory && (
            <div className="space-y-4">
              <h4 className="font-semibold text-purple-800 flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Signature Story: {data.signatureStory.title}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h5 className="font-medium text-purple-700">Context</h5>
                  <p className="text-sm text-purple-600 bg-purple-100/50 p-3 rounded-md">
                    {data.signatureStory.context}
                  </p>
                </div>
                <div className="space-y-2">
                  <h5 className="font-medium text-purple-700">Challenge</h5>
                  <p className="text-sm text-purple-600 bg-purple-100/50 p-3 rounded-md">
                    {data.signatureStory.challenge}
                  </p>
                </div>
                <div className="space-y-2">
                  <h5 className="font-medium text-purple-700">Approach</h5>
                  <p className="text-sm text-purple-600 bg-purple-100/50 p-3 rounded-md">
                    {data.signatureStory.approach}
                  </p>
                </div>
                <div className="space-y-2">
                  <h5 className="font-medium text-purple-700">Outcome</h5>
                  <p className="text-sm text-purple-600 bg-purple-100/50 p-3 rounded-md">
                    {data.signatureStory.outcome}
                  </p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <h5 className="font-medium text-purple-700">Repeatability</h5>
                  <p className="text-sm text-purple-600 bg-purple-100/50 p-3 rounded-md">
                    {data.signatureStory.repeatability}
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {/* Content Angles */}
          {data?.contentAngles && data.contentAngles.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-semibold text-purple-800 flex items-center gap-2">
                <Lightbulb className="h-4 w-4" />
                Content Angles
              </h4>
              <div className="flex flex-wrap gap-2">
                {data.contentAngles.map((angle, index) => (
                  <Badge key={index} className="bg-purple-600 text-white">
                    {angle}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          {/* Methodology */}
          {data?.methodology && (
            <div className="space-y-2">
              <h4 className="font-semibold text-purple-800 flex items-center gap-2">
                <Target className="h-4 w-4" />
                Methodology
              </h4>
              <p className="text-sm text-purple-700 bg-purple-100/50 p-3 rounded-md">
                {data.methodology}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Loading Skeleton Component
function FoundationSessionsSkeleton() {
  return (
    <div className="space-y-8">
      <div className="text-center mb-8">
        <Skeleton className="h-8 w-96 mx-auto mb-2" />
        <Skeleton className="h-4 w-64 mx-auto" />
      </div>
      
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-4">
          <Skeleton className="h-8 w-80" />
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-64" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
                <Skeleton className="h-16 w-full" />
              </div>
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}