import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { STAGE_LABELS } from "@/lib/intake-constants";
import UndergradIntake from "@/components/intake/UndergradIntake";
import EarlyCareerIntake from "@/components/intake/EarlyCareerIntake";
import MidCareerIntake from "@/components/intake/MidCareerIntake";
import { Loader2 } from "lucide-react";
import type { BrandingIntake } from "@shared/schema";
import "@/assets/css/new-dashboard.css";

type Platform = "undergraduate" | "early_career" | "mid_career";

function mapProfessionalStatus(status: string | null | undefined): Platform | null {
  switch (status) {
    case "undergraduate_or_recent_grad":
      return "undergraduate";
    case "early_career":
      return "early_career";
    case "mid_career_or_senior":
    case "career_break_or_transition":
      return "mid_career";
    default:
      return null;
  }
}

export default function BrandingIntakePage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [stage, setStage] = useState(1);
  const [responses, setResponses] = useState<Record<string, any>>({});
  const responsesRef = useRef(responses);
  responsesRef.current = responses;

  const platform = mapProfessionalStatus(user?.professionalStatus);

  const { data: existingIntake, isLoading } = useQuery<BrandingIntake | null>({
    queryKey: ["/api/branding-intake"],
    enabled: !!user,
  });

  useEffect(() => {
    if (existingIntake) {
      setStage(existingIntake.completed ? 5 : existingIntake.currentStage || 1);
      setResponses((existingIntake.responses as Record<string, any>) || {});
    }
  }, [existingIntake]);

  const saveMutation = useMutation({
    mutationFn: async (data: {
      currentStage: number;
      responses: Record<string, any>;
      completed?: boolean;
      marketingOptIn?: boolean;
    }) => {
      const res = await apiRequest("POST", "/api/branding-intake", {
        platform,
        ...data,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/branding-intake"] });
    },
  });

  if (!user) return null;

  if (!platform) {
    return (
      <div className="min-h-screen bg-[var(--dashboard-silk)] flex items-center justify-center p-4 dashboard-layout">
        <div className="bg-white rounded-xl shadow-sm border border-[var(--dashboard-border)] p-8 max-w-md text-center">
          <h2 className="text-xl font-semibold text-[var(--dashboard-void)] mb-3 dashboard-heading">
            Professional Status Required
          </h2>
          <p className="text-gray-600 text-sm">
            Your professional status hasn't been set yet. Please complete your registration to access the branding intake.
          </p>
          <button
            onClick={() => setLocation("/dashboard")}
            className="mt-6 px-6 py-2 bg-[var(--dashboard-void)] text-white rounded-lg text-sm hover:opacity-90 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--dashboard-silk)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[var(--dashboard-aqua)] animate-spin" />
      </div>
    );
  }

  const stageLabels = STAGE_LABELS[platform] || [];
  const totalStages = 5;

  const handleUpdateResponses = (stageData: Record<string, any>) => {
    const merged = { ...responsesRef.current, ...stageData };
    setResponses(merged);
    responsesRef.current = merged;
  };

  const handleNext = () => {
    const latestResponses = responsesRef.current;
    const nextStage = Math.min(stage + 1, totalStages);
    const isCompleting = nextStage === totalStages;

    saveMutation.mutate({
      currentStage: nextStage,
      responses: latestResponses,
      completed: isCompleting,
      marketingOptIn: latestResponses.marketing_opt_in || false,
    });

    setStage(nextStage);
  };

  const handleBack = () => {
    setStage(Math.max(stage - 1, 1));
  };

  const progressPercent = stage === totalStages ? 100 : ((stage - 1) / (totalStages - 1)) * 100;

  const intakeProps = {
    stage,
    responses,
    onUpdateResponses: handleUpdateResponses,
    onNext: handleNext,
    onBack: handleBack,
  };

  return (
    <div className="min-h-screen bg-[var(--dashboard-silk)] dashboard-layout">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {stage < totalStages && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-2xl font-semibold text-[var(--dashboard-void)] dashboard-heading">
                Branding Intake
              </h1>
              <span className="text-sm text-gray-500">
                Step {stage} of {totalStages - 1}
              </span>
            </div>

            <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
              <div
                className="h-2 rounded-full bg-[var(--dashboard-aqua)] transition-all duration-500 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="flex justify-between">
              {stageLabels.slice(0, -1).map((label, i) => (
                <span
                  key={label}
                  className={`text-xs ${
                    i + 1 <= stage ? "text-[var(--dashboard-void)] font-medium" : "text-gray-400"
                  }`}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}

        {saveMutation.isPending && (
          <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Saving...
          </div>
        )}

        {platform === "undergraduate" && <UndergradIntake {...intakeProps} />}
        {platform === "early_career" && <EarlyCareerIntake {...intakeProps} />}
        {platform === "mid_career" && <MidCareerIntake {...intakeProps} />}
      </div>
    </div>
  );
}
