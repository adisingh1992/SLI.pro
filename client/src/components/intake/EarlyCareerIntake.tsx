import { useState, useEffect, type ReactNode } from "react";
import { Link } from "wouter";
import { Check, ChevronRight, ChevronLeft, Sparkles, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  INDUSTRIES,
  FUNCTIONS,
  EARLY_CAREER_YEARS,
  EARLY_CAREER_STUDENT_STATUS_OPTIONS,
  EARLY_CAREER_FOCUS_OPTIONS,
  EARLY_CAREER_PRIORITIES,
  HIGHEST_DEGREE_OPTIONS,
  THREE_WAY_OPTIONS,
  PROFESSIONAL_PATH_OPTIONS,
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
  prominent,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  prominent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`intake-pill ${selected ? "intake-pill-selected" : ""} ${prominent && !selected ? "intake-pill-prominent" : ""}`}
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
  prominentFirst,
}: {
  options: string[];
  selected: string[];
  onChange: (val: string[]) => void;
  max?: number;
  prominentFirst?: boolean;
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
      {options.map((option, idx) => (
        <PillToggle
          key={option}
          label={option}
          selected={selected.includes(option)}
          onClick={() => toggle(option)}
          prominent={prominentFirst && idx === 0}
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
  required,
  error,
  children,
  titleSuffix,
}: {
  title: string;
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
      {children}
      {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
    </div>
  );
}

export default function EarlyCareerIntake({
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
  const [target_industries, setTargetIndustries] = useState<string[]>(responses.target_industries || []);
  const [target_functions, setTargetFunctions] = useState<string[]>(responses.target_functions || []);

  const [career_focus, setCareerFocus] = useState(responses.career_focus || "");
  const [immediate_priorities, setImmediatePriorities] = useState<string[]>(responses.immediate_priorities || []);
  const [highest_degree, setHighestDegree] = useState(responses.highest_degree || "");
  const [undergrad_institution, setUndergradInstitution] = useState(responses.undergrad_institution || "");
  const [graduate_institution, setGraduateInstitution] = useState(responses.graduate_institution || "");

  const [first_generation_grad, setFirstGenerationGrad] = useState(responses.first_generation_grad || "");
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
    setTargetIndustries(responses.target_industries || []);
    setTargetFunctions(responses.target_functions || []);
    setCareerFocus(responses.career_focus || "");
    setImmediatePriorities(responses.immediate_priorities || []);
    setHighestDegree(responses.highest_degree || "");
    setUndergradInstitution(responses.undergrad_institution || "");
    setGraduateInstitution(responses.graduate_institution || "");
    setFirstGenerationGrad(responses.first_generation_grad || "");
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
    if (target_industries.length === 0) errs.target_industries = "Please select at least one industry";
    if (target_functions.length === 0) errs.target_functions = "Please select at least one function";
    return errs;
  };

  const validateStage2 = () => {
    const errs: Record<string, string> = {};
    if (!career_focus) errs.career_focus = "Please select your current situation";
    if (immediate_priorities.length === 0) errs.immediate_priorities = "Please select at least one priority";
    if (!highest_degree) errs.highest_degree = "Please select your highest degree";
    if (!undergrad_institution.trim()) errs.undergrad_institution = "Undergraduate institution is required";
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
        target_industries,
        target_functions,
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
      const stageData: Record<string, any> = {
        career_focus,
        immediate_priorities,
        highest_degree,
        undergrad_institution,
      };
      if (graduate_institution.trim()) stageData.graduate_institution = graduate_institution;
      onUpdateResponses(stageData);
    } else if (stage === 3) {
      const stageData: Record<string, any> = {};
      if (first_generation_grad) stageData.first_generation_grad = first_generation_grad;
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
          professional brand and exploring career opportunities.
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

            <SectionBlock title="Years of Experience" required error={errors.years_experience}>
              <RadioGroup
                value={years_experience}
                onValueChange={setYearsExperience}
                className="mt-2 space-y-2 intake-radio-group"
              >
                {EARLY_CAREER_YEARS.map((opt) => (
                  <div key={opt.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={opt.value} id={`years-${opt.value}`} />
                    <Label htmlFor={`years-${opt.value}`} className="font-normal cursor-pointer">
                      {opt.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </SectionBlock>

            <SectionBlock title="Target Industries" required error={errors.target_industries}>
              <p className="text-sm text-[var(--intake-aqua-dark)] mb-2">Select up to 3 industries you're targeting</p>
              <MultiSelectPills
                options={INDUSTRIES}
                selected={target_industries}
                onChange={setTargetIndustries}
                max={3}
                prominentFirst
              />
            </SectionBlock>

            <SectionBlock title="Target Functions" required error={errors.target_functions}>
              <p className="text-sm text-[var(--intake-aqua-dark)] mb-2">Select up to 2 functions you're targeting</p>
              <MultiSelectPills
                options={FUNCTIONS}
                selected={target_functions}
                onChange={setTargetFunctions}
                max={2}
                prominentFirst
              />
            </SectionBlock>
          </>
        )}

        {stage === 2 && (
          <>
            <SectionBlock title="Professional experience / current situation" required error={errors.career_focus}>
              <RadioGroup
                value={career_focus}
                onValueChange={setCareerFocus}
                className="mt-2 space-y-2 intake-radio-group"
              >
                {EARLY_CAREER_FOCUS_OPTIONS.map((opt) => (
                  <div key={opt} className="flex items-center space-x-2">
                    <RadioGroupItem value={opt} id={`focus-${opt}`} />
                    <Label htmlFor={`focus-${opt}`} className="font-normal cursor-pointer">
                      {opt}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </SectionBlock>

            <SectionBlock title="Immediate priorities / goals" required error={errors.immediate_priorities}>
              <p className="text-sm text-[var(--intake-aqua-dark)] mb-2">Select all that apply</p>
              <div className="mt-2">
                <MultiSelectPills
                  options={EARLY_CAREER_PRIORITIES}
                  selected={immediate_priorities}
                  onChange={setImmediatePriorities}
                />
              </div>
            </SectionBlock>

            <SectionBlock title="Highest Degree" required error={errors.highest_degree}>
              <RadioGroup
                value={highest_degree}
                onValueChange={setHighestDegree}
                className="mt-2 space-y-2 intake-radio-group"
              >
                {HIGHEST_DEGREE_OPTIONS.map((opt) => (
                  <div key={opt.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={opt.value} id={`degree-${opt.value}`} />
                    <Label htmlFor={`degree-${opt.value}`} className="font-normal cursor-pointer">
                      {opt.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </SectionBlock>

            <SectionBlock title="Undergraduate Institution" required error={errors.undergrad_institution}>
              <Input
                value={undergrad_institution}
                onChange={(e) => setUndergradInstitution(e.target.value)}
                placeholder="Enter your undergraduate institution"
                className="mt-1"
              />
            </SectionBlock>

            <SectionBlock title="Graduate institution (if applicable)">
              <Input
                value={graduate_institution}
                onChange={(e) => setGraduateInstitution(e.target.value)}
                placeholder="Enter your graduate institution"
                className="mt-1"
              />
            </SectionBlock>
          </>
        )}

        {stage === 3 && (
          <>
            <div className="intake-info-block">
              <p className="text-sm text-[var(--intake-void)] leading-relaxed">
                These optional questions help us understand how professionals with
                different backgrounds approach positioning challenges. Your responses
                inform our methodology refinement and provide aggregate insights to
                university partners. Individual responses remain confidential.
              </p>
            </div>

            <SectionBlock
              title="Are you a first-generation college graduate?"
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
                value={first_generation_grad}
                onValueChange={setFirstGenerationGrad}
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
                  options={PROFESSIONAL_PATH_OPTIONS}
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
