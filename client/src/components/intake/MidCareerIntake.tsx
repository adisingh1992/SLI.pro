import { useState, useEffect, type ReactNode } from "react";
import { Link } from "wouter";
import { Check, ChevronRight, ChevronLeft, Sparkles, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  INDUSTRIES,
  FUNCTIONS,
  EARLY_CAREER_STUDENT_STATUS_OPTIONS,
  MID_CAREER_EXPERIENCE_YEARS,
  MID_CAREER_LEVEL_OPTIONS,
  MID_CAREER_SITUATION_OPTIONS,
  MID_CAREER_PRIORITIES,
  MID_CAREER_PROFESSIONAL_PATH,
  THREE_WAY_OPTIONS,
  RACE_ETHNICITY_OPTIONS,
  GENDER_IDENTITY_OPTIONS,
  IDENTITY_REPRESENTATION_OPTIONS,
  PRIVACY_TEXT,
  MARKETING_TEXT,
} from "@/lib/intake-constants";
import "@/assets/css/intake-theme.css";

interface IntakeProps {
  stage: number;
  responses: Record<string, any>;
  onUpdateResponses: (stageData: Record<string, any>) => void;
  onNext: () => void;
  onBack: () => void;
  totalStages?: number;
}

const RACE_OTHER_VALUE = "An identity not listed here";
const GENDER_OTHER_VALUE = "An identity not listed here";
const ENROLLED_VALUES = ["yes_fulltime", "yes_parttime"];

function PillToggle({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`intake-pill ${selected ? "intake-pill-selected" : ""}`}
    >
      {label}
    </button>
  );
}

function MultiSelectPills({
  options,
  selected,
  onChange,
  max,
}: {
  options: string[];
  selected: string[];
  onChange: (val: string[]) => void;
  max?: number;
}) {
  const toggle = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((s) => s !== option));
    } else if (!max || selected.length < max) {
      onChange([...selected, option]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <PillToggle
          key={option}
          label={option}
          selected={selected.includes(option)}
          onClick={() => toggle(option)}
        />
      ))}
    </div>
  );
}

function SingleSelectPills({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string;
  onChange: (val: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <PillToggle
          key={option}
          label={option}
          selected={selected === option}
          onClick={() => onChange(selected === option ? "" : option)}
        />
      ))}
    </div>
  );
}

function SectionBlock({
  title,
  description,
  required,
  error,
  children,
  titleSuffix,
}: {
  title: string;
  description?: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
  titleSuffix?: ReactNode;
}) {
  return (
    <div className="intake-section space-y-3">
      <div className="flex items-center gap-2">
        <Label className="text-base font-semibold text-[var(--intake-void)] intake-heading">
          {title}
          {required && <span className="text-red-500 ml-1">*</span>}
        </Label>
        {titleSuffix}
      </div>
      {description && (
        <p className="text-sm text-[var(--intake-aqua-dark)]">{description}</p>
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
  const [student_status, setStudentStatus] = useState(responses.student_status || "");
  const [grad_university_name, setGradUniversityName] = useState(responses.grad_university_name || "");
  const [current_title, setCurrentTitle] = useState(responses.current_title || "");
  const [current_company, setCurrentCompany] = useState(responses.current_company || "");
  const [years_experience, setYearsExperience] = useState(responses.years_experience || "");
  const [leadership_level, setLeadershipLevel] = useState(responses.leadership_level || "");

  const [primary_industry, setPrimaryIndustry] = useState(responses.primary_industry || "");
  const [functional_expertise, setFunctionalExpertise] = useState(responses.functional_expertise || "");
  const [current_situation, setCurrentSituation] = useState(responses.current_situation || "");
  const [mid_career_priorities, setMidCareerPriorities] = useState<string[]>(responses.mid_career_priorities || []);

  const [first_generation, setFirstGeneration] = useState(responses.first_generation || "");
  const [professional_path, setProfessionalPath] = useState<string[]>(responses.professional_path || []);

  const [race_ethnicity, setRaceEthnicity] = useState<string[]>(responses.race_ethnicity || []);
  const [race_ethnicity_other, setRaceEthnicityOther] = useState(responses.race_ethnicity_other || "");
  const [gender_identity, setGenderIdentity] = useState(responses.gender_identity || "");
  const [gender_identity_other, setGenderIdentityOther] = useState(responses.gender_identity_other || "");
  const [identity_representation, setIdentityRepresentation] = useState<string[]>(responses.identity_representation || []);

  const [marketing_opt_in, setMarketingOptIn] = useState(responses.marketing_opt_in || false);

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setStudentStatus(responses.student_status || "");
    setGradUniversityName(responses.grad_university_name || "");
    setCurrentTitle(responses.current_title || "");
    setCurrentCompany(responses.current_company || "");
    setYearsExperience(responses.years_experience || "");
    setLeadershipLevel(responses.leadership_level || "");
    setPrimaryIndustry(responses.primary_industry || "");
    setFunctionalExpertise(responses.functional_expertise || "");
    setCurrentSituation(responses.current_situation || "");
    setMidCareerPriorities(responses.mid_career_priorities || []);
    setFirstGeneration(responses.first_generation || "");
    setProfessionalPath(responses.professional_path || []);
    setRaceEthnicity(responses.race_ethnicity || []);
    setRaceEthnicityOther(responses.race_ethnicity_other || "");
    setGenderIdentity(responses.gender_identity || "");
    setGenderIdentityOther(responses.gender_identity_other || "");
    setIdentityRepresentation(responses.identity_representation || []);
    setMarketingOptIn(responses.marketing_opt_in || false);
  }, [responses]);

  const validateStage1 = () => {
    const errs: Record<string, string> = {};
    if (!student_status) errs.student_status = "Please select your enrollment status";
    if (!current_title.trim()) errs.current_title = "Job title is required";
    if (!current_company.trim()) errs.current_company = "Company is required";
    if (!years_experience) errs.years_experience = "Please select your years of experience";
    if (!leadership_level) errs.leadership_level = "Please select your current level";
    return errs;
  };

  const validateStage2 = () => {
    const errs: Record<string, string> = {};
    if (!primary_industry) errs.primary_industry = "Please select your target industry";
    if (!functional_expertise) errs.functional_expertise = "Please select your target function";
    if (!current_situation) errs.current_situation = "Please select your current situation";
    if (mid_career_priorities.length === 0) errs.mid_career_priorities = "Please select at least one priority";
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
      const stageData: Record<string, any> = {
        student_status,
        current_title,
        current_company,
        years_experience,
        leadership_level,
      };
      if (ENROLLED_VALUES.includes(student_status) && grad_university_name.trim()) {
        stageData.grad_university_name = grad_university_name;
      }
      onUpdateResponses(stageData);
    } else if (stage === 2) {
      validationErrors = validateStage2();
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        return;
      }
      onUpdateResponses({
        primary_industry,
        functional_expertise,
        current_situation,
        mid_career_priorities,
      });
    } else if (stage === 3) {
      const stageData: Record<string, any> = {};
      if (first_generation) stageData.first_generation = first_generation;
      if (professional_path.length > 0) stageData.professional_path = professional_path;
      onUpdateResponses(stageData);
    } else if (stage === 4) {
      const stageData: Record<string, any> = {};
      if (race_ethnicity.length > 0) stageData.race_ethnicity = race_ethnicity;
      if (race_ethnicity_other) stageData.race_ethnicity_other = race_ethnicity_other;
      if (gender_identity) stageData.gender_identity = gender_identity;
      if (gender_identity_other) stageData.gender_identity_other = gender_identity_other;
      if (identity_representation.length > 0) stageData.identity_representation = identity_representation;
      onUpdateResponses(stageData);
    } else if (stage === 5) {
      onUpdateResponses({ marketing_opt_in });
    }

    setErrors({});
    onNext();
  };

  if (stage === 6) {
    return (
      <div className="intake-completion intake-layout">
        <div className="intake-completion-icon">
          <Check className="w-8 h-8 text-[var(--intake-void)]" />
        </div>
        <h2 className="text-3xl font-bold text-[var(--intake-void)] intake-heading">
          You're all set!
        </h2>
        <p className="text-[var(--intake-aqua-dark)] text-center max-w-md mx-auto mt-3 leading-relaxed">
          Your profile has been saved. You're ready to start building your
          strategic positioning and advancing your career.
        </p>
        <Link href="/dashboard">
          <Button className="intake-btn-primary mt-8 inline-flex items-center gap-2 text-white">
            <Sparkles className="w-4 h-4" />
            Go to Dashboard
            <ChevronRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-5 intake-layout">
        {stage === 1 && (
          <>
            <SectionBlock title="Are you currently enrolled in a graduate program?" required error={errors.student_status}>
              <RadioGroup
                value={student_status}
                onValueChange={setStudentStatus}
                className="mt-2 space-y-2 intake-radio-group"
              >
                {EARLY_CAREER_STUDENT_STATUS_OPTIONS.map((opt) => (
                  <div key={opt.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={opt.value} id={`student-${opt.value}`} />
                    <Label htmlFor={`student-${opt.value}`} className="font-normal cursor-pointer">
                      {opt.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </SectionBlock>

            {ENROLLED_VALUES.includes(student_status) && (
              <SectionBlock title="University Name">
                <Input
                  value={grad_university_name}
                  onChange={(e) => setGradUniversityName(e.target.value)}
                  placeholder="Enter your university name"
                  className="mt-1"
                />
              </SectionBlock>
            )}

            <SectionBlock title="Current or most recent job title" required error={errors.current_title}>
              <Input
                value={current_title}
                onChange={(e) => setCurrentTitle(e.target.value)}
                placeholder="Enter your current or most recent job title"
                className="mt-1"
              />
            </SectionBlock>

            <SectionBlock title="Current or most recent company/organization" required error={errors.current_company}>
              <Input
                value={current_company}
                onChange={(e) => setCurrentCompany(e.target.value)}
                placeholder="Enter your current or most recent company"
                className="mt-1"
              />
            </SectionBlock>

            <SectionBlock title="Years of full-time professional experience" required error={errors.years_experience}>
              <RadioGroup
                value={years_experience}
                onValueChange={setYearsExperience}
                className="mt-2 space-y-2 intake-radio-group"
              >
                {MID_CAREER_EXPERIENCE_YEARS.map((opt) => (
                  <div key={opt.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={opt.value} id={`years-${opt.value}`} />
                    <Label htmlFor={`years-${opt.value}`} className="font-normal cursor-pointer">
                      {opt.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </SectionBlock>

            <SectionBlock title="Current Level" required error={errors.leadership_level}>
              <RadioGroup
                value={leadership_level}
                onValueChange={setLeadershipLevel}
                className="mt-2 space-y-2 intake-radio-group"
              >
                {MID_CAREER_LEVEL_OPTIONS.map((opt) => (
                  <div key={opt.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={opt.value} id={`level-${opt.value}`} />
                    <Label htmlFor={`level-${opt.value}`} className="font-normal cursor-pointer">
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
            <SectionBlock
              title="Target Industries"
              description="If you have expertise across multiple industries, select the one most relevant to your current positioning goals"
              required
              error={errors.primary_industry}
            >
              <div className="mt-1">
                <Combobox
                  options={INDUSTRIES}
                  value={primary_industry}
                  onValueChange={setPrimaryIndustry}
                  placeholder="Search for your target industry..."
                  emptyMessage="No matching industry found."
                />
              </div>
            </SectionBlock>

            <SectionBlock
              title="Target Functions"
              description="Select your primary functional expertise or the function you are targeting"
              required
              error={errors.functional_expertise}
            >
              <div className="mt-1">
                <Combobox
                  options={FUNCTIONS}
                  value={functional_expertise}
                  onValueChange={setFunctionalExpertise}
                  placeholder="Search for your target function..."
                  emptyMessage="No matching function found."
                />
              </div>
            </SectionBlock>

            <SectionBlock title="Professional experience / current situation" required error={errors.current_situation}>
              <RadioGroup
                value={current_situation}
                onValueChange={setCurrentSituation}
                className="mt-2 space-y-2 intake-radio-group"
              >
                {MID_CAREER_SITUATION_OPTIONS.map((opt) => (
                  <div key={opt} className="flex items-center space-x-2">
                    <RadioGroupItem value={opt} id={`situation-${opt}`} />
                    <Label htmlFor={`situation-${opt}`} className="font-normal cursor-pointer">
                      {opt}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </SectionBlock>

            <SectionBlock title="Immediate priorities / goals" required error={errors.mid_career_priorities}>
              <p className="text-sm text-[var(--intake-aqua-dark)] mb-2">Select all that apply</p>
              <div className="mt-2">
                <MultiSelectPills
                  options={MID_CAREER_PRIORITIES}
                  selected={mid_career_priorities}
                  onChange={setMidCareerPriorities}
                />
              </div>
            </SectionBlock>
          </>
        )}

        {stage === 3 && (
          <>
            <div className="intake-info-block">
              <p className="text-sm text-[var(--intake-void)] leading-relaxed">
                These optional questions help us understand how senior professionals with
                different backgrounds approach strategic positioning. Your responses
                inform our methodology while remaining confidential.
              </p>
            </div>

            <SectionBlock
              title="Are you a first-generation college student?"
              titleSuffix={
                <div className="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-[var(--intake-aqua-dark)] hover:text-[var(--intake-aqua)] transition-colors">
                        <Info className="w-4 h-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-sm">
                      Neither parent/guardian has completed a four-year college degree.
                    </TooltipContent>
                  </Tooltip>
                  <a
                    href="https://www.universityofcalifornia.edu/about-us/information-center/first-generation-college-students"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--intake-aqua)] underline hover:opacity-80 transition-opacity whitespace-nowrap"
                  >
                    What does this mean?
                  </a>
                </div>
              }
            >
              <RadioGroup
                value={first_generation}
                onValueChange={setFirstGeneration}
                className="mt-2 space-y-2 intake-radio-group"
              >
                {THREE_WAY_OPTIONS.map((opt) => (
                  <div key={opt.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={opt.value} id={`firstgen-${opt.value}`} />
                    <Label htmlFor={`firstgen-${opt.value}`} className="font-normal cursor-pointer">
                      {opt.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </SectionBlock>

            <SectionBlock title="Which of these describe your professional path?">
              <p className="text-sm text-[var(--intake-aqua-dark)] mb-2">Select all that apply</p>
              <div className="mt-2">
                <MultiSelectPills
                  options={MID_CAREER_PROFESSIONAL_PATH}
                  selected={professional_path}
                  onChange={setProfessionalPath}
                />
              </div>
            </SectionBlock>
          </>
        )}

        {stage === 4 && (
          <>
            <div className="intake-info-block">
              <p className="text-sm text-[var(--intake-void)] leading-relaxed">
                These optional questions help us understand the diversity of professional backgrounds and ensure career support is equitable. All responses are confidential and reported only in aggregate.
              </p>
            </div>

            <SectionBlock title="How do you identify?">
              <p className="text-sm text-[var(--intake-aqua-dark)] mb-2">Race &amp; Ethnicity — select all that apply</p>
              <div className="mt-2">
                <MultiSelectPills
                  options={RACE_ETHNICITY_OPTIONS}
                  selected={race_ethnicity}
                  onChange={(val) => {
                    if (!val.includes(RACE_OTHER_VALUE)) setRaceEthnicityOther("");
                    setRaceEthnicity(val);
                  }}
                />
              </div>
              {race_ethnicity.includes(RACE_OTHER_VALUE) && (
                <div className="mt-3">
                  <Label className="text-sm font-medium text-[var(--intake-void)]">
                    Please describe your identity:
                  </Label>
                  <Input
                    value={race_ethnicity_other}
                    onChange={(e) => setRaceEthnicityOther(e.target.value)}
                    placeholder="Enter your identity..."
                    className="mt-1"
                  />
                </div>
              )}
            </SectionBlock>

            <SectionBlock title="What is your gender identity?">
              <div className="mt-2">
                <SingleSelectPills
                  options={GENDER_IDENTITY_OPTIONS}
                  selected={gender_identity}
                  onChange={(val) => {
                    if (val !== GENDER_OTHER_VALUE) setGenderIdentityOther("");
                    setGenderIdentity(val);
                  }}
                />
              </div>
              {gender_identity === GENDER_OTHER_VALUE && (
                <div className="mt-3">
                  <Label className="text-sm font-medium text-[var(--intake-void)]">
                    Please describe your gender identity:
                  </Label>
                  <Input
                    value={gender_identity_other}
                    onChange={(e) => setGenderIdentityOther(e.target.value)}
                    placeholder="Enter your gender identity..."
                    className="mt-1"
                  />
                </div>
              )}
            </SectionBlock>

            <SectionBlock title="Do any of these shape how you show up professionally?">
              <p className="text-sm text-[var(--intake-aqua-dark)] mb-2">Select all that apply</p>
              <div className="mt-2">
                <MultiSelectPills
                  options={IDENTITY_REPRESENTATION_OPTIONS}
                  selected={identity_representation}
                  onChange={setIdentityRepresentation}
                />
              </div>
            </SectionBlock>
          </>
        )}

        {stage === 5 && (
          <>
            <div className="intake-privacy-block">
              <h3 className="text-lg font-semibold text-[var(--intake-void)] mb-3 intake-heading">
                Privacy & Data Usage
              </h3>
              <p className="text-sm text-[var(--intake-void)] leading-relaxed whitespace-pre-line opacity-80">
                {PRIVACY_TEXT}
              </p>
            </div>

            <div className="intake-section space-y-3">
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
                    className="text-base font-semibold text-[var(--intake-void)] cursor-pointer intake-heading"
                  >
                    Join the Career Intelligence community
                  </Label>
                  <p className="text-sm text-[var(--intake-aqua-dark)] mt-1">{MARKETING_TEXT}</p>
                </div>
              </div>
            </div>
          </>
        )}

        {stage !== 6 && (
          <div className="flex justify-between pt-4 pb-8">
            {stage > 1 ? (
              <button
                onClick={onBack}
                className="intake-btn-outline inline-flex items-center gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            ) : (
              <div />
            )}
            <button
              onClick={handleSaveAndContinue}
              className="intake-btn-primary inline-flex items-center gap-2"
            >
              Save & Continue
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
