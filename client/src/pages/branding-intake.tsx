import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { STAGE_LABELS } from "@/lib/intake-constants";
import UndergradIntake from "@/components/intake/UndergradIntake";
import EarlyCareerIntake from "@/components/intake/EarlyCareerIntake";
import MidCareerIntake from "@/components/intake/MidCareerIntake";
import { Loader2 } from "lucide-react";
import type { BrandingIntake } from "@shared/schema";
import "@/assets/css/intake-theme.css";

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

function getTotalStages(platform: Platform | null): number {
  if (platform === "undergraduate" || platform === "early_career" || platform === "mid_career") return 6;
  return 5;
}

const PROFESSIONAL_STATUS_OPTIONS = [
  {
    value: "undergraduate_or_recent_grad",
    label: "Undergraduate student or recent graduate",
    sublabel: "Currently enrolled or <2 years full-time work experience",
  },
  {
    value: "early_career",
    label: "Early career professional",
    sublabel: "2–7 years full-time work experience, whether working or in graduate school",
  },
  {
    value: "mid_career_or_senior",
    label: "Mid-career or senior professional",
    sublabel: "8+ years full-time work experience, whether working or in graduate school",
  },
  {
    value: "career_break_or_transition",
    label: "Career break or significant transition",
    sublabel: "",
  },
] as const;

const DISCOVERY_SOURCE_OPTIONS = [
  { value: "university_partnership", label: "University partnership" },
  { value: "colleague_or_mentor", label: "Colleague or mentor referral" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "web_search", label: "Web search" },
  { value: "professional_network_or_conference", label: "Professional network or conference" },
  { value: "other", label: "Other" },
] as const;

function OnboardingForm({ onComplete }: { onComplete: () => void }) {
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [selectedSource, setSelectedSource] = useState<string>("");
  const [sourceOther, setSourceOther] = useState<string>("");
  const queryClient = useQueryClient();

  const onboardingMutation = useMutation({
    mutationFn: async (data: {
      professionalStatus: string;
      discoverySource: string;
      discoverySourceOther?: string;
    }) => {
      const res = await apiRequest("PATCH", "/api/user/onboarding", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
  });

  const canSubmit =
    selectedStatus !== "" &&
    selectedSource !== "" &&
    (selectedSource !== "other" || sourceOther.trim() !== "") &&
    !onboardingMutation.isPending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onboardingMutation.mutate({
      professionalStatus: selectedStatus,
      discoverySource: selectedSource,
      ...(selectedSource === "other" && sourceOther.trim()
        ? { discoverySourceOther: sourceOther.trim() }
        : {}),
    });
  };

  return (
    <div className="min-h-screen intake-page flex items-center justify-center p-4 intake-layout">
      <div className="bg-white rounded-2xl shadow-sm border border-[var(--intake-border)] p-10 w-full max-w-xl">
        <h2 className="text-2xl font-semibold text-[var(--intake-void)] mb-1 intake-heading">
          Before we begin
        </h2>
        <p className="text-sm text-gray-500 mb-8">
          Answer two quick questions so we can personalise your experience.
        </p>

        {/* Q1 */}
        <fieldset className="mb-8">
          <legend className="text-base font-semibold text-[var(--intake-void)] mb-4">
            Which best describes your current professional situation?
          </legend>
          <div className="flex flex-col gap-3">
            {PROFESSIONAL_STATUS_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
                  selectedStatus === opt.value
                    ? "border-[var(--intake-aqua)] bg-[var(--intake-aqua)]/5"
                    : "border-[var(--intake-border)] hover:border-[var(--intake-aqua)]/50"
                }`}
              >
                <input
                  type="radio"
                  name="professionalStatus"
                  value={opt.value}
                  checked={selectedStatus === opt.value}
                  onChange={() => setSelectedStatus(opt.value)}
                  className="mt-0.5 accent-[var(--intake-aqua)] shrink-0"
                />
                <span className="flex flex-col">
                  <span className="text-sm font-medium text-[var(--intake-void)]">{opt.label}</span>
                  {opt.sublabel && (
                    <span className="text-xs text-gray-400 mt-0.5">{opt.sublabel}</span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Q2 */}
        <fieldset className="mb-8">
          <legend className="text-base font-semibold text-[var(--intake-void)] mb-4">
            How did you hear about SLI.pro?
          </legend>
          <div className="flex flex-col gap-3">
            {DISCOVERY_SOURCE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
                  selectedSource === opt.value
                    ? "border-[var(--intake-aqua)] bg-[var(--intake-aqua)]/5"
                    : "border-[var(--intake-border)] hover:border-[var(--intake-aqua)]/50"
                }`}
              >
                <input
                  type="radio"
                  name="discoverySource"
                  value={opt.value}
                  checked={selectedSource === opt.value}
                  onChange={() => setSelectedSource(opt.value)}
                  className="mt-0.5 accent-[var(--intake-aqua)] shrink-0"
                />
                <span className="text-sm font-medium text-[var(--intake-void)]">{opt.label}</span>
              </label>
            ))}
          </div>

          {selectedSource === "other" && (
            <input
              type="text"
              value={sourceOther}
              onChange={(e) => setSourceOther(e.target.value)}
              placeholder="Please describe…"
              className="mt-3 w-full rounded-xl border border-[var(--intake-border)] px-4 py-2.5 text-sm text-[var(--intake-void)] outline-none focus:border-[var(--intake-aqua)] transition-colors"
            />
          )}
        </fieldset>

        {onboardingMutation.isError && (
          <p className="text-sm text-red-500 mb-4">
            Something went wrong. Please try again.
          </p>
        )}

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="intake-btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {onboardingMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Continue
        </button>
      </div>
    </div>
  );
}

export default function BrandingIntakePage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [stage, setStage] = useState(1);
  const [responses, setResponses] = useState<Record<string, any>>({});
  const responsesRef = useRef(responses);
  responsesRef.current = responses;

  const platform = mapProfessionalStatus(user?.professionalStatus);
  const totalStages = getTotalStages(platform);

  const { data: existingIntake, isLoading } = useQuery<BrandingIntake | null>({
    queryKey: ["/api/branding-intake"],
    enabled: !!user && !!platform,
  });

  useEffect(() => {
    if (existingIntake) {
      setStage(existingIntake.completed ? totalStages : existingIntake.currentStage || 1);
      setResponses((existingIntake.responses as Record<string, any>) || {});
    }
  }, [existingIntake, totalStages]);

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
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/branding-intake"], data);
      queryClient.invalidateQueries({ queryKey: ["/api/branding-intake"] });
    },
  });

  if (!user) return null;

  if (!platform) {
    return <OnboardingForm onComplete={() => {}} />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen intake-page flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[var(--intake-aqua)] animate-spin" />
      </div>
    );
  }

  const stageLabels = STAGE_LABELS[platform] || [];

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
    totalStages,
  };

  return (
    <div className="min-h-screen intake-page intake-layout">
      <div className="max-w-[46.2rem] mx-auto px-4 py-8">
        {stage < totalStages && (
          <div className="intake-header mb-8">
            <div className="flex items-center justify-between mb-4 relative z-10">
              <h1 className="text-2xl font-semibold text-white intake-heading">
                Branding Intake
              </h1>
              <span className="text-sm text-white/70">
                Step {stage} of {totalStages - 1}
              </span>
            </div>

            <div className="intake-progress-track mb-3 relative z-10">
              <div
                className="intake-progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="flex justify-between relative z-10">
              {stageLabels.slice(0, -1).map((label, i) => (
                <span
                  key={label}
                  className={`text-xs ${
                    i + 1 <= stage ? "text-white font-medium" : "text-white/40"
                  }`}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}

        {saveMutation.isPending && (
          <div className="mb-4 flex items-center gap-2 text-sm text-[var(--intake-aqua-dark)]">
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
