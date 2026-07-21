import { useEffect, useMemo, useState } from "react";
import {
  supabase,
  withRetry,
  isSupabaseConfigured,
  getFriendlySupabaseError,
} from "../lib/supabaseClient";
import { describeCurriculum, computeAdmissionYear } from "../lib/curriculum";
import { getSubjects, getSubjectDetail } from "../lib/curriculumData";

const STATUS = [
  { key: "current", label: "현재 배우는 중", color: "#145BA9" },
  { key: "completed", label: "이미 배움", color: "#0f9d8f" },
  { key: "planned", label: "예정", color: "#8a6d3b" },
  { key: "interest", label: "관심", color: "#b5179e" },
];
export default function CurriculumSetup({ session }) {
  const userId = session?.user?.id;

  const [step, setStep] = useState(1);
  const [academicYear, setAcademicYear] = useState(2026);
  const [grade, setGrade] = useState(1);
  const [override, setOverride] = useState(null); // 직접 변경한 버전

  const [subjectAbbr, setSubjectAbbr] = useState(null);
  const [query, setQuery] = useState("");

  const [expanded, setExpanded] = useState({}); // area_code -> bool
  const [units, setUnits] = useState({}); // code -> status

  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const determined = describeCurriculum({ academicYear, grade });
  const version = override || determined?.version;
  const admissionYear = computeAdmissionYear({ academicYear, grade });

  const subjects = useMemo(() => getSubjects(), []);
  const detail = useMemo(
    () => (subjectAbbr ? getSubjectDetail(subjectAbbr) : null),
    [subjectAbbr]
  );

  const filteredSubjects = useMemo(() => {
    const q = query.trim();
    const list = q
      ? subjects.filter((s) => s.name.includes(q))
      : subjects;
    const common = list.filter((s) => s.category === "공통과목");
    const elective = list.filter((s) => s.category !== "공통과목");
    return { common, elective };
  }, [subjects, query]);

  useEffect(() => {
    if (!userId || !isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data, error } = await withRetry(() =>
          supabase
            .from("student_curriculum")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle()
        );

        if (error) {
          setMessage(getFriendlySupabaseError(error));
        } else if (data && !cancelled) {
          if (data.academic_year) setAcademicYear(data.academic_year);
          if (data.grade) setGrade(data.grade);
          if (data.version_overridden) setOverride(data.curriculum_version);
          const sel = data.selection || {};
          if (sel.subject?.abbr) setSubjectAbbr(sel.subject.abbr);
          if (Array.isArray(sel.units)) {
            const map = {};
            for (const u of sel.units) map[u.code] = u.status || "current";
            setUnits(map);
          }
        }
      } catch (err) {
        setMessage(getFriendlySupabaseError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  function toggleUnit(code) {
    setUnits((prev) => {
      const next = { ...prev };
      if (next[code]) delete next[code];
      else next[code] = "current";
      return next;
    });
  }

  function setStatus(code, statusKey) {
    setUnits((prev) => ({ ...prev, [code]: statusKey }));
  }

  function toggleArea(area) {
    const codes = area.standards.map((s) => s.code);
    const allSelected = codes.every((c) => units[c]);
    setUnits((prev) => {
      const next = { ...prev };
      if (allSelected) {
        for (const c of codes) delete next[c];
      } else {
        for (const c of codes) if (!next[c]) next[c] = "current";
      }
      return next;
    });
  }

  const selectedCount = Object.keys(units).length;

  async function handleSave() {
    setMessage("");

    if (!isSupabaseConfigured()) {
      setMessage("Supabase 설정이 필요합니다.");
      return;
    }
    if (!userId) {
      setMessage("먼저 로그인해야 합니다.");
      return;
    }

    setSaving(true);
    try {
      const unitList = Object.entries(units).map(([code, status]) => {
        const area = detail?.areas.find((a) =>
          a.standards.some((s) => s.code === code)
        );
        return { code, area: area?.area_code || null, status };
      });

      const row = {
        user_id: userId,
        academic_year: academicYear,
        grade,
        curriculum_version: version,
        version_overridden: Boolean(override),
        selection: {
          subject: detail
            ? { abbr: detail.abbr, name: detail.name }
            : null,
          units: unitList,
        },
        updated_at: new Date().toISOString(),
      };

      const { error } = await withRetry(() =>
        supabase
          .from("student_curriculum")
          .upsert(row, { onConflict: "user_id" })
      );

      if (error) {
        setMessage(getFriendlySupabaseError(error));
        return;
      }

      setMessage("교육과정 설정을 저장했습니다.");
    } catch (err) {
      setMessage(getFriendlySupabaseError(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section style={styles.panel}>
        <p style={styles.help}>교육과정 설정을 불러오는 중...</p>
      </section>
    );
  }

  return (
    <section style={styles.panel}>
      <div style={styles.stepper}>
        {[
          { n: 1, t: "교육과정" },
          { n: 2, t: "과목 선택" },
          { n: 3, t: "단원 선택" },
        ].map((s) => (
          <button
            key={s.n}
            type="button"
            onClick={() => setStep(s.n)}
            style={{
              ...styles.stepChip,
              ...(step === s.n ? styles.stepChipActive : {}),
            }}
          >
            {s.n}. {s.t}
          </button>
        ))}
      </div>

      {/* 1단계: 교육과정 판별 */}
      {step === 1 && (
        <div>
          <h3 style={styles.h3}>1단계 · 기본 정보</h3>
          <div style={styles.row}>
            <label style={styles.field}>
              <span style={styles.label}>학년도</span>
              <select
                style={styles.input}
                value={academicYear}
                onChange={(e) => {
                  setAcademicYear(Number(e.target.value));
                  setOverride(null);

                }}
              >
                {[2025, 2026, 2027, 2028].map((y) => (
                  <option key={y} value={y}>
                    {y}학년도
                  </option>
                ))}
              </select>
            </label>

            <label style={styles.field}>
              <span style={styles.label}>학년</span>
              <select
                style={styles.input}
                value={grade}
                onChange={(e) => {
                  setGrade(Number(e.target.value));
                  setOverride(null);

                }}
              >
                {[1, 2, 3].map((g) => (
                  <option key={g} value={g}>
                    고등학교 {g}학년
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={styles.resultCard}>
            <p style={styles.resultLine}>
              입학 연도(자동 계산): <b>{admissionYear}년</b>
            </p>
            <p style={styles.resultLine}>적용 교육과정</p>
            <p style={styles.versionBig}>
              {version === "2015"
                ? "2015 개정 교육과정"
                : "2022 개정 교육과정"}
              {override && (
                <span style={styles.overrideTag}> (직접 변경됨)</span>
              )}
            </p>
            {!override && determined && (
              <p style={styles.resultReason}>{determined.reason}</p>
            )}

            <div style={styles.btnRow}>
              <button
                type="button"
                style={styles.primaryBtn}
                onClick={() => {

                  setStep(2);
                }}
              >
                맞습니다
              </button>
              <button
                type="button"
                style={styles.ghostBtn}
                onClick={() =>
                  setOverride((prev) =>
                    prev ? null : version === "2015" ? "2022" : "2015"
                  )
                }
              >
                직접 변경
              </button>
            </div>

            {override && (
              <p style={styles.help}>
                {override} 개정으로 직접 지정했습니다. 다시 누르면 자동 판별로
                돌아갑니다.
              </p>
            )}
          </div>
          <p style={styles.help}>
            ※ 현재 데이터는 2022 개정 과목만 준비되어 있습니다. (지금 고촌
            학생은 전원 2022 개정)
          </p>
        </div>
      )}

      {/* 2단계: 과목 선택 */}
      {step === 2 && (
        <div>
          <h3 style={styles.h3}>2단계 · 과목 선택</h3>
          <input
            style={{ ...styles.input, width: "100%", marginBottom: 12 }}
            placeholder="과목 검색 (예: 정보, 물리학, 확률과 통계)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <SubjectGroup
            title="공통과목 (고1)"
            list={filteredSubjects.common}
            selected={subjectAbbr}
            onPick={setSubjectAbbr}
          />
          <SubjectGroup
            title="선택과목 (고2~3)"
            list={filteredSubjects.elective}
            selected={subjectAbbr}
            onPick={setSubjectAbbr}
          />

          <div style={styles.btnRow}>
            <button
              type="button"
              style={styles.ghostBtn}
              onClick={() => setStep(1)}
            >
              이전
            </button>
            <button
              type="button"
              style={{
                ...styles.primaryBtn,
                ...(subjectAbbr ? {} : styles.disabledBtn),
              }}
              disabled={!subjectAbbr}
              onClick={() => setStep(3)}
            >
              다음: 단원 선택
            </button>
          </div>
        </div>
      )}

      {/* 3단계: 단원(영역>성취기준) 트리 */}
      {step === 3 && (
        <div>
          <h3 style={styles.h3}>
            3단계 · 단원 선택 {detail ? `— ${detail.name}` : ""}
          </h3>

          {!detail ? (
            <p style={styles.help}>먼저 2단계에서 과목을 선택하세요.</p>
          ) : (
            <>
              <div style={styles.treeToolbar}>
                <span style={styles.countBadge}>선택 {selectedCount}개</span>
                <button
                  type="button"
                  style={styles.miniBtn}
                  onClick={() =>
                    setExpanded(
                      Object.fromEntries(
                        detail.areas.map((a) => [a.area_code, true])
                      )
                    )
                  }
                >
                  전체 펼치기
                </button>
                <button
                  type="button"
                  style={styles.miniBtn}
                  onClick={() => setExpanded({})}
                >
                  전체 접기
                </button>
              </div>

              <div style={styles.tree}>
                {detail.areas.map((area) => {
                  const codes = area.standards.map((s) => s.code);
                  const sel = codes.filter((c) => units[c]).length;
                  const all = sel === codes.length && codes.length > 0;
                  const some = sel > 0 && !all;
                  const open = Boolean(expanded[area.area_code]);

                  return (
                    <div key={area.area_code} style={styles.areaBox}>
                      <div style={styles.areaHeader}>
                        <input
                          type="checkbox"
                          checked={all}
                          ref={(el) => {
                            if (el) el.indeterminate = some;
                          }}
                          onChange={() => toggleArea(area)}
                        />
                        <button
                          type="button"
                          style={styles.areaTitleBtn}
                          onClick={() =>
                            setExpanded((prev) => ({
                              ...prev,
                              [area.area_code]: !open,
                            }))
                          }
                        >
                          {open ? "▼" : "▶"} {area.area_name}
                          <span style={styles.areaCount}>
                            {sel}/{codes.length}
                          </span>
                        </button>
                      </div>

                      {open && (
                        <div style={styles.stdList}>
                          {area.standards.map((s) => {
                            const status = units[s.code];
                            return (
                              <div key={s.code} style={styles.stdItem}>
                                <label style={styles.stdLabel}>
                                  <input
                                    type="checkbox"
                                    checked={Boolean(status)}
                                    onChange={() => toggleUnit(s.code)}
                                  />
                                  <span style={styles.stdText}>
                                    <b style={styles.stdCode}>{s.code}</b>{" "}
                                    {s.text}
                                  </span>
                                </label>

                                {status && (
                                  <div style={styles.statusRow}>
                                    {STATUS.map((st) => (
                                      <button
                                        key={st.key}
                                        type="button"
                                        onClick={() =>
                                          setStatus(s.code, st.key)
                                        }
                                        style={{
                                          ...styles.statusBtn,
                                          ...(status === st.key
                                            ? {
                                                background: st.color,
                                                color: "#fff",
                                                borderColor: st.color,
                                              }
                                            : {}),
                                        }}
                                      >
                                        {st.label}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={styles.btnRow}>
                <button
                  type="button"
                  style={styles.ghostBtn}
                  onClick={() => setStep(2)}
                >
                  이전
                </button>
                <button
                  type="button"
                  style={styles.primaryBtn}
                  disabled={saving}
                  onClick={handleSave}
                >
                  {saving ? "저장 중..." : "교육과정 설정 저장"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {message && <p style={styles.message}>{message}</p>}
    </section>
  );
}

function SubjectGroup({ title, list, selected, onPick }) {
  if (!list.length) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <p style={styles.groupTitle}>{title}</p>
      <div style={styles.subjectGrid}>
        {list.map((s) => (
          <button
            key={s.abbr}
            type="button"
            onClick={() => onPick(s.abbr)}
            style={{
              ...styles.subjectChip,
              ...(selected === s.abbr ? styles.subjectChipActive : {}),
            }}
            title={s.verified ? "" : "과목명 라벨 검수 대상"}
          >
            {s.name}
            {!s.verified && <span style={styles.needCheck}>*</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

const styles = {
  panel: {
    marginTop: 28,
    border: "1px solid rgba(154, 223, 226, 0.9)",
    borderRadius: 24,
    padding: 26,
    backgroundColor: "rgba(255, 255, 255, 0.82)",
    boxShadow: "0 18px 46px rgba(20, 91, 169, 0.1)",
  },
  stepper: { display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" },
  stepChip: {
    border: "1px solid rgba(20,91,169,0.2)",
    borderRadius: 999,
    padding: "8px 14px",
    background: "#fff",
    color: "#145BA9",
    fontWeight: 800,
    cursor: "pointer",
  },
  stepChipActive: { background: "#145BA9", color: "#fff" },
  h3: { margin: "0 0 14px", color: "#145BA9", fontSize: 20, fontWeight: 900 },
  row: { display: "flex", gap: 14, flexWrap: "wrap" },
  field: { display: "flex", flexDirection: "column", gap: 6, minWidth: 160 },
  label: { fontWeight: 800, color: "#24435f", fontSize: 14 },
  input: {
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    padding: "10px 12px",
    fontSize: 15,
    background: "#fff",
    boxSizing: "border-box",
  },
  resultCard: {
    marginTop: 16,
    borderRadius: 18,
    padding: 20,
    background: "rgba(238,248,251,0.9)",
    border: "1px solid rgba(154,223,226,0.8)",
  },
  resultLine: { margin: "2px 0", color: "#24435f", fontWeight: 700 },
  versionBig: {
    margin: "6px 0",
    color: "#145BA9",
    fontSize: 24,
    fontWeight: 900,
  },
  overrideTag: { fontSize: 14, color: "#b5179e" },
  resultReason: { margin: "4px 0 0", color: "#5d7890", fontSize: 14 },
  btnRow: { display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" },
  primaryBtn: {
    border: "none",
    borderRadius: 12,
    padding: "12px 18px",
    background: "#145BA9",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  },
  ghostBtn: {
    border: "1px solid rgba(20,91,169,0.25)",
    borderRadius: 12,
    padding: "12px 18px",
    background: "#fff",
    color: "#145BA9",
    fontWeight: 800,
    cursor: "pointer",
  },
  disabledBtn: { opacity: 0.5, cursor: "not-allowed" },
  help: { marginTop: 12, color: "#5d7890", fontSize: 13, lineHeight: 1.6 },
  groupTitle: { margin: "0 0 8px", fontWeight: 900, color: "#24435f" },
  subjectGrid: { display: "flex", flexWrap: "wrap", gap: 8 },
  subjectChip: {
    border: "1px solid rgba(20,91,169,0.2)",
    borderRadius: 999,
    padding: "8px 12px",
    background: "#fff",
    color: "#24435f",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  },
  subjectChipActive: {
    background: "#145BA9",
    color: "#fff",
    borderColor: "#145BA9",
  },
  needCheck: { color: "#b5179e", marginLeft: 2 },
  treeToolbar: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    marginBottom: 10,
    flexWrap: "wrap",
  },
  countBadge: {
    background: "#145BA9",
    color: "#fff",
    borderRadius: 999,
    padding: "4px 10px",
    fontWeight: 800,
    fontSize: 13,
  },
  miniBtn: {
    border: "1px solid rgba(20,91,169,0.2)",
    borderRadius: 8,
    padding: "5px 10px",
    background: "#fff",
    color: "#145BA9",
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
  },
  tree: { display: "flex", flexDirection: "column", gap: 8 },
  areaBox: {
    border: "1px solid rgba(154,223,226,0.7)",
    borderRadius: 12,
    background: "#fff",
    overflow: "hidden",
  },
  areaHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    background: "rgba(238,248,251,0.7)",
  },
  areaTitleBtn: {
    border: "none",
    background: "transparent",
    color: "#145BA9",
    fontWeight: 900,
    fontSize: 15,
    cursor: "pointer",
    textAlign: "left",
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  areaCount: { color: "#5d7890", fontSize: 13, fontWeight: 700 },
  stdList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "8px 12px 12px",
  },
  stdItem: {
    borderTop: "1px solid #eef2f5",
    paddingTop: 8,
  },
  stdLabel: { display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" },
  stdText: { color: "#334155", fontSize: 14, lineHeight: 1.55 },
  stdCode: { color: "#145BA9" },
  statusRow: { display: "flex", gap: 6, marginTop: 6, marginLeft: 24, flexWrap: "wrap" },
  statusBtn: {
    border: "1px solid #cbd5e1",
    borderRadius: 999,
    padding: "3px 9px",
    background: "#fff",
    color: "#475569",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  message: { marginTop: 14, color: "#145BA9", fontWeight: 900 },
};
