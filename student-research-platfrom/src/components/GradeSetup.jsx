import { useMemo, useState } from "react";
import {
  curriculumByCurrentGrade,
  getCurriculumByCurrentGrade,
} from "../data/curriculumChoices";
import {
  getFriendlySupabaseError,
  isSupabaseConfigured,
  supabase,
  supabaseConfigError,
  withRetry,
} from "../lib/supabaseClient";

function getEmptyChoices(groups) {
  return groups.reduce((acc, group) => {
    acc[group.id] = [];
    return acc;
  }, {});
}

function ChoiceGroup({ group, selectedSubjects, onToggle }) {
  return (
    <section style={styles.choiceGroup}>
      <div style={styles.choiceHeader}>
        <div>
          <h3 style={styles.choiceTitle}>{group.title}</h3>
          <p style={styles.smallText}>
            {group.semesterLabel} · {group.requiredCount}개 선택
          </p>
        </div>

        <strong style={styles.countText}>
          {selectedSubjects.length} / {group.requiredCount}
        </strong>
      </div>

      <div style={styles.subjectGrid}>
        {group.subjects.map((subject) => {
          const isSelected = selectedSubjects.includes(subject);

          return (
            <button
              key={subject}
              type="button"
              onClick={() => onToggle(group, subject)}
              style={{
                ...styles.subjectButton,
                ...(isSelected ? styles.subjectButtonSelected : {}),
              }}
            >
              {subject}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function GradeSetup({ session, existingAcademicProfile, onSaved }) {
  const initialGrade =
    existingAcademicProfile?.current_grade ||
    existingAcademicProfile?.grade ||
    "1학년";

  const [currentGrade, setCurrentGrade] = useState(initialGrade);
  const [choices, setChoices] = useState(() => {
    const curriculum = getCurriculumByCurrentGrade(initialGrade);
    const emptyChoices = getEmptyChoices(curriculum.groups);

    return {
      ...emptyChoices,
      ...(existingAcademicProfile?.selected_choices || {}),
      ...(existingAcademicProfile?.grade2_choices || {}),
      ...(existingAcademicProfile?.grade3_choices || {}),
    };
  });

  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const curriculum = useMemo(
    () => getCurriculumByCurrentGrade(currentGrade),
    [currentGrade]
  );

  function handleChangeGrade(nextGrade) {
    const nextCurriculum = getCurriculumByCurrentGrade(nextGrade);
    const nextEmptyChoices = getEmptyChoices(nextCurriculum.groups);

    setCurrentGrade(nextGrade);
    setChoices(nextEmptyChoices);
    setMessage("");
  }

  function handleToggle(group, subject) {
    setMessage("");

    setChoices((prev) => {
      const currentSubjects = prev[group.id] || [];
      const isAlreadySelected = currentSubjects.includes(subject);

      if (isAlreadySelected) {
        return {
          ...prev,
          [group.id]: currentSubjects.filter((item) => item !== subject),
        };
      }

      if (currentSubjects.length >= group.requiredCount) {
        setMessage(`${group.title}은 ${group.requiredCount}개까지만 선택할 수 있습니다.`);
        return prev;
      }

      return {
        ...prev,
        [group.id]: [...currentSubjects, subject],
      };
    });
  }

  function validateChoices() {
    for (const group of curriculum.groups) {
      const selectedSubjects = choices[group.id] || [];

      if (selectedSubjects.length !== group.requiredCount) {
        return `${group.title}은 ${group.requiredCount}개를 선택해야 합니다.`;
      }
    }

    return null;
  }

  async function handleSave() {
    setMessage("");

    if (!isSupabaseConfigured()) {
      setMessage(supabaseConfigError || "Supabase 설정이 필요합니다.");
      return;
    }

    if (!session?.user) {
      setMessage("먼저 로그인해야 합니다.");
      return;
    }

    const validationError = validateChoices();

    if (validationError) {
      setMessage(validationError);
      return;
    }

    setIsSaving(true);

    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from("student_academic_profiles")
          .upsert(
            {
              user_id: session.user.id,
              student_email: session.user.email,

              grade: currentGrade,
              current_grade: currentGrade,

              admission_year: curriculum.admissionYear,
              curriculum_label: curriculum.curriculumLabel,
              selected_choices: choices,

              academic_year: new Date().getFullYear(),
              curriculum_version: curriculum.curriculumLabel.includes("2022")
                ? "2022"
                : "2015",

              subject_name: null,
              subject_category: null,
              is_custom_subject: false,
              custom_subject_name: null,

              selected_units: choices,
              curriculum_confirmed: true,

              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          )
          .select("*")
          .single()
      );

      if (error) {
        setMessage(getFriendlySupabaseError(error));
        return;
      }

      onSaved(data);
    } catch (error) {
      setMessage(getFriendlySupabaseError(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="soft-panel grade-setup-panel" style={styles.card}>
      <h2 style={styles.title}>학년 및 선택과목 설정</h2>

      <p style={styles.text}>
        현재 학년에 맞는 입학생 교육과정 편제표를 기준으로 선택과목을
        입력합니다. 이 정보는 AI 심화탐구 주제 추천에 사용됩니다.
      </p>

      <div style={styles.gradeBox}>
        {Object.keys(curriculumByCurrentGrade).map((gradeOption) => (
          <button
            key={gradeOption}
            type="button"
            onClick={() => handleChangeGrade(gradeOption)}
            style={{
              ...styles.gradeButton,
              ...(currentGrade === gradeOption ? styles.gradeButtonSelected : {}),
            }}
          >
            {gradeOption}
          </button>
        ))}
      </div>

      <div style={styles.infoBox}>
        <h3 style={styles.infoTitle}>{curriculum.curriculumLabel}</h3>
        <p style={styles.text}>{curriculum.description}</p>

        {currentGrade === "1학년" && (
          <p style={styles.text}>
            현재 1학년은 선택과목 입력 없이 저장하고 넘어가면 됩니다.
          </p>
        )}
      </div>

      {curriculum.groups.length > 0 && (
        <div style={styles.choiceList}>
          {curriculum.groups.map((group) => (
            <ChoiceGroup
              key={group.id}
              group={group}
              selectedSubjects={choices[group.id] || []}
              onToggle={handleToggle}
            />
          ))}
        </div>
      )}

      {message && <p style={styles.message}>{message}</p>}

      <button
        className="animated-button"
        type="button"
        onClick={handleSave}
        disabled={isSaving}
        style={styles.saveButton}
      >
        {isSaving ? (
          <>
            저장 중
            <span className="button-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </>
        ) : (
          "선택과목 저장하고 계속하기"
        )}
      </button>
    </section>
  );
}

const styles = {
  card: {
    marginTop: "28px",
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
    padding: "24px",
    backgroundColor: "#f8fafc",
  },
  title: {
    marginTop: 0,
    fontSize: "24px",
    color: "#0f172a",
  },
  text: {
    color: "#475569",
    lineHeight: 1.7,
  },
  smallText: {
    margin: 0,
    fontSize: "13px",
    color: "#64748b",
  },
  gradeBox: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    marginTop: "20px",
  },
  gradeButton: {
    border: "1px solid #cbd5e1",
    borderRadius: "999px",
    padding: "12px 18px",
    backgroundColor: "white",
    color: "#334155",
    fontWeight: 700,
    cursor: "pointer",
  },
  gradeButtonSelected: {
    border: "1px solid #2563eb",
    backgroundColor: "#2563eb",
    color: "white",
  },
  infoBox: {
    marginTop: "20px",
    border: "1px solid #dbeafe",
    borderRadius: "14px",
    padding: "16px",
    backgroundColor: "#eff6ff",
  },
  infoTitle: {
    marginTop: 0,
    marginBottom: "8px",
    color: "#1e3a8a",
  },
  choiceList: {
    marginTop: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "18px",
  },
  choiceGroup: {
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
    padding: "18px",
    backgroundColor: "white",
  },
  choiceHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "flex-start",
    marginBottom: "14px",
  },
  choiceTitle: {
    margin: 0,
    color: "#0f172a",
    fontSize: "18px",
  },
  countText: {
    borderRadius: "999px",
    padding: "6px 10px",
    backgroundColor: "#e0f2fe",
    color: "#0369a1",
    fontSize: "14px",
    whiteSpace: "nowrap",
  },
  subjectGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "10px",
  },
  subjectButton: {
    border: "1px solid #cbd5e1",
    borderRadius: "12px",
    padding: "10px 12px",
    backgroundColor: "white",
    color: "#334155",
    fontWeight: 700,
    cursor: "pointer",
    textAlign: "left",
  },
  subjectButtonSelected: {
    border: "1px solid #2563eb",
    backgroundColor: "#dbeafe",
    color: "#1d4ed8",
  },
  message: {
    marginTop: "16px",
    color: "#2563eb",
    fontWeight: 700,
  },
  saveButton: {
    marginTop: "22px",
    border: "none",
    borderRadius: "12px",
    padding: "14px 18px",
    backgroundColor: "#0f172a",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
  },
};

export default GradeSetup;