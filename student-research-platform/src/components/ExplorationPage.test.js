import test from "node:test";
import assert from "node:assert/strict";
import {createElement,act} from "react";
import {create} from "react-test-renderer";
import {createServer} from "vite";
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
test("follow-up appends collapsible cards, preserves earlier answers and retries failed requests in place",async()=>{
  const server=await createServer({server:{middlewareMode:true},plugins:[{name:"test-session",enforce:"pre",load(id){if(id.endsWith("/src/lib/supabaseClient.js")) return 'export const supabase={auth:{getSession:async()=>({data:{session:{access_token:"test"}}})}};';}}]});
  const originalFetch=globalThis.fetch;
  let root;
  try {
    const {default:Page}=await server.ssrLoadModule("/src/components/ExplorationPage.jsx");
    const seed={intro:"자료 연결",choices:[{title:"효소 탐구",subject:"생명과학",question:"온도에 따른 효소 반응",sources:[]}],guidelines:[]};
    const requests=[];let fail=false,saved;
    globalThis.fetch=async(url,options)=>{
      if(options.method==="POST") {requests.push(JSON.parse(options.body));return {ok:true,json:async()=>({jobId:"00000000-0000-4000-8000-000000000001"})};}
      return {ok:true,json:async()=>fail ? {status:"failed",error:"일시 실패"}:{status:"completed",result:{exploration:{intro:"첫 안내",choices:[],guidelines:[{title:"통제 변인",detail:"온도 외 조건을 일정하게",question:"반복 측정은 어떻게?"}]}}}};
    };
    await act(async()=>{root=create(createElement(Page,{seed,records:[],files:[],onBack:()=>{},onChange:value=>{saved=value;}}));});
    const content=node=>typeof node==="string" ? node:(node.children || []).map(content).join("");
    const button=text=>root.root.findAllByType("button").find(node=>content(node).includes(text));
    await act(async()=>button("이 주제로 탐구하기").props.onClick());
    let cards=root.root.findAllByType("details").filter(node=>node.props.className==="exploration-step-card");
    assert.equal(cards.length,2);assert.equal(cards[0].props.open,false);assert.equal(cards[1].props.open,true);
    await act(async()=>cards[0].children.find(node=>node.type==="summary").props.onClick({preventDefault(){}}));
    cards=root.root.findAllByType("details").filter(node=>node.props.className==="exploration-step-card");assert.equal(cards[0].props.open,true);
    assert.equal(root.root.findAllByProps({className:"exploration-stage-options"}).length,0);
    fail=true;await act(async()=>button("반복 측정은 어떻게?").props.onClick());
    assert.equal(root.root.findByType("textarea").props.value,"반복 측정은 어떻게?");
    assert.equal(requests.length,1,"a suggested question is editable before a request");
    await act(async()=>root.root.findByType("form").props.onSubmit({preventDefault(){}}));
    cards=root.root.findAllByType("details").filter(node=>node.props.className==="exploration-step-card");assert.equal(cards.length,3);
    assert.equal(requests[1].explorationPath[0],"온도에 따른 효소 반응");
    assert.equal(root.root.findAllByProps({className:"exploration-key-point"}).length,2);
    fail=false;await act(async()=>button("다시 시도").props.onClick());
    assert.equal(root.root.findAllByProps({className:"exploration-step-card"}).length,3);
    assert.equal(root.root.findAllByProps({className:"exploration-key-point"}).length,3);
    await act(async()=>root.unmount());
    await act(async()=>{root=create(createElement(Page,{seed,records:[],files:[],initialState:saved,readOnly:true,onBack:()=>{}}));});
    assert.equal(root.root.findAllByProps({className:"exploration-step-card"}).length,3);
    assert.equal(root.root.findAllByType("form").length,0);
    assert.equal(requests.length,3);
  } finally {if(root) await act(async()=>root.unmount());globalThis.fetch=originalFetch;await server.close();}
});
