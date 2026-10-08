import { createClient } from "@supabase/supabase-js";

import { buildAnalysisContext, RECORD_SCAN_LIMIT, SYSTEM_PROMPT } from "../server/analysisContext.js";

export const MAX_BODY_BYTES = 16_384;
export const AI_MODEL = "nvidia/nemotron-3-super-120b-a12b";
export const AI_FALLBACK_MODEL = "nvidia/nemotron-3-nano-30b-a3b";

export function providerFailure(status) {
  if (status === 401 || status === 403) return {
    status: 503, code: "AI_PROVIDER_AUTH", providerStatus: status,
    error: `AI 연결 인증에 실패했습니다(NVIDIA ${status}). 관리자가 배포 환경의 NVIDIA_API_KEY와 모델 접근 권한을 확인해야 합니다.`,
  };
  if (status === 429) return {
    status: 429, code: "AI_PROVIDER_LIMIT", providerStatus: status,
    error: "AI 공급자의 요청 한도에 도달했습니다(NVIDIA 429). 잠시 후 다시 시도해 주세요. 반복되면 관리자가 API 사용 한도와 크레딧을 확인해야 합니다.",
  };
  if (status === 402) return {
    status: 503, code: "AI_PROVIDER_BILLING", providerStatus: status,
    error: "AI 공급자의 사용 요금 또는 크레딧 확인이 필요합니다(NVIDIA 402). 관리자에게 문의해 주세요.",
  };
  if (status === 404) return {
    status: 503, code: "AI_PROVIDER_MODEL", providerStatus: status,
    error: "설정된 AI 모델을 사용할 수 없습니다(NVIDIA 404). 관리자가 모델 제공 여부와 접근 권한을 확인해야 합니다.",
  };
  if (status === 410) return {
    status: 503, code: "AI_PROVIDER_MODEL_RETIRED", providerStatus: status,
    error: "설정된 AI 모델의 제공이 종료됐습니다(NVIDIA 410). 관리자가 사용 가능한 모델로 변경해야 합니다.",
  };
  if ([400, 413, 422].includes(status)) return {
    status: 502, code: "AI_PROVIDER_REQUEST", providerStatus: status,
    error: `AI 공급자가 분석 요청을 거부했습니다(NVIDIA ${status}). 관리자에게 이 오류 번호를 알려 주세요.`,
  };
  return {
    status: 502, code: "AI_PROVIDER_UNAVAILABLE", providerStatus: status,
    error: `AI 공급자에서 오류가 발생했습니다(NVIDIA ${status}). 잠시 후 다시 시도해 주세요.`,
  };
}

export function createAnalyzeHandler({ env = process.env, fetchImpl = fetch, clientFactory = createClient,
  logger = console } = {}) {
return async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({
      error: "POST 요청만 사용할 수 있습니다.",
    });
  }

  const authorization = request.headers?.authorization || "";
  const match = typeof authorization === "string" && authorization.match(/^Bearer ([^\s]+)$/i);
  if (!match) return response.status(401).json({ error: "먼저 로그인해 주세요." });
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const supabaseKey = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY ||
    env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
  const apiKey = typeof env.NVIDIA_API_KEY === "string" ? env.NVIDIA_API_KEY.trim() : "";
  if (!supabaseUrl || !supabaseKey || !apiKey) {
    return response.status(503).json({ error: "AI 분석 서비스 설정이 필요합니다. 관리자에게 문의해 주세요." });
  }

  let timeoutId;
  try {
    const token = match[1];
    const client = clientFactory(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: authData, error: authError } = await client.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user?.id || !user.email || !user.email_confirmed_at) {
      return response.status(401).json({ error: "로그인이 만료되었거나 이메일 확인이 필요합니다. 다시 로그인해 주세요." });
    }
    const { data: profile, error: profileError } = await client.from("profiles")
      .select("role").eq("id", user.id).maybeSingle();
    if (profileError) return response.status(503).json({ error: "사용자 권한을 확인할 수 없습니다." });
    if (profile?.role !== "student") return response.status(403).json({ error: "승인된 학생 계정만 분석할 수 있습니다." });

    const body = request.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return response.status(400).json({ error: "올바른 JSON 요청이 필요합니다." });
    }
    if (Buffer.byteLength(JSON.stringify(body)) > MAX_BODY_BYTES) {
      return response.status(413).json({ error: "요청 내용이 너무 큽니다." });
    }
    const { extraContext = "", selectedRecordIds } = body;
    if (typeof extraContext !== "string" || extraContext.length > 1200) {
      return response.status(400).json({ error: "보충 입력은 1,200자 이내로 작성해 주세요." });
    }
    if (selectedRecordIds !== undefined && (!Array.isArray(selectedRecordIds) ||
      selectedRecordIds.length < 1 || selectedRecordIds.length > RECORD_SCAN_LIMIT ||
      selectedRecordIds.some(id => typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) ||
      new Set(selectedRecordIds).size !== selectedRecordIds.length)) {
      return response.status(400).json({ error: "분석할 활동을 1~48개 선택해 주세요." });
    }
    const selectionSet = selectedRecordIds === undefined ? null : new Set(selectedRecordIds);
    let recordQuery = client.from("research_records").select("*").eq("user_id", user.id);
    if (selectedRecordIds !== undefined) recordQuery = recordQuery.in("id", selectedRecordIds);
    // Resolve selection IDs using the authenticated owner and RLS; never accept browser record contents.
    const [academicResult, recordResult, teacherResult] = await Promise.all([
      client.from("student_academic_profiles").select("*").eq("user_id", user.id).maybeSingle(),
      recordQuery.order("created_at", { ascending: false }).limit(RECORD_SCAN_LIMIT),
      client.from("teacher_shared_files").select("*").eq("student_email", user.email)
        .order("created_at", { ascending: false }).limit(8),
    ]);
    if (academicResult.error || recordResult.error || teacherResult.error) {
      return response.status(503).json({ error: "저장된 활동 자료를 불러오지 못했습니다." });
    }
    const academicProfile = academicResult.data;
    const records = recordResult.data || [];
    const teacherSharedFiles = teacherResult.data || [];
    if (!academicProfile) return response.status(400).json({ error: "먼저 학년과 선택과목을 저장해 주세요." });
    if (selectedRecordIds !== undefined && (records.length !== selectedRecordIds.length ||
      records.some(record => !selectionSet.has(record.id)))) {
      return response.status(400).json({ error: "선택한 활동을 확인할 수 없습니다. 기록을 새로 불러온 뒤 다시 선택해 주세요." });
    }
    if (!records.length) return response.status(400).json({ error: "분석할 활동 기록을 먼저 등록해 주세요." });
    const { data: quota, error: quotaError } = await client.rpc("consume_ai_analysis_quota");
    // Fail closed if the distributed quota function is missing or unavailable.
    if (quotaError || !quota || typeof quota.allowed !== "boolean") {
      return response.status(503).json({ error: "요청 제한 설정을 확인할 수 없습니다. 관리자에게 문의해 주세요." });
    }
    if (!quota.allowed) {
      response.setHeader("Retry-After", String(quota.retry_after || 600));
      return response.status(429).json({ error: "분석 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요." });
    }

    const { userPrompt, scope } = buildAnalysisContext(
      academicProfile, records, teacherSharedFiles, extraContext
    );

    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 45000);

    let nvidiaResponse, nvidiaRawText, usedModel;
    for (const model of [AI_MODEL, AI_FALLBACK_MODEL]) {
      usedModel = model;
      nvidiaResponse = await fetchImpl(
        "https://integrate.api.nvidia.com/v1/chat/completions",
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.6,
            max_tokens: 2600,
            stream: false,
            ...(model === AI_MODEL
              ? { reasoning_effort: "none" }
              : { chat_template_kwargs: { enable_thinking: false } }),
          }),
        }
      );
      nvidiaRawText = await nvidiaResponse.text();
      // A retired model cannot generate an answer: try the bounded alternative
      // only for 410, sharing the original deadline and student quota charge.
      if (nvidiaResponse.status !== 410 || model === AI_FALLBACK_MODEL) break;
      logger.warn("AI model retired; using fallback", {
        code: "AI_PROVIDER_MODEL_RETIRED", providerStatus: 410, model,
      });
    }
    clearTimeout(timeoutId);

    // Only log our fixed error code and HTTP status: never response bodies,
    // keys, tokens, student records, or untrusted provider error messages.
    if (!nvidiaResponse.ok) {
      const { status, ...failure } = providerFailure(nvidiaResponse.status);
      logger.warn("AI provider request failed", {
        code: failure.code, providerStatus: failure.providerStatus, model: usedModel,
      });
      if (nvidiaResponse.status === 429) response.setHeader("Retry-After", "60");
      return response.status(status).json({ ...failure, providerModel: usedModel });
    }

    let result = null;

    try {
      result = JSON.parse(nvidiaRawText);
    } catch {
      return response.status(502).json({
        error: "AI 서비스가 올바른 응답을 보내지 않았습니다. 잠시 후 다시 시도해 주세요.",
      });
    }

    const choice = result?.choices?.[0];
    const content = choice?.message?.content;
    // Some providers include private reasoning tags in message.content.
    const text = typeof content === "string"
      ? content.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").trim()
      : "";
    if (!text) return response.status(502).json({
      error: "AI 분석 결과가 비어 있습니다. 잠시 후 다시 시도해 주세요.",
    });
    return response.status(200).json({
      analysis: text,
      scope,
      providerModel: usedModel,
      fallbackUsed: usedModel === AI_FALLBACK_MODEL,
      warning: choice.finish_reason === "length"
        ? "응답 길이 제한으로 분석 일부가 생략되었을 수 있습니다." : null,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      return response.status(504).json({
        error:
          "NVIDIA AI 응답 시간이 너무 오래 걸립니다. 잠시 후 다시 시도하거나 입력 내용을 조금 줄여 주세요.",
      });
    }

    return response.status(500).json({
      error: "AI 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }
  finally {
    clearTimeout(timeoutId);
  }
};
}

export default createAnalyzeHandler();
