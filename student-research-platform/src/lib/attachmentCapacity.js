export const MAX_ATTACHMENT_BYTES=500*1024*1024;
export function attachmentBytes(files) {
  return files.reduce((sum,file)=>{const size=file.size ?? 0;if(!Number.isSafeInteger(size)||size<0)throw new Error("첨부파일 용량을 확인해 주세요.");return sum+size;},0);
}
export function assertAttachmentCapacity(files) {
  if(attachmentBytes(files)>MAX_ATTACHMENT_BYTES) throw new Error("선택한 파일의 총용량은 500MB 이하여야 합니다.");
}
