import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { ChevronLeft, Loader2, Linkedin, Stars, Award, ArrowRight, Lightbulb, FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceToNow } from "date-fns";
import NavBar from "@/components/nav-bar";

/**
 * What the optimization endpoint returns.
 *
 * The query was previously untyped, so `optimization` was `{}` and every field
 * access was an error the build tolerated. Typing it fixes those and — the
 * reason it is worth doing rather than casting — means the A4 holisticReview
 * fields are checked rather than assumed.
 *
 * Everything is optional because records created before A4 have no
 * holisticReview, and the older MVP rows are missing sections too.
 */
type OptimizationChange = {
  section?: string;
  current?: string;
  proposed?: string;
  why?: string;
  dependsOn?: string;
};

type LinkedinOptimizationView = {
  id?: number;
  createdAt?: string;
  alignmentAssessment?: string;
  headlineOptimization?: {
    currentHeadline?: string;
    recommendedHeadline?: string;
    rationale?: string;
  };
  aboutSection?: {
    currentAnalysis?: string;
    recommendations?: string;
    suggestedStructure?: string;
    keyElements?: string;
    draftContent?: string;
  };
  profileEnhancements?: {
    experienceSection?: string;
    skillsEndorsements?: string;
    activityEngagement?: string;
    visualImprovements?: string;
  };
  contentStrategy?: {
    themes?: string;
    postIdeas?: string;
    engagementTips?: string;
  };
  implementationPriorities?: string;
  /** A4: the integrated read. Absent on anything generated before A4. */
  holisticReview?: {
    throughLine?: string;
    readsAsToday?: string;
    readsAsAfter?: string;
    changes?: OptimizationChange[];
    sequence?: string;
  };
};

export default function LinkedinOptimizationPage() {
  const [_, navigate] = useLocation();
  const params = useParams();
  const id = params?.id;

  // Fetch the specific LinkedIn optimization if ID is provided, otherwise fetch the latest
  const { data: optimization, isLoading } = useQuery<LinkedinOptimizationView>({
    queryKey: id ? [`/api/linkedin-optimizations/${id}`] : ["/api/linkedin-optimizations/latest"],
  });

  // Handle generate new optimization
  const handleGenerateNew = () => {
    navigate("/linkedin-optimization/generate");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <NavBar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!optimization) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <NavBar />
        <main className="flex-1 container max-w-5xl mx-auto px-4 py-8">
          <Button
            variant="ghost"
            className="mb-6 flex items-center text-muted-foreground"
            onClick={() => navigate("/")}
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>

          <div className="bg-white shadow-card rounded-lg p-8 text-center">
            <div className="my-8">
              <div className="bg-blue-100 h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Linkedin className="h-10 w-10 text-blue-600" />
              </div>
              <h1 className="text-2xl font-semibold">No LinkedIn Optimization Found</h1>
              <p className="mt-2 text-gray-600 max-w-md mx-auto">
                You haven't generated a LinkedIn optimization yet. Generate one to get AI-powered recommendations
                for enhancing your LinkedIn profile.
              </p>
              <Button className="mt-6" onClick={handleGenerateNew}>
                Generate Your First Optimization
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Format date
  const timeAgo = optimization.createdAt
    ? formatDistanceToNow(new Date(optimization.createdAt), { addSuffix: true })
    : "recently";

  /*
   * Does this record actually carry the integrated review?
   *
   * NOT `!!optimization.holisticReview`, which is what this used to test and is
   * always true. The server stores the whole payload in one `holistic_review`
   * jsonb column, so the read path hands back a populated object under that name
   * whether or not the integrated review is in it. The panel below therefore
   * opened for every record and filled none of it — every field inside is
   * separately guarded, so each one silently rendered nothing — and the tabs
   * were captioned "detail behind the changes above" with nothing above.
   *
   * Any real field counts, not just `throughLine`: a partial generation that
   * returned changes but no through-line is still worth showing.
   */
  const review = optimization.holisticReview;
  const hasIntegratedReview = !!(
    review &&
    (review.throughLine ||
      review.readsAsToday ||
      review.readsAsAfter ||
      (review.changes?.length ?? 0) > 0 ||
      review.sequence)
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavBar />
      <main className="flex-1 container max-w-5xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <Button
            variant="ghost"
            className="flex items-center text-muted-foreground"
            onClick={() => navigate("/")}
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
          
          {/* <Button
            onClick={() => navigate("/linkedin-content-drafts")}
            className="flex items-center"
          >
            <FileText className="mr-2 h-4 w-4" />
            Pre-Drafted Content
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button> */}
        </div>

        <div className="bg-white shadow-card rounded-lg overflow-hidden mb-8">
          <div className="bg-blue-50 p-6 border-b border-blue-100">
            <div className="flex items-center gap-2 mb-1">
              <Linkedin className="h-5 w-5 text-blue-600" />
              <h1 className="text-2xl font-semibold text-blue-900">LinkedIn Optimization</h1>
              <Badge variant="outline" className="ml-auto text-blue-700 border-blue-200 bg-blue-50">
                Generated {timeAgo}
              </Badge>
            </div>
            <p className="text-blue-700">
              Recommendations to enhance your professional presence on LinkedIn
            </p>
          </div>

          {/*
            A4: the whole profile, before the sections.

            "The optimization should present a holistic, integrated view of the
            full profile with changes shown in context, not as disconnected
            pieces."

            This sits ABOVE the tabs rather than inside them, and that placement
            is the fix. A profile is read top to bottom in about nine seconds;
            the tabs below optimise the headline, the About and the experience
            as separate problems, which produces a profile saying three
            different things well. The through-line comes first, then the
            before/after changes with their dependencies, and only then the
            per-section detail.

            Rendered only when present — records created before A4 have no
            holisticReview, and their tabs still work exactly as they did.
          */}
          {/*
            Records generated before A4 have no integrated review, and there is
            no way to derive one from the six sections — it is a different read
            of the profile, not a summary of them. So say that plainly and offer
            the one action that fixes it, rather than showing an empty panel or
            silently dropping to the tabs as though nothing were missing.
          */}
          {!hasIntegratedReview && (
            <div className="border-b bg-slate-50 px-6 py-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
              <p className="text-sm text-slate-600">
                This optimization predates the integrated profile review, so it only has the
                section-by-section detail below. Regenerating adds the whole-profile read —
                the through-line, what your profile says today, and each change in context.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 shrink-0 sm:mt-0"
                onClick={handleGenerateNew}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Regenerate
              </Button>
            </div>
          )}

          {hasIntegratedReview && (
            <div className="border-b bg-slate-50 p-6 space-y-5">
              {review!.throughLine && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    What this profile should say
                  </p>
                  <p className="pt-1 text-lg leading-relaxed text-slate-900">
                    {review!.throughLine}
                  </p>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                {review!.readsAsToday && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-amber-700">
                      What it says today
                    </p>
                    <p className="pt-1 text-sm leading-relaxed text-amber-900 whitespace-pre-line">
                      {review!.readsAsToday}
                    </p>
                  </div>
                )}
                {review!.readsAsAfter && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-emerald-700">
                      What it would say after
                    </p>
                    <p className="pt-1 text-sm leading-relaxed text-emerald-900 whitespace-pre-line">
                      {review!.readsAsAfter}
                    </p>
                  </div>
                )}
              </div>

              {/* Changes in context — current beside proposed, never apart. */}
              {(review!.changes ?? []).length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    The changes, in order
                  </p>
                  {(review!.changes ?? []).map(
                    (change, i) => (
                      <div key={i} className="rounded-lg border bg-white p-4">
                        <p className="text-sm font-medium">{change.section}</p>
                        <div className="grid gap-3 pt-2 sm:grid-cols-2">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-slate-400">Now</p>
                            <p className="pt-1 text-sm text-slate-500 line-through decoration-slate-300">
                              {change.current}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide text-slate-400">
                              Instead
                            </p>
                            <p className="pt-1 text-sm text-slate-900">{change.proposed}</p>
                          </div>
                        </div>
                        {change.why && (
                          <p className="pt-3 text-sm text-slate-600">{change.why}</p>
                        )}
                        {change.dependsOn && (
                          /* The dependency is the thing the fragmented view
                             loses — a headline change that only works if the
                             About opening moves too. */
                          <p className="pt-2 text-xs text-slate-500">
                            Only works alongside: {change.dependsOn}
                          </p>
                        )}
                      </div>
                    ),
                  )}
                </div>
              )}

              {review!.sequence && (
                <div className="rounded-lg border bg-white p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Start here</p>
                  <p className="pt-1 text-sm leading-relaxed text-slate-800 whitespace-pre-line">
                    {review!.sequence}
                  </p>
                </div>
              )}
            </div>
          )}

          <Tabs defaultValue="overview" className="p-6">
            {hasIntegratedReview && (
              <p className="mb-3 text-xs text-slate-500">
                Section-by-section detail behind the changes above.
              </p>
            )}
            <TabsList className="mb-6">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="headline">Headline</TabsTrigger>
              <TabsTrigger value="about">About Section</TabsTrigger>
              <TabsTrigger value="profile">Profile Enhancements</TabsTrigger>
              <TabsTrigger value="content">Content Strategy</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              <div className="bg-blue-50 p-5 rounded-lg border border-blue-100">
                <h2 className="text-lg font-medium flex items-center gap-2 mb-3 text-blue-800">
                  <Stars className="h-5 w-5 text-blue-600" />
                  SLI Alignment Assessment
                </h2>
                <div className="text-blue-900 whitespace-pre-line">
                  {optimization.alignmentAssessment}
                </div>
              </div>

              <div className="bg-amber-50 p-5 rounded-lg border border-amber-100">
                <h2 className="text-lg font-medium flex items-center gap-2 mb-3 text-amber-800">
                  <Award className="h-5 w-5 text-amber-600" />
                  Implementation Priorities
                </h2>
                <div className="text-amber-900 whitespace-pre-line">
                  {optimization.implementationPriorities}
                </div>
              </div>
            </TabsContent>

            {/* Headline Tab */}
            <TabsContent value="headline" className="space-y-6">
              {optimization.headlineOptimization ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-gray-50 p-5 rounded-lg border border-gray-200">
                      <h3 className="font-medium text-gray-700 mb-2">Current Headline</h3>
                      <p className="text-gray-800">
                        {optimization.headlineOptimization.currentHeadline || "No current headline provided"}
                      </p>
                    </div>
                    <div className="bg-green-50 p-5 rounded-lg border border-green-100">
                      <h3 className="font-medium text-green-700 mb-2">Recommended Headline</h3>
                      <p className="text-green-800 font-medium">
                        {optimization.headlineOptimization.recommendedHeadline || "No recommendation available"}
                      </p>
                    </div>
                  </div>
                  
                  <div className="bg-blue-50 p-5 rounded-lg border border-blue-100">
                    <h3 className="font-medium text-blue-700 mb-2">Rationale</h3>
                    <p className="text-blue-800 whitespace-pre-line">
                      {optimization.headlineOptimization.rationale || "No rationale provided"}
                    </p>
                  </div>
                </>
              ) : (
                <div className="text-center p-8">
                  <p className="text-gray-500">No headline optimization data available</p>
                </div>
              )}
            </TabsContent>

            {/* About Section Tab */}
            <TabsContent value="about" className="space-y-6">
              {optimization.aboutSection ? (
                <>
                  <div className="bg-gray-50 p-5 rounded-lg border border-gray-200">
                    <h3 className="font-medium text-gray-700 mb-2">Current Analysis</h3>
                    <p className="text-gray-800 whitespace-pre-line">
                      {optimization.aboutSection.currentAnalysis || "No current analysis provided"}
                    </p>
                  </div>
                  
                  <div className="bg-blue-50 p-5 rounded-lg border border-blue-100">
                    <h3 className="font-medium text-blue-700 mb-2">Recommendations</h3>
                    <p className="text-blue-800 whitespace-pre-line">
                      {optimization.aboutSection.recommendations || "No recommendations provided"}
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-gray-50 p-5 rounded-lg border border-gray-200">
                      <h3 className="font-medium text-gray-700 mb-2">Suggested Structure</h3>
                      <p className="text-gray-800 whitespace-pre-line">
                        {optimization.aboutSection.suggestedStructure || "No structure suggestion provided"}
                      </p>
                    </div>
                    
                    <div className="bg-gray-50 p-5 rounded-lg border border-gray-200">
                      <h3 className="font-medium text-gray-700 mb-2">Key Elements</h3>
                      <p className="text-gray-800 whitespace-pre-line">
                        {optimization.aboutSection.keyElements || "No key elements provided"}
                      </p>
                    </div>
                  </div>
                  
                  <div className="bg-green-50 p-5 rounded-lg border border-green-100">
                    <h3 className="font-medium text-green-700 mb-2">Draft Content</h3>
                    <p className="text-green-800 whitespace-pre-line">
                      {optimization.aboutSection.draftContent || "No draft content provided"}
                    </p>
                  </div>
                </>
              ) : (
                <div className="text-center p-8">
                  <p className="text-gray-500">No about section optimization data available</p>
                </div>
              )}
            </TabsContent>

            {/* Profile Enhancements Tab */}
            <TabsContent value="profile" className="space-y-6">
              {optimization.profileEnhancements ? (
                <>
                  <div className="bg-blue-50 p-5 rounded-lg border border-blue-100">
                    <h3 className="font-medium text-blue-700 mb-2">Experience Section</h3>
                    <p className="text-blue-800 whitespace-pre-line">
                      {optimization.profileEnhancements.experienceSection || "No experience section recommendations provided"}
                    </p>
                  </div>
                  
                  <div className="bg-blue-50 p-5 rounded-lg border border-blue-100">
                    <h3 className="font-medium text-blue-700 mb-2">Skills & Endorsements</h3>
                    <p className="text-blue-800 whitespace-pre-line">
                      {optimization.profileEnhancements.skillsEndorsements || "No skills recommendations provided"}
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-blue-50 p-5 rounded-lg border border-blue-100">
                      <h3 className="font-medium text-blue-700 mb-2">Activity & Engagement</h3>
                      <p className="text-blue-800 whitespace-pre-line">
                        {optimization.profileEnhancements.activityEngagement || "No activity recommendations provided"}
                      </p>
                    </div>
                    
                    <div className="bg-blue-50 p-5 rounded-lg border border-blue-100">
                      <h3 className="font-medium text-blue-700 mb-2">Visual Improvements</h3>
                      <p className="text-blue-800 whitespace-pre-line">
                        {optimization.profileEnhancements.visualImprovements || "No visual recommendations provided"}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center p-8">
                  <p className="text-gray-500">No profile enhancement data available</p>
                </div>
              )}
            </TabsContent>

            {/* Content Strategy Tab */}
            <TabsContent value="content" className="space-y-6">
              {optimization.contentStrategy ? (
                <>
                  <div className="bg-amber-50 p-5 rounded-lg border border-amber-100">
                    <h3 className="font-medium text-amber-700 mb-2">Content Themes</h3>
                    <p className="text-amber-800 whitespace-pre-line">
                      {optimization.contentStrategy.themes || "No content themes provided"}
                    </p>
                  </div>
                  
                  <div className="bg-amber-50 p-5 rounded-lg border border-amber-100">
                    <h3 className="font-medium text-amber-700 mb-2">Post Ideas</h3>
                    <p className="text-amber-800 whitespace-pre-line">
                      {optimization.contentStrategy.postIdeas || "No post ideas provided"}
                    </p>
                  </div>
                  
                  <div className="bg-amber-50 p-5 rounded-lg border border-amber-100">
                    <h3 className="font-medium text-amber-700 mb-2">Engagement Tips</h3>
                    <p className="text-amber-800 whitespace-pre-line">
                      {optimization.contentStrategy.engagementTips || "No engagement tips provided"}
                    </p>
                  </div>
                </>
              ) : (
                <div className="text-center p-8">
                  <p className="text-gray-500">No content strategy data available</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex justify-between items-center">
          <Button
            variant="outline"
            onClick={() => navigate("/")}
            className="flex items-center"
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
          <Button
            onClick={handleGenerateNew}
            className="flex items-center"
          >
            <Lightbulb className="mr-2 h-4 w-4" />
            Generate New
          </Button>
        </div>
      </main>
    </div>
  );
}