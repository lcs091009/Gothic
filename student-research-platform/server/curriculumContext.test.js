import test from "node:test";
import assert from "node:assert/strict";
import courses from "../src/data/curriculumStandards/index.js";
import {curriculumLearningContext} from "./curriculumContext.js";
test("matches the student's cohort and relevant official high-school objectives without inventing textbook units",()=>{
  const current=curriculumLearningContext({admissionYear:"2025",selected:["생명과학"]},[{subject:"생명과학",title:"물질대사",content:"에너지 전환"}],"세포와 물질대사","효소 촉매");
  assert.equal(current.revision,"2022");assert.equal(current.courses[0].subject,"세포와 물질대사");assert.ok(current.courses[0].criteria.every(s=>/^12세포/.test(s.code)));assert.ok(current.courses.every(course=>course.criteria.length<=4));assert.match(current.coverage,/미확인/);
  const old=curriculumLearningContext({admissionYear:"2024",selected:["생명과학Ⅰ"]},[]);assert.equal(old.revision,"2015");assert.ok(old.courses[0].criteria.every(s=>/^12생과Ⅰ/.test(s.code)));
  assert.deepEqual(curriculumLearningContext({admissionYear:"2025",selected:["알 수 없는 과목"]},[]).courses,[]);
});
test("imported core courses keep first and second semester criteria separate and contain no extraction control bytes",()=>{
  const first=courses.find(c=>c.revision==="2022" && c.subject==="공통수학1");
  assert.ok(first.standards.length>0);assert.ok(first.standards.every(s=>s.code.startsWith("10공수1-")));
  for(const course of courses) for(const criterion of course.standards) {assert.match(criterion.code,/^1[02]/);assert.ok(criterion.objective.length>7);assert.ok(!Array.from(criterion.objective).some(char=>char.charCodeAt(0)<32));}
});

test("workbook unit references apply only to the matching course and revision; absent lesson goals remain absent",()=>{
  const current=curriculumLearningContext({admissionYear:2025,selected:[]},[],"공통수학1");
  assert.equal(current.textbookReferences.length,1);
  const book=current.textbookReferences[0];
  assert.equal(book.textbook,"비상 공통수학1(김원경)");
  assert.equal(book.units.length,18);
  assert.deepEqual(book.units[2],{large:"Ⅰ 다항식",middle:"2 나머지 정리와 인수분해",small:"02 인수분해",lessonObjective:null});
  assert.ok(book.units.every(unit=>unit.lessonObjective===null));
  assert.ok(book.units.every(unit=>Object.keys(unit).sort().join(",")==="large,lessonObjective,middle,small"));
  assert.match(current.rule,/성취기준으로 대체하거나 추측하지 않는다/);
  for(const [admissionYear,subject] of [[2024,"공통수학1"],[2025,"공통수학2"],[undefined,"공통수학1"],[2025,"생명과학"]]) {
    assert.deepEqual(curriculumLearningContext({admissionYear,selected:[]},[],subject).textbookReferences,[]);
  }
});
