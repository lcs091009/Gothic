import { createClient } from "@supabase/supabase-js";

const env = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigError = !supabaseUrl || !supabaseKey
  ? "Supabase 환경 변수가 설정되지 않았습니다. VITE_SUPABASE_URL과 VITE_SUPABASE_ANON_KEY(또는 VITE_SUPABASE_PUBLISHABLE_KEY)를 확인하세요."
  : null;

export const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export function isSupabaseConfigured() {
  return Boolean(supabase && supabaseUrl && supabaseKey);
}

export function isRetryableSupabaseError(error) {
  const status = error?.status;
  const message = error?.message || "";

  if (status >= 500 || status === 408 || status === 429) {
    return true;
  }

  return /fetch|network|timeout|temporar|server|connection/i.test(message);
}

export function getFriendlySupabaseError(error) {
  const message = error?.message || "";

  if (/duplicate|already exists|unique/i.test(message)) {
    return "중복된 정보입니다. 이미 존재하는 항목일 수 있으니 다시 확인한 뒤 시도해 주세요.";
  }

  if (/fetch|network|timeout|temporar|server|connection/i.test(message)) {
    return "서버와 통신이 불안정합니다. 잠시 후 다시 시도해 주세요.";
  }

  return error?.message || "알 수 없는 오류가 발생했습니다.";
}

export async function withRetry(operation, retries = 2) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isRetryableSupabaseError(error) || attempt === retries) {
        throw error;
      }
    }
  }

  throw lastError;
}