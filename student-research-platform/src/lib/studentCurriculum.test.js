import test from "node:test";
import assert from "node:assert/strict";
import {studentCurriculum,subjectGroups} from "./studentCurriculum.js";
import {explorationPrompt} from "../../server/exploration.js";
import {SYSTEM_PROMPT,buildAnalysisContext} from "../../server/analysisContext.js";
test("grade 2 uses 2025 cohort and keeps enrolled electives distinct from all offered courses",()=>{
  const profile={current_grade:"2학년",admission_year:"2024",grade2_choices:{g2025_2_1_a:["화학","생명과학","미적분"]},selected_choices:{g2025_2_2_b:["데이터 과학"],g2024_3_1_b:["미적분"]}};
  const result=studentCurriculum(profile);
  assert.equal(result.admissionYear,"2025");
  assert.deepEqual(result.selected,["화학","생명과학","데이터 과학"]);
  assert.ok(result.offered.includes("세계사"));assert.ok(!result.selected.includes("세계사"));
  assert.deepEqual(result.unverified,["미적분"]);
  const data=JSON.parse(buildAnalysisContext(profile,[],[],"").userPrompt.match(/\{[\s\S]*$/)[0]);
  assert.deepEqual(data.academic.curriculum.selected,result.selected);
  assert.equal(data.academic.curriculum.admissionYear,"2025");
  assert.match(data.academic.curriculum.coverage,/全|전체/);
  const groups=subjectGroups(profile,[{subject:"화학"}]);assert.equal(groups[0].label,"내가 저장한 선택과목");
  assert.equal(groups.flatMap(group=>group.subjects).filter(subject=>subject==="화학").length,1);
});
test("grade 3 combines legacy grade 2 and grade 3 selections using the 2024 cohort",()=>{
  const result=studentCurriculum({grade:3,grade2_choices:{g2024_2_1_a:["기하"]},grade3_choices:{g2024_3_1_b:["미적분"]}});
  assert.equal(result.admissionYear,"2024");assert.deepEqual(result.selected,["기하","미적분"]);
  assert.ok(!result.offered.includes("세포와 물질대사"));
});
test("unknown or missing curriculum never implies a complete course list or enrollment",()=>{
  assert.equal(studentCurriculum(null).admissionYear,"");
  assert.deepEqual(studentCurriculum({grade:"1학년"}).offered,[]);
  assert.deepEqual(studentCurriculum({selected_choices:{old:["생명과학",null,"\u0000bad"]}}).unverified,["생명과학"]);
});

test("initial and subsequent exploration both keep enrollment and emphasis guidance",()=>{
  for(const prompt of [SYSTEM_PROMPT,explorationPrompt(SYSTEM_PROMPT)]) {assert.match(prompt,/selected/);assert.match(prompt,/offered/);assert.match(prompt,/굵게/);}
});
