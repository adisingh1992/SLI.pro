export interface GradeMapping {
  label: string;
  progressPercent: number;
  badgeVariant: 'success' | 'info' | 'warning' | 'neutral';
}

export type MetricType = 
  | 'profileContentQuality'
  | 'sliClarity'
  | 'narrativeConsistency'
  | 'contentCreationActivity'
  | 'engagementActivity'
  | 'recommendationImplementation';

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F' | 'N/A';

const gradeMappings: Record<MetricType, Record<Grade, GradeMapping>> = {
  profileContentQuality: {
    'A': { label: 'Polished & Impactful', progressPercent: 95, badgeVariant: 'success' },
    'B': { label: 'Compelling & Clear', progressPercent: 85, badgeVariant: 'success' },
    'C': { label: 'Solid Foundation', progressPercent: 72, badgeVariant: 'info' },
    'D': { label: 'Ready for Refinement', progressPercent: 55, badgeVariant: 'warning' },
    'F': { label: 'Getting Established', progressPercent: 40, badgeVariant: 'neutral' },
    'N/A': { label: 'Not Yet Assessed', progressPercent: 0, badgeVariant: 'neutral' },
  },
  sliClarity: {
    'A': { label: 'Signature Story Resonates', progressPercent: 95, badgeVariant: 'success' },
    'B': { label: 'Clear Core Message', progressPercent: 82, badgeVariant: 'success' },
    'C': { label: 'Message Taking Shape', progressPercent: 68, badgeVariant: 'info' },
    'D': { label: 'Clarify Your Hook', progressPercent: 50, badgeVariant: 'warning' },
    'F': { label: 'Define Your Signature', progressPercent: 35, badgeVariant: 'neutral' },
    'N/A': { label: 'Not Yet Defined', progressPercent: 0, badgeVariant: 'neutral' },
  },
  narrativeConsistency: {
    'A': { label: 'Unified Storyline', progressPercent: 94, badgeVariant: 'success' },
    'B': { label: 'Mostly Aligned', progressPercent: 80, badgeVariant: 'success' },
    'C': { label: 'Emerging Cohesion', progressPercent: 66, badgeVariant: 'info' },
    'D': { label: 'Spotlight Gaps', progressPercent: 48, badgeVariant: 'warning' },
    'F': { label: 'Build the Throughline', progressPercent: 32, badgeVariant: 'neutral' },
    'N/A': { label: 'Not Yet Evaluated', progressPercent: 0, badgeVariant: 'neutral' },
  },
  contentCreationActivity: {
    'A': { label: 'Consistent Creator', progressPercent: 92, badgeVariant: 'success' },
    'B': { label: 'Steady Contributor', progressPercent: 78, badgeVariant: 'success' },
    'C': { label: 'Building Momentum', progressPercent: 63, badgeVariant: 'info' },
    'D': { label: 'Spark Activity', progressPercent: 45, badgeVariant: 'warning' },
    'F': { label: 'Getting Started', progressPercent: 28, badgeVariant: 'neutral' },
    'N/A': { label: 'Insight in Progress', progressPercent: 0, badgeVariant: 'neutral' },
  },
  engagementActivity: {
    'A': { label: 'Community Catalyst', progressPercent: 90, badgeVariant: 'success' },
    'B': { label: 'Active Amplifier', progressPercent: 76, badgeVariant: 'success' },
    'C': { label: 'Growing Presence', progressPercent: 62, badgeVariant: 'info' },
    'D': { label: 'Reignite Interactions', progressPercent: 44, badgeVariant: 'warning' },
    'F': { label: 'Reconnect with Peers', progressPercent: 30, badgeVariant: 'neutral' },
    'N/A': { label: 'Insight in Progress', progressPercent: 0, badgeVariant: 'neutral' },
  },
  recommendationImplementation: {
    'A': { label: 'Action Plan Embedded', progressPercent: 93, badgeVariant: 'success' },
    'B': { label: 'Executing with Purpose', progressPercent: 79, badgeVariant: 'success' },
    'C': { label: 'Progress Underway', progressPercent: 65, badgeVariant: 'info' },
    'D': { label: 'Translate Plans to Action', progressPercent: 47, badgeVariant: 'warning' },
    'F': { label: 'Kick Off Implementation', progressPercent: 33, badgeVariant: 'neutral' },
    'N/A': { label: 'Not Yet Applicable', progressPercent: 0, badgeVariant: 'neutral' },
  },
};

export function getGradeDisplay(metricType: MetricType, grade: Grade): GradeMapping {
  const mapping = gradeMappings[metricType]?.[grade];
  
  if (!mapping) {
    // Fallback for missing or unknown grades
    return {
      label: 'Insight in Progress',
      progressPercent: 0,
      badgeVariant: 'neutral',
    };
  }
  
  return mapping;
}

export function getBadgeColorClass(variant: GradeMapping['badgeVariant']): string {
  switch (variant) {
    case 'success':
      return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
    case 'info':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
    case 'warning':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300';
    case 'neutral':
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }
}
