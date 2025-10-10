import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FoundationSession, EnhancementModule } from '@shared/schema';
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
  Star,
  Sparkles,
  Network,
  Rocket
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatDistanceToNow } from 'date-fns';

interface SummaryListProps {
  userId?: number;
  isAdmin?: boolean;
}

export default function SummaryList({ userId, isAdmin = false }: SummaryListProps = {}) {
  // Determine API endpoints based on admin access and userId
  const sessionsEndpoint = isAdmin && userId 
    ? `/api/admin/users/${userId}/foundation-sessions`
    : '/api/foundation-sessions';
  
  const modulesEndpoint = isAdmin && userId
    ? `/api/admin/users/${userId}/enhancement-modules`
    : '/api/enhancement-modules';

  // Fetch the foundation sessions
  const { data: sessions, isLoading: sessionsLoading, isError: sessionsError, refetch: refetchSessions } = useQuery<FoundationSession[]>({
    queryKey: [sessionsEndpoint],
  });

  // Fetch the enhancement modules
  const { data: modules, isLoading: modulesLoading, isError: modulesError, refetch: refetchModules } = useQuery<EnhancementModule[]>({
    queryKey: [modulesEndpoint],
  });

  const isLoading = sessionsLoading || modulesLoading;
  const isError = sessionsError || modulesError;

  if (isLoading) {
    return <FoundationSessionsSkeleton />;
  }

  if (isError) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          Failed to load summaries. Please try again.
          <Button variant="outline" className="mt-2" onClick={() => { refetchSessions(); refetchModules(); }}>
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

  // Organize modules by module code
  const modulesByCode = modules?.reduce((acc, module) => {
    acc[module.moduleCode] = module;
    return acc;
  }, {} as Record<string, EnhancementModule>) || {};

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Professional Development Summary</h1>
        <p className="text-muted-foreground">Your comprehensive journey through foundation sessions and enhancement modules</p>
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

      {/* Divider */}
      <div className="border-t border-gray-200 my-8"></div>

      {/* Enhancement Modules Section */}
      <div className="space-y-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold mb-2">Enhancement Modules</h2>
          <p className="text-muted-foreground">Optional advanced modules for specialized professional growth</p>
        </div>

        {/* Module A: Digital Behavior Analysis */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-teal-800 flex items-center gap-2">
            <Sparkles className="h-6 w-6" />
            Module A: Digital Behavior & LinkedIn Content Strategy
          </h2>
          <ModuleACard module={modulesByCode['A']} />
        </div>

        {/* Module B: Network Position Mapping */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-orange-800 flex items-center gap-2">
            <Network className="h-6 w-6" />
            Module B: Network Position Mapping
          </h2>
          <ModuleBCard module={modulesByCode['B']} />
        </div>

        {/* Module C: Career Aspiration Alignment */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-indigo-800 flex items-center gap-2">
            <Rocket className="h-6 w-6" />
            Module C: Career Aspiration Alignment
          </h2>
          <ModuleCCard module={modulesByCode['C']} />
        </div>
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

// Module A Card Component
function ModuleACard({ module }: { module?: EnhancementModule }) {
  if (!module || module.status !== 'completed') {
    return (
      <Card className="border-teal-200 bg-teal-50/30">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center text-center py-8">
            <div>
              <Clock className="h-12 w-12 text-teal-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-teal-800 mb-2">Module Not Completed</h3>
              <p className="text-teal-600">Complete Module A to see your digital behavior and LinkedIn strategy summary here.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const data = module.completionData;
  
  return (
    <Card className="border-teal-200 bg-teal-50/30">
      <CardHeader className="bg-teal-100/50">
        <div className="flex justify-between items-center">
          <CardTitle className="text-teal-800 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-teal-600" />
            Digital Behavior & LinkedIn Strategy Complete
          </CardTitle>
          <Badge variant="outline" className="bg-teal-100 text-teal-700 border-teal-300">
            Completed {module.completedAt ? formatDistanceToNow(new Date(module.completedAt), { addSuffix: true }) : ''}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Brand Claim */}
          {data?.brandClaim && (
            <div className="space-y-2 md:col-span-2">
              <h4 className="font-semibold text-teal-800 flex items-center gap-2">
                <Target className="h-4 w-4" />
                Brand Claim
              </h4>
              <p className="text-sm text-teal-700 bg-teal-100/50 p-3 rounded-md">
                "{data.brandClaim}"
              </p>
            </div>
          )}
          
          {/* LinkedIn Optimization */}
          {data?.linkedinOptimization && (
            <div className="space-y-2 md:col-span-2">
              <h4 className="font-semibold text-teal-800 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                LinkedIn Profile Optimization
              </h4>
              <div className="space-y-3">
                {data.linkedinOptimization.headline && (
                  <div>
                    <h5 className="font-medium text-teal-700 text-xs mb-1">Headline</h5>
                    <p className="text-sm text-teal-600 bg-teal-100/50 p-2 rounded-md">
                      {data.linkedinOptimization.headline}
                    </p>
                  </div>
                )}
                {data.linkedinOptimization.profileScore && (
                  <div>
                    <h5 className="font-medium text-teal-700 text-xs mb-1">Profile Score</h5>
                    <Badge className="bg-teal-600 text-white">
                      {data.linkedinOptimization.profileScore}/10
                    </Badge>
                  </div>
                )}
                {data.linkedinOptimization.keyImprovements && data.linkedinOptimization.keyImprovements.length > 0 && (
                  <div>
                    <h5 className="font-medium text-teal-700 text-xs mb-1">Key Improvements</h5>
                    <ul className="space-y-1">
                      {data.linkedinOptimization.keyImprovements.map((improvement, index) => (
                        <li key={index} className="text-sm text-teal-700 flex items-start gap-2">
                          <span className="text-teal-500 mt-1">→</span>
                          {improvement}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Featured Article Seeds */}
          {data?.featuredArticleSeeds && data.featuredArticleSeeds.length > 0 && (
            <div className="space-y-2 md:col-span-2">
              <h4 className="font-semibold text-teal-800 flex items-center gap-2">
                <Lightbulb className="h-4 w-4" />
                Featured Article Ideas
              </h4>
              <div className="flex flex-wrap gap-2">
                {data.featuredArticleSeeds.map((seed, index) => (
                  <Badge key={index} className="bg-teal-600 text-white">
                    {seed}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          {/* Content Strategy */}
          {data?.contentStrategy && (
            <div className="space-y-2 md:col-span-2">
              <h4 className="font-semibold text-teal-800 flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Content Strategy
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.contentStrategy.naturalFormats && data.contentStrategy.naturalFormats.length > 0 && (
                  <div>
                    <h5 className="font-medium text-teal-700 text-xs mb-1">Natural Formats</h5>
                    <div className="flex flex-wrap gap-1">
                      {data.contentStrategy.naturalFormats.map((format, index) => (
                        <Badge key={index} variant="outline" className="border-teal-300 text-teal-700 text-xs">
                          {format}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {data.contentStrategy.behaviorChange && (
                  <div>
                    <h5 className="font-medium text-teal-700 text-xs mb-1">Behavior Change</h5>
                    <p className="text-sm text-teal-600 bg-teal-100/50 p-2 rounded-md">
                      {data.contentStrategy.behaviorChange}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Plan */}
          {data?.actionPlan && data.actionPlan.length > 0 && (
            <div className="space-y-2 md:col-span-2">
              <h4 className="font-semibold text-teal-800 flex items-center gap-2">
                <Target className="h-4 w-4" />
                Action Plan
              </h4>
              <ul className="space-y-1">
                {data.actionPlan.map((action, index) => (
                  <li key={index} className="text-sm text-teal-700 flex items-start gap-2">
                    <span className="text-teal-500 mt-1">✓</span>
                    {action}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Success Metrics */}
          {data?.successMetrics && data.successMetrics.length > 0 && (
            <div className="space-y-2 md:col-span-2">
              <h4 className="font-semibold text-teal-800 flex items-center gap-2">
                <Star className="h-4 w-4" />
                Success Metrics
              </h4>
              <ul className="space-y-1">
                {data.successMetrics.map((metric, index) => (
                  <li key={index} className="text-sm text-teal-700 flex items-start gap-2">
                    <span className="text-teal-500 mt-1">•</span>
                    {metric}
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

// Module B Card Component
function ModuleBCard({ module }: { module?: EnhancementModule }) {
  if (!module || module.status !== 'completed') {
    return (
      <Card className="border-orange-200 bg-orange-50/30">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center text-center py-8">
            <div>
              <Clock className="h-12 w-12 text-orange-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-orange-800 mb-2">Module Not Completed</h3>
              <p className="text-orange-600">Complete Module B to see your network positioning strategy summary here.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const data = module.completionData;
  
  return (
    <Card className="border-orange-200 bg-orange-50/30">
      <CardHeader className="bg-orange-100/50">
        <div className="flex justify-between items-center">
          <CardTitle className="text-orange-800 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-orange-600" />
            Network Position Mapping Complete
          </CardTitle>
          <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-300">
            Completed {module.completedAt ? formatDistanceToNow(new Date(module.completedAt), { addSuffix: true }) : ''}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Network Analysis */}
          {data?.networkAnalysis && (
            <div className="space-y-2 md:col-span-2">
              <h4 className="font-semibold text-orange-800 flex items-center gap-2">
                <Network className="h-4 w-4" />
                Network Analysis
              </h4>
              <div className="space-y-3">
                {data.networkAnalysis.currentPosition && (
                  <div>
                    <h5 className="font-medium text-orange-700 text-xs mb-1">Current Position</h5>
                    <p className="text-sm text-orange-600 bg-orange-100/50 p-2 rounded-md">
                      {data.networkAnalysis.currentPosition}
                    </p>
                  </div>
                )}
                {data.networkAnalysis.strategicGaps && data.networkAnalysis.strategicGaps.length > 0 && (
                  <div>
                    <h5 className="font-medium text-orange-700 text-xs mb-1">Strategic Gaps</h5>
                    <ul className="space-y-1">
                      {data.networkAnalysis.strategicGaps.map((gap, index) => (
                        <li key={index} className="text-sm text-orange-700 flex items-start gap-2">
                          <span className="text-orange-500 mt-1">•</span>
                          {gap}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Value Proposition */}
          {data?.valueProposition && (
            <div className="space-y-2 md:col-span-2">
              <h4 className="font-semibold text-orange-800 flex items-center gap-2">
                <Target className="h-4 w-4" />
                Value Proposition
              </h4>
              <p className="text-sm text-orange-700 bg-orange-100/50 p-3 rounded-md">
                {data.valueProposition}
              </p>
            </div>
          )}

          {/* Tier 1 Targets */}
          {data?.tier1Targets && data.tier1Targets.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-semibold text-orange-800 flex items-center gap-2">
                <Star className="h-4 w-4" />
                Tier 1 Targets
              </h4>
              <div className="flex flex-wrap gap-2">
                {data.tier1Targets.map((target, index) => (
                  <Badge key={index} className="bg-orange-600 text-white">
                    {target}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Tier 2 Targets */}
          {data?.tier2Targets && data.tier2Targets.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-semibold text-orange-800 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Tier 2 Targets
              </h4>
              <div className="flex flex-wrap gap-2">
                {data.tier2Targets.map((target, index) => (
                  <Badge key={index} variant="outline" className="border-orange-300 text-orange-700">
                    {target}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Relationship Strategy */}
          {data?.relationshipStrategy && data.relationshipStrategy.length > 0 && (
            <div className="space-y-2 md:col-span-2">
              <h4 className="font-semibold text-orange-800 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Relationship Strategy
              </h4>
              <ul className="space-y-1">
                {data.relationshipStrategy.map((strategy, index) => (
                  <li key={index} className="text-sm text-orange-700 flex items-start gap-2">
                    <span className="text-orange-500 mt-1">→</span>
                    {strategy}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 30-Day Plan */}
          {data?.thirtyDayPlan && data.thirtyDayPlan.length > 0 && (
            <div className="space-y-2 md:col-span-2">
              <h4 className="font-semibold text-orange-800 flex items-center gap-2">
                <Target className="h-4 w-4" />
                30-Day Action Plan
              </h4>
              <ol className="space-y-2">
                {data.thirtyDayPlan.map((action, index) => (
                  <li key={index} className="text-sm text-orange-700 flex items-start gap-3">
                    <Badge variant="outline" className="border-orange-300 text-orange-700 text-xs mt-0.5">
                      {index + 1}
                    </Badge>
                    <span>{action}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Module C Card Component
function ModuleCCard({ module }: { module?: EnhancementModule }) {
  if (!module || module.status !== 'completed') {
    return (
      <Card className="border-indigo-200 bg-indigo-50/30">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center text-center py-8">
            <div>
              <Clock className="h-12 w-12 text-indigo-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-indigo-800 mb-2">Module Not Completed</h3>
              <p className="text-indigo-600">Complete Module C to see your career aspiration alignment summary here.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const data = module.completionData;
  
  return (
    <Card className="border-indigo-200 bg-indigo-50/30">
      <CardHeader className="bg-indigo-100/50">
        <div className="flex justify-between items-center">
          <CardTitle className="text-indigo-800 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-indigo-600" />
            Career Aspiration Alignment Complete
          </CardTitle>
          <Badge variant="outline" className="bg-indigo-100 text-indigo-700 border-indigo-300">
            Completed {module.completedAt ? formatDistanceToNow(new Date(module.completedAt), { addSuffix: true }) : ''}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="space-y-6">
          {/* Target Role & Tier */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {data?.targetRole && (
              <div className="space-y-2">
                <h4 className="font-semibold text-indigo-800 flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Target Role
                </h4>
                <p className="text-sm text-indigo-700 bg-indigo-100/50 p-3 rounded-md">
                  {data.targetRole}
                </p>
              </div>
            )}
            
            {data?.tierClassification && (
              <div className="space-y-2">
                <h4 className="font-semibold text-indigo-800 flex items-center gap-2">
                  <Award className="h-4 w-4" />
                  Advancement Tier
                </h4>
                <Badge className="bg-indigo-600 text-white">{data.tierClassification}</Badge>
              </div>
            )}
          </div>

          {/* Current Positioning */}
          {data?.currentPositioning && (
            <div className="space-y-2">
              <h4 className="font-semibold text-indigo-800 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Current Positioning
              </h4>
              <p className="text-sm text-indigo-700 bg-indigo-100/50 p-3 rounded-md">
                {data.currentPositioning}
              </p>
            </div>
          )}

          {/* Backwards Narrative */}
          {data?.backwardsNarrative && (
            <div className="space-y-2">
              <h4 className="font-semibold text-indigo-800 flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                25-Year Aspiration Narrative
              </h4>
              <p className="text-sm text-indigo-700 bg-indigo-100/50 p-3 rounded-md">
                {data.backwardsNarrative}
              </p>
            </div>
          )}

          {/* Experience Gaps */}
          {data?.experienceGaps && data.experienceGaps.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-semibold text-indigo-800 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Experience Gaps
              </h4>
              <ul className="space-y-1">
                {data.experienceGaps.map((gap, index) => (
                  <li key={index} className="text-sm text-indigo-700 flex items-start gap-2">
                    <span className="text-indigo-500 mt-1">•</span>
                    {gap}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Career Pathway */}
          {(data?.immediateStep || data?.intermediateStep || data?.ultimateGoal) && (
            <div className="space-y-2">
              <h4 className="font-semibold text-indigo-800 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Career Pathway
              </h4>
              <div className="space-y-3">
                {data.immediateStep && (
                  <div>
                    <h5 className="font-medium text-indigo-700 text-xs mb-1">Immediate Step (6-12 months)</h5>
                    <p className="text-sm text-indigo-600 bg-indigo-100/50 p-2 rounded-md">
                      {data.immediateStep}
                    </p>
                  </div>
                )}
                {data.intermediateStep && (
                  <div>
                    <h5 className="font-medium text-indigo-700 text-xs mb-1">Intermediate Step (2-3 years)</h5>
                    <p className="text-sm text-indigo-600 bg-indigo-100/50 p-2 rounded-md">
                      {data.intermediateStep}
                    </p>
                  </div>
                )}
                {data.ultimateGoal && (
                  <div>
                    <h5 className="font-medium text-indigo-700 text-xs mb-1">Ultimate Goal (5+ years)</h5>
                    <p className="text-sm text-indigo-600 bg-indigo-100/50 p-2 rounded-md">
                      {data.ultimateGoal}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 30-Day Actions */}
          {data?.thirtyDayActions && data.thirtyDayActions.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-semibold text-indigo-800 flex items-center gap-2">
                <Rocket className="h-4 w-4" />
                30-Day Action Plan
              </h4>
              <ol className="space-y-2">
                {data.thirtyDayActions.map((action, index) => (
                  <li key={index} className="text-sm text-indigo-700 flex items-start gap-3">
                    <Badge variant="outline" className="border-indigo-300 text-indigo-700 text-xs mt-0.5">
                      {index + 1}
                    </Badge>
                    <span>{action}</span>
                  </li>
                ))}
              </ol>
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