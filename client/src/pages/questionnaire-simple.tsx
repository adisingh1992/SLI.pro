import React, { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { UserProfile } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Loader2, CheckCircle, Upload, X, FileText } from "lucide-react";

type PlatformType = "undergraduate" | "early_career" | "mid_career";

function mapProfessionalStatus(status?: string | null): PlatformType | null {
  if (!status) return null;
  if (status === "undergraduate_or_recent_grad") return "undergraduate";
  if (status === "early_career") return "early_career";
  if (
    status === "mid_career_or_senior" ||
    status === "career_break_or_transition"
  )
    return "mid_career";
  return null;
}

const SECTIONS = [
  { label: "A", name: "Digital Presence", steps: [1, 2, 3, 4] },
  { label: "B", name: "Identity & Narrative", steps: [5, 6, 7] },
  { label: "C", name: "Content", steps: [8, 9, 10] },
  { label: "D", name: "Networking", steps: [11, 12] },
  { label: "E", name: "Aspirations", steps: [13, 14, 15] },
  { label: "F", name: "Self-Knowledge", steps: [16, 17, 18] },
];

const TOTAL_STEPS = 18;

function getSectionForStep(step: number) {
  return SECTIONS.find((s) => s.steps.includes(step)) ?? SECTIONS[0];
}

export default function QuestionnairePage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);

  const platform: PlatformType | null = mapProfessionalStatus(
    user?.professionalStatus,
  );

  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [linkedinPresence, setLinkedinPresence] = useState("");
  const [otherPresence, setOtherPresence] = useState<string[]>([]);
  const [presenceSelfAssessment, setPresenceSelfAssessment] = useState<
    number | null
  >(null);
  const [narrativeDiagnostic, setNarrativeDiagnostic] = useState("");
  const [talkingAboutYourselfHardest, setTalkingAboutYourselfHardest] =
    useState<string[]>([]);
  const [desiredChange, setDesiredChange] = useState("");
  const [contentComfort, setContentComfort] = useState<number | null>(null);
  const [contentHoldBack, setContentHoldBack] = useState<string[]>([]);
  const [preferredContentFormat, setPreferredContentFormat] = useState<
    string[]
  >([]);
  const [networkState, setNetworkState] = useState("");
  const [networkingBeliefs, setNetworkingBeliefs] = useState<string[]>([]);
  const [topicInterests, setTopicInterests] = useState<string[]>([]);
  const [topicInterestsOther, setTopicInterestsOther] = useState("");
  const [crossCuttingThemes, setCrossCuttingThemes] = useState<string[]>([]);
  const [aspiration, setAspiration] = useState("");
  const [personalityAssessments, setPersonalityAssessments] = useState<
    string[]
  >([]);
  const [files, setFiles] = useState<File[]>([]);
  const [additionalInfo, setAdditionalInfo] = useState("");

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle",
  );

  const { data: userProfile, isLoading: profileLoading } =
    useQuery<UserProfile>({
      queryKey: ["/api/user/profile"],
      enabled: !!user,
    });

  const questionnaireMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/questionnaire", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Registration Complete!",
        description:
          "Your account setup is now complete. Thank you for providing your career insights!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
      navigate("/profile");
    },
    onError: () => {
      toast({
        title: "Error",
        description:
          "There was a problem submitting your questionnaire. Please try again.",
        variant: "destructive",
      });
    },
  });

  const saveAsDraftMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest(
        "POST",
        "/api/questionnaire/draft",
        data,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "There was a problem saving your draft. Please try again.",
        variant: "destructive",
      });
    },
  });

  React.useEffect(() => {
    if (userProfile?.questionnaire) {
      const q = userProfile.questionnaire;

      if (q.background) setLinkedinUrl(q.background);

      try {
        if (q.goals) {
          const goalsData = JSON.parse(q.goals);
          if (goalsData.linkedinPresence) setLinkedinPresence(goalsData.linkedinPresence);
          if (goalsData.otherPresence) setOtherPresence(goalsData.otherPresence);
          if (goalsData.networkState) setNetworkState(goalsData.networkState);
          if (goalsData.networkingBeliefs) setNetworkingBeliefs(goalsData.networkingBeliefs);
        }
      } catch {}

      try {
        if (q.aspirations) {
          const aspirationsData = JSON.parse(q.aspirations);
          if (aspirationsData.presenceSelfAssessment != null)
            setPresenceSelfAssessment(aspirationsData.presenceSelfAssessment);
          if (aspirationsData.narrativeDiagnostic)
            setNarrativeDiagnostic(aspirationsData.narrativeDiagnostic);
          if (aspirationsData.talkingAboutYourselfHardest)
            setTalkingAboutYourselfHardest(aspirationsData.talkingAboutYourselfHardest);
          if (aspirationsData.desiredChange)
            setDesiredChange(aspirationsData.desiredChange);
          if (aspirationsData.aspiration)
            setAspiration(aspirationsData.aspiration);
          if (aspirationsData.additionalInfo)
            setAdditionalInfo(aspirationsData.additionalInfo);
        }
      } catch {}

      try {
        if (q.challenges) {
          const challengesData = JSON.parse(q.challenges);
          if (challengesData.contentComfort != null)
            setContentComfort(challengesData.contentComfort);
          if (challengesData.contentHoldBack)
            setContentHoldBack(challengesData.contentHoldBack);
        }
      } catch {}

      try {
        if (q.interests) {
          const interestsData = JSON.parse(q.interests);
          if (interestsData.preferredContentFormat)
            setPreferredContentFormat(interestsData.preferredContentFormat);
          if (interestsData.topicInterests)
            setTopicInterests(interestsData.topicInterests);
          if (interestsData.topicInterestsOther)
            setTopicInterestsOther(interestsData.topicInterestsOther);
          if (interestsData.crossCuttingThemes)
            setCrossCuttingThemes(interestsData.crossCuttingThemes);
          if (interestsData.personalityAssessments)
            setPersonalityAssessments(interestsData.personalityAssessments);
        }
      } catch {}
    }
  }, [userProfile]);

  const prepareFormData = (isDraft = true) => {
    return {
      isDraft,
      background: linkedinUrl,
      goals: JSON.stringify({
        linkedinPresence,
        otherPresence,
        networkState,
        networkingBeliefs,
      }),
      aspirations: JSON.stringify({
        presenceSelfAssessment,
        narrativeDiagnostic,
        talkingAboutYourselfHardest,
        desiredChange,
        aspiration,
        additionalInfo,
      }),
      challenges: JSON.stringify({
        contentComfort,
        contentHoldBack,
      }),
      interests: JSON.stringify({
        preferredContentFormat,
        topicInterests,
        topicInterestsOther,
        crossCuttingThemes,
        personalityAssessments,
      }),
      timeframe: "",
      industry: "",
    };
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        if (!reader.result) {
          reject(new Error("Failed to read file"));
          return;
        }
        const base64String = reader.result.toString();
        const base64Data = base64String.split(",")[1];
        resolve(base64Data);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const uploadAssessmentFiles = async () => {
    if (files.length === 0) return;
    try {
      for (const file of files) {
        const fileData = await fileToBase64(file);
        const fileType = file.name.toLowerCase().endsWith(".pdf")
          ? "assessment-pdf"
          : file.name.toLowerCase().match(/\.(jpg|jpeg|png)$/)
            ? "assessment-image"
            : "assessment-doc";
        await apiRequest("POST", "/api/documents", {
          name: `Assessment: ${file.name}`,
          type: fileType,
          fileName: file.name,
          fileData: fileData,
        });
      }
      toast({
        title: "Files Uploaded",
        description: `Successfully uploaded ${files.length} file${files.length > 1 ? "s" : ""}.`,
      });
    } catch (error) {
      console.error("Error uploading files:", error);
      toast({
        title: "Upload Error",
        description:
          "There was a problem uploading one or more files. Please try again.",
        variant: "destructive",
      });
    }
  };

  const validateCurrentStep = (): boolean => {
    switch (currentStep) {
      case 1: {
        const valid =
          linkedinUrl.trim() !== "" &&
          linkedinUrl.toLowerCase().includes("linkedin.com");
        if (!valid)
          toast({
            title: "Required Field",
            description:
              "Please enter a valid LinkedIn URL (must include linkedin.com)",
            variant: "destructive",
          });
        return valid;
      }
      case 2: {
        const valid = linkedinPresence !== "";
        if (!valid)
          toast({
            title: "Required Field",
            description: "Please select an option",
            variant: "destructive",
          });
        return valid;
      }
      case 3:
        return true;
      case 4: {
        const valid = presenceSelfAssessment !== null;
        if (!valid)
          toast({
            title: "Required Field",
            description: "Please select a rating",
            variant: "destructive",
          });
        return valid;
      }
      case 5: {
        const valid = narrativeDiagnostic !== "";
        if (!valid)
          toast({
            title: "Required Field",
            description: "Please select an option",
            variant: "destructive",
          });
        return valid;
      }
      case 6: {
        const valid = talkingAboutYourselfHardest.length >= 1;
        if (!valid)
          toast({
            title: "Required Field",
            description: "Please select at least one option",
            variant: "destructive",
          });
        return valid;
      }
      case 7: {
        const valid = desiredChange.trim() !== "";
        if (!valid)
          toast({
            title: "Required Field",
            description: "Please answer this question",
            variant: "destructive",
          });
        return valid;
      }
      case 8: {
        const valid = contentComfort !== null;
        if (!valid)
          toast({
            title: "Required Field",
            description: "Please select a rating",
            variant: "destructive",
          });
        return valid;
      }
      case 9: {
        const valid = contentHoldBack.length >= 1;
        if (!valid)
          toast({
            title: "Required Field",
            description: "Please select at least one option",
            variant: "destructive",
          });
        return valid;
      }
      case 10: {
        const valid = preferredContentFormat.length >= 1;
        if (!valid)
          toast({
            title: "Required Field",
            description: "Please select at least one option",
            variant: "destructive",
          });
        return valid;
      }
      case 11: {
        const valid = networkState !== "";
        if (!valid)
          toast({
            title: "Required Field",
            description: "Please select an option",
            variant: "destructive",
          });
        return valid;
      }
      case 12: {
        const valid = networkingBeliefs.length >= 1;
        if (!valid)
          toast({
            title: "Required Field",
            description: "Please select at least one option",
            variant: "destructive",
          });
        return valid;
      }
      case 13: {
        const valid = topicInterests.length >= 1;
        if (!valid)
          toast({
            title: "Required Field",
            description: "Please select at least one topic",
            variant: "destructive",
          });
        return valid;
      }
      case 14: {
        const valid = crossCuttingThemes.length >= 1;
        if (!valid)
          toast({
            title: "Required Field",
            description: "Please select at least one theme",
            variant: "destructive",
          });
        return valid;
      }
      case 15: {
        const valid = aspiration.trim() !== "";
        if (!valid)
          toast({
            title: "Required Field",
            description: "Please answer this question",
            variant: "destructive",
          });
        return valid;
      }
      case 16:
      case 17:
      case 18:
        return true;
      default:
        return true;
    }
  };

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  const autoSave = async (): Promise<boolean> => {
    try {
      setSaveStatus("saving");
      const formData = prepareFormData(true);
      await saveAsDraftMutation.mutateAsync(formData);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
      queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
      return true;
    } catch (error) {
      console.error("Auto-save failed:", error);
      setSaveStatus("idle");
      return false;
    }
  };

  const nextStep = async () => {
    if (!validateCurrentStep()) return;
    await autoSave();
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(currentStep + 1);
      scrollToTop();
    }
  };

  const prevStep = async () => {
    if (currentStep > 1) {
      await autoSave();
      setCurrentStep(currentStep - 1);
      scrollToTop();
    }
  };

  const handleSaveAsDraft = async () => {
    try {
      const formData = prepareFormData(true);
      setSaveStatus("saving");
      await saveAsDraftMutation.mutateAsync(formData);
      await queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
      setSaveStatus("saved");
      toast({
        title: "Draft Saved",
        description: "Your questionnaire draft has been saved successfully.",
      });
      setSaveStatus("idle");
      navigate("/", { replace: true });
    } catch (error) {
      setSaveStatus("idle");
      toast({
        title: "Error",
        description: "Failed to save draft. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async () => {
    if (!validateCurrentStep()) return;
    if (files.length > 0) {
      await uploadAssessmentFiles();
    }
    setSaveStatus("saving");
    const formData = prepareFormData(false);
    await questionnaireMutation.mutateAsync(formData);
    await queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
    setSaveStatus("saved");
    toast({
      title: "Questionnaire Submitted",
      description: "Your questionnaire has been successfully submitted.",
    });
    setSaveStatus("idle");
    navigate("/", { replace: true });
  };

  const toggleMultiSelect = (
    value: string,
    current: string[],
    setter: (v: string[]) => void,
    max?: number,
  ) => {
    if (current.includes(value)) {
      setter(current.filter((v) => v !== value));
    } else {
      if (max && current.length >= max) {
        toast({
          title: `Maximum ${max} selections`,
          description: `You can only select up to ${max} options.`,
          variant: "destructive",
        });
        return;
      }
      setter([...current, value]);
    }
  };

  const LikertScale = ({
    value,
    onChange,
    lowLabel,
    highLabel,
  }: {
    value: number | null;
    onChange: (v: number) => void;
    lowLabel: string;
    highLabel: string;
  }) => (
    <div className="mt-4">
      <div className="flex gap-3 flex-wrap">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`w-12 h-12 rounded-full border-2 font-semibold text-lg transition-colors ${
              value === n
                ? "bg-[#bed6d1] border-[#bed6d1] text-white"
                : "border-gray-300 text-gray-600 hover:border-[#bed6d1]"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between mt-2 text-xs text-gray-500">
        <span>1 = {lowLabel}</span>
        <span>5 = {highLabel}</span>
      </div>
    </div>
  );

  const MultiSelectPill = ({
    options,
    selected,
    onToggle,
    max,
  }: {
    options: string[];
    selected: string[];
    onToggle: (v: string) => void;
    max?: number;
  }) => (
    <div className="flex flex-wrap gap-2 mt-3">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onToggle(opt)}
          className={`px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
            selected.includes(opt)
              ? "bg-[#bed6d1] border-[#bed6d1] text-white"
              : "border-gray-300 text-gray-700 hover:border-[#bed6d1]"
          }`}
        >
          {opt}
        </button>
      ))}
      {max && (
        <span className="self-center text-xs text-gray-400 ml-1">
          {selected.length}/{max} selected
        </span>
      )}
    </div>
  );

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-gray-700 font-semibold text-base block mb-1">
                Q1 — LinkedIn URL <span className="text-red-500">*</span>
              </Label>
              <p className="text-sm text-gray-500 mb-3">
                Your LinkedIn profile URL — our AI coach will use this to audit
                your presence.
              </p>
              <Input
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                placeholder="https://www.linkedin.com/in/yourprofile"
                className="w-full"
              />
            </div>
          </div>
        );

      case 2: {
        const q2Options: Record<PlatformType, string[]> = {
          undergraduate: [
            "I don't have a LinkedIn profile yet",
            "I have one but haven't touched it in months",
            "I've updated it recently but I'm not confident it's strong",
            "I actively maintain it and post occasionally",
          ],
          early_career: [
            "I have a profile but rarely update it",
            "I update it when job searching but not otherwise",
            "I maintain it regularly but don't post much",
            "I'm active — I post, comment, and engage consistently",
          ],
          mid_career: [
            "I have a profile but it's outdated",
            "I update it periodically but it doesn't reflect my current value",
            "I maintain it and use it for networking",
            "I'm active and use LinkedIn strategically for visibility",
          ],
        };
        const options = platform ? q2Options[platform] : q2Options.early_career;
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-gray-700 font-semibold text-base block mb-1">
                Q2 — Current LinkedIn Presence{" "}
                <span className="text-red-500">*</span>
              </Label>
              <p className="text-sm text-gray-500 mb-3">
                Which best describes your current LinkedIn activity?
              </p>
              <RadioGroup
                value={linkedinPresence}
                onValueChange={setLinkedinPresence}
                className="space-y-3 mt-2"
              >
                {options.map((opt) => (
                  <div key={opt} className="flex items-start space-x-3">
                    <RadioGroupItem value={opt} id={`q2-${opt}`} className="mt-0.5" />
                    <Label htmlFor={`q2-${opt}`} className="cursor-pointer leading-snug">
                      {opt}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </div>
        );
      }

      case 3: {
        const q3Options = [
          "Personal website or portfolio",
          "GitHub or technical portfolio",
          "Medium / Substack / blog",
          "Twitter/X",
          "Industry-specific platform (Behance, Dribbble, etc.)",
          "None of these",
        ];
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-gray-700 font-semibold text-base block mb-1">
                Q3 — Other Professional Online Presence{" "}
                <span className="text-gray-400 font-normal text-sm">(Optional)</span>
              </Label>
              <p className="text-sm text-gray-500 mb-2">
                Select any other platforms where you have a professional
                presence.
              </p>
              <MultiSelectPill
                options={q3Options}
                selected={otherPresence}
                onToggle={(v) =>
                  toggleMultiSelect(v, otherPresence, setOtherPresence)
                }
              />
            </div>
          </div>
        );
      }

      case 4: {
        const q4Prompt: Record<PlatformType, string> = {
          undergraduate:
            "How well does your online presence reflect who you are professionally?",
          early_career:
            "How well does your professional brand position you for where you want to go next?",
          mid_career:
            "How well does your professional presence reflect your current expertise and leadership?",
        };
        const prompt = platform ? q4Prompt[platform] : q4Prompt.early_career;
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-gray-700 font-semibold text-base block mb-1">
                Q4 — Self-Assessment of Professional Presence{" "}
                <span className="text-red-500">*</span>
              </Label>
              <p className="text-sm text-gray-600 mb-1">{prompt}</p>
              <LikertScale
                value={presenceSelfAssessment}
                onChange={setPresenceSelfAssessment}
                lowLabel="Not at all"
                highLabel="Very well"
              />
            </div>
          </div>
        );
      }

      case 5: {
        const q5Config: Record<
          PlatformType,
          { prompt: string; options: string[] }
        > = {
          undergraduate: {
            prompt:
              "When someone asks \"what do you want to do after graduation,\" how do you feel?",
            options: [
              "Confident — I have a clear answer",
              "Directional — general sense but struggle to articulate",
              "Overwhelmed — too many interests",
              "Lost — I genuinely don't know yet",
            ],
          },
          early_career: {
            prompt:
              "When someone asks \"what do you do?,\" how confident are you?",
            options: [
              "Very — clear, compelling answer",
              "Somewhat — I describe my title but not my value",
              "Uncertain — I'm in transition",
              "Stuck — my role doesn't reflect where I'm heading",
            ],
          },
          mid_career: {
            prompt: "When someone asks \"what's your story?,\" how do you feel?",
            options: [
              "Strong — clear narrative that opens doors",
              "Fragmented — broad experience, can't connect it",
              "Outdated — reflects who I was, not who I am",
              "Invisible — strong track record but nobody knows",
            ],
          },
        };
        const config = platform ? q5Config[platform] : q5Config.early_career;
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-gray-700 font-semibold text-base block mb-1">
                Q5 — Professional Narrative Diagnostic{" "}
                <span className="text-red-500">*</span>
              </Label>
              <p className="text-sm text-gray-600 mb-3">{config.prompt}</p>
              <RadioGroup
                value={narrativeDiagnostic}
                onValueChange={setNarrativeDiagnostic}
                className="space-y-3"
              >
                {config.options.map((opt) => (
                  <div key={opt} className="flex items-start space-x-3">
                    <RadioGroupItem value={opt} id={`q5-${opt}`} className="mt-0.5" />
                    <Label htmlFor={`q5-${opt}`} className="cursor-pointer leading-snug">
                      {opt}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </div>
        );
      }

      case 6: {
        const q6Options: Record<PlatformType, string[]> = {
          undergraduate: [
            "Don't have enough experience to talk about",
            "Not sure what makes me different",
            "Can't connect academic work to career outcomes",
            "Don't know what tone or voice to use",
            "Feel awkward self-promoting",
            "I don't have this problem",
          ],
          early_career: [
            "Default to my job title instead of my value",
            "Not sure what makes me different from peers",
            "Experience spans multiple areas, no through-line",
            "Sound fine but forgettable",
            "Feel awkward self-promoting",
            "I don't have this problem",
          ],
          mid_career: [
            "Experience is broad, struggle to articulate a narrative",
            "Undersell expertise or defer to title/company",
            "Story feels outdated",
            "Known for one thing, want to be known for another",
            "Better in person than on paper/online",
            "I don't have this problem",
          ],
        };
        const options = platform ? q6Options[platform] : q6Options.early_career;
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-gray-700 font-semibold text-base block mb-1">
                Q6 — What's Hardest About Talking About Yourself?{" "}
                <span className="text-red-500">*</span>
              </Label>
              <p className="text-sm text-gray-500 mb-2">
                Select up to 2 options.
              </p>
              <MultiSelectPill
                options={options}
                selected={talkingAboutYourselfHardest}
                onToggle={(v) =>
                  toggleMultiSelect(
                    v,
                    talkingAboutYourselfHardest,
                    setTalkingAboutYourselfHardest,
                    2,
                  )
                }
                max={2}
              />
            </div>
          </div>
        );
      }

      case 7:
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-gray-700 font-semibold text-base block mb-1">
                Q7 — Desired Change <span className="text-red-500">*</span>
              </Label>
              <p className="text-sm text-gray-600 mb-3">
                What do you hope is different about how you present yourself
                professionally after completing SLI.pro?
              </p>
              <p className="text-xs text-gray-400 mb-3">
                Please write at least 2–3 sentences.
              </p>
              <Textarea
                value={desiredChange}
                onChange={(e) => setDesiredChange(e.target.value)}
                placeholder="Describe what you hope changes about how you show up professionally..."
                className="w-full min-h-[120px]"
              />
            </div>
          </div>
        );

      case 8:
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-gray-700 font-semibold text-base block mb-1">
                Q8 — Comfort Creating Professional Content{" "}
                <span className="text-red-500">*</span>
              </Label>
              <p className="text-sm text-gray-600 mb-1">
                How comfortable are you creating and sharing professional content
                online?
              </p>
              <LikertScale
                value={contentComfort}
                onChange={setContentComfort}
                lowLabel="Not at all comfortable"
                highLabel="Very comfortable"
              />
            </div>
          </div>
        );

      case 9: {
        const q9Options: Record<PlatformType, string[]> = {
          undergraduate: [
            "Unsure what to say",
            "Fear of judgment",
            "Don't know how to start",
            "Time management",
            "Unclear on my professional voice",
            "Nothing — I'm already active",
          ],
          early_career: [
            "Unsure what I'd say that's worth sharing",
            "Worried how it looks to my employer",
            "Don't have time",
            "Not sure what tone fits my industry",
            "Don't see the ROI",
            "Nothing — I'm already active",
          ],
          mid_career: [
            "Don't want to seem like I'm trying too hard",
            "Not sure what angle to take",
            "Worried about saying the wrong thing publicly",
            "Time — feels like a second job",
            "Unclear how content helps at my level",
            "Nothing — I'm already active",
          ],
        };
        const options = platform ? q9Options[platform] : q9Options.early_career;
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-gray-700 font-semibold text-base block mb-1">
                Q9 — What Holds You Back?{" "}
                <span className="text-red-500">*</span>
              </Label>
              <p className="text-sm text-gray-500 mb-2">
                Select all that apply.
              </p>
              <div className="space-y-3 mt-2">
                {options.map((opt) => (
                  <div key={opt} className="flex items-start space-x-3">
                    <Checkbox
                      id={`q9-${opt}`}
                      checked={contentHoldBack.includes(opt)}
                      onCheckedChange={() =>
                        toggleMultiSelect(opt, contentHoldBack, setContentHoldBack)
                      }
                    />
                    <Label htmlFor={`q9-${opt}`} className="cursor-pointer leading-snug">
                      {opt}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      }

      case 10: {
        const q10Options = [
          "Sharing an article or news story with my perspective",
          "Writing about something I've learned or experienced",
          "Commenting on someone else's post",
          "Sharing a takeaway from a class, event, or project",
          "A personal story connected to my professional interests",
          "Creating an original framework, analysis, or how-to",
          "I have no idea — that's why I'm here",
        ];
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-gray-700 font-semibold text-base block mb-1">
                Q10 — Preferred Content Format{" "}
                <span className="text-red-500">*</span>
              </Label>
              <p className="text-sm text-gray-500 mb-2">
                Select up to 2 options.
              </p>
              <MultiSelectPill
                options={q10Options}
                selected={preferredContentFormat}
                onToggle={(v) =>
                  toggleMultiSelect(
                    v,
                    preferredContentFormat,
                    setPreferredContentFormat,
                    2,
                  )
                }
                max={2}
              />
            </div>
          </div>
        );
      }

      case 11: {
        const q11Options: Record<PlatformType, string[]> = {
          undergraduate: [
            "I don't really have one yet",
            "Mostly classmates and professors",
            "A few professionals from internships or family",
            "A growing network I'm actively building",
          ],
          early_career: [
            "Mostly people from current/past job",
            "Scattered — not strategic",
            "Growing but concentrated in one industry",
            "Strong and diversified",
          ],
          mid_career: [
            "Deep within my company, shallow externally",
            "Strong in current industry, weak in target",
            "Broad but not activated",
            "Strategic and active across target areas",
          ],
        };
        const options = platform ? q11Options[platform] : q11Options.early_career;
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-gray-700 font-semibold text-base block mb-1">
                Q11 — Current Network State{" "}
                <span className="text-red-500">*</span>
              </Label>
              <p className="text-sm text-gray-500 mb-3">
                Which best describes the current state of your professional
                network?
              </p>
              <RadioGroup
                value={networkState}
                onValueChange={setNetworkState}
                className="space-y-3"
              >
                {options.map((opt) => (
                  <div key={opt} className="flex items-start space-x-3">
                    <RadioGroupItem value={opt} id={`q11-${opt}`} className="mt-0.5" />
                    <Label htmlFor={`q11-${opt}`} className="cursor-pointer leading-snug">
                      {opt}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </div>
        );
      }

      case 12: {
        const q12Options: Record<PlatformType, string[]> = {
          undergraduate: [
            "Don't know who to reach out to",
            "Don't know what to say",
            "Feel like I'm bothering people",
            "Comfortable but want to be more strategic",
            "Avoid it entirely",
          ],
          early_career: [
            "Network only when I need something",
            "Not sure how to build outside my company",
            "Awkward reaching out to people I don't know",
            "Comfortable but want higher-level connections",
            "Don't see the point until job searching",
          ],
          mid_career: [
            "Outgrown my network, need new relationships",
            "Network reactively, not strategically",
            "Not sure how to position for next level",
            "Want visibility without seeming self-serving",
            "Maintain relationships but don't create new ones",
          ],
        };
        const options = platform ? q12Options[platform] : q12Options.early_career;
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-gray-700 font-semibold text-base block mb-1">
                Q12 — Networking Beliefs{" "}
                <span className="text-red-500">*</span>
              </Label>
              <p className="text-sm text-gray-500 mb-2">
                Select up to 2 options.
              </p>
              <MultiSelectPill
                options={options}
                selected={networkingBeliefs}
                onToggle={(v) =>
                  toggleMultiSelect(v, networkingBeliefs, setNetworkingBeliefs, 2)
                }
                max={2}
              />
            </div>
          </div>
        );
      }

      case 13: {
        const q13Options = [
          "AI & Technology",
          "Climate & Sustainability",
          "Finance & Markets",
          "Healthcare & Life Sciences",
          "Social Impact & DEI",
          "Entrepreneurship & Innovation",
          "Global Markets & Policy",
          "Arts, Media & Entertainment",
          "Education & Learning",
          "Consumer Products & Retail",
          "Something else",
        ];
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-gray-700 font-semibold text-base block mb-1">
                Q13 — Topic Interests{" "}
                <span className="text-red-500">*</span>
              </Label>
              <p className="text-sm text-gray-500 mb-2">
                Select up to 3 topics you care most about.
              </p>
              <MultiSelectPill
                options={q13Options}
                selected={topicInterests}
                onToggle={(v) =>
                  toggleMultiSelect(v, topicInterests, setTopicInterests, 3)
                }
                max={3}
              />
              {topicInterests.includes("Something else") && (
                <div className="mt-3">
                  <Input
                    value={topicInterestsOther}
                    onChange={(e) => setTopicInterestsOther(e.target.value)}
                    placeholder="Please specify your topic..."
                    className="w-full"
                  />
                </div>
              )}
            </div>
          </div>
        );
      }

      case 14: {
        const q14Options = [
          "Climate Change & Sustainability",
          "Consumer Behavior & Culture",
          "Digital Transformation & AI in Society",
          "Education & Future of Learning",
          "Emerging Markets & Global Economy",
          "Entertainment, Sports & Media",
          "Entrepreneurship & Startups",
          "Financial Innovation & Markets",
          "Future of Work",
          "Global Politics & Geopolitics",
          "Health & Wellness",
          "Healthcare Innovation",
          "Social Impact & DEI",
          "Urban Development & Infrastructure",
        ];
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-gray-700 font-semibold text-base block mb-1">
                Q14 — Cross-Cutting Themes{" "}
                <span className="text-red-500">*</span>
              </Label>
              <p className="text-sm text-gray-500 mb-2">
                Select all themes that resonate with you.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                {q14Options.map((opt) => (
                  <div key={opt} className="flex items-start space-x-3">
                    <Checkbox
                      id={`q14-${opt}`}
                      checked={crossCuttingThemes.includes(opt)}
                      onCheckedChange={() =>
                        toggleMultiSelect(opt, crossCuttingThemes, setCrossCuttingThemes)
                      }
                    />
                    <Label htmlFor={`q14-${opt}`} className="cursor-pointer leading-snug">
                      {opt}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      }

      case 15: {
        const q15Prompt: Record<PlatformType, string> = {
          undergraduate:
            "Beyond your next job or internship, what kind of impact do you want to have in your career?",
          early_career:
            "Where do you want to be professionally in 3–5 years, and what's the gap between there and here?",
          mid_career:
            "What do you want to be known for in your industry? What's preventing that from being true today?",
        };
        const prompt = platform ? q15Prompt[platform] : q15Prompt.early_career;
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-gray-700 font-semibold text-base block mb-1">
                Q15 — Aspiration Question{" "}
                <span className="text-red-500">*</span>
              </Label>
              <p className="text-sm text-gray-600 mb-3">{prompt}</p>
              <p className="text-xs text-gray-400 mb-3">
                Please write at least 2–3 sentences.
              </p>
              <Textarea
                value={aspiration}
                onChange={(e) => setAspiration(e.target.value)}
                placeholder="Share your aspirations..."
                className="w-full min-h-[120px]"
              />
            </div>
          </div>
        );
      }

      case 16: {
        const q16Options = [
          "Myers-Briggs (MBTI)",
          "CliftonStrengths (StrengthsFinder)",
          "VIA — Values in Action",
          "Enneagram",
          "DISC",
          "360° Leadership or Managerial Assessment",
          "None",
        ];
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-gray-700 font-semibold text-base block mb-1">
                Q16 — Personality / Strengths Assessments{" "}
                <span className="text-gray-400 font-normal text-sm">(Optional)</span>
              </Label>
              <p className="text-sm text-gray-500 mb-3">
                Which of these have you completed? Select all that apply.
              </p>
              <div className="space-y-3">
                {q16Options.map((opt) => (
                  <div key={opt} className="flex items-start space-x-3">
                    <Checkbox
                      id={`q16-${opt}`}
                      checked={personalityAssessments.includes(opt)}
                      onCheckedChange={() =>
                        toggleMultiSelect(
                          opt,
                          personalityAssessments,
                          setPersonalityAssessments,
                        )
                      }
                    />
                    <Label htmlFor={`q16-${opt}`} className="cursor-pointer leading-snug">
                      {opt}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      }

      case 17:
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-gray-700 font-semibold text-base block mb-1">
                Q17 — Upload Assessment Results{" "}
                <span className="text-gray-400 font-normal text-sm">(Optional)</span>
              </Label>
              <p className="text-sm text-gray-500 mb-4">
                If you'd like to share results from any of your personality or
                strengths assessments, you can upload them here. Accepted
                formats: PDF, JPG, PNG, DOCX.
              </p>

              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-[#bed6d1] transition-colors cursor-pointer"
                onClick={() =>
                  document.getElementById("assessment-upload")?.click()
                }
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.add("border-[#bed6d1]");
                }}
                onDragLeave={(e) => {
                  e.currentTarget.classList.remove("border-[#bed6d1]");
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove("border-[#bed6d1]");
                  const droppedFiles = Array.from(e.dataTransfer.files);
                  setFiles((prev) => [...prev, ...droppedFiles]);
                }}
              >
                <Upload className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 font-medium">
                  Drag & drop files here, or click to browse
                </p>
                <p className="text-sm text-gray-400 mt-1">
                  PDF, JPG, PNG, DOCX accepted
                </p>
                <input
                  id="assessment-upload"
                  type="file"
                  className="hidden"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={(e) => {
                    if (e.target.files) {
                      setFiles((prev) => [
                        ...prev,
                        ...Array.from(e.target.files!),
                      ]);
                    }
                  }}
                />
              </div>

              {files.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium text-gray-700">
                    Selected files:
                  </p>
                  {files.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-[#bed6d1]" />
                        <span className="text-sm text-gray-700">
                          {file.name}
                        </span>
                        <span className="text-xs text-gray-400">
                          ({(file.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setFiles((prev) => prev.filter((_, i) => i !== index))
                        }
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );

      case 18:
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-gray-700 font-semibold text-base block mb-1">
                Q18 — Anything Else?{" "}
                <span className="text-gray-400 font-normal text-sm">(Optional)</span>
              </Label>
              <p className="text-sm text-gray-600 mb-3">
                Is there anything else you want to share before we begin?
              </p>
              <Textarea
                value={additionalInfo}
                onChange={(e) => setAdditionalInfo(e.target.value)}
                placeholder="Share anything else you'd like us to know..."
                className="w-full min-h-[120px]"
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[#bed6d1]" />
      </div>
    );
  }

  const currentSection = getSectionForStep(currentStep);
  const isLastStep = currentStep === TOTAL_STEPS;

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="container py-10 px-4 sm:px-6 lg:px-8 max-w-3xl mx-auto">
        <Card className="border-none shadow-md">
          <CardHeader className="bg-[#202436] text-white rounded-t-lg">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-2xl font-bold">
                  Branding Assessment
                  {userProfile?.questionnaire?.isDraft && (
                    <span className="ml-2 inline-flex items-center rounded-md bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800 ring-1 ring-inset ring-yellow-600/20">
                      Draft
                    </span>
                  )}
                </CardTitle>
                <CardDescription className="text-white opacity-90">
                  Build your professional foundation — step by step.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                className="bg-[#202436] text-[#6c8083] hover:bg-gray-100 hover:text-[#4c5c5e]"
                onClick={() => navigate("/", { replace: true })}
              >
                Back to Home
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-6 lg:p-8">
            {/* Section progress bar */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  Section {currentSection.label}: {currentSection.name}
                </span>
                <span className="text-sm text-gray-500">
                  Q{currentStep} of {TOTAL_STEPS}
                </span>
              </div>

              {/* Section bubbles */}
              <div className="flex gap-2 items-center mb-3">
                {SECTIONS.map((section) => {
                  const firstStep = section.steps[0];
                  const lastStep = section.steps[section.steps.length - 1];
                  const isActive = section.steps.includes(currentStep);
                  const isCompleted = lastStep < currentStep;
                  return (
                    <div
                      key={section.label}
                      className={`flex items-center justify-center rounded-full text-xs font-bold transition-all ${
                        isActive
                          ? "bg-[#bed6d1] text-white w-8 h-8"
                          : isCompleted
                            ? "bg-green-500 text-white w-7 h-7"
                            : "bg-gray-200 text-gray-500 w-7 h-7"
                      }`}
                      title={`Section ${section.label}: ${section.name}`}
                    >
                      {isCompleted ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        section.label
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Progress bar */}
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#bed6d1] transition-all duration-300 ease-in-out"
                  style={{ width: `${(currentStep / TOTAL_STEPS) * 100}%` }}
                />
              </div>

              {/* Step dots within current section */}
              <div className="flex gap-1.5 mt-2">
                {currentSection.steps.map((step) => (
                  <div
                    key={step}
                    className={`h-1.5 rounded-full transition-all duration-200 ${
                      step < currentStep
                        ? "bg-green-400 flex-1"
                        : step === currentStep
                          ? "bg-[#bed6d1] flex-1"
                          : "bg-gray-200 flex-1"
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-6">
              {renderStepContent()}

              <div className="flex justify-between mt-8">
                <Button
                  type="button"
                  variant="outline"
                  onClick={prevStep}
                  disabled={currentStep === 1}
                  className="w-[120px]"
                >
                  Previous
                </Button>

                <div className="flex items-center gap-2">
                  {saveStatus === "saving" && (
                    <div className="text-xs text-muted-foreground flex items-center mr-2">
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      Saving...
                    </div>
                  )}
                  {saveStatus === "saved" && (
                    <div className="text-xs text-green-600 flex items-center mr-2">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Saved
                    </div>
                  )}

                  {(!userProfile?.questionnaire ||
                    userProfile?.questionnaire?.isDraft) && (
                    <Button
                      type="button"
                      onClick={handleSaveAsDraft}
                      className="w-[120px]"
                      variant="outline"
                      disabled={saveAsDraftMutation.isPending}
                    >
                      {saveAsDraftMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      Save Progress
                    </Button>
                  )}

                  {isLastStep ? (
                    <Button
                      type="button"
                      onClick={handleSubmit}
                      className="w-[120px] bg-[#bed6d1] hover:bg-[#6c8083]"
                      disabled={questionnaireMutation.isPending}
                    >
                      {questionnaireMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      Submit
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={nextStep}
                      className="w-[120px] bg-[#bed6d1] hover:bg-[#6c8083]"
                    >
                      Next
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
