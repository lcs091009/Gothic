import test from "node:test";
import assert from "node:assert/strict";
import {createElement,lazy,Suspense,useEffect,useState,act} from "react";
import {create} from "react-test-renderer";
import RetainedView from "./RetainedView.js";
import PageErrorBoundary from "./PageErrorBoundary.js";
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
test("lazy analysis survives leaving during its first load and stays isolated per account",async()=>{
  let loads=0,release,update;
  const ready=new Promise(resolve=>{release=resolve;});
  function Analysis() {const [result,setResult]=useState("selected");update=setResult;return createElement("span",null,result);}
  const LazyAnalysis=lazy(async()=>{loads++;await ready;return {default:Analysis};});
  const render=(active,user="one")=>createElement(RetainedView,{active,key:user},
    createElement(Suspense,{fallback:createElement("p",{role:"status"},"loading")},createElement(LazyAnalysis)));
  let root;await act(async()=>{root=create(render(false));});assert.equal(loads,0);
  await act(async()=>root.update(render(true)));assert.equal(loads,1);assert.equal(root.toJSON().children[0].children[0],"loading");
  await act(async()=>root.update(render(false)));
  await act(async()=>release());assert.equal(root.toJSON().props.hidden,true);
  await act(async()=>update("finished while hidden"));
  await act(async()=>root.update(render(true)));assert.equal(loads,1);assert.equal(root.toJSON().children[0].children[0],"finished while hidden");
  await act(async()=>root.update(render(true,"two")));assert.equal(root.toJSON().children[0].children[0],"selected");
  await act(async()=>root.unmount());
});
test("a failed page download leaves the parent draft mounted",async context=>{
  context.mock.method(console,"error",()=>{});
  let changeDraft,root;
  const Broken=lazy(()=>Promise.reject(new Error("page chunk unavailable")));
  function Draft() {const [value,setValue]=useState("original");changeDraft=setValue;return createElement("input",{value,readOnly:true});}
  const render=show=>createElement("main",null,createElement(Draft),createElement(PageErrorBoundary,null,
    createElement(Suspense,{fallback:createElement("p",null,"loading")},show ? createElement(Broken):null)));
  await act(async()=>{root=create(render(false));});
  await act(async()=>changeDraft("unsaved work"));
  await act(async()=>root.update(render(true)));
  assert.equal(root.toJSON().children[0].props.value,"unsaved work");
  assert.equal(root.toJSON().children[1].props.role,"alert");
  await act(async()=>root.unmount());
});
