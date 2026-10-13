import test from "node:test";
import assert from "node:assert/strict";
import { createMessageScope } from "./messageScope.js";

test("registration validation does not appear on AI and does not return with navigation", () => {
  const scope=createMessageScope("register");let entry;
  const registration=scope.writer(value=>entry=value);
  registration("과목, 활동 제목, 탐구 내용은 반드시 입력해야 합니다.");
  assert.match(scope.visible(entry),/과목/);
  scope.activate("ai");assert.equal(scope.visible(entry),"");
  scope.activate("register");assert.equal(scope.visible(entry),"");
});
test("late completion cannot overwrite another page or a fresh visit to the same page", () => {
  const scope=createMessageScope("register");let entry;
  const oldUpload=scope.writer(value=>entry=value);
  scope.activate("ai");scope.writer(value=>entry=value)("현재 분석 안내");
  oldUpload("이전 업로드 실패");assert.equal(scope.visible(entry),"현재 분석 안내");
  scope.activate("register");scope.writer(value=>entry=value)("새 등록 안내");
  oldUpload("늦게 끝난 요청");assert.equal(scope.visible(entry),"새 등록 안내");
});
test("teacher success intentionally transfers to history, then clears on leaving; accounts isolate", () => {
  const scope=createMessageScope("teacher-a:register");let entry;
  scope.activate("teacher-a:files");scope.writer(value=>entry=value)("3명에게 전달했습니다.");
  assert.match(scope.visible(entry),/3명/);
  scope.activate("teacher-a:menu");assert.equal(scope.visible(entry),"");
  scope.activate("teacher-b:files");assert.equal(scope.visible(entry),"");
});
