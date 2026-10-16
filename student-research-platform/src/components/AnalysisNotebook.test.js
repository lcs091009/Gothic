import test from "node:test";
import assert from "node:assert/strict";
import {createElement,act} from "react";
import {create} from "react-test-renderer";
import {createServer} from "vite";
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
test("note deletion requires a cancellable inline confirmation and keeps it available on failure",async()=>{
  const server=await createServer({server:{middlewareMode:true}});let root,calls=0,success=false;
  try {
    const {default:Notebook}=await server.ssrLoadModule("/src/components/AnalysisNotebook.jsx");
    await act(async()=>{root=create(createElement(Notebook,{notes:[{id:"note",title:"효소 분석",updated_at:"2026-10-16"}],onOpen(){},onDelete:async()=>{calls++;return success;}}));});
    const content=node=>typeof node==="string" ? node:(node.children || []).map(content).join("");
    const button=text=>root.root.findAllByType("button").find(node=>content(node)===text);
    await act(async()=>button("삭제").props.onClick());assert.equal(calls,0);
    await act(async()=>button("취소").props.onClick());assert.equal(calls,0);assert.equal(button("삭제하기"),undefined);
    await act(async()=>button("삭제").props.onClick());
    await act(async()=>button("삭제하기").props.onClick());assert.equal(calls,1);assert.ok(button("삭제하기"));
    success=true;await act(async()=>button("삭제하기").props.onClick());assert.equal(calls,2);assert.equal(button("삭제하기"),undefined);
  } finally {if(root) await act(async()=>root.unmount());await server.close();}
});
