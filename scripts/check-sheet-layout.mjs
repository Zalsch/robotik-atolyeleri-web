import assert from "node:assert/strict";
import { buildAttendanceMatrix, ledgerValues, parseLedgerValues } from "../lib/server/sheet-layout.ts";

const row = (lesson, student, classId, name, className, at, status) => ({
  key: `${lesson}:${student}`, studentId: student, classId, studentName: name,
  className, lessonAt: at, status, updatedAt: "2026-09-20T12:00:00Z",
});
const records = [
  row("lesson-2", "student-1", "class-1", "Ada Yılmaz", "A Sınıfı", "2026-09-27T11:00:00Z", "yok"),
  row("lesson-1", "student-1", "class-1", "Ada Yılmaz", "A Sınıfı", "2026-09-20T11:00:00Z", "var"),
  row("lesson-1", "student-2", "class-1", "Ece Yılmaz", "A Sınıfı", "2026-09-20T11:00:00Z", "yok"),
  row("lesson-3", "student-1", "class-2", "Ada Yılmaz", "B Sınıfı", "2026-09-20T14:00:00Z", "var"),
];
assert.deepEqual(buildAttendanceMatrix(records), [
  ["İsim Soyisim", "Sınıf", "20.09.2026", "27.09.2026"],
  ["Ada Yılmaz", "A Sınıfı", "Var", "Yok"],
  ["Ece Yılmaz", "A Sınıfı", "Yok", ""],
  ["Ada Yılmaz", "B Sınıfı", "Var", ""],
]);
assert.deepEqual(parseLedgerValues(ledgerValues(records[0])), records[0]);
const corrected = records.map((record) => record.key === "lesson-2:student-1" ? { ...record, status: "var" } : record);
assert.equal(buildAttendanceMatrix(corrected)[1][3], "Var");
const extra = row("lesson-4", "student-1", "class-1", "Ada Yılmaz", "A Sınıfı", "2026-09-20T15:00:00Z", "yok");
assert.deepEqual(buildAttendanceMatrix([...records, extra])[0].slice(2),
  ["20.09.2026", "20.09.2026 (2)", "27.09.2026"]);
assert.equal(buildAttendanceMatrix([
  row("lesson-5", "student-3", "class-1", "Can Demir", "A Sınıfı", "2026-09-20T22:30:00Z", "var"),
])[0][2], "21.09.2026");
assert.throws(() => buildAttendanceMatrix([...records, records[0]]), /yinelenen/);
console.log("Sheet layout checks passed: student/class rows, date columns, correction and same-day lessons.");
