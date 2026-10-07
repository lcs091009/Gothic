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


export default function HomePage({ signInWithGoogle, message }) {
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
            <button type="button" className="student-back" onClick={signInWithGoogle}>로그인</button>
          </header>

          <div className="login-hero">
            <img src="/research-logo.svg" alt="활동 연결 노트 로고" className="login-logo" />
            <p className="student-eyebrow">작년 활동 기반 과목 연결</p>
            <h1 id="login-title">활동 연결 노트</h1>
            <p className="student-intro">
              작년 활동과 현재 선택과목을 연결해 다음 활동 방향을 정리합니다.
              생기부나 보고서를 대신 작성하지 않고, 학생이 스스로 과목 안에서
              이어갈 활동을 설계하도록 돕습니다.
            </p>
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
        </section>
      </main>
    );
}
