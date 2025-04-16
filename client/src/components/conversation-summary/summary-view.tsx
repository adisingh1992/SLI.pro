import React from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Skeleton } from '@/components/ui/skeleton';
import { ConversationSummary } from '@shared/schema';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

export default function ConversationSummaryView({ id }: { id: number }) {
  const [, navigate] = useLocation();

  // Fetch the conversation summary
  const { data: summary, isLoading, isError, refetch } = useQuery<ConversationSummary>({
    queryKey: ['/api/conversations', id, 'summary'],
    queryFn: () => fetch(`/api/conversations/${id}/summary`).then(res => {
      if (!res.ok) throw new Error('Failed to load summary');
      return res.json();
    }),
  });

  // Function to generate/regenerate a summary
  const regenerateSummary = async () => {
    try {
      await apiRequest({
        url: `/api/conversations/${id}/summary`,
        method: 'POST',
      });
      refetch();
    } catch (error) {
      console.error('Error regenerating summary:', error);
    }
  };

  if (isLoading) {
    return <SummarySkeleton />;
  }

  if (isError || !summary) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          Failed to load the conversation summary. Please try again.
          <Button variant="outline" className="mt-2" onClick={() => refetch()}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Conversation Summary</h2>
        <div className="space-x-2">
          <Button onClick={() => navigate(`/conversations/${id}`)} variant="outline">
            Back to Conversation
          </Button>
          <Button onClick={regenerateSummary} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" /> Regenerate
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="career">Career</TabsTrigger>
          <TabsTrigger value="strengths">Strengths</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Name</h4>
                  <p className="text-lg">{summary.basicInfo?.name || 'Not specified'}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Current Role</h4>
                  <p className="text-lg">{summary.basicInfo?.currentRole || 'Not specified'}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Industry</h4>
                  <p className="text-lg">{summary.basicInfo?.industry || 'Not specified'}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Years of Experience</h4>
                  <p className="text-lg">{summary.basicInfo?.yearsOfExperience || 'Not specified'}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Target Timeline</h4>
                  <p className="text-lg">{summary.basicInfo?.targetTimeline || 'Not specified'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Functional Categorization</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Primary Function</h4>
                  <p className="text-lg">{summary.functionalCategorization?.primaryFunction || 'Not specified'}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Secondary Function</h4>
                  <p className="text-lg">{summary.functionalCategorization?.secondaryFunction || 'Not specified'}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Level of Certainty</h4>
                  <p className="text-lg">{summary.functionalCategorization?.levelOfCertainty || 'Not specified'}</p>
                </div>
              </div>
              
              <Separator className="my-4" />
              
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Key Strengths</h4>
                {summary.functionalCategorization?.keyStrengths && 
                 summary.functionalCategorization.keyStrengths.length > 0 ? (
                  <ul className="list-disc pl-5 space-y-1">
                    {summary.functionalCategorization.keyStrengths.map((strength, index) => (
                      <li key={index}>{strength}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No strengths specified</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="career" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Career Transition</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Current State</h4>
                  <p className="text-lg">{summary.careerTransition?.currentState || 'Not specified'}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Desired State</h4>
                  <p className="text-lg">{summary.careerTransition?.desiredState || 'Not specified'}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Transition Type</h4>
                  <p className="text-lg">{summary.careerTransition?.transitionType || 'Not specified'}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Complexity Rating</h4>
                  <p className="text-lg">{summary.careerTransition?.complexityRating || 'Not specified'}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Primary Motivation</h4>
                  <p className="text-lg">{summary.careerTransition?.primaryMotivation || 'Not specified'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Psychology & Motivation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Enneagram Type</h4>
                  <p className="text-lg">{summary.psychologyAndMotivation?.enneagramType || 'Not specified'}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Assessment Results</h4>
                  <p className="text-lg">{summary.psychologyAndMotivation?.assessmentResults || 'Not specified'}</p>
                </div>
              </div>
              
              <Separator className="my-4" />
              
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Top Priorities</h4>
                  {summary.psychologyAndMotivation?.topPriorities && 
                   summary.psychologyAndMotivation.topPriorities.length > 0 ? (
                    <ul className="list-disc pl-5 space-y-1">
                      {summary.psychologyAndMotivation.topPriorities.map((priority, index) => (
                        <li key={index}>{priority}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No priorities specified</p>
                  )}
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Aspirational Themes</h4>
                  {summary.psychologyAndMotivation?.aspirationalThemes && 
                   summary.psychologyAndMotivation.aspirationalThemes.length > 0 ? (
                    <ul className="list-disc pl-5 space-y-1">
                      {summary.psychologyAndMotivation.aspirationalThemes.map((theme, index) => (
                        <li key={index}>{theme}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No themes specified</p>
                  )}
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Notable Quotes</h4>
                  {summary.psychologyAndMotivation?.notableQuotes && 
                   summary.psychologyAndMotivation.notableQuotes.length > 0 ? (
                    <ul className="list-disc pl-5 space-y-1">
                      {summary.psychologyAndMotivation.notableQuotes.map((quote, index) => (
                        <li key={index}>"{quote}"</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No quotes specified</p>
                  )}
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Motivational Drivers</h4>
                  {summary.psychologyAndMotivation?.motivationalDrivers && 
                   summary.psychologyAndMotivation.motivationalDrivers.length > 0 ? (
                    <ul className="list-disc pl-5 space-y-1">
                      {summary.psychologyAndMotivation.motivationalDrivers.map((driver, index) => (
                        <li key={index}>{driver}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No drivers specified</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="strengths" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Strengths & Positioning</CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="strengths">
                  <AccordionTrigger>Key Strengths</AccordionTrigger>
                  <AccordionContent>
                    {summary.strengthsAndPositioning?.keyStrengths && 
                     summary.strengthsAndPositioning.keyStrengths.length > 0 ? (
                      <ul className="list-disc pl-5 space-y-1">
                        {summary.strengthsAndPositioning.keyStrengths.map((strength, index) => (
                          <li key={index}>{strength}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>No strengths specified</p>
                    )}
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="development">
                  <AccordionTrigger>Areas for Development</AccordionTrigger>
                  <AccordionContent>
                    {summary.strengthsAndPositioning?.areasForDevelopment && 
                     summary.strengthsAndPositioning.areasForDevelopment.length > 0 ? (
                      <ul className="list-disc pl-5 space-y-1">
                        {summary.strengthsAndPositioning.areasForDevelopment.map((area, index) => (
                          <li key={index}>{area}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>No areas specified</p>
                    )}
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="value">
                  <AccordionTrigger>Value Proposition</AccordionTrigger>
                  <AccordionContent>
                    <p>{summary.strengthsAndPositioning?.valueProposition || 'Not specified'}</p>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="achievements">
                  <AccordionTrigger>Achievement Examples</AccordionTrigger>
                  <AccordionContent>
                    {summary.strengthsAndPositioning?.achievementExamples && 
                     summary.strengthsAndPositioning.achievementExamples.length > 0 ? (
                      <ul className="list-disc pl-5 space-y-1">
                        {summary.strengthsAndPositioning.achievementExamples.map((achievement, index) => (
                          <li key={index}>{achievement}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>No achievements specified</p>
                    )}
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="comfort">
                  <AccordionTrigger>Comfort with Self-Promotion</AccordionTrigger>
                  <AccordionContent>
                    <p>{summary.strengthsAndPositioning?.comfortWithSelfPromotion || 'Not specified'}</p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Digital Presence</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">LinkedIn Activity</h4>
                  <p className="text-lg">{summary.digitalPresence?.linkedInActivity || 'Not specified'}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Content Creation Experience</h4>
                  <p className="text-lg">{summary.digitalPresence?.contentCreationExperience || 'Not specified'}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Barriers</h4>
                  <p className="text-lg">{summary.digitalPresence?.barriers || 'Not specified'}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Networking Approach</h4>
                  <p className="text-lg">{summary.digitalPresence?.networkingApproach || 'Not specified'}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Posting Frequency</h4>
                  <p className="text-lg">{summary.digitalPresence?.postingFrequency || 'Not specified'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="content" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Content Strategy</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-6">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Confident Topics</h4>
                  {summary.contentStrategy?.confidentTopics && 
                   summary.contentStrategy.confidentTopics.length > 0 ? (
                    <ul className="list-disc pl-5 space-y-1">
                      {summary.contentStrategy.confidentTopics.map((topic, index) => (
                        <li key={index}>{topic}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No topics specified</p>
                  )}
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Preferred Formats</h4>
                  {summary.contentStrategy?.preferredFormats && 
                   summary.contentStrategy.preferredFormats.length > 0 ? (
                    <ul className="list-disc pl-5 space-y-1">
                      {summary.contentStrategy.preferredFormats.map((format, index) => (
                        <li key={index}>{format}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No formats specified</p>
                  )}
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Creation Barriers</h4>
                  <p className="text-lg">{summary.contentStrategy?.creationBarriers || 'Not specified'}</p>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Suggested Initial Topic</h4>
                  <p className="text-lg">{summary.contentStrategy?.suggestedInitialTopic || 'Not specified'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recommendations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recommendations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-6">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">SLI Directions</h4>
                  {summary.recommendations?.sliDirections && 
                   summary.recommendations.sliDirections.length > 0 ? (
                    <ul className="list-disc pl-5 space-y-1">
                      {summary.recommendations.sliDirections.map((direction, index) => (
                        <li key={index}>{direction}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No directions specified</p>
                  )}
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Ice Bucket Moments</h4>
                  {summary.recommendations?.iceBucketMoments && 
                   summary.recommendations.iceBucketMoments.length > 0 ? (
                    <ul className="list-disc pl-5 space-y-1">
                      {summary.recommendations.iceBucketMoments.map((moment, index) => (
                        <li key={index}>{moment}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No moments specified</p>
                  )}
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Content Strategy Directions</h4>
                  {summary.recommendations?.contentStrategyDirections && 
                   summary.recommendations.contentStrategyDirections.length > 0 ? (
                    <ul className="list-disc pl-5 space-y-1">
                      {summary.recommendations.contentStrategyDirections.map((direction, index) => (
                        <li key={index}>{direction}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No directions specified</p>
                  )}
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Special Considerations</h4>
                  <p className="text-lg">{summary.recommendations?.specialConsiderations || 'Not specified'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Skeleton className="h-8 w-64" />
        <div className="space-x-2">
          <Skeleton className="h-10 w-40 inline-block" />
          <Skeleton className="h-10 w-40 inline-block" />
        </div>
      </div>

      <Skeleton className="h-10 w-full max-w-md" />

      <div className="space-y-4">
        <Skeleton className="h-[200px] w-full" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    </div>
  );
}