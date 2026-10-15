import test from "node:test";
import assert from "node:assert/strict";
import {createElement,version} from "react";
import {version as domVersion} from "react-dom";
import {renderToString} from "react-dom/server";
import {createRoot} from "react-dom/client";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
test("production React DOM can load and render with the exact installed React version",()=>{
  assert.equal(version,domVersion);
  assert.equal(require("react-test-renderer/package.json").version,version);
  assert.equal(typeof createRoot,"function");
  assert.equal(renderToString(createElement("main",null,"활동 연결 노트")),"<main>활동 연결 노트</main>");
});
