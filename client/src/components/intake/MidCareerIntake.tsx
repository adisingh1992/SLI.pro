import { useState, useEffect, type ReactNode } from "react";
import { Link } from "wouter";
import { Check, ChevronRight, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import {
  INDUSTRIES,
  FUNCTIONS,
  MID_CAREER_YEARS,
  LEADERSHIP_LEVELS,
  MID_CAREER_TRANSITION_STATUS,
  POSITIONING_GOALS,
  MID_CAREER_TIMELINE,
  MID_CAREER_DEGREE_OPTIONS,
  THREE_WAY_OPTIONS,
  CAREER_TRANSITION_PATTERNS,
  PRIVACY_TEXT,
  MARKETING_TEXT,
} from "@/lib/intake-constants";
import "@/assets/css/new-dashboard.css";

interface IntakeProps {
  stage: number;
  responses: Record<string, any>;
  onUpdateResponses: (stageData: Record<string, any>) => void;
  onNext: () => void;
  onBack: () => void;
}

function SectionBlock({
  title,
  description,
  required,
  error,
  children,
}: {
  title: string;
  description?: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg border border-[var(--dashboard-border)] p-6 space-y-3">
      <Label className="text-base font-semibold text-[var(--dashboard-void)] dashboard-heading">
        {title}
        {required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      {description && (
        <p className="text-sm text-gray-500">{description}</p>
      )}
      {children}
      {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
    </div>
  );
}

export default function MidCareerIntake({
  stage,
  responses,
  onUpdateResponses,
  onNext,
  onBack,
}: IntakeProps) {
  const [current_title, setCurrentTitle] = useState(responses.current_title || "");
  const [current_company, setCurrentCompany] = useState(responses.current_company || "");
  const [years_experience, setYearsExperience] = useState(responses.years_experience || "");
  const [leadership_level, setLeadershipLevel] = useState(responses.leadership_level || "");
  const [primary_industry, setPrimaryIndustry] = useState(responses.primary_industry || "");
  const [functional_expertise, setFunctionalExpertise] = useState(responses.functional_expertise || "");
  const [transition_status, setTransitionStatus] = useState(responses.transition_status || "");

  const [positioning_goal, setPositioningGoal] = useState(responses.positioning_goal || "");
  const [timeline, setTimeline] = useState(responses.timeline || "");
  const [current_reputation, setCurrentReputation] = useState(responses.current_reputation || "");
  const [highest_degree, setHighestDegree] = useState(responses.highest_degree || "");
  const [graduate_institutions, setGraduateInstitutions] = useState(responses.graduate_institutions || "");

  const [underrepresented_senior, setUnderrepresentedSenior] = useState(responses.underrepresented_senior || "");
  const [career_transition_pattern, setCareerTransitionPattern] = useState(responses.career_transition_pattern || "");

  const [marketing_opt_in, setMarketingOptIn] = useState(responses.marketing_opt_in || false);

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setCurrentTitle(responses.current_title || "");
    setCurrentCompany(responses.current_company || "");
    setYearsExperience(responses.years_experience || "");
    setLeadershipLevel(responses.leadership_level || "");
    setPrimaryIndustry(responses.primary_industry || "");
    setFunctionalExpertise(responses.functional_expertise || "");
    setTransitionStatus(responses.transition_status || "");
    setPositioningGoal(responses.positioning_goal || "");
    setTimeline(responses.timeline || "");
    setCurrentReputation(responses.current_reputation || "");
    setHighestDegree(responses.highest_degree || "");
    setGraduateInstitutions(responses.graduate_institutions || "");
    setUnderrepresentedSenior(responses.underrepresented_senior || "");
    setCareerTransitionPattern(responses.career_transition_pattern || "");
    setMarketingOptIn(responses.marketing_opt_in || false);
  }, [responses]);

  const validateStage1 = () => {
    const errs: Record<string, string> = {};
    if (!current_title.trim()) errs.current_title = "Job title is required";
    if (!current_company.trim()) errs.current_company = "Company is required";
    if (!years_experience) errs.years_experience = "Please select your years of experience";
    if (!leadership_level) errs.leadership_level = "Please select your leadership level";
    if (!primary_industry) errs.primary_industry = "Please select your primary industry";
    if (!functional_expertise) errs.functional_expertise = "Please select your functional expertise";
    if (!transition_status) errs.transition_status = "Please select your transition status";
    return errs;
  };

  const validateStage2 = () => {
    const errs: Record<string, string> = {};
    if (!positioning_goal) errs.positioning_goal = "Please select your positioning goal";
    if (!timeline) errs.timeline = "Please select your timeline";
    if (!current_reputation.trim()) errs.current_reputation = "Please describe your professional reputation";
    if (!highest_degree) errs.highest_degree = "Please select your highest degree";
    return errs;
  };

  const handleSaveAndContinue = () => {
    let validationErrors: Record<string, string> = {};

    if (stage === 1) {
      validationErrors = validateStage1();
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        return;
      }
      onUpdateResponses({
        current_title,
        current_company,
        years_experience,
        leadership_level,
        primary_industry,
        functional_expertise,
        transition_status,
      });
    } else if (stage === 2) {
      validationErrors = validateStage2();
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        return;
      }
      const stageData: Record<string, any> = {
        positioning_goal,
        timeline,
        current_reputation,
        highest_degree,
      };
      if (graduate_institutions.trim()) stageData.graduate_institutions = graduate_institutions;
      onUpdateResponses(stageData);
    } else if (stage === 3) {
      const stageData: Record<string, any> = {};
      if (underrepresented_senior) stageData.underrepresented_senior = underrepresented_senior;
      if (career_transition_pattern) stageData.career_transition_pattern = career_transition_pattern;
      onUpdateResponses(stageData);
    } else if (stage === 4) {
      onUpdateResponses({ marketing_opt_in });
    }

    setErrors({});
    onNext();
  };

  if (stage === 5) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-6 bg-white rounded-lg dashboard-layout">
        <div className="w-16 h-16 rounded-full bg-[var(--dashboard-aqua)] flex items-center justify-center">
          <Check className="w-8 h-8 text-[var(--dashboard-void)]" />
        </div>
        <h2 className="text-3xl font-bold text-[var(--dashboard-void)] dashboard-heading">
          You're all set!
        </h2>
        <p className="text-gray-600 text-center max-w-md">
          Your profile has been saved. You're ready to start building your
          strategic positioning and advancing your career.
        </p>
        <Link href="/dashboard">
          <Button className="bg-[var(--dashboard-void)] hover:bg-[var(--dashboard-void)]/90 text-white px-8 py-3">
            Go to Dashboard
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 dashboard-layout">
      {stage === 1 && (
        <>
          <SectionBlock title="Current Job Title / Role" required error={errors.current_title}>
            <Input
              value={current_title}
              onChange={(e) => setCurrentTitle(e.target.value)}
              placeholder="Enter your current job title or role"
              className="mt-1"
            />
          </SectionBlock>

          <SectionBlock title="Current Company" required error={errors.current_company}>
            <Input
              value={current_company}
              onChange={(e) => setCurrentCompany(e.target.value)}
              placeholder="Enter your current company"
              className="mt-1"
            />
          </SectionBlock>

          <SectionBlock title="Years of Experience" required error={errors.years_experience}>
            <RadioGroup
              value={years_experience}
              onValueChange={setYearsExperience}
              className="mt-2 space-y-2"
            >
              {MID_CAREER_YEARS.map((opt) => (
                <div key={opt.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={opt.value} id={`years-${opt.value}`} />
                  <Label htmlFor={`years-${opt.value}`} className="font-normal cursor-pointer">
                    {opt.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </SectionBlock>

          <SectionBlock title="Leadership Level" required error={errors.leadership_level}>
            <RadioGroup
              value={leadership_level}
              onValueChange={setLeadershipLevel}
              className="mt-2 space-y-2"
            >
              {LEADERSHIP_LEVELS.map((opt) => (
                <div key={opt.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={opt.value} id={`leadership-${opt.value}`} />
                  <Label htmlFor={`leadership-${opt.value}`} className="font-normal cursor-pointer">
                    {opt.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </SectionBlock>

          <SectionBlock
            title="Primary Industry"
            description="If you have expertise across multiple industries, select the one most relevant to your current positioning goals"
            required
            error={errors.primary_industry}
          >
            <div className="mt-1">
              <Combobox
                options={INDUSTRIES}
                value={primary_industry}
                onValueChange={setPrimaryIndustry}
                placeholder="Search for your industry..."
                emptyMessage="No matching industry found."
              />
            </div>
          </SectionBlock>

          <SectionBlock
            title="Functional Expertise"
            description="Select primary functional expertise. We'll address cross-functional leadership in positioning strategy."
            required
            error={errors.functional_expertise}
          >
            <div className="mt-1">
              <Combobox
                options={FUNCTIONS}
                value={functional_expertise}
                onValueChange={setFunctionalExpertise}
                placeholder="Search for your function..."
                emptyMessage="No matching function found."
              />
            </div>
          </SectionBlock>

          <SectionBlock title="Transition Status" required error={errors.transition_status}>
            <RadioGroup
              value={transition_status}
              onValueChange={setTransitionStatus}
              className="mt-2 space-y-2"
            >
              {MID_CAREER_TRANSITION_STATUS.map((opt) => (
                <div key={opt.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={opt.value} id={`transition-${opt.value}`} />
                  <Label htmlFor={`transition-${opt.value}`} className="font-normal cursor-pointer">
                    {opt.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </SectionBlock>
        </>
      )}

      {stage === 2 && (
        <>
          <SectionBlock title="Positioning Goal" required error={errors.positioning_goal}>
            <RadioGroup
              value={positioning_goal}
              onValueChange={setPositioningGoal}
              className="mt-2 space-y-2"
            >
              {POSITIONING_GOALS.map((opt) => (
                <div key={opt.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={opt.value} id={`goal-${opt.value}`} />
                  <Label htmlFor={`goal-${opt.value}`} className="font-normal cursor-pointer">
                    {opt.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </SectionBlock>

          <SectionBlock title="Timeline" required error={errors.timeline}>
            <RadioGroup
              value={timeline}
              onValueChange={setTimeline}
              className="mt-2 space-y-2"
            >
              {MID_CAREER_TIMELINE.map((opt) => (
                <div key={opt.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={opt.value} id={`timeline-${opt.value}`} />
                  <Label htmlFor={`timeline-${opt.value}`} className="font-normal cursor-pointer">
                    {opt.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </SectionBlock>

          <SectionBlock title="Current Professional Reputation" required error={errors.current_reputation}>
            <p className="text-sm text-gray-500">
              In 2-3 sentences, describe the professional reputation you've built. What do colleagues, peers, or industry contacts associate with your name?
            </p>
            <Textarea
              value={current_reputation}
              onChange={(e) => setCurrentReputation(e.target.value)}
              placeholder="Describe your professional reputation..."
              className="mt-1 min-h-[120px]"
            />
          </SectionBlock>

          <SectionBlock title="Highest Degree" required error={errors.highest_degree}>
            <RadioGroup
              value={highest_degree}
              onValueChange={setHighestDegree}
              className="mt-2 space-y-2"
            >
              {MID_CAREER_DEGREE_OPTIONS.map((opt) => (
                <div key={opt.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={opt.value} id={`degree-${opt.value}`} />
                  <Label htmlFor={`degree-${opt.value}`} className="font-normal cursor-pointer">
                    {opt.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </SectionBlock>

          <SectionBlock title="Graduate Degrees or Executive Education Programs">
            <p className="text-sm text-gray-500">
              List any graduate degrees or executive education programs
            </p>
            <Input
              value={graduate_institutions}
              onChange={(e) => setGraduateInstitutions(e.target.value)}
              placeholder="e.g., MBA from Wharton, Executive Leadership Program at Harvard"
              className="mt-1"
            />
          </SectionBlock>
        </>
      )}

      {stage === 3 && (
        <>
          <div className="bg-[var(--dashboard-silk)] rounded-lg border border-[var(--dashboard-border)] p-6">
            <p className="text-sm text-gray-600 leading-relaxed">
              These optional questions help us understand how senior professionals with
              different backgrounds approach strategic positioning. Your responses
              inform our methodology while remaining confidential.
            </p>
          </div>

          <SectionBlock title="Do you identify as a member of an underrepresented group in senior leadership within your industry?">
            <RadioGroup
              value={underrepresented_senior}
              onValueChange={setUnderrepresentedSenior}
              className="mt-2 space-y-2"
            >
              {THREE_WAY_OPTIONS.map((opt) => (
                <div key={opt.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={opt.value} id={`underrep-${opt.value}`} />
                  <Label htmlFor={`underrep-${opt.value}`} className="font-normal cursor-pointer">
                    {opt.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </SectionBlock>

          <SectionBlock title="Career Transition Pattern">
            <RadioGroup
              value={career_transition_pattern}
              onValueChange={setCareerTransitionPattern}
              className="mt-2 space-y-2"
            >
              {CAREER_TRANSITION_PATTERNS.map((opt) => (
                <div key={opt.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={opt.value} id={`pattern-${opt.value}`} />
                  <Label htmlFor={`pattern-${opt.value}`} className="font-normal cursor-pointer">
                    {opt.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </SectionBlock>
        </>
      )}

      {stage === 4 && (
        <>
          <div className="bg-[var(--dashboard-silk)] rounded-lg border border-[var(--dashboard-border)] p-6">
            <h3 className="text-lg font-semibold text-[var(--dashboard-void)] mb-3 dashboard-heading">
              Privacy & Data Usage
            </h3>
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
              {PRIVACY_TEXT}
            </p>
          </div>

          <div className="bg-white rounded-lg border border-[var(--dashboard-border)] p-6 space-y-3">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="marketing-opt-in"
                checked={marketing_opt_in}
                onCheckedChange={(checked) => setMarketingOptIn(checked === true)}
                className="mt-1"
              />
              <div>
                <Label
                  htmlFor="marketing-opt-in"
                  className="text-base font-semibold text-[var(--dashboard-void)] cursor-pointer dashboard-heading"
                >
                  Join the Career Intelligence community
                </Label>
                <p className="text-sm text-gray-500 mt-1">{MARKETING_TEXT}</p>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="flex justify-between pt-4">
        {stage > 1 ? (
          <Button
            variant="outline"
            onClick={onBack}
            className="border-[var(--dashboard-void)] text-[var(--dashboard-void)]"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        ) : (
          <div />
        )}
        <Button
          onClick={handleSaveAndContinue}
          className="bg-[var(--dashboard-void)] hover:bg-[var(--dashboard-void)]/90 text-white"
        >
          Save & Continue
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
