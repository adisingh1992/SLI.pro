import { useState, useEffect, type ReactNode } from "react";
import { Link } from "wouter";
import { Check, ChevronRight, ChevronLeft, Sparkles } from "lucide-react";
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
  INDUSTRIES,
  FUNCTIONS,
  ENROLLMENT_STATUS_OPTIONS,
  GRADUATION_YEARS,
  ACADEMIC_PROGRAMS,
  PROFESSIONAL_EXPERIENCE_OPTIONS,
  IMMEDIATE_PRIORITIES,
  THREE_WAY_OPTIONS,
  STUDENT_TYPE_OPTIONS,
  IDENTITY_FLAGS,
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
}

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

function SectionBlock({
  title,
  required,
  error,
  children,
}: {
  title: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="intake-section space-y-3">
      <Label className="text-base font-semibold text-[var(--intake-void)] intake-heading">
        {title}
        {required && <span className="text-red-500 ml-1">*</span>}
      </Label>
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
  const [academic_programs, setAcademicPrograms] = useState<string[]>(responses.academic_programs || []);

  const [target_industries, setTargetIndustries] = useState<string[]>(responses.target_industries || []);
  const [target_functions, setTargetFunctions] = useState<string[]>(responses.target_functions || []);
  const [professional_experience, setProfessionalExperience] = useState<string[]>(responses.professional_experience || []);
  const [immediate_priorities, setImmediatePriorities] = useState<string[]>(responses.immediate_priorities || []);

  const [first_generation_student, setFirstGenStudent] = useState(responses.first_generation_student || "");
  const [domestic_or_international, setDomesticOrIntl] = useState(responses.domestic_or_international || "");
  const [underrepresented_group, setUnderrepresentedGroup] = useState(responses.underrepresented_group || "");
  const [identity_flags, setIdentityFlags] = useState<string[]>(responses.identity_flags || []);

  const [marketing_opt_in, setMarketingOptIn] = useState(responses.marketing_opt_in || false);

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setUniversityName(responses.university_name || "");
    setEnrollmentStatus(responses.enrollment_status || "");
    setGraduationYear(responses.graduation_year || "");
    setMajor(responses.major || "");
    setAcademicPrograms(responses.academic_programs || []);
    setTargetIndustries(responses.target_industries || []);
    setTargetFunctions(responses.target_functions || []);
    setProfessionalExperience(responses.professional_experience || []);
    setImmediatePriorities(responses.immediate_priorities || []);
    setFirstGenStudent(responses.first_generation_student || "");
    setDomesticOrIntl(responses.domestic_or_international || "");
    setUnderrepresentedGroup(responses.underrepresented_group || "");
    setIdentityFlags(responses.identity_flags || []);
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
    if (academic_programs.length === 0) errs.academic_programs = "Please select at least one option";
    return errs;
  };

  const validateStage2 = () => {
    const errs: Record<string, string> = {};
    if (target_industries.length === 0) errs.target_industries = "Please select at least one industry";
    if (target_functions.length === 0) errs.target_functions = "Please select at least one function";
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
      if (domestic_or_international) stageData.domestic_or_international = domestic_or_international;
      if (underrepresented_group) stageData.underrepresented_group = underrepresented_group;
      if (identity_flags.length > 0) stageData.identity_flags = identity_flags;
      onUpdateResponses(stageData);
    } else if (stage === 4) {
      onUpdateResponses({ marketing_opt_in });
    }

    setErrors({});
    onNext();
  };

  if (stage === 5) {
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
            <SectionBlock title="Expected Graduation Year" required error={errors.graduation_year}>
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
                options={INDUSTRIES}
                value={major}
                onValueChange={setMajor}
                placeholder="Search for your major..."
                emptyMessage="No matching major found."
              />
            </div>
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
            <p className="text-sm text-[var(--intake-aqua-dark)] mb-2">Select up to 3 industries you're interested in</p>
            <MultiSelectPills
              options={INDUSTRIES}
              selected={target_industries}
              onChange={setTargetIndustries}
              max={3}
            />
          </SectionBlock>

          <SectionBlock
            title="Target Functions"
            required
            error={errors.target_functions}
          >
            <p className="text-sm text-[var(--intake-aqua-dark)] mb-2">Select up to 2 functions you're interested in</p>
            <MultiSelectPills
              options={FUNCTIONS}
              selected={target_functions}
              onChange={setTargetFunctions}
              max={2}
            />
          </SectionBlock>

          <SectionBlock
            title="Professional Experience"
            required
            error={errors.professional_experience}
          >
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

          <SectionBlock title="Are you a first-generation college student?">
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

          <SectionBlock title="Student Type">
            <RadioGroup
              value={domestic_or_international}
              onValueChange={setDomesticOrIntl}
              className="mt-2 space-y-2 intake-radio-group"
            >
              {STUDENT_TYPE_OPTIONS.map((opt) => (
                <div key={opt.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={opt.value} id={`student-type-${opt.value}`} />
                  <Label htmlFor={`student-type-${opt.value}`} className="font-normal cursor-pointer">
                    {opt.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </SectionBlock>

          <SectionBlock title="Do you identify as part of an underrepresented group?">
            <RadioGroup
              value={underrepresented_group}
              onValueChange={setUnderrepresentedGroup}
              className="mt-2 space-y-2 intake-radio-group"
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

          <SectionBlock title="Identity & Background">
            <div className="mt-2">
              <MultiSelectPills
                options={IDENTITY_FLAGS}
                selected={identity_flags}
                onChange={setIdentityFlags}
              />
            </div>
          </SectionBlock>
        </>
      )}

      {stage === 4 && (
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

      {stage !== 5 && (
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
  );
}
