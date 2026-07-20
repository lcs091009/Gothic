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
    const {
      academicProfile,
      records,
      teacherSharedFiles = [],
      extraContext,
    } = request.body || {};

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

    const safeRecords = records
      .slice(0, 12)
      .map((record, index) => {
        return `
활동 ${index + 1}
- 학년/학기: ${record.grade || "미입력"} ${record.semester || ""}
- 과목: ${record.subject || "미입력"}
- 제목: ${record.title || "미입력"}
- 내용: ${String(record.content || "미입력").slice(0, 1200)}
- 첨부파일: ${record.drive_file_name || "없음"}
`;
      })
      .join("\n");

    const safeTeacherSharedFiles = Array.isArray(teacherSharedFiles) && teacherSharedFiles.length
      ? teacherSharedFiles
          .slice(0, 8)
          .map((file, index) => {
            return `
선생님 자료 ${index + 1}
- 파일명: ${file.file_name || "미입력"}
- 분류: ${file.category || "기타"}
- 설명: ${String(file.description || "설명 없음").slice(0, 1000)}
- 매칭 상태: ${file.match_status || "미확인"}
`;
          })
          .join("\n")
      : "현재 제공된 선생님 자료 없음";

    const safeExtraContext = String(extraContext || "").slice(0, 1200);
    const studentInput = safeExtraContext || "없음";

    const systemPrompt = `
너는 고등학생의 활동 기록을 바탕으로 "활동 흐름"을 분석하는 교육 보조 AI다.

중요 원칙:
- 생기부, 보고서, 수행평가를 대신 작성하지 않는다.
- 학생이 실제로 한 활동과 입력한 자료에 근거해서만 분석한다.
- 과장된 표현, 평가자 말투, 교사용 생기부 문체를 쓰지 않는다.
- 학생이 다음 활동을 스스로 설계할 수 있게 돕는다.
- 없는 활동, 없는 성과, 확인되지 않은 역량을 만들어내지 않는다.
- 답변은 구체적이고 실행 가능해야 한다.
- 막연한 말 대신 "왜 그렇게 연결되는지"를 설명한다.

분석 기준:
1. 반복해서 드러나는 관심 분야
2. 과목 개념과 연결되는 지점
3. 이전 활동에서 이어갈 수 있는 질문
4. 선생님 제공 자료와 학생 기록 사이의 연결점
5. 다음 활동으로 발전 가능한 방향
6. 현재 기록에서 부족한 점 또는 보완하면 좋은 점

답변 방식:
- 학생에게 말하듯이 친절하게 설명한다.
- 단정하지 말고 "이 기록만 보면", "현재 자료 기준으로는"처럼 근거 범위를 밝힌다.
- 반드시 아래 출력 형식을 지킨다.
`;

    const userPrompt = `
[학생 선택과목 정보]
학년: ${academicProfile?.grade || "미입력"}
선택과목: ${academicProfile?.selected_subjects || "미입력"}
관심 진로: ${academicProfile?.career_interest || "미입력"}

[학생이 직접 등록한 활동 기록]
${safeRecords}

[선생님이 제공한 자료]
${safeTeacherSharedFiles}

[학생 추가 요청]
${studentInput}

위 자료를 바탕으로 활동 흐름을 분석해줘.

출력 형식은 반드시 아래를 따라줘.

1. 현재 기록에서 보이는 핵심 관심 흐름
- 학생 기록에서 반복되는 관심사를 2~3개로 정리한다.
- 각 관심사마다 근거가 된 활동을 함께 적는다.

2. 선택과목과 연결되는 지점
- 현재 선택과목과 기존 활동이 어떻게 이어지는지 설명한다.
- 억지 연결은 하지 말고, 연결이 약하면 약하다고 말한다.

3. 선생님 제공 자료에서 참고할 점
- 선생님 자료가 있으면 학생 활동과 연결되는 부분을 정리한다.
- 선생님 자료가 없으면 "현재 제공된 선생님 자료는 없습니다"라고 말한다.

4. 다음 활동으로 발전 가능한 질문
- 바로 탐구 주제로 확정하지 말고, 질문 형태로 3개 제안한다.
- 각 질문은 학생이 실제로 수행 가능한 수준이어야 한다.

5. 보완하면 좋은 점
- 기록이 부족한 부분, 더 구체화하면 좋은 부분을 알려준다.
- 비판적으로 말하지 말고 개선 방향으로 말한다.

6. 다음에 학생이 직접 할 일
- 학생이 바로 할 수 있는 행동 3가지를 제안한다.
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
          model: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: userPrompt,
            },
          ],
          temperature: 0.35,
          top_p: 0.8,
          max_tokens: 1400,
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