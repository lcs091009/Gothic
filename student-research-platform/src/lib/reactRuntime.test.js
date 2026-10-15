import test from "node:test";
import assert from "node:assert/strict";
import {createElement,version} from "react";
import {version as domVersion} from "react-dom";
import {renderToString} from "react-dom/server";

test("the application React DOM renderer matches React and can render",()=>{
  assert.equal(domVersion,version);
  assert.equal(renderToString(createElement("p",null,"startup ready")),"<p>startup ready</p>");
});
