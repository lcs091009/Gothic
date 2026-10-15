export default function AttachmentLinks({ file }) {
  const attachments = Array.isArray(file.attachments) && file.attachments.length
    ? file.attachments : file.file_url ? [{ url: file.file_url, name: "첨부파일 열기" }] : [];
  return <div className="attachment-links">{attachments.filter(item => /^https?:\/\//i.test(item.url || "")).map((item, index) =>
    <a key={item.id || index} className="teacher-link" href={item.url} target="_blank" rel="noreferrer">{item.name || `첨부파일 ${index + 1}`} <span aria-hidden="true">↗</span></a>
  )}</div>;
}
