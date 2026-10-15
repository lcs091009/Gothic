import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const dist=new URL("../dist/",import.meta.url);
const html=await readFile(new URL("index.html",dist),"utf8");
const entry=html.match(/<script[^>]+src="([^"]+)"/)?.[1];
assert.ok(entry,"The production HTML must reference an application bundle");
const reachedRoot=new Error("Application reached its React root");
// Stop before mounting; dependency initialization must succeed first.
globalThis.document={
  createElement:()=>({relList:{supports:()=>true}}),
  getElementById:id=>{assert.equal(id,"root");throw reachedRoot;}
};
try {
  await import(new URL(entry.replace(/^\//,""),dist));
  assert.fail("Application did not initialize its root");
} catch(error) {
  assert.equal(error,reachedRoot,"Production bundle failed before React could mount: "+error.message);
}
console.log("Production dependency initialization passed");
