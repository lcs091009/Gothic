import "./StudentHome.css";

import { studentCategories } from "../config/studentCategories";

export default function StudentHome({ headingRef, name, academicProfile, isAcademicProfileLoading, recordsCount, materialsCount, onNavigate }) {
  return (
    <section className="student-home" aria-labelledby="student-home-title">
      <p className="student-eyebrow">나의 활동 공간</p>
      <h2 id="student-home-title" ref={headingRef} tabIndex={-1}>{name ? `${name}님, 반가워요.` : "오늘은 무엇을 해볼까요?"}</h2>
      <p className="student-intro">작은 활동부터 하나씩, 나만의 기록을 쌓아보세요.</p>
      <div className="student-summary" aria-label="활동 현황">
        <span>내 기록 <strong>{recordsCount}</strong></span>
        <span>선생님 자료 <strong>{materialsCount}</strong></span>
      </div>
      {!isAcademicProfileLoading && !academicProfile && (
        <p className="student-setup-note">처음이라면 ‘학년 / 선택과목’에서 내 정보를 설정해 주세요.</p>
      )}
      <nav className="student-category-grid" aria-label="학생 메뉴">
        {studentCategories.map(category => (
          <button key={category.id} type="button" className="student-category" onClick={() => onNavigate(category.id)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={category.icon} /></svg>
            <span className="student-category-copy"><strong>{category.title}</strong><span>{category.description}</span></span>
            <span className="student-category-arrow" aria-hidden="true">↗</span>
          </button>
        ))}
      </nav>
    </section>
  );
}
