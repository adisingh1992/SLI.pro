import { useState, useEffect, type ReactNode } from "react";
import { Link } from "wouter";
import { Check, ChevronRight, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import {
  INDUSTRIES,
  FUNCTIONS,
  EARLY_CAREER_YEARS,
  STUDENT_STATUS_OPTIONS,
  CAREER_FOCUS_OPTIONS,
  TIMELINE_OPTIONS,
  HIGHEST_DEGREE_OPTIONS,
  THREE_WAY_OPTIONS,
  CAREER_PATH_PATTERNS,
  PRIVACY_TEXT,
  MARKETING_TEXT,
} from "@/lib/intake-constants";

interface IntakeProps {
  stage: number;
  responses: Record<string, any>;
  onUpdateResponses: (stageData: Record<string, any>) => void;
  onNext: () => void;
  onBack: () => void;
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
    <div className="bg-white rounded-lg border border-gray-100 p-6 space-y-3">
      <Label
        className="text-base font-semibold text-[#202436]"
        style={{ fontFamily: "Lora, serif" }}
      >
        {title}
        {required && <span className="text-red-500 ml-1">*</span>}
      </Label>
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
  const [current_title, setCurrentTitle] = useState(responses.current_title || "");
  const [current_company, setCurrentCompany] = useState(responses.current_company || "");
  const [years_experience, setYearsExperience] = useState(responses.years_experience || "");
  const [current_industry, setCurrentIndustry] = useState(responses.current_industry || "");
  const [current_function, setCurrentFunction] = useState(responses.current_function || "");
  const [student_status, setStudentStatus] = useState(responses.student_status || "");

  const [career_focus, setCareerFocus] = useState(responses.career_focus || "");
  const [timeline, setTimeline] = useState(responses.timeline || "");
  const [target_industry_optional, setTargetIndustryOptional] = useState(responses.target_industry_optional || "");
  const [highest_degree, setHighestDegree] = useState(responses.highest_degree || "");
  const [undergrad_institution, setUndergradInstitution] = useState(responses.undergrad_institution || "");
  const [graduate_institution, setGraduateInstitution] = useState(responses.graduate_institution || "");

  const [first_generation_grad, setFirstGenerationGrad] = useState(responses.first_generation_grad || "");
  const [underrepresented_group, setUnderrepresentedGroup] = useState(responses.underrepresented_group || "");
  const [career_path_pattern, setCareerPathPattern] = useState(responses.career_path_pattern || "");

  const [marketing_opt_in, setMarketingOptIn] = useState(responses.marketing_opt_in || false);

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setCurrentTitle(responses.current_title || "");
    setCurrentCompany(responses.current_company || "");
    setYearsExperience(responses.years_experience || "");
    setCurrentIndustry(responses.current_industry || "");
    setCurrentFunction(responses.current_function || "");
    setStudentStatus(responses.student_status || "");
    setCareerFocus(responses.career_focus || "");
    setTimeline(responses.timeline || "");
    setTargetIndustryOptional(responses.target_industry_optional || "");
    setHighestDegree(responses.highest_degree || "");
    setUndergradInstitution(responses.undergrad_institution || "");
    setGraduateInstitution(responses.graduate_institution || "");
    setFirstGenerationGrad(responses.first_generation_grad || "");
    setUnderrepresentedGroup(responses.underrepresented_group || "");
    setCareerPathPattern(responses.career_path_pattern || "");
    setMarketingOptIn(responses.marketing_opt_in || false);
  }, [responses]);

  const validateStage1 = () => {
    const errs: Record<string, string> = {};
    if (!current_title.trim()) errs.current_title = "Job title is required";
    if (!current_company.trim()) errs.current_company = "Company is required";
    if (!years_experience) errs.years_experience = "Please select your years of experience";
    if (!current_industry) errs.current_industry = "Please select your industry";
    if (!current_function) errs.current_function = "Please select your function";
    if (!student_status) errs.student_status = "Please select your student status";
    return errs;
  };

  const validateStage2 = () => {
    const errs: Record<string, string> = {};
    if (!career_focus) errs.career_focus = "Please select your career focus";
    if (!timeline) errs.timeline = "Please select your timeline";
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
      onUpdateResponses({
        current_title,
        current_company,
        years_experience,
        current_industry,
        current_function,
        student_status,
      });
    } else if (stage === 2) {
      validationErrors = validateStage2();
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        return;
      }
      const stageData: Record<string, any> = {
        career_focus,
        timeline,
        highest_degree,
        undergrad_institution,
      };
      if (target_industry_optional) stageData.target_industry_optional = target_industry_optional;
      if (graduate_institution.trim()) stageData.graduate_institution = graduate_institution;
      onUpdateResponses(stageData);
    } else if (stage === 3) {
      const stageData: Record<string, any> = {};
      if (first_generation_grad) stageData.first_generation_grad = first_generation_grad;
      if (underrepresented_group) stageData.underrepresented_group = underrepresented_group;
      if (career_path_pattern) stageData.career_path_pattern = career_path_pattern;
      onUpdateResponses(stageData);
    } else if (stage === 4) {
      onUpdateResponses({ marketing_opt_in });
    }

    setErrors({});
    onNext();
  };

  if (stage === 5) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-6 bg-white rounded-lg">
        <div className="w-16 h-16 rounded-full bg-[#bed6d1] flex items-center justify-center">
          <Check className="w-8 h-8 text-[#202436]" />
        </div>
        <h2
          className="text-3xl font-bold text-[#202436]"
          style={{ fontFamily: "Lora, serif" }}
        >
          You're all set!
        </h2>
        <p
          className="text-gray-600 text-center max-w-md"
          style={{ fontFamily: "Montserrat, sans-serif" }}
        >
          Your profile has been saved. You're ready to start building your
          professional brand and exploring career opportunities.
        </p>
        <Link href="/dashboard">
          <Button
            className="bg-[#202436] hover:bg-[#202436]/90 text-white px-8 py-3"
            style={{ fontFamily: "Montserrat, sans-serif" }}
          >
            Go to Dashboard
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6" style={{ fontFamily: "Montserrat, sans-serif" }}>
      {stage === 1 && (
        <>
          <SectionBlock title="Current Job Title" required error={errors.current_title}>
            <Input
              value={current_title}
              onChange={(e) => setCurrentTitle(e.target.value)}
              placeholder="Enter your current job title"
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

          <SectionBlock title="Current Industry" required error={errors.current_industry}>
            <div className="mt-1">
              <Combobox
                options={INDUSTRIES}
                value={current_industry}
                onValueChange={setCurrentIndustry}
                placeholder="Search for your industry..."
                emptyMessage="No matching industry found."
              />
            </div>
          </SectionBlock>

          <SectionBlock title="Current Function" required error={errors.current_function}>
            <div className="mt-1">
              <Combobox
                options={FUNCTIONS}
                value={current_function}
                onValueChange={setCurrentFunction}
                placeholder="Search for your function..."
                emptyMessage="No matching function found."
              />
            </div>
          </SectionBlock>

          <SectionBlock title="Student Status" required error={errors.student_status}>
            <RadioGroup
              value={student_status}
              onValueChange={setStudentStatus}
              className="mt-2 space-y-2"
            >
              {STUDENT_STATUS_OPTIONS.map((opt) => (
                <div key={opt.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={opt.value} id={`student-${opt.value}`} />
                  <Label htmlFor={`student-${opt.value}`} className="font-normal cursor-pointer">
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
          <SectionBlock title="Career Focus" required error={errors.career_focus}>
            <RadioGroup
              value={career_focus}
              onValueChange={setCareerFocus}
              className="mt-2 space-y-2"
            >
              {CAREER_FOCUS_OPTIONS.map((opt) => (
                <div key={opt.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={opt.value} id={`focus-${opt.value}`} />
                  <Label htmlFor={`focus-${opt.value}`} className="font-normal cursor-pointer">
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
              {TIMELINE_OPTIONS.map((opt) => (
                <div key={opt.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={opt.value} id={`timeline-${opt.value}`} />
                  <Label htmlFor={`timeline-${opt.value}`} className="font-normal cursor-pointer">
                    {opt.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </SectionBlock>

          <SectionBlock title="Target industry if different from current">
            <div className="mt-1">
              <Combobox
                options={INDUSTRIES}
                value={target_industry_optional}
                onValueChange={setTargetIndustryOptional}
                placeholder="Search for target industry..."
                emptyMessage="No matching industry found."
              />
            </div>
          </SectionBlock>

          <SectionBlock title="Highest Degree" required error={errors.highest_degree}>
            <RadioGroup
              value={highest_degree}
              onValueChange={setHighestDegree}
              className="mt-2 space-y-2"
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
          <div className="bg-[#f8f9fa] rounded-lg border border-gray-100 p-6">
            <p className="text-sm text-gray-600 leading-relaxed">
              These optional questions help us understand how professionals with
              different backgrounds approach positioning challenges. Your responses
              inform our methodology refinement and provide aggregate insights to
              university partners. Individual responses remain confidential.
            </p>
          </div>

          <SectionBlock title="Are you a first-generation college graduate?">
            <RadioGroup
              value={first_generation_grad}
              onValueChange={setFirstGenerationGrad}
              className="mt-2 space-y-2"
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

          <SectionBlock title="Do you identify as part of an underrepresented group?">
            <RadioGroup
              value={underrepresented_group}
              onValueChange={setUnderrepresentedGroup}
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

          <SectionBlock title="Career Path Pattern">
            <RadioGroup
              value={career_path_pattern}
              onValueChange={setCareerPathPattern}
              className="mt-2 space-y-2"
            >
              {CAREER_PATH_PATTERNS.map((opt) => (
                <div key={opt.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={opt.value} id={`path-${opt.value}`} />
                  <Label htmlFor={`path-${opt.value}`} className="font-normal cursor-pointer">
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
          <div className="bg-[#f8f9fa] rounded-lg border border-gray-100 p-6">
            <h3
              className="text-lg font-semibold text-[#202436] mb-3"
              style={{ fontFamily: "Lora, serif" }}
            >
              Privacy & Data Usage
            </h3>
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
              {PRIVACY_TEXT}
            </p>
          </div>

          <div className="bg-white rounded-lg border border-gray-100 p-6 space-y-3">
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
                  className="text-base font-semibold text-[#202436] cursor-pointer"
                  style={{ fontFamily: "Lora, serif" }}
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
            className="border-[#202436] text-[#202436]"
            style={{ fontFamily: "Montserrat, sans-serif" }}
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        ) : (
          <div />
        )}
        <Button
          onClick={handleSaveAndContinue}
          className="bg-[#202436] hover:bg-[#202436]/90 text-white"
          style={{ fontFamily: "Montserrat, sans-serif" }}
        >
          Save & Continue
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}