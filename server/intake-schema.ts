export interface QuestionEntry {
  key: string;
  label: string;
  options?: { value: string; label: string }[];
}

export interface StageSchema {
  name: string;
  questions: QuestionEntry[];
}

const ENROLLMENT_STATUS_OPTIONS = [
  { value: "current_student", label: "Current undergraduate student" },
  { value: "recent_grad", label: "Recent graduate (graduated within last 2 years)" },
  { value: "gap_year", label: "Gap year (accepted to university, deferred enrollment)" },
];

const THREE_WAY_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "prefer_not_say", label: "Prefer not to say" },
];

const EARLY_CAREER_STUDENT_STATUS_OPTIONS = [
  { value: "yes_fulltime", label: "Yes — full-time MBA or master's program" },
  { value: "yes_parttime", label: "Yes — part-time or executive program" },
  { value: "no_working", label: "No — I'm working full-time" },
  { value: "no_between_roles", label: "No — I'm between roles" },
];

const EARLY_CAREER_YEARS = [
  { value: "2-3", label: "2-3 years" },
  { value: "4-5", label: "4-5 years" },
  { value: "6-7", label: "6-7 years" },
];

const MID_CAREER_EXPERIENCE_YEARS = [
  { value: "8-12", label: "8–12 years" },
  { value: "13-20", label: "13–20 years" },
  { value: "20+", label: "20+ years" },
];

const HIGHEST_DEGREE_OPTIONS = [
  { value: "bachelors", label: "Bachelor's degree" },
  { value: "masters", label: "Master's degree (MBA, MS, MA, MPA, etc.)" },
  { value: "doctoral", label: "Doctoral degree (PhD, MD, JD, etc.)" },
  { value: "professional_cert", label: "Professional certification / some college" },
  { value: "currently_completing", label: "Currently completing degree (not yet graduated)" },
];

const MID_CAREER_LEVEL_OPTIONS = [
  { value: "individual_contributor", label: "Individual contributor / specialist" },
  { value: "manager", label: "Manager / team lead" },
  { value: "director", label: "Director / senior manager" },
  { value: "vp", label: "VP / senior director" },
  { value: "csuite", label: "C-suite / executive" },
  { value: "founder", label: "Founder / entrepreneur" },
  { value: "prefer_not_say", label: "Prefer not to say" },
];

export const INTAKE_SCHEMA: Record<string, StageSchema[]> = {
  undergraduate: [
    {
      name: "Academic Context",
      questions: [
        { key: "university_name", label: "University Name" },
        { key: "enrollment_status", label: "Enrollment Status", options: ENROLLMENT_STATUS_OPTIONS },
        { key: "graduation_year", label: "Expected Graduation Year (if currently enrolled)" },
        { key: "major", label: "Major / Field of Study" },
        { key: "simultaneous_major_text", label: "Please fill in the other Simultaneous Major here:" },
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
        { key: "student_experience", label: "Which of these describe your student experience?" },
      ],
    },
    {
      name: "Demographics",
      questions: [
        { key: "race_ethnicity", label: "How do you identify? (Race & Ethnicity — select all that apply)" },
        { key: "race_ethnicity_other", label: "Please describe your identity:" },
        { key: "gender_identity", label: "What is your gender identity?" },
        { key: "gender_identity_other", label: "Please describe your gender identity:" },
        { key: "identity_representation", label: "Do any of these shape how you show up professionally?" },
      ],
    },
  ],

  early_career: [
    {
      name: "Professional Context",
      questions: [
        { key: "student_status", label: "Are you currently enrolled in a graduate program?", options: EARLY_CAREER_STUDENT_STATUS_OPTIONS },
        { key: "grad_university_name", label: "University Name (Graduate Program)" },
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
        { key: "graduate_institution", label: "Graduate institution (if applicable)" },
      ],
    },
    {
      name: "Professional Path",
      questions: [
        { key: "first_generation_grad", label: "Are you a first-generation college graduate?", options: THREE_WAY_OPTIONS },
        { key: "professional_path", label: "Which of these describe your professional path?" },
      ],
    },
    {
      name: "Demographics",
      questions: [
        { key: "race_ethnicity", label: "How do you identify? (Race & Ethnicity — select all that apply)" },
        { key: "race_ethnicity_other", label: "Please describe your identity:" },
        { key: "gender_identity", label: "What is your gender identity?" },
        { key: "gender_identity_other", label: "Please describe your gender identity:" },
        { key: "identity_representation", label: "Do any of these shape how you show up professionally?" },
      ],
    },
  ],

  mid_career: [
    {
      name: "Professional Context",
      questions: [
        { key: "student_status", label: "Are you currently enrolled in a graduate program?", options: EARLY_CAREER_STUDENT_STATUS_OPTIONS },
        { key: "grad_university_name", label: "University Name (Graduate Program)" },
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
        { key: "professional_path", label: "Which of these describe your professional path?" },
      ],
    },
    {
      name: "Demographics",
      questions: [
        { key: "race_ethnicity", label: "How do you identify? (Race & Ethnicity — select all that apply)" },
        { key: "race_ethnicity_other", label: "Please describe your identity:" },
        { key: "gender_identity", label: "What is your gender identity?" },
        { key: "gender_identity_other", label: "Please describe your gender identity:" },
        { key: "identity_representation", label: "Do any of these shape how you show up professionally?" },
      ],
    },
  ],
};

export function resolveIntakeFieldValue(question: QuestionEntry, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";

  if (!question.options) {
    if (Array.isArray(value)) return value.join(", ");
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        const match = question.options!.find((o) => o.value === item);
        return match ? match.label : String(item);
      })
      .join(", ");
  }

  if (typeof value === "string") {
    const match = question.options.find((o) => o.value === value);
    return match ? match.label : value;
  }

  return String(value);
}
