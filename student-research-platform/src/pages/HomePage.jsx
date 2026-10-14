import styles from "../styles/appStyles";
import { studentCategories } from "../config/studentCategories";
import "./StudentHome.css";
import "./HomePage.css";

const studentRecordPreview = [
  "자율활동: 학급 탐구 프로젝트에서 자료 조사와 발표 구성을 맡아 주제의 핵심을 정리하고 친구들의 의견을 종합함.",
  "진로활동: 과학적 탐구 방법과 데이터 분석 과정에 관심을 가지고 관련 도서를 읽으며 자신의 관심 분야를 구체화함.",
  "세부능력 및 특기사항: 수업 중 제시된 현상을 관찰한 뒤 가설을 세우고 근거 자료를 찾아 설명하려는 태도가 돋보임.",
  "동아리활동: 탐구 주제를 선정하고 실험 계획을 작성하는 과정에서 변인 통제와 결과 해석의 중요성을 이해함.",
  "독서활동: 사회 문제와 과학 기술의 관계를 다룬 글을 읽고 토론 과정에서 자신의 의견을 논리적으로 표현함.",
  "종합의견: 꾸준한 기록 습관을 바탕으로 이전 활동과 새 탐구 주제를 연결하려는 성실한 태도를 보임.",
];


export default function HomePage({ signInWithGoogle, isSigningIn = false, message }) {
return (
      <main className="student-dashboard neutral-landing login-page">
        <div
          className="floating-record floating-record-left"
          style={styles.floatingRecord}
          aria-hidden="true"
        >
          <h2 style={styles.recordSheetTitle}>학교생활기록부</h2>
          {studentRecordPreview.concat(studentRecordPreview).map((text, index) => (
            <p key={`left-${index}`} style={styles.recordSheetLine}>
              {text}
            </p>
          ))}
        </div>

        <div
          className="floating-record floating-record-right"
          style={styles.floatingRecord}
          aria-hidden="true"
        >
          <h2 style={styles.recordSheetTitle}>창의적 체험활동 상황</h2>
          {studentRecordPreview.concat(studentRecordPreview).map((text, index) => (
            <p key={`right-${index}`} style={styles.recordSheetLine}>
              {text}
            </p>
          ))}
        </div>

        <div
          className="floating-record floating-record-center"
          style={styles.floatingRecordCenter}
          aria-hidden="true"
        >
          <h2 style={styles.recordSheetTitle}>탐구 활동 종합 기록</h2>
          {studentRecordPreview.concat(studentRecordPreview).map((text, index) => (
            <p key={`center-${index}`} style={styles.recordSheetLine}>
              {text}
            </p>
          ))}
        </div>

        <section className="dashboard-card login-shell" aria-labelledby="login-title">
          <header className="student-header">
            <p className="login-brand">활동 연결 노트</p>
            <span className="login-brand-note">학생 · 선생님</span>
          </header>

          <div className="login-hero">
            <img src="/research-logo.svg" alt="활동 연결 노트 로고" className="login-logo" />
            <p className="student-eyebrow">기록에서 다음 탐구로</p>
            <h1 id="login-title">학생 자율 탐구 도우미</h1>
            <p className="student-intro">
              탐구를 기록하고, 활동을 연결하고, 함께 자료를 나누세요.
            </p>
            <div className="login-action">
              <button type="button" className="google-sign-in" onClick={signInWithGoogle} disabled={isSigningIn} aria-busy={isSigningIn}>
                <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.04 46.98 31.86 46.98 24.55Z" />
                  <path fill="#FBBC05" d="M10.53 28.59A14.41 14.41 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.86 23.86 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
                </svg>
                <span>{isSigningIn ? "Google로 연결 중…" : "Google로 계속하기"}</span>
              </button>
              <p className="login-account-hint">학교 Google 계정으로 로그인해 주세요.</p>
            </div>
            {message && <p className="login-message" role="status">{message}</p>}
          </div>

          <div className="login-feature-grid" aria-label="주요 기능">
            {[
              { title: "기록 정리", description: "흩어진 탐구 활동을 학기별로 모아 봅니다.", icon: studentCategories[1].icon },
              { title: "흐름 분석", description: "이전 활동에서 관심 분야와 강점을 찾습니다.", icon: studentCategories[3].icon },
              { title: "연결 점검", description: "현재 과목의 정체성이 드러나는 활동 방향을 점검합니다.", icon: studentCategories[4].icon },
            ].map(feature => (
              <article className="student-category login-feature" key={feature.title}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={feature.icon} /></svg>
                <span className="student-category-copy"><strong>{feature.title}</strong><span>{feature.description}</span></span>
              </article>
            ))}
          </div>
          <p className="login-footer">학생은 활동 기록과 분석을, 선생님은 학생 조회와 과제 전달을 이용할 수 있습니다.</p>
        </section>
      </main>
    );
}
