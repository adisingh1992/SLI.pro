import { useState, useEffect, type ReactNode } from "react";
import { Link } from "wouter";
import { Check, ChevronRight, ChevronLeft, Sparkles, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  ENROLLMENT_STATUS_OPTIONS,
  GRADUATION_YEARS,
  MAJOR_FIELD_OPTIONS,
  ACADEMIC_PROGRAMS,
  PROFESSIONAL_EXPERIENCE_OPTIONS,
  IMMEDIATE_PRIORITIES,
  THREE_WAY_OPTIONS,
  STUDENT_EXPERIENCE_OPTIONS,
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

const SIMULTANEOUS_MAJOR_VALUE = "Bachelors in Business + Simultaneous Major";
const RACE_OTHER_VALUE = "An identity not listed here";
const GENDER_OTHER_VALUE = "An identity not listed here";

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

export default function UndergradIntake({
  stage,
  responses,
  onUpdateResponses,
  onNext,
  onBack,
}: IntakeProps) {
  const [university_name, setUniversityName] = useState(responses.university_name || "");
  const [enrollment_status, setEnrollmentStatus] = useState(responses.enrollment_status || "");
  const [graduation_year, setGraduationYear] = useState(responses.graduation_year || "");
  const [major, setMajor] = useState(responses.major || "");
  const [simultaneous_major_text, setSimultaneousMajorText] = useState(responses.simultaneous_major_text || "");
  const [academic_programs, setAcademicPrograms] = useState<string[]>(responses.academic_programs || []);

  const [target_industries, setTargetIndustries] = useState<string[]>(Array.isArray(responses.target_industries) ? responses.target_industries : responses.target_industries ? [responses.target_industries] : []);
  const [target_functions, setTargetFunctions] = useState(responses.target_functions || "");
  const [professional_experience, setProfessionalExperience] = useState<string[]>(responses.professional_experience || []);
  const [immediate_priorities, setImmediatePriorities] = useState<string[]>(responses.immediate_priorities || []);

  const [first_generation_student, setFirstGenStudent] = useState(responses.first_generation_student || "");
  const [student_experience, setStudentExperience] = useState<string[]>(responses.student_experience || []);

  const [race_ethnicity, setRaceEthnicity] = useState<string[]>(responses.race_ethnicity || []);
  const [race_ethnicity_other, setRaceEthnicityOther] = useState(responses.race_ethnicity_other || "");
  const [gender_identity, setGenderIdentity] = useState(responses.gender_identity || "");
  const [gender_identity_other, setGenderIdentityOther] = useState(responses.gender_identity_other || "");
  const [identity_representation, setIdentityRepresentation] = useState<string[]>(responses.identity_representation || []);

  const [marketing_opt_in, setMarketingOptIn] = useState(responses.marketing_opt_in || false);

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setUniversityName(responses.university_name || "");
    setEnrollmentStatus(responses.enrollment_status || "");
    setGraduationYear(responses.graduation_year || "");
    setMajor(responses.major || "");
    setSimultaneousMajorText(responses.simultaneous_major_text || "");
    setAcademicPrograms(responses.academic_programs || []);
    setTargetIndustries(Array.isArray(responses.target_industries) ? responses.target_industries : responses.target_industries ? [responses.target_industries] : []);
    setTargetFunctions(responses.target_functions || "");
    setProfessionalExperience(responses.professional_experience || []);
    setImmediatePriorities(responses.immediate_priorities || []);
    setFirstGenStudent(responses.first_generation_student || "");
    setStudentExperience(responses.student_experience || []);
    setRaceEthnicity(responses.race_ethnicity || []);
    setRaceEthnicityOther(responses.race_ethnicity_other || "");
    setGenderIdentity(responses.gender_identity || "");
    setGenderIdentityOther(responses.gender_identity_other || "");
    setIdentityRepresentation(responses.identity_representation || []);
    setMarketingOptIn(responses.marketing_opt_in || false);
  }, [responses]);

  const validateStage1 = () => {
    const errs: Record<string, string> = {};
    if (!university_name.trim()) errs.university_name = "University name is required";
    if (!enrollment_status) errs.enrollment_status = "Please select your enrollment status";
    if (enrollment_status === "current_student" && !graduation_year) {
      errs.graduation_year = "Please select your expected graduation year";
    }
    if (!major) errs.major = "Please select your major";
    if (major === SIMULTANEOUS_MAJOR_VALUE && !simultaneous_major_text.trim()) {
      errs.simultaneous_major_text = "Please fill in your simultaneous major";
    }
    if (academic_programs.length === 0) errs.academic_programs = "Please select at least one option";
    return errs;
  };

  const validateStage2 = () => {
    const errs: Record<string, string> = {};
    if (target_industries.length === 0) errs.target_industries = "Please select at least one industry";
    if (!target_functions) errs.target_functions = "Please select a function";
    if (professional_experience.length === 0) errs.professional_experience = "Please select at least one option";
    if (immediate_priorities.length === 0) errs.immediate_priorities = "Please select at least one priority";
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
        university_name,
        enrollment_status,
        major,
        academic_programs,
      };
      if (enrollment_status === "current_student") {
        stageData.graduation_year = graduation_year;
      }
      if (major === SIMULTANEOUS_MAJOR_VALUE) {
        stageData.simultaneous_major_text = simultaneous_major_text;
      }
      onUpdateResponses(stageData);
    } else if (stage === 2) {
      validationErrors = validateStage2();
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        return;
      }
      onUpdateResponses({
        target_industries,
        target_functions,
        professional_experience,
        immediate_priorities,
      });
    } else if (stage === 3) {
      const stageData: Record<string, any> = {};
      if (first_generation_student) stageData.first_generation_student = first_generation_student;
      if (student_experience.length > 0) stageData.student_experience = student_experience;
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
            <SectionBlock title="University Name" required error={errors.university_name}>
              <Input
                value={university_name}
                onChange={(e) => setUniversityName(e.target.value)}
                placeholder="Enter your university name"
                className="mt-1"
              />
            </SectionBlock>

            <SectionBlock title="Enrollment Status" required error={errors.enrollment_status}>
              <RadioGroup
                value={enrollment_status}
                onValueChange={setEnrollmentStatus}
                className="mt-2 space-y-2 intake-radio-group"
              >
                {ENROLLMENT_STATUS_OPTIONS.map((opt) => (
                  <div key={opt.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={opt.value} id={`enrollment-${opt.value}`} />
                    <Label htmlFor={`enrollment-${opt.value}`} className="font-normal cursor-pointer">
                      {opt.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </SectionBlock>

            {enrollment_status === "current_student" && (
              <SectionBlock title="Expected Graduation Year (if currently enrolled)" required error={errors.graduation_year}>
                <Select value={graduation_year} onValueChange={setGraduationYear}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select graduation year" />
                  </SelectTrigger>
                  <SelectContent>
                    {GRADUATION_YEARS.map((year) => (
                      <SelectItem key={year} value={year}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SectionBlock>
            )}

            <SectionBlock title="Major / Field of Study" required error={errors.major}>
              <div className="mt-1">
                <Combobox
                  options={MAJOR_FIELD_OPTIONS}
                  value={major}
                  onValueChange={setMajor}
                  placeholder="Search for your major..."
                  emptyMessage="No matching major found."
                />
              </div>
              {major === SIMULTANEOUS_MAJOR_VALUE && (
                <div className="mt-3">
                  <Label className="text-sm font-medium text-[var(--intake-void)]">
                    Please fill in the other Simultaneous Major here:
                  </Label>
                  <Input
                    value={simultaneous_major_text}
                    onChange={(e) => setSimultaneousMajorText(e.target.value)}
                    placeholder="Enter your other major..."
                    className="mt-1"
                  />
                  {errors.simultaneous_major_text && (
                    <p className="text-sm text-red-500 mt-1">{errors.simultaneous_major_text}</p>
                  )}
                </div>
              )}
            </SectionBlock>

            <SectionBlock title="Academic Programs" required error={errors.academic_programs}>
              <div className="mt-2">
                <MultiSelectPills
                  options={ACADEMIC_PROGRAMS}
                  selected={academic_programs}
                  onChange={setAcademicPrograms}
                />
              </div>
            </SectionBlock>
          </>
        )}

        {stage === 2 && (
          <>
            <SectionBlock
              title="Target Industries"
              required
              error={errors.target_industries}
            >
              <p className="text-sm text-[var(--intake-aqua-dark)] mb-2">Select up to 3</p>
              <div className="mt-2">
                <MultiSelectPills
                  options={INDUSTRIES}
                  selected={target_industries}
                  onChange={setTargetIndustries}
                  max={3}
                />
              </div>
            </SectionBlock>

            <SectionBlock
              title="Target Functions"
              required
              error={errors.target_functions}
            >
              <Combobox
                options={FUNCTIONS}
                value={target_functions}
                onValueChange={setTargetFunctions}
                placeholder="Select a function..."
              />
            </SectionBlock>

            <SectionBlock
              title="Professional Experience"
              required
              error={errors.professional_experience}
            >
              <p className="text-sm text-[var(--intake-aqua-dark)] mb-2">Select all that apply</p>
              <div className="mt-2">
                <MultiSelectPills
                  options={PROFESSIONAL_EXPERIENCE_OPTIONS}
                  selected={professional_experience}
                  onChange={setProfessionalExperience}
                />
              </div>
            </SectionBlock>

            <SectionBlock
              title="Immediate Priorities"
              required
              error={errors.immediate_priorities}
            >
              <div className="mt-2">
                <MultiSelectPills
                  options={IMMEDIATE_PRIORITIES}
                  selected={immediate_priorities}
                  onChange={setImmediatePriorities}
                />
              </div>
            </SectionBlock>
          </>
        )}

        {stage === 3 && (
          <>
            <div className="intake-info-block">
              <p className="text-sm text-[var(--intake-void)] leading-relaxed">
                These optional questions help us understand how different student
                populations experience professional positioning challenges. Your
                responses inform our research and help university partners improve
                career support programs. Individual responses remain confidential
                and are only shared in aggregate form with your institution.
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
                value={first_generation_student}
                onValueChange={setFirstGenStudent}
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

            <SectionBlock title="Which of these describe your student experience?">
              <div className="mt-2">
                <MultiSelectPills
                  options={STUDENT_EXPERIENCE_OPTIONS}
                  selected={student_experience}
                  onChange={setStudentExperience}
                />
              </div>
            </SectionBlock>
          </>
        )}

        {stage === 4 && (
          <>
            <div className="intake-info-block">
              <p className="text-sm text-[var(--intake-void)] leading-relaxed">
                These optional questions help us understand the diversity of student backgrounds and ensure career support is equitable. All responses are confidential and reported only in aggregate.
              </p>
            </div>

            <SectionBlock title="How do you identify?">
              <p className="text-sm text-[var(--intake-aqua-dark)] mb-2">Race &amp; Ethnicity — select all that apply</p>
              <div className="mt-2">
                <MultiSelectPills
                  options={RACE_ETHNICITY_OPTIONS}
                  selected={race_ethnicity}
                  onChange={(val) => {
                    if (!val.includes(RACE_OTHER_VALUE)) {
                      setRaceEthnicityOther("");
                    }
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
                    if (val !== GENDER_OTHER_VALUE) {
                      setGenderIdentityOther("");
                    }
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
