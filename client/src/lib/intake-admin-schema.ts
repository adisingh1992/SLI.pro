import {
  ENROLLMENT_STATUS_OPTIONS,
  THREE_WAY_OPTIONS,
  EARLY_CAREER_STUDENT_STATUS_OPTIONS,
  EARLY_CAREER_YEARS,
  MID_CAREER_EXPERIENCE_YEARS,
  HIGHEST_DEGREE_OPTIONS,
  MID_CAREER_LEVEL_OPTIONS,
} from "@/lib/intake-constants";

export interface QuestionEntry {
  key: string;
  label: string;
  options?: { value: string; label: string }[];
}

export interface StageSchema {
  name: string;
  questions: QuestionEntry[];
}

export const INTAKE_SCHEMA: Record<string, StageSchema[]> = {
  undergraduate: [
    {
      name: "Academic Context",
      questions: [
        { key: "university_name", label: "University Name" },
        { key: "enrollment_status", label: "Enrollment Status", options: ENROLLMENT_STATUS_OPTIONS },
        { key: "graduation_year", label: "Expected Graduation Year" },
        { key: "major", label: "Major / Field of Study" },
        { key: "simultaneous_major_text", label: "Simultaneous Major Details" },
        { key: "academic_programs", label: "Academic Programs" },
      ],
    },
    {
      name: "Career Exploration",
      questions: [
        { key: "target_industries", label: "Target Industries" },
        { key: "target_functions", label: "Target Functions" },
        { key: "professional_experience", label: "Professional Experience" },
        { key: "immediate_priorities", label: "Immediate Priorities" },
      ],
    },
    {
      name: "Student Experience",
      questions: [
        { key: "first_generation_student", label: "Are you a first-generation college student?", options: THREE_WAY_OPTIONS },
        { key: "student_experience", label: "Student Experience Descriptors" },
      ],
    },
    {
      name: "Demographics",
      questions: [
        { key: "race_ethnicity", label: "Race & Ethnicity" },
        { key: "race_ethnicity_other", label: "Race & Ethnicity (Other)" },
        { key: "gender_identity", label: "Gender Identity" },
        { key: "gender_identity_other", label: "Gender Identity (Other)" },
        { key: "identity_representation", label: "Identity & Representation" },
      ],
    },
  ],

  early_career: [
    {
      name: "Professional Context",
      questions: [
        { key: "student_status", label: "Currently enrolled in a graduate program?", options: EARLY_CAREER_STUDENT_STATUS_OPTIONS },
        { key: "grad_university_name", label: "Graduate University Name" },
        { key: "current_title", label: "Current or most recent job title" },
        { key: "current_company", label: "Current or most recent company/organization" },
        { key: "years_experience", label: "Years of Experience", options: EARLY_CAREER_YEARS },
        { key: "target_industries", label: "Target Industries" },
        { key: "target_functions", label: "Target Functions" },
      ],
    },
    {
      name: "Career Direction & Education",
      questions: [
        { key: "career_focus", label: "Professional experience / current situation" },
        { key: "immediate_priorities", label: "Immediate priorities / goals" },
        { key: "highest_degree", label: "Highest Degree", options: HIGHEST_DEGREE_OPTIONS },
        { key: "undergrad_institution", label: "Undergraduate Institution" },
        { key: "graduate_institution", label: "Graduate Institution (if applicable)" },
      ],
    },
    {
      name: "Professional Path",
      questions: [
        { key: "first_generation_grad", label: "Are you a first-generation college graduate?", options: THREE_WAY_OPTIONS },
        { key: "professional_path", label: "Professional Path Descriptors" },
      ],
    },
    {
      name: "Demographics",
      questions: [
        { key: "race_ethnicity", label: "Race & Ethnicity" },
        { key: "race_ethnicity_other", label: "Race & Ethnicity (Other)" },
        { key: "gender_identity", label: "Gender Identity" },
        { key: "gender_identity_other", label: "Gender Identity (Other)" },
        { key: "identity_representation", label: "Identity & Representation" },
      ],
    },
  ],

  mid_career: [
    {
      name: "Professional Context",
      questions: [
        { key: "student_status", label: "Currently enrolled in a graduate program?", options: EARLY_CAREER_STUDENT_STATUS_OPTIONS },
        { key: "grad_university_name", label: "Graduate University Name" },
        { key: "current_title", label: "Current or most recent job title" },
        { key: "current_company", label: "Current or most recent company/organization" },
        { key: "years_experience", label: "Years of full-time professional experience", options: MID_CAREER_EXPERIENCE_YEARS },
        { key: "leadership_level", label: "Current Level", options: MID_CAREER_LEVEL_OPTIONS },
      ],
    },
    {
      name: "Strategic Positioning",
      questions: [
        { key: "primary_industry", label: "Target Industries" },
        { key: "functional_expertise", label: "Target Functions" },
        { key: "current_situation", label: "Professional experience / current situation" },
        { key: "mid_career_priorities", label: "Immediate priorities / goals" },
      ],
    },
    {
      name: "Professional Path",
      questions: [
        { key: "first_generation", label: "Are you a first-generation college student?", options: THREE_WAY_OPTIONS },
        { key: "professional_path", label: "Professional Path Descriptors" },
      ],
    },
    {
      name: "Demographics",
      questions: [
        { key: "race_ethnicity", label: "Race & Ethnicity" },
        { key: "race_ethnicity_other", label: "Race & Ethnicity (Other)" },
        { key: "gender_identity", label: "Gender Identity" },
        { key: "gender_identity_other", label: "Gender Identity (Other)" },
        { key: "identity_representation", label: "Identity & Representation" },
      ],
    },
  ],
};

export function resolveIntakeFieldValue(question: QuestionEntry, value: unknown): unknown {
  if (!question.options || value === null || value === undefined || value === "") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => {
      const match = question.options!.find((o) => o.value === item);
      return match ? match.label : String(item);
    });
  }
  if (typeof value === "string") {
    const match = question.options.find((o) => o.value === value);
    return match ? match.label : value;
  }
  return value;
}
