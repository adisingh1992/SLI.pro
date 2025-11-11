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
import { getGradeDisplay, getBadgeColorClass, type Grade, type MetricType } from './gradeMappings';

interface FreshnessReportProps {
  report: {
    id: number;
    userId: number;
    questionnaireAnalysis: any;
    resumeAnalysis: any;
    linkedinAnalysis: any;
    additionalDocumentsAnalysis: any[];
    finalSynthesis: any; // Use any type since we need to handle multiple formats
    createdAt: string;
  };
  userName?: string;
}

const calculateFreshnessGrade = (report: FreshnessReportProps['report']): string => {
  // First check if we have a detailed metrics profile content quality grade
  try {
    const synthData = typeof report.finalSynthesis === 'string' 
      ? JSON.parse(report.finalSynthesis) 
      : report.finalSynthesis;
      
    // Check for grade in detailedMetrics
    if (synthData?.detailedMetrics?.profileContentQuality?.grade) {
      return synthData.detailedMetrics.profileContentQuality.grade;
    }
    
    // Check for grade in older format or directly in finalSynthesis
    if (synthData?.profileContentQuality?.grade) {
      return synthData.profileContentQuality.grade;
    }
    
    // Fall back to extracting from brand strength
    if (synthData?.brandAudit?.currentBrandStrength) {
      const brandStrength = synthData.brandAudit.currentBrandStrength.toLowerCase();
      
      if (brandStrength.includes('strong')) return 'A';
      if (brandStrength.includes('good')) return 'B';
      if (brandStrength.includes('moderate')) return 'C';
      if (brandStrength.includes('weak')) return 'D';
      if (brandStrength.includes('poor')) return 'F';
    }
    
    // Check for overall grade
    if (synthData?.overallGrade) {
      return synthData.overallGrade;
    }
    
    // Default to C if we can't determine
    return 'C';
  } catch (error) {
    console.error("Error calculating freshness grade:", error);
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
  console.log("Original report data:", report);
  
  if (!report) {
    return <Card className="mb-8"><CardContent className="pt-6">No report data available</CardContent></Card>;
  }
  
  // Simple check for finalSynthesis existence
  if (!report.finalSynthesis) {
    return <Card className="mb-8"><CardContent className="pt-6">
      <div>
        <p>Report is missing final synthesis data</p>
        <p className="text-xs text-muted-foreground mt-2">Debug: {JSON.stringify(report.finalSynthesis)}</p>
      </div>
    </CardContent></Card>;
  }
  
  // Always convert to object if it's a string
  let processedSynthesis;
  try {
    processedSynthesis = typeof report.finalSynthesis === 'string' 
      ? JSON.parse(report.finalSynthesis) 
      : report.finalSynthesis;
    console.log("Processed synthesis:", processedSynthesis);
  } catch (e) {
    console.error("Error parsing finalSynthesis:", e);
    return <Card className="mb-8"><CardContent className="pt-6">
      <div>
        <p>Error parsing report data</p>
        <p className="text-xs text-muted-foreground mt-2">Please try refreshing the page or contact support.</p>
      </div>
    </CardContent></Card>;
  }
  
  // Simple grade calculation
  const freshnessGrade = calculateFreshnessGrade({...report, finalSynthesis: processedSynthesis});
  const freshnessScore = calculateFreshnessScore(freshnessGrade);
  const progressColor = getProgressColor(freshnessScore);
  
  // Get overall grade display using the profileContentQuality mapping
  const overallGradeDisplay = getGradeDisplay('profileContentQuality', freshnessGrade as Grade);

  // Initialize with default empty values
  let brandAudit: any = {
    currentBrandStrength: 'No brand strength data available',
    coreStrengths: [],
    criticalGaps: []
  };
  
  let personalBrandStrategy: any = {
    uniqueValueProposition: 'No value proposition data available',
    coreNarrative: 'No core narrative data available',
    recommendedPositioning: '',
    targetAudience: [],
    keyDifferentiators: []
  };
  
  let contentRecommendations: any = {};
  let digitalPresenceStrategy: any = {};
  let implementationRoadmap: any = {};
  let competitiveAnalysis: any = {};
  let detailedMetrics: any = {};
  
  // Check if we have the new format (with brandAudit field)
  if (processedSynthesis?.brandAudit) {
    // New format - extract data directly
    const {
      brandAudit: ba,
      personalBrandStrategy: pbs,
      contentRecommendations: cr,
      digitalPresenceStrategy: dps,
      implementationRoadmap: ir,
      competitiveAnalysis: ca,
      detailedMetrics: dm
    } = processedSynthesis;
    
    brandAudit = ba || brandAudit;
    personalBrandStrategy = pbs || personalBrandStrategy;
    contentRecommendations = cr || contentRecommendations;
    digitalPresenceStrategy = dps || digitalPresenceStrategy;
    implementationRoadmap = ir || implementationRoadmap;
    competitiveAnalysis = ca || competitiveAnalysis;
    detailedMetrics = dm || detailedMetrics;
  } 
  // Old format with overallGrade field
  else if (processedSynthesis?.overallGrade) {
    // Map the old format data to display in the new format structure
    const fs = processedSynthesis;
    
    detailedMetrics = {
      profileContentQuality: {
        grade: fs.profileContentQuality?.grade || 'C',
        explanation: fs.profileContentQuality?.explanation || 'No data available'
      },
      narrativeConsistency: fs.narrativeConsistency,
      contentCreationActivity: fs.contentCreationActivity,
      engagementActivity: fs.engagementActivity,
      recommendationImplementation: fs.recommendationImplementation,
      sliClarity: fs.sliClarity
    };
    
    brandAudit = {
      currentBrandStrength: fs.overallExplanation || 'No brand strength data available',
      coreStrengths: fs.actionableSuggestions?.slice(0, 2) || [],
      criticalGaps: fs.actionableSuggestions?.slice(2, 4) || []
    };
    
    personalBrandStrategy = {
      uniqueValueProposition: 'See detailed metrics for insights',
      coreNarrative: fs.overallExplanation || 'No core narrative data available'
    };
  } 
  // Unknown format - try to extract useful data
  else {
    console.warn("Unknown report format, attempting to extract data:", processedSynthesis);
    
    try {
      // Try to find any useful fields
      if (processedSynthesis.detailedMetrics?.profileContentQuality) {
        detailedMetrics.profileContentQuality = processedSynthesis.detailedMetrics.profileContentQuality;
      }
      
      if (processedSynthesis.grade || processedSynthesis.overallGrade) {
        const grade = processedSynthesis.grade || processedSynthesis.overallGrade;
        detailedMetrics.profileContentQuality = {
          grade: grade,
          explanation: processedSynthesis.explanation || 'Based on analysis of your professional content'
        };
      }
      
      if (processedSynthesis.summary || processedSynthesis.overview) {
        const summary = processedSynthesis.summary || processedSynthesis.overview;
        brandAudit.currentBrandStrength = summary;
      }
      
      // Try to extract any array that might contain actionable suggestions
      if (Array.isArray(processedSynthesis.recommendations) && processedSynthesis.recommendations.length > 0) {
        brandAudit.coreStrengths = processedSynthesis.recommendations.slice(0, 2);
        brandAudit.criticalGaps = processedSynthesis.recommendations.slice(2, 4);
      }
    } catch (e) {
      console.error("Error extracting data from unknown format:", e);
    }
  }

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
            <div className="flex flex-col items-center justify-center rounded-md p-4 min-w-[140px]">
              <span className={`text-sm font-semibold px-3 py-1.5 rounded mb-2 ${getBadgeColorClass(overallGradeDisplay.badgeVariant)}`}>
                {overallGradeDisplay.label}
              </span>
              <span className="text-2xl font-bold">{overallGradeDisplay.progressPercent}%</span>
              <span className="text-xs text-muted-foreground mt-1">Overall Score</span>
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
              (() => {
                const gradeDisplay = getGradeDisplay('profileContentQuality', detailedMetrics.profileContentQuality.grade as Grade);
                return (
                  <div className="mb-5 p-4 bg-muted/50 rounded-md border">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold">Profile Content Quality</h4>
                      <span className={`text-sm font-semibold px-3 py-1 rounded ${getBadgeColorClass(gradeDisplay.badgeVariant)}`}>
                        {gradeDisplay.label}
                      </span>
                    </div>
                    <div className="mb-3">
                      <Progress value={gradeDisplay.progressPercent} className="h-2" />
                      <div className="flex justify-between mt-1">
                        <span className="text-xs text-muted-foreground">Progress</span>
                        <span className="text-xs text-muted-foreground">{gradeDisplay.progressPercent}%</span>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {detailedMetrics.profileContentQuality.explanation}
                    </p>
                  </div>
                );
              })()
            )}
            
            {/* SLI Clarity */}
            {detailedMetrics?.sliClarity ? (
              (() => {
                const gradeDisplay = getGradeDisplay('sliClarity', detailedMetrics.sliClarity.grade as Grade);
                return (
                  <div className="mb-4 p-4 bg-muted/50 rounded-md border">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold">SLI Clarity</h4>
                      <span className={`text-sm font-semibold px-3 py-1 rounded ${getBadgeColorClass(gradeDisplay.badgeVariant)}`}>
                        {gradeDisplay.label}
                      </span>
                    </div>
                    <div className="mb-3">
                      <Progress value={gradeDisplay.progressPercent} className="h-2" />
                      <div className="flex justify-between mt-1">
                        <span className="text-xs text-muted-foreground">Progress</span>
                        <span className="text-xs text-muted-foreground">{gradeDisplay.progressPercent}%</span>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {detailedMetrics.sliClarity.explanation}
                    </p>
                  </div>
                );
              })()
            ) : (
              <div className="mb-4 p-3 bg-muted/30 rounded-md border border-dashed">
                <div className="flex items-center justify-between mb-1 opacity-60">
                  <h4 className="text-sm font-semibold">SLI Clarity</h4>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Grade:</span>
                    <span className="text-sm font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-500">-</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground opacity-60 italic">
                  Measures how clearly your Single Lasting Impression is defined across your materials and aligns with coaching insights.
                </p>
              </div>
            )}
            
            {/* Narrative Consistency */}
            {detailedMetrics?.narrativeConsistency ? (
              (() => {
                const gradeDisplay = getGradeDisplay('narrativeConsistency', detailedMetrics.narrativeConsistency.grade as Grade);
                return (
                  <div className="mb-4 p-4 bg-muted/50 rounded-md border">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold">Narrative Consistency</h4>
                      <span className={`text-sm font-semibold px-3 py-1 rounded ${getBadgeColorClass(gradeDisplay.badgeVariant)}`}>
                        {gradeDisplay.label}
                      </span>
                    </div>
                    <div className="mb-3">
                      <Progress value={gradeDisplay.progressPercent} className="h-2" />
                      <div className="flex justify-between mt-1">
                        <span className="text-xs text-muted-foreground">Progress</span>
                        <span className="text-xs text-muted-foreground">{gradeDisplay.progressPercent}%</span>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {detailedMetrics.narrativeConsistency.explanation}
                    </p>
                  </div>
                );
              })()
            ) : (
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
            )}
            
            {/* Content Creation Activity */}
            {detailedMetrics?.contentCreationActivity ? (
              (() => {
                const gradeDisplay = getGradeDisplay('contentCreationActivity', detailedMetrics.contentCreationActivity.grade as Grade);
                return (
                  <div className="mb-4 p-4 bg-muted/50 rounded-md border">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold">Content Creation Activity</h4>
                      <span className={`text-sm font-semibold px-3 py-1 rounded ${getBadgeColorClass(gradeDisplay.badgeVariant)}`}>
                        {gradeDisplay.label}
                      </span>
                    </div>
                    <div className="mb-3">
                      <Progress value={gradeDisplay.progressPercent} className="h-2" />
                      <div className="flex justify-between mt-1">
                        <span className="text-xs text-muted-foreground">Progress</span>
                        <span className="text-xs text-muted-foreground">{gradeDisplay.progressPercent}%</span>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {detailedMetrics.contentCreationActivity.explanation}
                    </p>
                  </div>
                );
              })()
            ) : (
              <div className="mb-4 p-3 bg-muted/30 rounded-md border border-dashed">
                <div className="flex items-center justify-between mb-1 opacity-60">
                  <h4 className="text-sm font-semibold">Content Creation Activity</h4>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Grade:</span>
                    <span className="text-sm font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-500">-</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground opacity-60 italic">
                  No content creation activity data available. Complete monthly check-ins to track your content creation activity.
                </p>
              </div>
            )}
            
            {/* Engagement Activity */}
            {detailedMetrics?.engagementActivity ? (
              (() => {
                const gradeDisplay = getGradeDisplay('engagementActivity', detailedMetrics.engagementActivity.grade as Grade);
                return (
                  <div className="mb-4 p-4 bg-muted/50 rounded-md border">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold">Engagement Activity</h4>
                      <span className={`text-sm font-semibold px-3 py-1 rounded ${getBadgeColorClass(gradeDisplay.badgeVariant)}`}>
                        {gradeDisplay.label}
                      </span>
                    </div>
                    <div className="mb-3">
                      <Progress value={gradeDisplay.progressPercent} className="h-2" />
                      <div className="flex justify-between mt-1">
                        <span className="text-xs text-muted-foreground">Progress</span>
                        <span className="text-xs text-muted-foreground">{gradeDisplay.progressPercent}%</span>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {detailedMetrics.engagementActivity.explanation}
                    </p>
                  </div>
                );
              })()
            ) : (
              <div className="mb-4 p-3 bg-muted/30 rounded-md border border-dashed">
                <div className="flex items-center justify-between mb-1 opacity-60">
                  <h4 className="text-sm font-semibold">Engagement Activity</h4>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Grade:</span>
                    <span className="text-sm font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-500">-</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground opacity-60 italic">
                  No engagement activity data available. Complete monthly check-ins to track your engagement with industry content and thought leaders.
                </p>
              </div>
            )}
            
            {/* Implementation of Recommendations */}
            {detailedMetrics?.recommendationImplementation ? (
              (() => {
                const gradeDisplay = getGradeDisplay('recommendationImplementation', detailedMetrics.recommendationImplementation.grade as Grade);
                return (
                  <div className="p-4 bg-muted/50 rounded-md border">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold">Implementation of Recommendations</h4>
                      <span className={`text-sm font-semibold px-3 py-1 rounded ${getBadgeColorClass(gradeDisplay.badgeVariant)}`}>
                        {gradeDisplay.label}
                      </span>
                    </div>
                    <div className="mb-3">
                      <Progress value={gradeDisplay.progressPercent} className="h-2" />
                      <div className="flex justify-between mt-1">
                        <span className="text-xs text-muted-foreground">Progress</span>
                        <span className="text-xs text-muted-foreground">{gradeDisplay.progressPercent}%</span>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {detailedMetrics.recommendationImplementation.explanation}
                    </p>
                  </div>
                );
              })()
            ) : (
              <div className="p-3 bg-muted/30 rounded-md border border-dashed">
                <div className="flex items-center justify-between mb-1 opacity-60">
                  <h4 className="text-sm font-semibold">Implementation of Recommendations</h4>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Grade:</span>
                    <span className="text-sm font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-500">-</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground opacity-60 italic">
                  {detailedMetrics?.recommendationImplementation?.explanation || 
                  "This metric requires a previous freshness report. It will be available once you've generated multiple reports."}
                </p>
              </div>
            )}
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