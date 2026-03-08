/**
 * Input:
 * - hiringHistory: object|null, structured hiring history payload
 * Output:
 * - string: compact human-readable summary for AI prompt context
 */
function summarizeHiringHistory(hiringHistory) {
  if (!hiringHistory || typeof hiringHistory !== "object") return "";

  const faculty = Array.isArray(hiringHistory.hires_by_faculty?.data)
    ? hiringHistory.hires_by_faculty.data
        .slice(0, 3)
        .map((item) => `${item.name}: ${item.y}%`)
        .join(", ")
    : "";

  const workTerms = Array.isArray(hiringHistory.hires_by_student_work_term_number?.data)
    ? hiringHistory.hires_by_student_work_term_number.data
        .slice(0, 3)
        .map((item) => `${item.name}: ${item.y}%`)
        .join(", ")
    : "";

  const programs = Array.isArray(hiringHistory.most_frequently_hired_programs?.categories)
    ? hiringHistory.most_frequently_hired_programs.categories.slice(0, 4).join(", ")
    : "";

  return [faculty && `Faculty mix: ${faculty}`, workTerms && `Work terms: ${workTerms}`, programs && `Top programs: ${programs}`]
    .filter(Boolean)
    .join(" | ");
}

globalThis.summarizeHiringHistory = summarizeHiringHistory;
