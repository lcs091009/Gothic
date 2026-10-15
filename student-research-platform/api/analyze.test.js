import test from "node:test";
import assert from "node:assert/strict";
import { createAnalyzeHandler, MAX_BODY_BYTES } from "./analyze.js";

const env = { SUPABASE_URL: "https://test.supabase.co", SUPABASE_PUBLISHABLE_KEY: "public-test", NVIDIA_API_KEY: "fake-test-only" };
const user = { id: "student-1", email: "27-1234@gochon.hs.kr", email_confirmed_at: "2026-01-01" };
const materialId = "00000000-0000-4000-8000-000000000001";
const explorationReply = {intro:"온도 효과를 비교해 볼 수 있어요. [R1]",choices:[
  {title:"반복 측정",question:"반복 횟수에 따라 결과는 얼마나 달라질까?",why:"측정 신뢰성 확인",connection:"이전 온도 기록의 반복 여부와 결과 해석이 연결됨"},
  {title:"조건 비교",question:"다른 온도에서도 비슷한 결과가 나올까?",why:"조건 확장",connection:"선택한 온도 질문과 효소의 성질이 연결됨"}]};
function fixture(overrides = {}) {
  const tables = {
    profiles: { data: { role: "student" } },
    student_academic_profiles: { data: { current_grade: "2학년", selected_choices: { science: ["생명과학", "화학"] } } },
    research_records: { data: [{ title: "효소 실험", content: "온도와 반응 속도" }] },
    teacher_shared_files: { data: [] },
    ...overrides.tables,
  };
  const queries = [], providerCalls = [], logs = [];
  let authCalls = 0, quotaCalls = 0;
  const client = {
    auth: { async getUser(token) { authCalls++; if(overrides.hangAuth) return new Promise(()=>{}); assert.equal(token, "valid-token"); return overrides.auth || { data: { user } }; } },
    from(table) {
      const query = { table, filters: [] }; queries.push(query);
      const chain = { select() { return chain; }, eq(...args) { query.filters.push(args); return chain; },
        in(column, values) { query.in = [column, values]; return chain; },
        order() { return chain; }, limit(n) { query.limit = n; return chain; },
        maybeSingle() { return Promise.resolve(tables[table]); },
        then(resolve, reject) { return Promise.resolve(tables[table]).then(resolve, reject); } };
      return chain;
    },
    async rpc(name) { quotaCalls++; assert.equal(name, "consume_ai_analysis_quota"); return overrides.quota || { data: { allowed: true } }; },
  };
  const handler = createAnalyzeHandler({ env: overrides.env || env, clientFactory: () => client,
    logger: { warn: (...args) => logs.push(args) },timeoutMs:overrides.timeoutMs,
    fetchImpl: async (url, options) => {
      providerCalls.push({ url, options });
      if(overrides.hangProvider) return new Promise(()=>{});
      if (overrides.fetchError) throw overrides.fetchError;
      const reply = overrides.providerResponses?.[providerCalls.length - 1] || overrides;
      return { ok: reply.ok ?? true, status: reply.status || 200,
        text: async () => overrides.hangBody ? new Promise(()=>{}) : reply.raw ?? JSON.stringify({ choices: [{ message: { content: "분석 완료" } }] }) };
    } });
  async function call(request = {}) {
    const response = { headers: {}, setHeader(k, v) { this.headers[k] = v; },
      status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ method: "POST", headers: { authorization: "Bearer valid-token" }, body: { extraContext: "추가 요청" }, ...request }, response);
    return response;
  }
  return { call, queries, providerCalls, logs, get authCalls() { return authCalls; }, get quotaCalls() { return quotaCalls; } };
}

test("rejects non-POST and missing bearer without invoking auth/provider", async () => {
  const f = fixture();
  assert.equal((await f.call({ method: "GET" })).code, 405);
  assert.equal((await f.call({ headers: {} })).code, 401);
  assert.equal(f.authCalls, 0); assert.equal(f.providerCalls.length, 0);
});
test("rejects invalid tokens, unverified email, pending and teacher roles", async () => {
  for (const overrides of [{ auth: { error: { message: "invalid" } } },
    { auth: { data: { user: { ...user, email_confirmed_at: null } } } }]) {
    const f = fixture(overrides); assert.equal((await f.call()).code, 401); assert.equal(f.providerCalls.length, 0);
  }
  for (const role of ["pending", "teacher"]) {
    const f = fixture({ tables: { profiles: { data: { role } } } });
    assert.equal((await f.call()).code, 403); assert.equal(f.quotaCalls, 0);
  }
});
test("uses stored owner-filtered records and choices, ignoring forged browser records", async () => {
  const f = fixture();
  const r = await f.call({ body: { extraContext: "질문", records: [{ title: "FORGED" }], academicProfile: { user_id: "victim" } } });
  assert.equal(r.code, 200); assert.equal(r.body.analysis, "분석 완료");
  assert.equal(r.headers["Cache-Control"], "no-store");
  assert.equal(f.quotaCalls, 1);
  const prompt = JSON.parse(f.providerCalls[0].options.body).messages[1].content;
  assert.match(prompt, /생명과학, 화학/); assert.match(prompt, /효소 실험/); assert.doesNotMatch(prompt, /FORGED|victim/);
  assert.deepEqual(f.queries.find(q => q.table === "research_records").filters, [["user_id", user.id]]);
  assert.deepEqual(f.queries.find(q => q.table === "teacher_shared_files").filters, [["student_email", user.email]]);
  assert.equal(f.queries.find(q => q.table === "research_records").limit, 48);
});
test("fails closed if distributed quota is absent and returns retry header when exhausted", async () => {
  for (const quota of [{ error: { message: "function missing" } }, { data: null }]) {
    const f = fixture({ quota }); assert.equal((await f.call()).code, 503); assert.equal(f.providerCalls.length, 0);
  }
  const f = fixture({ quota: { data: { allowed: false, retry_after: 123 } } });
  const r = await f.call(); assert.equal(r.code, 429); assert.equal(r.headers["Retry-After"], "123");
  assert.equal(f.providerCalls.length, 0);
});
test("validates context, body size and missing stored records before spending quota", async () => {
  const f = fixture();
  for (const body of [null, [], { extraContext: 123 }, { extraContext: "x".repeat(1201) }]) {
    assert.equal((await f.call({ body })).code, 400);
  }
  assert.equal((await f.call({ body: { extraContext: "", ignored: "x".repeat(MAX_BODY_BYTES) } })).code, 413);
  assert.equal(f.quotaCalls, 0);
  const missing = fixture({ tables: { research_records: { data: [] } } });
  assert.equal((await missing.call()).code, 400); assert.equal(missing.quotaCalls, 0);
});
test("configuration and database failures never call provider", async () => {
  const config = fixture({ env: {} }); assert.equal((await config.call()).code, 503);
  const db = fixture({ tables: { research_records: { error: { message: "private DB detail" } } } });
  const r = await db.call(); assert.equal(r.code, 503); assert.doesNotMatch(JSON.stringify(r.body), /private DB detail/);
  assert.equal(db.providerCalls.length, 0);
});
test("provider failures do not expose raw contents or secrets and timeouts return 504", async () => {
  for (const options of [{ raw: "private provider payload" }, { ok: false, raw: '{"error":{"message":"private secret"}}' }]) {
    const r = await fixture(options).call(); assert.equal(r.code, 502); assert.doesNotMatch(JSON.stringify(r.body), /private|secret/);
  }
  const abort = new Error("timeout"); abort.name = "AbortError";
  assert.equal((await fixture({ fetchError: abort }).call()).code, 504);
  const r = await fixture({ fetchError: new Error("private secret") }).call();
  assert.equal(r.code, 500); assert.doesNotMatch(JSON.stringify(r.body), /private secret/);
});

test("rejects empty or non-text answers rather than returning success", async () => {
  for (const content of ["", "  ", null, {}, "<think>unfinished reasoning"]) {
    const f = fixture({ raw: JSON.stringify({ choices: [{ message: { content } }] }) });
    assert.equal((await f.call()).code, 502);
    assert.equal(f.providerCalls.length, 1);
  }
});

test("returns source scope, hides reasoning and flags truncated answers without another paid call", async () => {
  const f = fixture({ raw: JSON.stringify({ choices: [{ finish_reason: "length",
    message: { content: "<think>private reasoning</think>근거 기반 분석" } }] }) });
  const r = await f.call();
  assert.equal(r.code, 200);
  assert.equal(r.body.analysis, "근거 기반 분석");
  assert.match(r.body.warning, /일부가 생략/);
  assert.equal(r.body.scope.detailedRecords, 1);
  assert.equal(f.providerCalls.length, 1);
  assert.equal(f.quotaCalls, 1);
});

test("distinguishes provider authentication, model, billing, input and availability failures without leaking payloads", async () => {
  for (const [status, code, httpStatus] of [
    [401, "AI_PROVIDER_AUTH", 503], [403, "AI_PROVIDER_AUTH", 503],
    [402, "AI_PROVIDER_BILLING", 503], [404, "AI_PROVIDER_MODEL", 503],
    [410, "AI_PROVIDER_MODEL_RETIRED", 503],
    [400, "AI_PROVIDER_REQUEST", 502], [413, "AI_PROVIDER_REQUEST", 502],
    [422, "AI_PROVIDER_REQUEST", 502], [500, "AI_PROVIDER_UNAVAILABLE", 502],
  ]) {
    const f = fixture({ ok: false, status, raw: "PRIVATE_PROVIDER_BODY fake-test-only valid-token" });
    const r = await f.call();
    assert.equal(r.code, httpStatus);
    assert.equal(r.body.code, code);
    assert.equal(r.body.providerStatus, status);
    assert.match(r.body.error, new RegExp(String(status)));
    assert.doesNotMatch(JSON.stringify([r.body, f.logs]), /PRIVATE_PROVIDER_BODY|fake-test-only|valid-token/);
    assert.equal(f.providerCalls.length, status === 410 ? 2 : 1);
    assert.equal(f.logs.length, status === 410 ? 2 : 1);
  }
});

test("provider rate limiting returns a retry header independently of student quota", async () => {
  const f = fixture({ ok: false, status: 429, raw: "rate limit" });
  const r = await f.call();
  assert.equal(r.code, 429);
  assert.equal(r.body.code, "AI_PROVIDER_LIMIT");
  assert.equal(r.headers["Retry-After"], "60");
  assert.equal(f.quotaCalls, 1);
  assert.equal(f.providerCalls.length, 1);
});

test("trims accidental whitespace around a server key and rejects whitespace-only configuration", async () => {
  const f = fixture({ env: { ...env, NVIDIA_API_KEY: "  fake-test-only\n" } });
  assert.equal((await f.call()).code, 200);
  assert.equal(f.providerCalls[0].options.headers.Authorization, "Bearer fake-test-only");
  const empty = fixture({ env: { ...env, NVIDIA_API_KEY: " \n " } });
  assert.equal((await empty.call()).code, 503);
  assert.equal(empty.providerCalls.length, 0);
});

test("uses Nemotron 3 Super with explicit non-streaming and reasoning disabled", async () => {
  const f = fixture();
  assert.equal((await f.call()).code, 200);
  const payload = JSON.parse(f.providerCalls[0].options.body);
  assert.equal(payload.model, "nvidia/nemotron-3-super-120b-a12b");
  assert.equal(payload.temperature, 0.6);
  assert.ok(payload.max_tokens <= 32768);
  assert.equal(payload.stream, false);
  assert.equal(payload.reasoning_effort, "none");
  assert.deepEqual(payload.messages.map(m => m.role), ["system", "user"]);
  assert.doesNotMatch(payload.messages[0].content, /\/no_think/);
  assert.match(payload.messages[0].content, /근거 규칙/);
  assert.equal(f.providerCalls.length, 1);
});


test("a 410 switches once to Nano with the same deadline, owner data and one quota charge", async () => {
  const f = fixture({ providerResponses: [{ ok: false, status: 410, raw: "PRIVATE_RETIRED_BODY" }, { ok: true }] });
  const r = await f.call();
  assert.equal(r.code, 200);
  assert.equal(r.body.analysis, "분석 완료");
  assert.equal(r.body.fallbackUsed, true);
  assert.equal(r.body.providerModel, "nvidia/nemotron-3-nano-30b-a3b");
  assert.equal(f.quotaCalls, 1);
  assert.equal(f.providerCalls.length, 2);
  const first = JSON.parse(f.providerCalls[0].options.body);
  const second = JSON.parse(f.providerCalls[1].options.body);
  assert.deepEqual(first.messages, second.messages);
  assert.equal(second.chat_template_kwargs.enable_thinking, false);
  assert.equal(second.stream, false);
  assert.equal(f.providerCalls[0].options.signal, f.providerCalls[1].options.signal);
  assert.doesNotMatch(JSON.stringify([r.body, f.logs]), /PRIVATE_RETIRED_BODY/);
});

test("does not retry authentication, rate limit, unavailable models, server failure or empty successful answers", async () => {
  for (const status of [401, 403, 404, 429, 500]) {
    const f = fixture({ ok: false, status });
    await f.call();
    assert.equal(f.providerCalls.length, 1);
  }
  const f = fixture({ raw: JSON.stringify({ choices: [{ message: { content: "" } }] }) });
  assert.equal((await f.call()).code, 502);
  assert.equal(f.providerCalls.length, 1);
});

test("two retired models stop after two attempts and identify the final model", async () => {
  const f = fixture({ ok: false, status: 410 });
  const r = await f.call();
  assert.equal(r.code, 503);
  assert.equal(r.body.code, "AI_PROVIDER_MODEL_RETIRED");
  assert.equal(r.body.providerModel, "nvidia/nemotron-3-nano-30b-a3b");
  assert.equal(f.providerCalls.length, 2);
  assert.equal(f.quotaCalls, 1);
});

const selectedId = "00000000-0000-4000-8000-000000000001";
const olderId = "00000000-0000-4000-8000-000000000002";
test("selected older records use an owner-scoped ID query and only stored content", async () => {
  const f = fixture({ tables: { research_records: { data: [{ id: olderId, title: "작년 활동", content: "기록된 결론" }] } } });
  const r = await f.call({ body: { selectedRecordIds: [olderId], records: [{ content: "FORGED" }] } });
  assert.equal(r.code, 200);
  const query = f.queries.find(q => q.table === "research_records");
  assert.deepEqual(query.in, ["id", [olderId]]);
  assert.deepEqual(query.filters, [["user_id", user.id]]);
  assert.equal(query.limit, 48);
  const prompt = JSON.parse(f.providerCalls[0].options.body).messages[1].content;
  assert.match(prompt, /작년 활동|기록된 결론/);
  assert.doesNotMatch(prompt, /FORGED/);
  assert.equal(r.body.scope.scannedRecords, 1);
});
test("empty, invalid, duplicate and oversized selections never spend AI quota", async () => {
  for (const ids of [[], null, "all", [123], ["invalid"], [selectedId, selectedId], Array(49).fill(selectedId)]) {
    const f = fixture();
    assert.equal((await f.call({ body: { selectedRecordIds: ids } })).code, 400);
    assert.equal(f.quotaCalls, 0);
    assert.equal(f.providerCalls.length, 0);
  }
});
test("missing, deleted or inaccessible selected IDs fail without falling back to all records", async () => {
  for (const data of [[], [{ id: olderId, content: "not selected" }]]) {
    const f = fixture({ tables: { research_records: { data } } });
    assert.equal((await f.call({ body: { selectedRecordIds: [selectedId] } })).code, 400);
    assert.equal(f.quotaCalls, 0);
    assert.equal(f.providerCalls.length, 0);
  }
});

test("selected teacher attachments resolve by recipient and IDs using only stored data", async () => {
  const f=fixture({tables:{teacher_shared_files:{data:[{id:materialId,file_name:"교사 과제",description:"실험 조건 비교",attachments:[{id:"chosen-file",name:"선택 안내"},{id:"unchecked-file",name:"EXCLUDED"}]}]}}});
  const r=await f.call({body:{extraContext:"",selectedTeacherFiles:[{materialId,attachmentId:"chosen-file"}],teacherMaterials:[{description:"FORGED"}]}});
  assert.equal(r.code,200);
  const q=f.queries.find(query=>query.table==="teacher_shared_files");
  assert.ok(q.filters.some(([column,value])=>column==="student_email"&&value===user.email));
  assert.deepEqual(q.in,["id",[materialId]]);
  const prompt=JSON.parse(f.providerCalls[0].options.body).messages[1].content;
  assert.match(prompt,/실험 조건 비교|선택 안내/);
  assert.doesNotMatch(prompt,/EXCLUDED|FORGED/);
  assert.equal(r.body.scope.teacherAttachments,1);
});
test("explicit no-teacher-file selection does not silently include shared materials",async()=>{
  const f=fixture({tables:{teacher_shared_files:{data:[{id:materialId,description:"MUST_NOT_INCLUDE"}]}}});
  const r=await f.call({body:{selectedTeacherFiles:[]}});
  assert.equal(r.code,200);
  assert.doesNotMatch(JSON.parse(f.providerCalls[0].options.body).messages[1].content,/MUST_NOT_INCLUDE/);
  assert.equal(r.body.scope.teacherMaterials,0);
});
test("missing and forged teacher file choices fail before quota and provider calls",async()=>{
  for(const data of [[],[{id:materialId,attachments:[{id:"different"}]}]]) {
    const f=fixture({tables:{teacher_shared_files:{data}}});
    const r=await f.call({body:{selectedTeacherFiles:[{materialId,attachmentId:"missing"}]}});
    assert.equal(r.code,400);assert.equal(f.quotaCalls,0);assert.equal(f.providerCalls.length,0);
  }
  for(const selectedTeacherFiles of [[{materialId:"not-uuid",attachmentId:"file"}],[{materialId,attachmentId:"a"},{materialId,attachmentId:"a"}],Array.from({length:21},(_,i)=>({materialId,attachmentId:`file-${i}`}))]) {
    const f=fixture();assert.equal((await f.call({body:{selectedTeacherFiles}})).code,400);
    assert.equal(f.quotaCalls,0);assert.equal(f.providerCalls.length,0);
  }
});

test("exploration uses authenticated stored evidence and bounded selection path",async()=>{
  const f=fixture({raw:JSON.stringify({choices:[{message:{content:JSON.stringify(explorationReply)}}]})});
  const r=await f.call({body:{extraContext:"",explorationPath:["온도는 어떤 영향을 줄까?"],records:[{title:"FORGED"}]}});
  assert.equal(r.code,200);assert.equal(r.body.analysis,"");assert.match(r.body.exploration.intro,/효소 실험/);assert.doesNotMatch(r.body.exploration.intro,/R1/);
  assert.equal(f.quotaCalls,1);
  const messages=JSON.parse(f.providerCalls[0].options.body).messages;
  assert.match(messages[1].content,/온도는 어떤 영향을 줄까/);assert.doesNotMatch(messages[1].content,/FORGED/);
  assert.match(messages[0].content,/JSON만 출력/);
  for(const path of [null,[""],Array(13).fill("질문"),["x".repeat(401)]]) {
    const invalid=fixture();assert.equal((await invalid.call({body:{explorationPath:path}})).code,400);assert.equal(invalid.quotaCalls,0);
  }
});
test("initial analysis separates topic cards and replaces readable evidence without exposing JSON",async()=>{
  const f=fixture({raw:JSON.stringify({choices:[{message:{content:"1. 핵심 흐름\n온도 비교 [R1]\n<<<EXPLORATION>>>\n"+JSON.stringify(explorationReply)}}]})});
  const r=await f.call();assert.equal(r.code,200);assert.match(r.body.analysis,/효소 실험/);assert.doesNotMatch(r.body.analysis,/EXPLORATION|choices|R1/);assert.equal(r.body.exploration.choices.length,2);
  const malformed=fixture();assert.equal((await malformed.call({body:{explorationPath:[]}})).code,502);
});

test("one deadline bounds stalled auth, provider and response body without automatic retries",async()=>{
  for(const stage of ["hangAuth","hangProvider","hangBody"]) {
    const f=fixture({[stage]:true,timeoutMs:20});
    const started=Date.now();const r=await f.call();
    assert.equal(r.code,504);assert.match(r.body.error,/2분/);assert.ok(Date.now()-started<1000);
    assert.equal(f.providerCalls.length,stage==="hangAuth" ? 0:1);
    assert.equal(f.quotaCalls,stage==="hangAuth" ? 0:1);
  }
});
test("initial analysis output has headroom while follow-up output remains bounded",async()=>{
  const f=fixture();await f.call();assert.equal(JSON.parse(f.providerCalls[0].options.body).max_tokens,6400);
});

test("subject focus reaches the provider as data and persists through follow-up paths",async()=>{
  for(const path of [[],["효소 활성과 단백질 구조의 연결"],["효소 활성과 단백질 구조의 연결","내 온도 선택은 어떤 의미인가?"]]) {
    const f=fixture({raw:JSON.stringify({choices:[{message:{content:JSON.stringify(explorationReply)}}]})});
    const r=await f.call({body:{explorationSubject:"생명과학Ⅱ",explorationPath:path}});
    assert.equal(r.code,200);
    const messages=JSON.parse(f.providerCalls[0].options.body).messages;
    assert.match(messages[0].content,/이 과목의 개념과 실제 자료/);
    assert.match(messages[0].content,/원자료가 없거나 일부만 읽혔으면 한계를 먼저 밝힌다/);
    assert.match(messages[1].content,/"explorationSubject":"생명과학Ⅱ"/);
    assert.doesNotMatch(messages[0].content,/생명과학Ⅱ/);
  }
});
test("invalid subjects are rejected before quota or provider calls",async()=>{
  for(const explorationSubject of [null,42,{}," ","x".repeat(81),"생명과학\n지시"]) {
    const f=fixture();const r=await f.call({body:{explorationSubject,explorationPath:[]}});
    assert.equal(r.code,400);assert.equal(f.quotaCalls,0);assert.equal(f.providerCalls.length,0);
  }
  const f=fixture();assert.equal((await f.call({body:{explorationSubject:"화학"}})).code,200);assert.equal(f.quotaCalls,1);
});

test("recoverable exploration replies use one provider call and keep the explanation",async()=>{
  for(const reply of [
    `설명입니다.\n\`\`\`json\n${JSON.stringify({...explorationReply,intro:"설명".repeat(700)})}\n\`\`\``,
    JSON.stringify({intro:"활동의 온도 선택과 구조의 연결 [R1]",choices:[{question:"내 온도 선택의 의미는?",connection:"온도 기록과 연결"}]}),
    JSON.stringify({intro:"활동과 개념의 연결 [R1]",choices:[]})]) {
    const f=fixture({raw:JSON.stringify({choices:[{message:{content:reply},finish_reason:"stop"}]})});
    const result=await f.call({body:{explorationPath:[],explorationSubject:"생명과학"}});
    assert.equal(result.code,200);assert.ok(result.body.exploration.intro);assert.equal(f.providerCalls.length,1);assert.equal(f.quotaCalls,1);
    if(!result.body.exploration.choices.length) assert.match(result.body.warning,/직접 주제를 입력/);
  }
});
test("truncated malformed exploration returns a distinct error without logging private contents",async()=>{
  const content='{"intro":"PRIVATE-STUDENT-TEXT","choices":[';
  const f=fixture({raw:JSON.stringify({choices:[{message:{content},finish_reason:"length"}]})});
  const result=await f.call({body:{explorationPath:[]}});
  assert.equal(result.code,502);assert.equal(result.body.code,"AI_EXPLORATION_FORMAT");assert.match(result.body.error,/잘렸습니다/);
  assert.doesNotMatch(JSON.stringify(f.logs),/PRIVATE-STUDENT-TEXT/);assert.equal(f.providerCalls.length,1);
});

const bodyText=(id,text)=>({id,text,characters:text.length,pages:2,unreadPages:0,partial:false});
test("authorized attachment bodies reach initial and follow-up prompts, with file citations",async()=>{
  const f=fixture({tables:{research_records:{data:[{id:selectedId,title:"내 활동",drive_file_id:"own-file",drive_file_name:"내 원본.pdf"}]},teacher_shared_files:{data:[{id:materialId,student_email:user.email,file_name:"선생님 과제",attachments:[{id:"teacher-file",name:"수업 자료.pdf"}]}]}},raw:JSON.stringify({choices:[{message:{content:JSON.stringify({intro:"두 자료의 효소 개념 [D1, D2]",choices:[],guidelines:[{title:"준비",detail:"온도 비교 기준을 선택해 보세요.",question:"내 기준은?"}]})}}]})});
  const response=await f.call({body:{selectedRecordIds:[selectedId],selectedTeacherFiles:[{materialId,attachmentId:"teacher-file"}],documentTexts:[bodyText("own-file","내 문서의 촉매"),bodyText("teacher-file","선생님 문서의 활성화 에너지")],explorationPath:["효소의 온도 영향"],explorationSubject:"생명과학"}});
  assert.equal(response.code,200);assert.equal(response.body.scope.documentsRead,2);assert.match(response.body.exploration.intro,/내 원본.pdf.*수업 자료.pdf/);
  assert.equal(response.body.exploration.guidelines.length,1);assert.deepEqual(response.body.exploration.choices,[]);
  const messages=JSON.parse(f.providerCalls[0].options.body).messages;assert.match(messages[1].content,/활성화 에너지/);assert.match(messages[1].content,/내 문서의 촉매/);
});
test("foreign/unselected attachment text is rejected before quota/provider calls",async()=>{
  const f=fixture();const response=await f.call({body:{documentTexts:[bodyText("foreign","forged file body")]}});
  assert.equal(response.code,400);assert.equal(f.quotaCalls,0);assert.equal(f.providerCalls.length,0);
  const duplicate=fixture();assert.equal((await duplicate.call({body:{documentTexts:[bodyText("same","body"),bodyText("same","body")]}})).code,400);
});
test("teacher-only material analysis works without student activity records",async()=>{
  const f=fixture({tables:{research_records:{data:[]},teacher_shared_files:{data:[{id:materialId,file_name:"교과 자료",attachments:[{id:"teacher-file",name:"선생님.pdf"}]}]}}});
  const response=await f.call({body:{selectedRecordIds:[],selectedTeacherFiles:[{materialId,attachmentId:"teacher-file"}],documentTexts:[bodyText("teacher-file","관측값과 비교 기준")],explorationSubject:"물리학"}});
  assert.equal(response.code,200);assert.equal(response.body.scope.scannedRecords,0);assert.equal(response.body.scope.documentsRead,1);
});
test("follow-up never exposes unrelated new topic choices returned by the model",async()=>{
  const f=fixture({raw:JSON.stringify({choices:[{message:{content:JSON.stringify(explorationReply)}}]})});
  const response=await f.call({body:{explorationPath:["효소 주제","진행 중 점검"]}});assert.equal(response.code,200);assert.deepEqual(response.body.exploration.choices,[]);
  assert.match(JSON.parse(f.providerCalls[0].options.body).messages[0].content,/현재 필요한 2~4가지 안내/);
});

test("initial structured response renders analysis separately from recommendations",async()=>{
  const payload={analysis:"1. 핵심 흐름\n자료의 온도 비교 [R1]",exploration:{intro:"생명과학과 연결",choices:[{title:"생명과학 · 효소",subject:"생명과학",question:"효소 활성은 어떻게 달라질까?",connection:"자료의 온도 기록"}]}};
  const f=fixture({raw:JSON.stringify({choices:[{message:{content:JSON.stringify(payload)}}]})});
  const response=await f.call();assert.equal(response.code,200);assert.match(response.body.analysis,/효소 실험/);assert.doesNotMatch(response.body.analysis,/"choices"|"analysis"/);assert.equal(response.body.exploration.choices[0].subject,"생명과학");
});
