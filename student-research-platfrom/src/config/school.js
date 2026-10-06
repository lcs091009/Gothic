const env = import.meta.env || {};
export const schoolEmailDomain = env.VITE_SCHOOL_EMAIL_DOMAIN || "gochon.hs.kr";
export const studentAdmissionYear = env.VITE_STUDENT_ADMISSION_YEAR || "26";

export function getStudentNumber(email = "", domain = schoolEmailDomain) {
  const [local, host] = String(email).toLowerCase().split("@");
  if (host !== domain.toLowerCase()) return null;
  return local.match(/^\d{2}-(\d{3,5})$/)?.[1] || null;
}

export function getStudentEmail(number, year = studentAdmissionYear) {
  return number ? `${year}-${number}@${schoolEmailDomain}` : "";
}

export function extractStudentNumber(name, year = studentAdmissionYear) {
  const explicit = String(name).match(/(?:^|[^0-9])(\d{2})[-_](\d{3,5})(?!\d)/);
  // A filename explicitly naming another cohort must not be assigned silently.
  if (explicit) return explicit[1] === year ? explicit[2] : "";
  return String(name).match(/(?:^|[^0-9])(\d{4,5})(?!\d)/)?.[1] || "";
}
