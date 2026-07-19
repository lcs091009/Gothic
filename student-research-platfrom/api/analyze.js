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
    const { academicProfile, records, extraContext } = request.body || {};

    if (!academicProfile) {
      return response.status(400).json({
        error: "선택과목 정보가 없습니다.",
      });
    }

    if (!Array.isArray(records) || records.length === 0) {
      return response.status(400).json({
        error: "분석할 활동 기록이 없습니다. 먼저 활동 기록을 등록해 주세요.",
      });
    }

    const safeRecords = records.slice(0, 5).map((record) => ({
      title: record.title || "",
      subject: record.subject || "",
      grade: record.grade || "",
      semester: record.semester || "",
      content: String(record.content || "").slice(0, 800),
      driveFileName: record.drive_file_name || "",
      driveFileUrl: record.drive_file_url || "",
    }));

    const safeExtraContext = String(extraContext || "").slice(0, 1200);

    const prompt = `
너는 학생의 탐구 주제를 대신 정해주는 AI가 아니다.
너는 학생이 작년 활동을 돌아보고, 현재 선택과목 안에서 다음 활동 방향을 스스로 정하도록 돕는 분석 도우미다.

가장 중요한 기준:
1. 선택과목보다 기존 활동과의 연계성을 먼저 본다.
2. 기존 활동의 제목만 보고 비슷한 주제를 반복 추천하지 않는다.
3. 기존 활동의 내용, 한계, 궁금증, 느낀 점에서 다음 활동 방향을 찾는다.
4. 과목명만 붙인 억지 주제를 만들지 않는다.
5. 현재 과목의 정체성이 드러나는 개념을 반드시 제시한다.
6. 완성된 보고서 주제가 아니라, 학생이 발전시킬 수 있는 활동 방향과 질문을 제시한다.
7. 학생이 직접 정해야 할 부분을 남겨 둔다.
8. 생기부 문장이나 보고서를 대신 작성하지 않는다.
9. 업로드된 활동 기록과 학생이 직접 보충 입력한 내용을 구분해서 분석한다.
10. 보충 입력에만 있는 내용은 확정적으로 말하지 말고 "학생 보충 입력에 따르면"이라고 표현한다.
11. 자료가 부족하면 부족하다고 말하고, 추가로 입력하면 좋은 정보를 제안한다.

학생 정보:
- 현재 학년: ${academicProfile.current_grade || academicProfile.grade || "알 수 없음"}
- 교육과정: ${academicProfile.curriculum_label || "알 수 없음"}
- 입학 연도: ${academicProfile.admission_year || "알 수 없음"}

선택과목:
${JSON.stringify(academicProfile.selected_choices || {}, null, 2)}

업로드된 기존 활동 기록:
${JSON.stringify(safeRecords, null, 2)}

학생 보충 입력:
${safeExtraContext || "보충 입력 없음"}

출력 형식:

[1. 자료 완성도 점검]
- 업로드된 기록으로 확인되는 내용:
- 학생 보충 입력으로 확인되는 내용:
- 아직 부족한 정보:
- 추가로 입력하면 좋은 정보:

[2. 기존 활동 흐름 요약]
학생이 작년에 어떤 활동을 했고, 어떤 관심 흐름이 보이는지 정리한다.
단순히 "과학에 관심이 있다"처럼 쓰지 말고, 활동 속에서 반복되는 관점이나 문제의식을 중심으로 설명한다.

[3. 기존 활동에서 이어질 수 있는 지점]
기존 활동의 한계, 궁금증, 더 확장할 수 있는 부분을 3개 찾는다.

1.
2.
3.

[4. 현재 과목과의 연결 가능성]
선택과목 중 연결 가능한 과목을 고르고, 그 과목의 핵심 개념이 어떻게 드러나야 하는지 설명한다.

- 과목명:
  - 연결되는 기존 활동:
  - 과목 정체성이 드러나는 핵심 개념:
  - 연결 가능성:
  - 주의할 점:

[5. 다음 활동 방향 후보]
완성된 주제가 아니라 활동 방향 후보를 3개 제시한다.

후보 1
- 활동 방향:
- 출발한 기존 활동:
- 연결 가능한 과목:
- 과목 정체성이 드러나는 개념:
- 학생이 직접 정해야 할 부분:
- 가능한 활동 방법:
- 선생님께 설명할 수 있는 연결 이유:

후보 2
- 활동 방향:
- 출발한 기존 활동:
- 연결 가능한 과목:
- 과목 정체성이 드러나는 개념:
- 학생이 직접 정해야 할 부분:
- 가능한 활동 방법:
- 선생님께 설명할 수 있는 연결 이유:

후보 3
- 활동 방향:
- 출발한 기존 활동:
- 연결 가능한 과목:
- 과목 정체성이 드러나는 개념:
- 학생이 직접 정해야 할 부분:
- 가능한 활동 방법:
- 선생님께 설명할 수 있는 연결 이유:

[6. 주의할 점]
AI가 대신 주제를 정한 것처럼 보이지 않게, 학생이 직접 판단해야 할 부분을 안내한다.
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
          temperature: 0.3,
          max_tokens: 1300,
        }),
      }
    );

    clearTimeout(timeoutId);

    const nvidiaRawText = await nvidiaResponse.text();

    let result = null;

    try {
      result = JSON.parse(nvidiaRawText);
    } catch {
      return response.status(502).json({
        error: `NVIDIA가 JSON이 아닌 응답을 보냈습니다. 응답 내용: ${nvidiaRawText.slice(
          0,
          300
        )}`,
      });
    }

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
          "NVIDIA AI 응답 시간이 너무 오래 걸립니다. 잠시 후 다시 시도하거나 입력 내용을 조금 줄여 주세요.",
      });
    }

    return response.status(500).json({
      error: error.message || "AI 분석 중 알 수 없는 오류가 발생했습니다.",
    });
  }
}