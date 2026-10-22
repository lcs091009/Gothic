import test from "node:test";
import assert from "node:assert/strict";
import {createElement,act} from "react";
import {create} from "react-test-renderer";
import {createServer} from "vite";
import courses from "../data/curriculumStandards/index.js";
import {courseUnits,revisionFor,subjectOptions,textbookChapters} from "../lib/curriculumGoals.js";
globalThis.IS_REACT_ACT_ENVIRONMENT=true;

test("standards are grouped by content area in source order and filtered by keyword",()=>{
  const course={standards:[{code:"A-01",area:"힘과 에너지",objective:"운동량 보존"},{code:"A-02",area:"힘과 에너지",objective:"일과 에너지"},{code:"B-01",area:"전기와 자기",objective:"전기장"}]};
  assert.deepEqual(courseUnits(course).map(unit=>[unit.number,unit.area,unit.standards.length]),[[1,"힘과 에너지",2],[2,"전기와 자기",1]]);
  assert.deepEqual(courseUnits(course,"운동량").map(unit=>unit.standards.map(item=>item.code)),[["A-01"]]);
  assert.deepEqual(courseUnits(null),[]);
});

test("revision follows admission year and the student's subjects come first",()=>{
  assert.equal(revisionFor("2025"),"2022");assert.equal(revisionFor("2024"),"2015");assert.equal(revisionFor(""),"2022");
  const options=subjectOptions(courses,"2022",["물리학","없는 과목","공통 수학1"]);
  assert.deepEqual(options.mine,["물리학","공통수학1"]);
  assert.ok(!options.others.includes("물리학") && options.others.length>50);
  assert.deepEqual(textbookChapters({units:[{large:"Ⅰ",middle:"1",small:"a"},{large:"Ⅰ",middle:"1",small:"b"},{large:"Ⅱ",middle:"1",small:"c"}]}).map(chapter=>[chapter.title,chapter.units.length]),[["Ⅰ",2],["Ⅱ",1]]);
});

test("curriculum tab shows areas with real standards and the reference textbook without inventing objectives",async()=>{
  const server=await createServer({server:{middlewareMode:true}});let root;
  try {
    const {default:Page}=await server.ssrLoadModule("/src/components/CurriculumGoalsPage.jsx");
    await act(async()=>{root=create(createElement(Page,{academicProfile:null,records:[{subject:"공통수학1"}]}));});
    for(let i=0;i<150 && root.root.findAllByType("select").length===0;i++) await act(async()=>{await new Promise(resolve=>setTimeout(resolve,100));});
    const text=node=>typeof node==="string" ? node:(node.children || []).map(text).join("");
    assert.equal(root.root.findByType("select").props.value,"공통수학1");
    const goals=root.root.findAllByType("li").map(text);
    assert.ok(goals.some(goal=>/^\[10공수1-01-01\]/.test(goal)));
    assert.ok(goals.some(goal=>goal.includes("학습목표 미확보")));
  } finally {act(()=>root?.unmount());await server.close();}
});
