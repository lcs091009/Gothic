import styles from "../styles/appStyles";

export default function StudentPage({ section = "register", onNavigate, grade, setGrade, semester, setSemester, subject, setSubject, title, setTitle, content, setContent, handleSubmitResearchRecord, isUploadDragging, handleUploadDragOver, handleUploadDragLeave, handleUploadDrop, openGooglePicker, isPickerLoading, isUploadingFile, isGoogleAuthLoading, driveFileName, driveFileUrl, isSubmitting, records, handleDeleteResearchRecord, deletingRecordId, loadTeacherSharedFiles, session, isLoadingTeacherSharedFiles, teacherSharedFiles }) {
  return (
          <>
            {section === "register" && <section style={styles.box}>
              <h2 style={styles.subTitle}>활동 기록 등록</h2>

              <p style={styles.text}>
                지난 학기나 작년에 했던 수행평가·발표·탐구·독서·동아리 활동을
                과목별로 등록하세요. 이후 활동 흐름 분석에서 현재 선택과목과
                연결 가능한 다음 활동 방향을 정리할 수 있습니다.
              </p>

              <form onSubmit={handleSubmitResearchRecord} style={styles.form}>
                <div style={styles.row}>
                  <div style={styles.field}>
                    <label style={styles.label}>학년</label>
                    <select
                      value={grade}
                      onChange={(event) => setGrade(event.target.value)}
                      style={styles.input}
                    >
                      <option>1학년</option>
                      <option>2학년</option>
                      <option>3학년</option>
                    </select>
                  </div>

                  <div style={styles.field}>
                    <label style={styles.label}>학기</label>
                    <select
                      value={semester}
                      onChange={(event) => setSemester(event.target.value)}
                      style={styles.input}
                    >
                      <option>1학기</option>
                      <option>2학기</option>
                      <option>지난 학기</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={styles.label}>과목</label>
                  <input
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    placeholder="예: 생명과학, 화학, 영어, 통합사회"
                    style={styles.input}
                  />
                </div>

                <div>
                  <label style={styles.label}>활동 제목</label>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="예: 온도에 따른 효소 반응 속도 탐구"
                    style={styles.input}
                  />
                </div>

                <div>
                  <label style={styles.label}>활동 내용 요약</label>
                  <textarea
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    placeholder="무엇을 했는지, 어떤 과목 개념과 연결되었는지, 알게 된 점, 아쉬웠던 점, 새로 생긴 궁금증을 함께 적어 주세요."
                    rows={7}
                    style={styles.textarea}
                  />
                </div>

                <div
                  className={`upload-drop-zone ${
                    isUploadDragging ? "upload-drop-zone-active" : ""
                  }`}
                  style={{
                    ...styles.driveUploadBox,
                    ...(isUploadDragging ? styles.driveUploadBoxActive : {}),
                  }}
                  onDragOver={handleUploadDragOver}
                  onDragLeave={handleUploadDragLeave}
                  onDrop={handleUploadDrop}
                >
                  <div className="upload-icon-bubble" aria-hidden="true">
                    ↑
                  </div>

                  <label style={styles.label}>Google Drive 파일 선택/업로드</label>

                  <p style={styles.smallText}>
                    버튼을 누르면 기존 Google Drive 파일을 선택할 수 있고, 파일을 이 영역에
                    끌어다 놓으면 Google Drive에 바로 업로드됩니다.
                  </p>

                  <button
                    className="animated-button"
                    type="button"
                    onClick={openGooglePicker}
                    disabled={isPickerLoading || isUploadingFile || isGoogleAuthLoading}
                    style={styles.driveButton}
                  >
                    {isUploadingFile ? (
                      <>
                        Google Drive 업로드 중
                        <span className="button-dots" aria-hidden="true">
                          <span />
                          <span />
                          <span />
                        </span>
                      </>
                    ) : isGoogleAuthLoading ? (
                      <>
                        Google 로그인 확인 중
                        <span className="button-dots" aria-hidden="true">
                          <span />
                          <span />
                          <span />
                        </span>
                      </>
                    ) : isPickerLoading ? (
                      <>
                        Google Picker 여는 중
                        <span className="button-dots" aria-hidden="true">
                          <span />
                          <span />
                          <span />
                        </span>
                      </>
                    ) : (
                      "Google Drive에서 파일 선택/업로드"
                    )}
                  </button>

                  {driveFileName && (
                    <div style={styles.selectedFileBox}>
                      <p style={styles.fileNameText}>선택된 파일: {driveFileName}</p>

                      {driveFileUrl && (
                        <a
                          href={driveFileUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={styles.link}
                        >
                          선택한 파일 열기
                        </a>
                      )}
                    </div>
                  )}
                </div>

                <button
                  className="animated-button"
                  type="submit"
                  disabled={isSubmitting}
                  style={styles.button}
                >
                  {isSubmitting ? (
                    <>
                      저장 중
                      <span className="button-dots" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                      </span>
                    </>
                  ) : (
                    "활동 기록 저장"
                  )}
                </button>
              </form>
            </section>}

            {section === "records" && <section style={styles.box}>
              <h2 style={styles.subTitle}>내 활동 기록</h2>

              {records.length === 0 ? (
                <div className="student-empty-state">
                  <p style={styles.text}>아직 저장된 활동 기록이 없습니다.</p>
                  <button type="button" className="student-back" onClick={() => onNavigate("register")}>첫 활동 등록하기 →</button>
                </div>
              ) : (
                <div style={styles.recordList}>
                  {records.map((record) => (
                    <article key={record.id} style={styles.recordCard}>
                      <div style={styles.badgeRow}>
                        <span style={styles.badge}>{record.grade}</span>
                        <span style={styles.badge}>{record.semester}</span>
                        <span style={styles.badge}>{record.subject}</span>
                      </div>

                      <h3 style={styles.recordTitle}>{record.title}</h3>

                      <details className="student-record-details">
                        <summary>활동 내용 보기</summary>
                        <p style={styles.recordContent}>{record.content}</p>
                      </details>

                      {record.drive_file_name && (
                        <p style={styles.fileNameText}>
                          업로드한 파일: {record.drive_file_name}
                        </p>
                      )}

                      {record.drive_file_url && (
                        <a
                          href={record.drive_file_url}
                          target="_blank"
                          rel="noreferrer"
                          style={styles.link}
                        >
                          Google Drive 파일 열기
                        </a>
                      )}

                      <p style={styles.dateText}>
                        저장 시간:{" "}
                        {new Date(record.created_at).toLocaleString("ko-KR")}
                      </p>

                      <button
                        className="delete-button"
                        type="button"
                        onClick={() => handleDeleteResearchRecord(record.id)}
                        disabled={deletingRecordId === record.id}
                        style={styles.deleteButton}
                      >
                        {deletingRecordId === record.id ? (
                          <>
                            삭제 중
                            <span className="button-dots" aria-hidden="true">
                              <span />
                              <span />
                              <span />
                            </span>
                          </>
                        ) : (
                          "활동 기록 삭제"
                        )}
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>}

            {section === "materials" && <section className="soft-panel" style={styles.box}>
              <div style={styles.sharedFileTitleRow}>
                <div>
                  <h2 style={styles.subTitle}>선생님이 제공한 내 자료</h2>
                  <p style={styles.text}>
                    선생님이 파일명과 학번을 기준으로 연결한 자료입니다. 내가 직접 등록한
                    활동 기록과는 구분해서 확인하세요.
                  </p>
                </div>

                <button
                  className="animated-button"
                  type="button"
                  onClick={() => loadTeacherSharedFiles(session.user.email)}
                  disabled={isLoadingTeacherSharedFiles}
                  style={styles.headerButton}
                >
                  {isLoadingTeacherSharedFiles ? (
                    <>
                      새로고침 중
                      <span className="button-dots" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                      </span>
                    </>
                  ) : (
                    "자료 새로고침"
                  )}
                </button>
              </div>

              {isLoadingTeacherSharedFiles ? (
                <div className="skeleton-panel" style={styles.teacherSharedLoadingBox}>
                  <div className="mini-spinner" aria-hidden="true" />
                  <p style={styles.text}>선생님 제공 자료를 불러오는 중입니다.</p>
                </div>
              ) : teacherSharedFiles.length === 0 ? (
                <div style={styles.emptySharedFileBox}>
                  <p style={styles.text}>아직 선생님이 제공한 자료가 없습니다.</p>
                  <p style={styles.smallText}>
                    선생님이 학번이 포함된 파일명으로 자료를 등록하면 여기에 표시됩니다.
                  </p>
                </div>
              ) : (
                <div style={styles.recordList}>
                  {teacherSharedFiles.map((file) => (
                    <article className="teacher-card" key={file.id} style={styles.recordCard}>
                      <div style={styles.badgeRow}>
                        <span style={styles.badge}>{file.category || "기타"}</span>
                        <span style={styles.badge}>
                          {file.match_status === "matched" ? "자동 매칭" : "확인 필요"}
                        </span>
                      </div>

                      <h3 style={styles.recordTitle}>{file.file_name}</h3>

                      <p style={styles.recordContent}>{file.description}</p>

                      <p style={styles.fileNameText}>
                        제공한 선생님: {file.teacher_email || "알 수 없음"}
                      </p>

                      {file.file_url && (
                        <a
                          href={file.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="teacher-link"
                          style={styles.link}
                        >
                          선생님 제공 파일 열기
                        </a>
                      )}

                      <p style={styles.dateText}>
                        등록 시간: {new Date(file.created_at).toLocaleString("ko-KR")}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>}
          </>
  );
}
