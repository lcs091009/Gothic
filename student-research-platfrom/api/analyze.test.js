import test from "node:test";
import assert from "node:assert/strict";
import { createAnalyzeHandler, MAX_BODY_BYTES } from "./analyze.js";

const env = { SUPABASE_URL: "https://test.supabase.co", SUPABASE_PUBLISHABLE_KEY: "public-test", NVIDIA_API_KEY: "fake-test-only" };
const user = { id: "student-1", email: "27-1234@gochon.hs.kr", email_confirmed_at: "2026-01-01" };
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
    auth: { async getUser(token) { authCalls++; assert.equal(token, "valid-token"); return overrides.auth || { data: { user } }; } },
    from(table) {
      const query = { table, filters: [] }; queries.push(query);
      const chain = { select() { return chain; }, eq(...args) { query.filters.push(args); return chain; },
        order() { return chain; }, limit(n) { query.limit = n; return chain; },
        maybeSingle() { return Promise.resolve(tables[table]); },
        then(resolve, reject) { return Promise.resolve(tables[table]).then(resolve, reject); } };
      return chain;
    },
    async rpc(name) { quotaCalls++; assert.equal(name, "consume_ai_analysis_quota"); return overrides.quota || { data: { allowed: true } }; },
  };
  const handler = createAnalyzeHandler({ env: overrides.env || env, clientFactory: () => client,
    logger: { warn: (...args) => logs.push(args) },
    fetchImpl: async (url, options) => {
      providerCalls.push({ url, options });
      if (overrides.fetchError) throw overrides.fetchError;
      return { ok: overrides.ok ?? true, status: overrides.status || 200,
        text: async () => overrides.raw ?? JSON.stringify({ choices: [{ message: { content: "분석 완료" } }] }) };
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
    assert.equal(f.providerCalls.length, 1);
    assert.equal(f.logs.length, 1);
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
