import test from "node:test";
import assert from "node:assert/strict";
import {createElement,act} from "react";
import {create} from "react-test-renderer";
import {createServer} from "vite";
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
test("analysis renders actual bold emphasis, paginates and opens a separate retained exploration screen",async()=>{
  const server=await createServer({server:{middlewareMode:true}});let root;
  try {
    const {default:Workspace}=await server.ssrLoadModule("/src/components/AnalysisWorkspace.jsx");
    await act(async()=>{root=create(createElement(Workspace,{analysis:"1. 핵심 흐름\n- 핵심: **온도와 활성**을 비교했어요.\n2. 교과 연결\n- 근거: 효소의 구조를 살펴봐요.",exploration:{intro:"주제를 골라요",choices:[]},records:[],files:[]}));});
    assert.ok(root.root.findAllByType("strong").some(node=>node.props.children==="온도와 활성"));
    const content=node=>typeof node==="string" ? node:(node.children || []).map(content).join("");
    const button=text=>root.root.findAllByType("button").find(node=>content(node)===text);
    await act(async()=>button("다음 →").props.onClick());assert.ok(root.root.findAllByType("h3").some(node=>content(node).startsWith("교과 연결")));
    await act(async()=>button("← 이전").props.onClick());
    await act(async()=>root.root.findByProps({className:"exploration-next-screen"}).props.onClick());
    assert.equal(root.root.findByProps({className:"analysis-workspace"}).props.hidden,true);
    assert.equal(root.root.findAllByProps({className:"analysis-workspace exploration-screen"}).length,1);
    await act(async()=>button("← 분석 노트로").props.onClick());assert.equal(root.root.findByProps({className:"analysis-workspace"}).props.hidden,false);
  } finally {if(root) await act(async()=>root.unmount());await server.close();}
});
