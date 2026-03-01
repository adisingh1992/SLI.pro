import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
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

  useEffect(() => {
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

  const buildRawAnswers = () => {
    const p = platform ?? "early_career";

    const q2Prompt = "Current LinkedIn Presence";
    const q4Prompts: Record<PlatformType, string> = {
      undergraduate: "How well does your online presence reflect who you are professionally? (1–5)",
      early_career: "How well does your professional brand position you for where you want to go next? (1–5)",
      mid_career: "How well does your professional presence reflect your current expertise and leadership? (1–5)",
    };
    const q5Prompts: Record<PlatformType, string> = {
      undergraduate: "When someone asks \"what do you want to do after graduation,\" how do you feel?",
      early_career: "When someone asks \"what do you do?,\" how confident are you?",
      mid_career: "When someone asks \"what's your story?,\" how do you feel?",
    };
    const q15Prompts: Record<PlatformType, string> = {
      undergraduate: "Beyond your next job or internship, what kind of impact do you want to have in your career?",
      early_career: "Where do you want to be professionally in 3–5 years, and what's the gap between there and here?",
      mid_career: "What do you want to be known for in your industry? What's preventing that from being true today?",
    };

    return {
      Q1: {
        question: "LinkedIn URL",
        answer: linkedinUrl,
      },
      Q2: {
        question: q2Prompt,
        answer: linkedinPresence,
      },
      Q3: {
        question: "Other Professional Online Presence",
        answer: otherPresence,
      },
      Q4: {
        question: q4Prompts[p],
        answer: presenceSelfAssessment,
      },
      Q5: {
        question: q5Prompts[p],
        answer: narrativeDiagnostic,
      },
      Q6: {
        question: "What's Hardest About Talking About Yourself? (up to 2)",
        answer: talkingAboutYourselfHardest,
      },
      Q7: {
        question: "What do you hope is different about how you present yourself professionally after completing SLI.pro?",
        answer: desiredChange,
      },
      Q8: {
        question: "Comfort Creating Professional Content (1–5)",
        answer: contentComfort,
      },
      Q9: {
        question: "What Holds You Back from creating content?",
        answer: contentHoldBack,
      },
      Q10: {
        question: "Preferred Content Format (up to 2)",
        answer: preferredContentFormat,
      },
      Q11: {
        question: "Current Network State",
        answer: networkState,
      },
      Q12: {
        question: "Networking Beliefs (up to 2)",
        answer: networkingBeliefs,
      },
      Q13: {
        question: "Topic Interests (up to 3)",
        answer: topicInterests,
        other: topicInterestsOther || null,
      },
      Q14: {
        question: "Cross-Cutting Themes",
        answer: crossCuttingThemes,
      },
      Q15: {
        question: q15Prompts[p],
        answer: aspiration,
      },
      Q16: {
        question: "Personality / Strengths Assessments",
        answer: personalityAssessments,
      },
      Q17: {
        question: "Upload Assessment Results",
        answer: files.map((f) => f.name),
      },
      Q18: {
        question: "Is there anything else you want to share before we begin?",
        answer: additionalInfo,
      },
    };
  };

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
      rawAnswers: buildRawAnswers(),
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
    <div className="flex items-center justify-between gap-2 max-w-lg mt-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
      <div className="text-xs font-medium text-slate-500 text-center w-16 shrink-0">{lowLabel}</div>
      <div className="flex gap-2 sm:gap-3">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`h-10 w-10 sm:h-12 sm:w-12 rounded-full border-2 flex items-center justify-center font-semibold transition-all ${
              value === n
                ? "border-[#bed6d1] bg-[#bed6d1] text-white"
                : "border-slate-300 text-slate-600 hover:border-[#bed6d1]/70"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="text-xs font-medium text-slate-500 text-center w-16 shrink-0">{highLabel}</div>
    </div>
  );

  const CardRadioGroup = ({
    options,
    value,
    onChange,
  }: {
    options: string[];
    value: string;
    onChange: (v: string) => void;
  }) => (
    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {options.map((opt) => {
        const selected = value === opt;
        const parts = opt.split(" — ");
        const title = parts[0];
        const subtitle = parts.length > 1 ? parts.slice(1).join(" — ") : null;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`relative flex cursor-pointer rounded-xl border p-4 shadow-sm text-left transition-colors w-full ${
              selected
                ? "border-[#bed6d1] bg-[#bed6d1]/10"
                : "border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50"
            }`}
          >
            <span className="flex flex-1 flex-col">
              <span className={`text-sm font-medium ${selected ? "text-[#202436]" : "text-slate-900"}`}>
                {title}
              </span>
              {subtitle && (
                <span className={`mt-1 text-sm ${selected ? "text-[#4c5c5e]" : "text-slate-500"}`}>
                  {subtitle}
                </span>
              )}
            </span>
            {selected && (
              <svg className="h-5 w-5 text-[#bed6d1] shrink-0 ml-2 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );

  const CardCheckboxGrid = ({
    options,
    selected,
    onToggle,
    max,
    columns = 2,
  }: {
    options: string[];
    selected: string[];
    onToggle: (v: string) => void;
    max?: number;
    columns?: 1 | 2;
  }) => (
    <div className={`grid gap-3 mt-3 ${columns === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
      {options.map((opt) => {
        const isChecked = selected.includes(opt);
        return (
          <label
            key={opt}
            className={`relative flex items-start cursor-pointer rounded-lg border p-3 transition-colors ${
              isChecked
                ? "border-[#bed6d1] bg-[#bed6d1]/5"
                : "border-slate-200 bg-white hover:bg-slate-50"
            }`}
          >
            <div className="flex h-5 items-center">
              <input
                type="checkbox"
                className="sr-only"
                checked={isChecked}
                onChange={() => onToggle(opt)}
              />
              <div className={`h-4 w-4 rounded border-2 flex items-center justify-center transition-colors ${
                isChecked ? "border-[#bed6d1] bg-[#bed6d1]" : "border-slate-300"
              }`}>
                {isChecked && (
                  <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </div>
            <div className="ml-3 text-sm leading-6">
              <span className={`font-medium ${isChecked ? "text-[#202436]" : "text-slate-900"}`}>{opt}</span>
            </div>
          </label>
        );
      })}
    </div>
  );

  const SECTION_SUBTITLES: Record<string, string> = {
    A: "Let's understand your current digital footprint and where it stands.",
    B: "Let's explore how you currently talk about your work and where you want to go.",
    C: "Let's look at your relationship with creating and sharing professional content.",
    D: "Let's understand how you build and maintain professional relationships.",
    E: "Let's clarify what you're working toward and what drives you.",
    F: "Let's draw on any self-knowledge you've gathered through assessments or reflection.",
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div>
              <label className="text-base font-semibold leading-6 text-slate-900 block mb-1">
                Q1 — LinkedIn URL <span className="text-red-500">*</span>
              </label>
              <p className="text-sm text-slate-500 mb-3">
                Your LinkedIn profile URL — our AI coach will use this to audit
                your presence.
              </p>
              <input
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                placeholder="https://www.linkedin.com/in/yourprofile"
                className="block w-full rounded-xl border-0 py-3 px-4 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-[#bed6d1] sm:text-sm sm:leading-6"
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
            <fieldset>
              <legend className="text-base font-semibold leading-6 text-slate-900">
                Q2 — Current LinkedIn Presence <span className="text-red-500">*</span>
              </legend>
              <p className="text-sm text-slate-500 mt-1 mb-1">
                Which best describes your current LinkedIn activity?
              </p>
              <CardRadioGroup options={options} value={linkedinPresence} onChange={setLinkedinPresence} />
            </fieldset>
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
            <fieldset>
              <div className="flex justify-between items-end mb-1">
                <legend className="text-base font-semibold leading-6 text-slate-900">
                  Q3 — Other Professional Online Presence{" "}
                  <span className="text-slate-400 font-normal text-sm">(Optional)</span>
                </legend>
              </div>
              <p className="text-sm text-slate-500 mb-1">
                Select any other platforms where you have a professional presence.
              </p>
              <CardCheckboxGrid
                options={q3Options}
                selected={otherPresence}
                onToggle={(v) => toggleMultiSelect(v, otherPresence, setOtherPresence)}
              />
            </fieldset>
          </div>
        );
      }

      case 4: {
        const q4Prompt: Record<PlatformType, string> = {
          undergraduate: "How well does your online presence reflect who you are professionally?",
          early_career: "How well does your professional brand position you for where you want to go next?",
          mid_career: "How well does your professional presence reflect your current expertise and leadership?",
        };
        const prompt = platform ? q4Prompt[platform] : q4Prompt.early_career;
        return (
          <div className="space-y-4">
            <fieldset>
              <legend className="text-base font-semibold leading-6 text-slate-900">
                Q4 — Self-Assessment of Professional Presence <span className="text-red-500">*</span>
              </legend>
              <p className="text-sm text-slate-500 mt-1">{prompt}</p>
              <LikertScale
                value={presenceSelfAssessment}
                onChange={setPresenceSelfAssessment}
                lowLabel="Not at all"
                highLabel="Very well"
              />
            </fieldset>
          </div>
        );
      }

      case 5: {
        const q5Config: Record<PlatformType, { prompt: string; options: string[] }> = {
          undergraduate: {
            prompt: "When someone asks \"what do you want to do after graduation,\" how do you feel?",
            options: [
              "Confident — I have a clear answer",
              "Directional — general sense but struggle to articulate",
              "Overwhelmed — too many interests",
              "Lost — I genuinely don't know yet",
            ],
          },
          early_career: {
            prompt: "When someone asks \"what do you do?,\" how confident are you?",
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
            <fieldset>
              <legend className="text-base font-semibold leading-6 text-slate-900">
                Q5 — Professional Narrative Diagnostic <span className="text-red-500">*</span>
              </legend>
              <p className="text-sm text-slate-500 mt-1 mb-1">{config.prompt}</p>
              <CardRadioGroup options={config.options} value={narrativeDiagnostic} onChange={setNarrativeDiagnostic} />
            </fieldset>
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
            <fieldset>
              <div className="flex justify-between items-end">
                <legend className="text-base font-semibold leading-6 text-slate-900">
                  Q6 — What's Hardest About Talking About Yourself? <span className="text-red-500">*</span>
                </legend>
                <span className="text-xs font-medium bg-slate-100 text-slate-600 py-1 px-2 rounded-md shrink-0 ml-3">Select up to 2</span>
              </div>
              <CardCheckboxGrid
                options={options}
                selected={talkingAboutYourselfHardest}
                onToggle={(v) => toggleMultiSelect(v, talkingAboutYourselfHardest, setTalkingAboutYourselfHardest, 2)}
                max={2}
              />
            </fieldset>
          </div>
        );
      }

      case 7:
        return (
          <div className="space-y-4">
            <div>
              <label className="text-base font-semibold leading-6 text-slate-900 block">
                Q7 — Desired Change <span className="text-red-500">*</span>
              </label>
              <p className="text-sm text-slate-500 mt-1 mb-1">
                What do you hope is different about how you present yourself professionally after completing SLI.pro?
              </p>
              <p className="text-xs text-slate-400 mb-3">Please write at least 2–3 sentences.</p>
              <textarea
                value={desiredChange}
                onChange={(e) => setDesiredChange(e.target.value)}
                placeholder="Describe what you hope changes about how you show up professionally..."
                rows={4}
                className="block w-full rounded-xl border-0 py-3 px-4 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-[#bed6d1] sm:text-sm sm:leading-6 resize-none"
              />
            </div>
          </div>
        );

      case 8:
        return (
          <div className="space-y-4">
            <fieldset>
              <legend className="text-base font-semibold leading-6 text-slate-900">
                Q8 — Comfort Creating Professional Content <span className="text-red-500">*</span>
              </legend>
              <p className="text-sm text-slate-500 mt-1">
                How comfortable are you creating and sharing professional content online?
              </p>
              <LikertScale
                value={contentComfort}
                onChange={setContentComfort}
                lowLabel="Not comfortable"
                highLabel="Very comfortable"
              />
            </fieldset>
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
            <fieldset>
              <legend className="text-base font-semibold leading-6 text-slate-900">
                Q9 — What Holds You Back? <span className="text-red-500">*</span>
              </legend>
              <p className="text-sm text-slate-500 mt-1 mb-1">Select all that apply.</p>
              <CardCheckboxGrid
                options={options}
                selected={contentHoldBack}
                onToggle={(v) => toggleMultiSelect(v, contentHoldBack, setContentHoldBack)}
              />
            </fieldset>
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
            <fieldset>
              <div className="flex justify-between items-end">
                <legend className="text-base font-semibold leading-6 text-slate-900">
                  Q10 — Preferred Content Format <span className="text-red-500">*</span>
                </legend>
                <span className="text-xs font-medium bg-slate-100 text-slate-600 py-1 px-2 rounded-md shrink-0 ml-3">Select up to 2</span>
              </div>
              <CardCheckboxGrid
                options={q10Options}
                selected={preferredContentFormat}
                onToggle={(v) => toggleMultiSelect(v, preferredContentFormat, setPreferredContentFormat, 2)}
                max={2}
                columns={1}
              />
            </fieldset>
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
            <fieldset>
              <legend className="text-base font-semibold leading-6 text-slate-900">
                Q11 — Current Network State <span className="text-red-500">*</span>
              </legend>
              <p className="text-sm text-slate-500 mt-1 mb-1">
                Which best describes the current state of your professional network?
              </p>
              <CardRadioGroup options={options} value={networkState} onChange={setNetworkState} />
            </fieldset>
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
            <fieldset>
              <div className="flex justify-between items-end">
                <legend className="text-base font-semibold leading-6 text-slate-900">
                  Q12 — Networking Beliefs <span className="text-red-500">*</span>
                </legend>
                <span className="text-xs font-medium bg-slate-100 text-slate-600 py-1 px-2 rounded-md shrink-0 ml-3">Select up to 2</span>
              </div>
              <CardCheckboxGrid
                options={options}
                selected={networkingBeliefs}
                onToggle={(v) => toggleMultiSelect(v, networkingBeliefs, setNetworkingBeliefs, 2)}
                max={2}
                columns={1}
              />
            </fieldset>
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
            <fieldset>
              <div className="flex justify-between items-end">
                <legend className="text-base font-semibold leading-6 text-slate-900">
                  Q13 — Topic Interests <span className="text-red-500">*</span>
                </legend>
                <span className="text-xs font-medium bg-slate-100 text-slate-600 py-1 px-2 rounded-md shrink-0 ml-3">Select up to 3</span>
              </div>
              <CardCheckboxGrid
                options={q13Options}
                selected={topicInterests}
                onToggle={(v) => toggleMultiSelect(v, topicInterests, setTopicInterests, 3)}
                max={3}
              />
              {topicInterests.includes("Something else") && (
                <div className="mt-3">
                  <input
                    value={topicInterestsOther}
                    onChange={(e) => setTopicInterestsOther(e.target.value)}
                    placeholder="Please specify your topic..."
                    className="block w-full rounded-xl border-0 py-3 px-4 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-[#bed6d1] sm:text-sm sm:leading-6"
                  />
                </div>
              )}
            </fieldset>
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
            <fieldset>
              <legend className="text-base font-semibold leading-6 text-slate-900">
                Q14 — Cross-Cutting Themes <span className="text-red-500">*</span>
              </legend>
              <p className="text-sm text-slate-500 mt-1 mb-1">Select all themes that resonate with you.</p>
              <CardCheckboxGrid
                options={q14Options}
                selected={crossCuttingThemes}
                onToggle={(v) => toggleMultiSelect(v, crossCuttingThemes, setCrossCuttingThemes)}
              />
            </fieldset>
          </div>
        );
      }

      case 15: {
        const q15Prompt: Record<PlatformType, string> = {
          undergraduate: "Beyond your next job or internship, what kind of impact do you want to have in your career?",
          early_career: "Where do you want to be professionally in 3–5 years, and what's the gap between there and here?",
          mid_career: "What do you want to be known for in your industry? What's preventing that from being true today?",
        };
        const prompt = platform ? q15Prompt[platform] : q15Prompt.early_career;
        return (
          <div className="space-y-4">
            <div>
              <label className="text-base font-semibold leading-6 text-slate-900 block">
                Q15 — Aspiration Question <span className="text-red-500">*</span>
              </label>
              <p className="text-sm text-slate-500 mt-1 mb-1">{prompt}</p>
              <p className="text-xs text-slate-400 mb-3">Please write at least 2–3 sentences.</p>
              <textarea
                value={aspiration}
                onChange={(e) => setAspiration(e.target.value)}
                placeholder="Share your aspirations..."
                rows={4}
                className="block w-full rounded-xl border-0 py-3 px-4 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-[#bed6d1] sm:text-sm sm:leading-6 resize-none"
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
            <fieldset>
              <legend className="text-base font-semibold leading-6 text-slate-900">
                Q16 — Personality / Strengths Assessments{" "}
                <span className="text-slate-400 font-normal text-sm">(Optional)</span>
              </legend>
              <p className="text-sm text-slate-500 mt-1 mb-1">Which of these have you completed? Select all that apply.</p>
              <CardCheckboxGrid
                options={q16Options}
                selected={personalityAssessments}
                onToggle={(v) => toggleMultiSelect(v, personalityAssessments, setPersonalityAssessments)}
              />
            </fieldset>
          </div>
        );
      }

      case 17:
        return (
          <div className="space-y-4">
            <div>
              <label className="text-base font-semibold leading-6 text-slate-900 block">
                Q17 — Upload Assessment Results{" "}
                <span className="text-slate-400 font-normal text-sm">(Optional)</span>
              </label>
              <p className="text-sm text-slate-500 mt-1 mb-4">
                If you'd like to share results from any of your personality or strengths assessments, you can upload them here. Accepted formats: PDF, JPG, PNG, DOCX.
              </p>
              <div
                className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-[#bed6d1] transition-colors cursor-pointer"
                onClick={() => document.getElementById("assessment-upload")?.click()}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-[#bed6d1]"); }}
                onDragLeave={(e) => { e.currentTarget.classList.remove("border-[#bed6d1]"); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove("border-[#bed6d1]");
                  setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
                }}
              >
                <Upload className="h-10 w-10 text-slate-400 mx-auto mb-3" />
                <p className="text-slate-600 font-medium">Drag & drop files here, or click to browse</p>
                <p className="text-sm text-slate-400 mt-1">PDF, JPG, PNG, DOCX accepted</p>
                <input
                  id="assessment-upload"
                  type="file"
                  className="hidden"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={(e) => {
                    if (e.target.files) {
                      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                    }
                  }}
                />
              </div>
              {files.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium text-slate-700">Selected files:</p>
                  {files.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-[#bed6d1]" />
                        <span className="text-sm text-slate-700">{file.name}</span>
                        <span className="text-xs text-slate-400">({(file.size / 1024).toFixed(1)} KB)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                        className="text-slate-400 hover:text-red-500 transition-colors"
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
              <label className="text-base font-semibold leading-6 text-slate-900 block">
                Q18 — Anything Else?{" "}
                <span className="text-slate-400 font-normal text-sm">(Optional)</span>
              </label>
              <p className="text-sm text-slate-500 mt-1 mb-3">
                Is there anything else you want to share before we begin?
              </p>
              <textarea
                value={additionalInfo}
                onChange={(e) => setAdditionalInfo(e.target.value)}
                placeholder="Share anything else you'd like us to know..."
                rows={4}
                className="block w-full rounded-xl border-0 py-3 px-4 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-[#bed6d1] sm:text-sm sm:leading-6 resize-none"
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
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-[#bed6d1]" />
      </div>
    );
  }

  const currentSection = getSectionForStep(currentStep);
  const isLastStep = currentStep === TOTAL_STEPS;

  return (
    <div className="bg-slate-50 text-slate-800 antialiased min-h-screen flex flex-col">
      <main className="flex-grow flex items-start justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl w-full space-y-8">

          {/* Header + Stepper */}
          <div>
            <h1 className="text-3xl font-bold text-center text-slate-900 mb-8">Brand Assessment</h1>

            {/* Connected-dots stepper */}
            <nav aria-label="Progress">
              <ol role="list" className="flex items-start w-full">
                {SECTIONS.map((section, idx) => {
                  const lastStep = section.steps[section.steps.length - 1];
                  const isCompleted = lastStep < currentStep;
                  const isCurrent = section.steps.includes(currentStep);
                  const prevCompleted = idx > 0 && SECTIONS[idx - 1].steps[SECTIONS[idx - 1].steps.length - 1] < currentStep;
                  return (
                    <li key={section.label} className="flex-1 flex flex-col items-center">
                      {/* Dot row with connecting lines */}
                      <div className="relative w-full flex items-center justify-center h-8">
                        {/* Left connector */}
                        {idx > 0 && (
                          <div
                            className={`absolute top-1/2 -translate-y-1/2 left-0 right-1/2 h-0.5 rounded-full ${prevCompleted ? "bg-[#bed6d1]" : "bg-slate-200"}`}
                            aria-hidden="true"
                          />
                        )}
                        {/* Right connector */}
                        {idx < SECTIONS.length - 1 && (
                          <div
                            className={`absolute top-1/2 -translate-y-1/2 left-1/2 right-0 h-0.5 rounded-full ${isCompleted ? "bg-[#bed6d1]" : "bg-slate-200"}`}
                            aria-hidden="true"
                          />
                        )}
                        {/* Dot */}
                        <div className="relative z-10">
                          {isCompleted ? (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#bed6d1]">
                              <svg className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                              </svg>
                            </div>
                          ) : isCurrent ? (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#bed6d1] bg-white" aria-current="step">
                              <span className="h-2.5 w-2.5 rounded-full bg-[#bed6d1]" />
                            </div>
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-300 bg-white" />
                          )}
                        </div>
                      </div>
                      {/* Label — always centered under its dot */}
                      <span className={`mt-2 text-[10px] font-medium uppercase tracking-wider text-center leading-tight ${isCurrent ? "text-[#6c8083] font-bold" : "text-slate-400"}`}>
                        {section.name}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </nav>
          </div>

          {/* Question card */}
          <div className="bg-white shadow-xl shadow-slate-200/50 rounded-2xl p-6 sm:p-10 border border-slate-100">
            {/* Section header */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-xl font-semibold leading-7 text-slate-900">
                  Section {currentSection.label} — {currentSection.name}
                  {userProfile?.questionnaire?.isDraft && (
                    <span className="ml-3 inline-flex items-center rounded-md bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 ring-1 ring-inset ring-yellow-600/20">
                      Draft
                    </span>
                  )}
                </h2>
                <span className="text-xs text-slate-400 shrink-0 ml-4">Q{currentStep} of {TOTAL_STEPS}</span>
              </div>
              <p className="text-sm leading-6 text-slate-500">{SECTION_SUBTITLES[currentSection.label]}</p>
            </div>

            <hr className="border-slate-200 mb-8" />

            {/* Question content */}
            <div className="space-y-6">
              {renderStepContent()}
            </div>
          </div>

          {/* Navigation buttons — outside the card */}
          <div className="flex items-center justify-between px-2">
            {/* Back */}
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={prevStep}
                className="text-sm font-semibold leading-6 text-slate-600 hover:text-slate-900 flex items-center gap-2 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate("/", { replace: true })}
                className="text-sm font-semibold leading-6 text-slate-400 hover:text-slate-600 flex items-center gap-2 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Home
              </button>
            )}

            {/* Right side: save status + save draft + next/submit */}
            <div className="flex items-center gap-4">
              {saveStatus === "saving" && (
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Saving...
                </span>
              )}
              {saveStatus === "saved" && (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Saved
                </span>
              )}

              {(!userProfile?.questionnaire || userProfile?.questionnaire?.isDraft) && (
                <button
                  type="button"
                  onClick={handleSaveAsDraft}
                  disabled={saveAsDraftMutation.isPending}
                  className="text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  {saveAsDraftMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                  Save Progress
                </button>
              )}

              {isLastStep ? (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={questionnaireMutation.isPending}
                  className="rounded-xl bg-[#bed6d1] px-8 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-[#6c8083] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bed6d1] transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {questionnaireMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Submit
                  {!questionnaireMutation.isPending && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={nextStep}
                  className="rounded-xl bg-[#bed6d1] px-8 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-[#6c8083] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bed6d1] transition-colors flex items-center gap-2"
                >
                  Next Section
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
