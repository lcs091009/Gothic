export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({
      error: "POST 요청만 사용할 수 있습니다.",
    });
  }

  const apiKey = process.env.NVIDIA_API_KEY;

  if (!apiKey) {
    return response.status(500).json({
      error: "NVIDIA_API_KEY 환경 변수가 설정되지 않았습니다.",
    });
  }

  try {
    const { academicProfile, records } = request.body || {};

    if (!academicProfile) {
      return response.status(400).json({
        error: "선택과목 정보가 없습니다.",
      });
    }

    if (!Array.isArray(records) || records.length === 0) {
      return response.status(400).json({
        error: "분석할 탐구 기록이 없습니다. 먼저 탐구 기록을 등록해 주세요.",
      });
    }

    const safeRecords = records.slice(0, 3).map((record) => ({
      title: record.title || "",
      subject: record.subject || "",
      grade: record.grade || "",
      semester: record.semester || "",
      content: String(record.content || "").slice(0, 500),
      driveFileName: record.drive_file_name || "",
      driveFileUrl: record.drive_file_url || "",
    }));

    const prompt = `
너는 고등학생의 선택과목과 탐구 기록을 바탕으로 심화탐구 주제를 추천하는 교육용 AI이다.

조건:
1. 학생의 선택과목과 직접 연결되는 주제만 추천한다.
2. 기존 탐구 기록에서 이어질 수 있는 심화 주제를 추천한다.
3. 학교 탐구 보고서로 쓸 수 있을 만큼 구체적으로 작성한다.
4. 위험한 실험, 불법 행위, 개인정보 침해와 관련된 주제는 추천하지 않는다.
5. 결과는 한국어로 작성한다.
6. 추천 주제는 3개만 제시한다.

학생 정보:
- 현재 학년: ${academicProfile.current_grade || academicProfile.grade || "알 수 없음"}
- 교육과정: ${academicProfile.curriculum_label || "알 수 없음"}
- 입학 연도: ${academicProfile.admission_year || "알 수 없음"}

선택과목:
${JSON.stringify(academicProfile.selected_choices || {}, null, 2)}

탐구 기록:
${JSON.stringify(safeRecords, null, 2)}

아래 형식으로 답하라.

[AI 분석 요약]

[추천 심화탐구 주제 1]
주제명:
연결 선택과목:
기존 탐구와의 연결점:
추천 이유:
탐구 방법:
예상 결과물:
추가 조사 키워드:

[추천 심화탐구 주제 2]
주제명:
연결 선택과목:
기존 탐구와의 연결점:
추천 이유:
탐구 방법:
예상 결과물:
추가 조사 키워드:

[추천 심화탐구 주제 3]
주제명:
연결 선택과목:
기존 탐구와의 연결점:
추천 이유:
탐구 방법:
예상 결과물:
추가 조사 키워드:
`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    const nvidiaResponse = await fetch(
      "https://integrate.api.nvidia.com/v1/chat/completions",
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "meta/llama-3.1-8b-instruct",
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.4,
          max_tokens: 800,
        }),
      }
    );

    clearTimeout(timeoutId);

    const result = await nvidiaResponse.json();

    if (!nvidiaResponse.ok) {
      return response.status(nvidiaResponse.status).json({
        error:
          result?.error?.message ||
          `NVIDIA AI API 오류가 발생했습니다. 상태 코드: ${nvidiaResponse.status}`,
      });
    }

    const text =
      result?.choices?.[0]?.message?.content ||
      "AI 분석 결과를 읽어오지 못했습니다.";

    return response.status(200).json({
      analysis: text,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      return response.status(504).json({
        error:
          "NVIDIA AI 응답 시간이 너무 오래 걸립니다. 잠시 후 다시 시도하거나 더 가벼운 모델로 바꿔 주세요.",
      });
    }

    return response.status(500).json({
      error: error.message || "AI 분석 중 알 수 없는 오류가 발생했습니다.",
    });
  }
}