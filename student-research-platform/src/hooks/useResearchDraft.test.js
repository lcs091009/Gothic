import test from "node:test";
import assert from "node:assert/strict";
import {createElement,act} from "react";
import {create} from "react-test-renderer";
import {useResearchDraft} from "./useResearchDraft.js";
globalThis.IS_REACT_ACT_ENVIRONMENT=true;

test("drafts survive same-account refresh and reject previous-account completions",async()=>{
  let value,root;
  function Harness({userId}) {value=useResearchDraft(userId);return null;}
  const render=userId=>createElement(Harness,{userId});
  await act(async()=>{root=create(render("one"));});
  await act(async()=>{value.setGrade("2학년");value.setSubject("생명과학");value.setTitle("내 기록");value.setContent("개인 활동");});
  const first=value;
  await act(async()=>root.update(render("one")));
  assert.equal(value.content,"개인 활동");assert.equal(value.grade,"2학년");assert.equal(first.isCurrent(),true);
  await act(async()=>root.update(render("two")));
  assert.equal(first.isCurrent(),false);assert.equal(value.content,"");assert.equal(value.subject,"");assert.equal(value.title,"");assert.equal(value.grade,"1학년");
  await act(async()=>value.setContent("새 계정의 기록"));
  await act(async()=>first.setContent("늦게 도착한 저장 완료"));
  assert.equal(value.content,"새 계정의 기록");
  await act(async()=>root.update(render("one")));
  assert.equal(value.content,"");assert.equal(first.isCurrent(),false);
  await act(async()=>first.setTitle("이전 요청"));assert.equal(value.title,"");
  await act(async()=>value.setContent("로그아웃 전 기록"));
  await act(async()=>root.update(render(undefined)));assert.equal(value.content,"");
  await act(async()=>root.unmount());
});
