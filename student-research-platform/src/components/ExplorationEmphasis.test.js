import test from "node:test";
import assert from "node:assert/strict";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ExplorationEmphasis from "./ExplorationEmphasis.js";
test("emphasis highlights only inline key phrases and escapes model HTML",()=>{
  const html=renderToStaticMarkup(createElement(ExplorationEmphasis,{text:"**통제 변인**을 확인해요 <script>bad</script>"}));
  assert.match(html,/<strong[^>]*>통제 변인<\/strong>/);assert.ok(!html.includes("<script>"));assert.match(html,/&lt;script&gt;/);
});
