export type AttendanceLedgerRecord = {
  key: string;
  classId: string;
  studentId: string;
  studentName: string;
  className: string;
  lessonAt: string;
  status: "var" | "yok";
  updatedAt: string;
};

export const visibleHeader = ["İsim Soyisim", "Sınıf"];
export const ledgerHeader = [
  "Kayıt anahtarı", "Sınıf kimliği", "Öğrenci kimliği", "İsim Soyisim",
  "Sınıf", "Ders tarihi", "Yoklama", "Güncellendi",
];

export function ledgerValues(record: AttendanceLedgerRecord): string[] {
  return [record.key, record.classId, record.studentId, record.studentName,
    record.className, record.lessonAt, record.status, record.updatedAt];
}

export function parseLedgerValues(values: string[]): AttendanceLedgerRecord {
  if (values.length < 8 || (values[6] !== "var" && values[6] !== "yok")) {
    throw new Error("Yoklama sistem sekmesinde geçersiz kayıt var");
  }
  return {
    key: values[0], classId: values[1], studentId: values[2], studentName: values[3],
    className: values[4], lessonAt: values[5], status: values[6], updatedAt: values[7],
  };
}

function localDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Yoklama ders tarihi geçersiz");
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

type StudentRow = {
  key: string;
  name: string;
  className: string;
  newestAt: string;
  lessons: Map<string, AttendanceLedgerRecord[]>;
};

export function buildAttendanceMatrix(records: AttendanceLedgerRecord[]): string[][] {
  const students = new Map<string, StudentRow>();
  const dates = new Map<string, number>();
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.key)) throw new Error("Yoklama sistem sekmesinde yinelenen kayıt var");
    seen.add(record.key);
    const date = localDate(record.lessonAt);
    const key = `${record.classId}:${record.studentId}`;
    let student = students.get(key);
    if (!student) {
      student = { key, name: record.studentName, className: record.className,
        newestAt: record.updatedAt, lessons: new Map() };
      students.set(key, student);
    }
    if (record.updatedAt >= student.newestAt) {
      student.name = record.studentName;
      student.className = record.className;
      student.newestAt = record.updatedAt;
    }
    const lessons = student.lessons.get(date) ?? [];
    lessons.push(record);
    student.lessons.set(date, lessons);
    dates.set(date, Math.max(dates.get(date) ?? 0, lessons.length));
  }
  const columns = [...dates].sort(([left], [right]) => left.localeCompare(right));
  const headers = [...visibleHeader];
  for (const [date, count] of columns) {
    const [year, month, day] = date.split("-");
    const label = `${day}.${month}.${year}`;
    for (let slot = 1; slot <= count; slot++) headers.push(slot === 1 ? label : `${label} (${slot})`);
  }
  const sortedStudents = [...students.values()].sort((left, right) =>
    left.className.localeCompare(right.className, "tr")
    || left.name.localeCompare(right.name, "tr") || left.key.localeCompare(right.key));
  const matrix = [headers];
  for (const student of sortedStudents) {
    const row = [student.name, student.className];
    for (const [date, count] of columns) {
      const lessons = (student.lessons.get(date) ?? []).sort((left, right) =>
        left.lessonAt.localeCompare(right.lessonAt) || left.key.localeCompare(right.key));
      for (let slot = 0; slot < count; slot++) {
        row.push(lessons[slot] ? (lessons[slot].status === "var" ? "Var" : "Yok") : "");
      }
    }
    matrix.push(row);
  }
  return matrix;
}
