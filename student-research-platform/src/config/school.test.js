import test from "node:test";
import assert from "node:assert/strict";
import { getStudentNumber, getStudentEmail, extractStudentNumber } from "./school.js";
test("student identities support new admission years and require exact school domain", () => {
  assert.equal(getStudentNumber("27-1234@gochon.hs.kr"), "1234");
  assert.equal(getStudentNumber("28-1234@GOCHON.HS.KR"), "1234");
  assert.equal(getStudentNumber("27-1234@gochon.hs.kr.evil.test"), null);
  assert.equal(getStudentNumber(null), null);
  assert.equal(getStudentNumber("teacher@gochon.hs.kr"), null);
});
test("teacher matching rejects filenames explicitly naming a different cohort", () => {
  assert.equal(extractStudentNumber("27-1234_보고서.pdf", "27"), "1234");
  assert.equal(extractStudentNumber("26-1234_보고서.pdf", "27"), "");
  assert.equal(extractStudentNumber("김학생_1234_보고서.pdf", "27"), "1234");
  assert.equal(getStudentEmail("1234", "27"), "27-1234@gochon.hs.kr");
});
