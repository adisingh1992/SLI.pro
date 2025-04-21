import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  GraduationCap, BookOpen, Briefcase, Calendar, CheckCircle, 
  ChevronRight, ClipboardCheck, Dice5, FileText, Globe, 
  Lightbulb, ListChecks, Target, TrendingUp, UserCircle 
} from 'lucide-react';

interface FreshnessReportProps {
  report: {
    id: number;
    userId: number;
    questionnaireAnalysis: any;
    resumeAnalysis: any;
    linkedinAnalysis: any;
    additionalDocumentsAnalysis: any[];
    finalSynthesis: {
      brandAudit: {
        currentBrandStrength: string;
        coreStrengths: string[];
        criticalGaps: string[];
        brandConsistency: string;
      };
      personalBrandStrategy: {
        uniqueValueProposition: string;
        coreNarrative: string;
        recommendedPositioning: string;
        targetAudience: string[];
        keyDifferentiators: string[];
      };
      contentRecommendations: {
        resumeImprovements: string[];
        linkedInEnhancements: string[];
        thoughtLeadershipTopics: string[];
      };
      digitalPresenceStrategy: {
        platformPriorities: string[];
        engagementTactics: string[];
        networkingApproach: string;
        contentCalendarFramework: string;
      };
      implementationRoadmap: {
        immediateNextSteps: string[];
        thirtyDayMilestones: string[];
        ninetyDayGoals: string[];
      };
      competitiveAnalysis: {
        marketPositioning: string;
        industryTrendAlignment: string;
        distinctionOpportunities: string;
      };
      detailedMetrics?: {
        profileContentQuality: {
          grade: string;
          explanation: string;
        };
      };
    };
    createdAt: string;
  };
  userName?: string;
}

const calculateFreshnessGrade = (report: FreshnessReportProps['report']): string => {
  // First check if we have a detailed metrics profile content quality grade
  try {
    if (report.finalSynthesis.detailedMetrics?.profileContentQuality?.grade) {
      return report.finalSynthesis.detailedMetrics.profileContentQuality.grade;
    }
    
    // Fall back to extracting from brand strength if detailed metrics aren't available
    const brandStrength = report.finalSynthesis.brandAudit.currentBrandStrength || '';
    
    if (brandStrength.toLowerCase().includes('strong')) return 'A';
    if (brandStrength.toLowerCase().includes('good')) return 'B';
    if (brandStrength.toLowerCase().includes('moderate')) return 'C';
    if (brandStrength.toLowerCase().includes('weak')) return 'D';
    if (brandStrength.toLowerCase().includes('poor')) return 'F';
    
    // Default to C if we can't determine
    return 'C';
  } catch (error) {
    return 'C'; // Default grade
  }
};

const calculateFreshnessScore = (grade: string): number => {
  switch(grade) {
    case 'A': return 90;
    case 'B': return 75;
    case 'C': return 60;
    case 'D': return 45;
    case 'F': return 30;
    default: return 60;
  }
};

const getProgressColor = (score: number): string => {
  if (score >= 80) return 'bg-green-500';
  if (score >= 70) return 'bg-emerald-500';
  if (score >= 60) return 'bg-yellow-500';
  if (score >= 40) return 'bg-orange-500';
  return 'bg-red-500';
};

const ReportDisplay: React.FC<FreshnessReportProps> = ({ report, userName }) => {
  if (!report || !report.finalSynthesis) {
    return <Card className="mb-8"><CardContent className="pt-6">No report data available</CardContent></Card>;
  }

  const freshnessGrade = calculateFreshnessGrade(report);
  const freshnessScore = calculateFreshnessScore(freshnessGrade);
  const progressColor = getProgressColor(freshnessScore);

  // Extract relevant data from report
  const {
    brandAudit,
    personalBrandStrategy,
    contentRecommendations,
    digitalPresenceStrategy,
    implementationRoadmap,
    competitiveAnalysis,
    detailedMetrics
  } = report.finalSynthesis;

  return (
    <div className="space-y-6">
      <Card className="mb-8">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl font-bold">Professional Brand Freshness Report</CardTitle>
              <CardDescription>
                Comprehensive analysis of {userName || 'your'} current professional brand positioning
              </CardDescription>
            </div>
            <div className="flex flex-col items-center justify-center bg-muted rounded-md p-3 w-24 h-24">
              <span className="text-4xl font-bold">{freshnessGrade}</span>
              <span className="text-xs text-muted-foreground">Freshness Grade</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-6">
            <div className="flex justify-between mb-2">
              <span className="text-sm font-medium">Brand Freshness Score</span>
              <span className="text-sm font-medium">{freshnessScore}%</span>
            </div>
            <Progress value={freshnessScore} className={`h-2 ${progressColor}`} />
          </div>

          {/* 1. Executive Summary */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Executive Summary</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              {brandAudit.currentBrandStrength}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
              <div className="flex items-start gap-2">
                <CheckCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                <span className="text-sm">{brandAudit.coreStrengths[0] || 'Strong professional experience'}</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                <span className="text-sm">{brandAudit.coreStrengths[1] || 'Clear career trajectory'}</span>
              </div>
            </div>
          </div>
          
          <Separator className="my-6" />

          {/* 2. Current Positioning Analysis */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Target className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Current Positioning Analysis</h3>
            </div>
            
            <div className="mb-4">
              <h4 className="text-sm font-semibold mb-2">Single Lasting Impression (SLI)</h4>
              <p className="text-sm p-3 bg-muted rounded-md border">
                {personalBrandStrategy.uniqueValueProposition}
              </p>
            </div>
            
            <div className="mb-4">
              <h4 className="text-sm font-semibold mb-2">Alignment with Goals</h4>
              <p className="text-sm text-muted-foreground">
                {personalBrandStrategy.coreNarrative}
              </p>
            </div>
            
            <div className="mb-3">
              <h4 className="text-sm font-semibold mb-2">Key Challenges</h4>
              <ul className="space-y-2">
                {brandAudit.criticalGaps.slice(0, 2).map((gap: string, index: number) => (
                  <li key={index} className="flex items-start gap-2">
                    <ChevronRight className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span className="text-sm">{gap}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          
          <Separator className="my-6" />

          {/* 3. Detailed Metrics Assessment */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Detailed Metrics Assessment</h3>
            </div>
            
            {/* Profile Content Quality - Active Metric */}
            {detailedMetrics?.profileContentQuality && (
              <div className="mb-5 p-4 bg-muted/50 rounded-md border">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold">Profile Content Quality</h4>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Grade:</span>
                    <span className={`text-sm font-bold px-2 py-0.5 rounded ${
                      detailedMetrics.profileContentQuality.grade === 'A' ? 'bg-green-100 text-green-700' :
                      detailedMetrics.profileContentQuality.grade === 'B' ? 'bg-blue-100 text-blue-700' :
                      detailedMetrics.profileContentQuality.grade === 'C' ? 'bg-yellow-100 text-yellow-700' :
                      detailedMetrics.profileContentQuality.grade === 'D' ? 'bg-orange-100 text-orange-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {detailedMetrics.profileContentQuality.grade}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {detailedMetrics.profileContentQuality.explanation}
                </p>
              </div>
            )}
            
            {/* SLI Clarity - Placeholder */}
            <div className="mb-4 p-3 bg-muted/30 rounded-md border border-dashed">
              <div className="flex items-center justify-between mb-1 opacity-60">
                <h4 className="text-sm font-semibold">SLI Clarity</h4>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">Grade:</span>
                  <span className="text-sm font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-500">-</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground opacity-60 italic">
                Coming soon: Measures how clearly your Single Lasting Impression is defined across your materials.
              </p>
            </div>
            
            {/* Narrative Consistency - Placeholder */}
            <div className="mb-4 p-3 bg-muted/30 rounded-md border border-dashed">
              <div className="flex items-center justify-between mb-1 opacity-60">
                <h4 className="text-sm font-semibold">Narrative Consistency</h4>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">Grade:</span>
                  <span className="text-sm font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-500">-</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground opacity-60 italic">
                Coming soon: Evaluates how consistently your professional story appears across all platforms.
              </p>
            </div>
            
            {/* Content Creation Activity - Placeholder */}
            <div className="mb-4 p-3 bg-muted/30 rounded-md border border-dashed">
              <div className="flex items-center justify-between mb-1 opacity-60">
                <h4 className="text-sm font-semibold">Content Creation Activity</h4>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">Grade:</span>
                  <span className="text-sm font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-500">-</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground opacity-60 italic">
                Coming soon: Measures your activity level in creating professional content and thought leadership.
              </p>
            </div>
            
            {/* Engagement Activity - Placeholder */}
            <div className="mb-4 p-3 bg-muted/30 rounded-md border border-dashed">
              <div className="flex items-center justify-between mb-1 opacity-60">
                <h4 className="text-sm font-semibold">Engagement Activity</h4>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">Grade:</span>
                  <span className="text-sm font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-500">-</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground opacity-60 italic">
                Coming soon: Tracks how actively you engage with industry content and thought leaders.
              </p>
            </div>
            
            {/* Implementation of Recommendations - Placeholder */}
            <div className="p-3 bg-muted/30 rounded-md border border-dashed">
              <div className="flex items-center justify-between mb-1 opacity-60">
                <h4 className="text-sm font-semibold">Implementation of Recommendations</h4>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">Grade:</span>
                  <span className="text-sm font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-500">-</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground opacity-60 italic">
                Coming soon: Measures how effectively you've implemented previous SLI.pro recommendations.
              </p>
            </div>
          </div>
          
          <Separator className="my-6" />

          {/* 4. Priority Recommendations */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <ListChecks className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Priority Recommendations</h3>
            </div>
            
            <div className="space-y-4">
              {implementationRoadmap.immediateNextSteps.slice(0, 3).map((step: string, index: number) => (
                <div key={index} className="flex items-start gap-3 p-3 bg-muted/50 rounded-md border">
                  <div className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">
                    {index + 1}
                  </div>
                  <div>
                    <p className="text-sm">{step}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <Separator className="my-6" />

          {/* 5. Key Themes & Insights */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Lightbulb className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Key Themes & Insights</h3>
            </div>
            
            <div className="flex flex-wrap gap-2 mb-4">
              {personalBrandStrategy.keyDifferentiators.slice(0, 5).map((theme: string, index: number) => (
                <Badge key={index} variant="outline" className="px-3 py-1">
                  {theme}
                </Badge>
              ))}
            </div>
            
            <p className="text-sm text-muted-foreground">
              These recurring themes appear across your professional materials and can help define your unique SLI.
            </p>
          </div>
          
          <Separator className="my-6" />

          {/* 6. Industry-Specific Context */}
          <div className="mb-2">
            <div className="flex items-center gap-2 mb-4">
              <Globe className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Industry-Specific Context</h3>
            </div>
            
            <div className="mb-4">
              <h4 className="text-sm font-semibold mb-2">Industry Positioning</h4>
              <p className="text-sm text-muted-foreground mb-3">
                {competitiveAnalysis.marketPositioning}
              </p>
            </div>
            
            <div className="mb-4">
              <h4 className="text-sm font-semibold mb-2">Trend Alignment</h4>
              <p className="text-sm text-muted-foreground mb-3">
                {competitiveAnalysis.industryTrendAlignment}
              </p>
            </div>
            
            <div>
              <h4 className="text-sm font-semibold mb-2">Opportunities for Distinction</h4>
              <p className="text-sm text-muted-foreground">
                {competitiveAnalysis.distinctionOpportunities}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Additional Cards for More Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Professional Identity</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              <li className="flex items-start gap-2">
                <UserCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs text-muted-foreground">Recommended Positioning</span>
                  <p className="text-sm">{personalBrandStrategy.recommendedPositioning}</p>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <Target className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs text-muted-foreground">Target Audience</span>
                  <p className="text-sm">{personalBrandStrategy.targetAudience.join(', ')}</p>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <Dice5 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs text-muted-foreground">Brand Consistency</span>
                  <p className="text-sm">{brandAudit.brandConsistency}</p>
                </div>
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Content Strategy</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              <li className="flex items-start gap-2">
                <Globe className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs text-muted-foreground">Platform Priorities</span>
                  <p className="text-sm">{digitalPresenceStrategy.platformPriorities.join(', ')}</p>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <ClipboardCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs text-muted-foreground">Content Recommendations</span>
                  <p className="text-sm">{contentRecommendations.thoughtLeadershipTopics.slice(0, 1).join(', ')}</p>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <Calendar className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs text-muted-foreground">Content Calendar</span>
                  <p className="text-sm">{digitalPresenceStrategy.contentCalendarFramework}</p>
                </div>
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Resume Insights</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Recommended Improvements</h4>
              <ul className="space-y-2">
                {contentRecommendations.resumeImprovements.slice(0, 3).map((improvement: string, index: number) => (
                  <li key={index} className="flex items-start gap-2">
                    <ChevronRight className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span className="text-sm">{improvement}</span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">LinkedIn Insights</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Recommended Improvements</h4>
              <ul className="space-y-2">
                {contentRecommendations.linkedInEnhancements.slice(0, 3).map((improvement: string, index: number) => (
                  <li key={index} className="flex items-start gap-2">
                    <ChevronRight className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span className="text-sm">{improvement}</span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ReportDisplay;