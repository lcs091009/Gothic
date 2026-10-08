import { createClient } from "@supabase/supabase-js";

import { buildAnalysisContext, RECORD_SCAN_LIMIT, SYSTEM_PROMPT } from "../server/analysisContext.js";

export const MAX_BODY_BYTES = 16_384;

export function createAnalyzeHandler({ env = process.env, fetchImpl = fetch, clientFactory = createClient } = {}) {
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
  const apiKey = env.NVIDIA_API_KEY;
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
    const { extraContext = "" } = body;
    if (typeof extraContext !== "string" || extraContext.length > 1200) {
      return response.status(400).json({ error: "보충 입력은 1,200자 이내로 작성해 주세요." });
    }
    // Fetch the authenticated student's data under RLS; never trust IDs or records from the browser.
    const [academicResult, recordResult, teacherResult] = await Promise.all([
      client.from("student_academic_profiles").select("*").eq("user_id", user.id).maybeSingle(),
      client.from("research_records").select("*").eq("user_id", user.id)
        .order("created_at", { ascending: false }).limit(RECORD_SCAN_LIMIT),
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

    const nvidiaResponse = await fetchImpl(
      "https://integrate.api.nvidia.com/v1/chat/completions",
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
          messages: [
            {
              role: "system",
              content: SYSTEM_PROMPT,
            },
            {
              role: "user",
              content: userPrompt,
            },
          ],
          temperature: 0,
          top_p: 1,
          max_tokens: 2600,
        }),
      }
    );

    const nvidiaRawText = await nvidiaResponse.text();
    clearTimeout(timeoutId);

    let result = null;

    try {
      result = JSON.parse(nvidiaRawText);
    } catch {
      return response.status(502).json({
        error: "AI 서비스가 올바른 응답을 보내지 않았습니다. 잠시 후 다시 시도해 주세요.",
      });
    }

    if (!nvidiaResponse.ok) {
      return response.status(502).json({ error: "AI 서비스 요청에 실패했습니다. 잠시 후 다시 시도해 주세요." });
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
