import test from "node:test";
import assert from "node:assert/strict";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import SubjectConnection from "./SubjectConnection.js";
test("course/activity connection appears above the new topic title as safe text",()=>{
  const html=renderToStaticMarkup(createElement("button",null,createElement(SubjectConnection,{sources:[{subject:"생명과학",topic:"효소 실험"}],subject:"화학"}),createElement("strong",null,"촉매와 활성화 에너지")));
  assert.match(html,/생명과학\(효소 실험\)/);assert.match(html,/ → /);assert.ok(html.indexOf("화학")<html.indexOf("<strong>"));
  const unsafe=renderToStaticMarkup(createElement(SubjectConnection,{sources:[{subject:"국어",topic:"<script>alert(1)</script>"}],subject:"사회"}));
  assert.ok(!unsafe.includes("<script>"));assert.match(unsafe,/&lt;script&gt;/);
  assert.match(renderToStaticMarkup(createElement(SubjectConnection)),/선택한 활동·자료/);
});
