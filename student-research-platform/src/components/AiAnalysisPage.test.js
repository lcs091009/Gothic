import test from "node:test";
import assert from "node:assert/strict";
import {createElement,act} from "react";
import {create} from "react-test-renderer";
import {createServer} from "vite";
globalThis.IS_REACT_ACT_ENVIRONMENT=true;

test("completed record analysis displays and retains original sources for saved notes and follow-up",async()=>{
  const server=await createServer({server:{middlewareMode:true},plugins:[{name:"analysis-page-fixture",enforce:"pre",load(id){
    if(id.endsWith("/src/lib/supabaseClient.js")) return 'export const supabase={auth:{getSession:async()=>({data:{session:{access_token:"test"}}})}};';
    if(id.endsWith("/src/hooks/useAnalysisNotes.js")) return 'const notebook={notes:[],save:note=>globalThis.__analysisPageTest.saved.push(note),refresh(){}};export const useAnalysisNotes=()=>notebook;';
    if(id.endsWith("/src/hooks/useGoogleDrive.js")) return 'const closeGooglePicker=()=>{};export const useGoogleDrive=()=>({closeGooglePicker,getGoogleAccessToken:async options=>{globalThis.__analysisPageTest.auth.push(options);return "drive-test";}});';
    if(id.endsWith("/src/lib/readAnalysisDocument.js")) return 'export const readAnalysisDocuments=async documents=>({documents:documents.map(file=>({...file,text:"첨부의 효소 실험 결과",characters:12,partial:false,pages:1,unreadPages:0})),failures:[]});';
  }}]});
  const originalFetch=globalThis.fetch;let root;
  globalThis.__analysisPageTest={saved:[],auth:[]};
  try {
    const {default:Page}=await server.ssrLoadModule("/src/components/AiAnalysisPage.jsx");
    const {default:Workspace}=await server.ssrLoadModule("/src/components/AnalysisWorkspace.jsx");
    const requests=[];
    globalThis.fetch=async(url,options)=>{
      if(options.method==="POST") {requests.push(JSON.parse(options.body));return {ok:true,json:async()=>({jobId:"job"})};}
      return {ok:true,json:async()=>({status:"completed",result:{noteId:"saved-note",analysis:"1. 핵심 흐름\n효소 실험 기록을 분석했어요.",exploration:{intro:"실험에서 이어가요",choices:[{title:"효소 탐구",question:"효소 조건 비교",subject:"생명과학",sources:[]}]}}})};
    };
    for(const attachment of [false,true]) {
      const record={id:"record-1",title:"효소 실험",subject:"생명과학",content:"온도별 반응을 비교했다.",...(attachment ? {drive_file_id:"drive-1",drive_file_name:"효소.pdf"}:{})};
      await act(async()=>{root=create(createElement(Page,{academicProfile:{current_grade:"2"},records:[record],userId:"user"}));});
      const content=node=>typeof node==="string" ? node:(node.children || []).map(content).join("");
      const button=text=>root.root.findAllByType("button").find(node=>content(node).includes(text));
      await act(async()=>button("선택한 활동 분석하기").props.onClick());
      assert.ok(content(root.root).includes("효소 실험 기록을 분석했어요."),"completed analysis must reach the screen");
      const workspace=root.root.findByType(Workspace);
      assert.deepEqual(workspace.props.records,[record]);
      assert.equal(workspace.props.noteId,"saved-note");
      assert.equal(workspace.props.documentTexts.length,attachment ? 1:0);
      assert.deepEqual(requests.at(-1).selectedRecordIds,[record.id]);
      assert.equal(requests.at(-1).documentTexts.length,attachment ? 1:0);
      assert.equal(globalThis.__analysisPageTest.saved.at(-1).content.inputs.records[0].id,record.id);
      await act(async()=>root.root.findByProps({className:"exploration-next-screen"}).props.onClick());
      await act(async()=>button("이 주제로 탐구하기").props.onClick());
      assert.deepEqual(requests.at(-1).selectedRecordIds,[record.id]);
      assert.equal(requests.at(-1).documentTexts.length,attachment ? 1:0);
      assert.equal(requests.at(-1).noteId,"saved-note");
      await act(async()=>root.unmount());root=null;
    }
    assert.deepEqual(globalThis.__analysisPageTest.auth,[{interactive:false}]);
  } finally {if(root) await act(async()=>root.unmount());globalThis.fetch=originalFetch;delete globalThis.__analysisPageTest;await server.close();}
});
