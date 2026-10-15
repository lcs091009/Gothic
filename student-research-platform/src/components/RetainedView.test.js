import test from "node:test";
import assert from "node:assert/strict";
import {createElement,useEffect,useState,act} from "react";
import {create} from "react-test-renderer";
import RetainedView from "./RetainedView.js";
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
test("navigation retains the same view, pending completion and selection until account changes",async()=>{
  let mounts=0,unmounts=0,update;
  function Analysis() {const [result,setResult]=useState("chosen-topic");update=setResult;useEffect(()=>{mounts++;return()=>{unmounts++;};},[]);return createElement("span",null,result);}
  const render=(active,user="one")=>createElement(RetainedView,{active,key:user},createElement(Analysis));
  let root;await act(async()=>{root=create(render(false));});assert.equal(mounts,0);
  await act(async()=>root.update(render(true)));assert.equal(mounts,1);
  await act(async()=>root.update(render(false)));assert.equal(unmounts,0);assert.equal(root.toJSON().props.hidden,true);
  await act(async()=>update("completed-while-hidden"));
  await act(async()=>root.update(render(true)));assert.equal(mounts,1);assert.equal(root.toJSON().children[0].children[0],"completed-while-hidden");
  await act(async()=>root.update(render(true,"two")));assert.equal(unmounts,1);assert.equal(mounts,2);assert.equal(root.toJSON().children[0].children[0],"chosen-topic");
  await act(async()=>root.unmount());
});
