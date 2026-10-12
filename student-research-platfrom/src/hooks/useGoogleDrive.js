import { uploadDriveFile, shareDriveFile, mergeDriveAttachments, MAX_DRIVE_ATTACHMENTS } from "../lib/googleDriveFiles";
const scriptRequests = new Map();
import { requestDriveAccessToken } from "../lib/googleDriveAuth";
import { getGooglePickerConfigError } from "../lib/googlePickerConfig";
import { useCallback, useEffect, useRef, useState } from "react";

export function useGoogleDrive({ setMessage, userId, multiple = false }) {
  const [attachments, setAttachments] = useState([]);
  const attachmentsRef = useRef([]);
  const [fileProgress, setFileProgress] = useState("");
  const [driveFileId, setDriveFileId] = useState("");
  const [driveFileName, setDriveFileName] = useState("");
  const [driveFileUrl, setDriveFileUrl] = useState("");
  const [isPickerLoading, setIsPickerLoading] = useState(false);
  const [isGoogleAuthLoading, setIsGoogleAuthLoading] = useState(false);
  const [isUploadDragging, setIsUploadDragging] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const mounted = useRef(true);
  const uploadLock = useRef(false);
  const currentUserRef = useRef(userId);
  currentUserRef.current = userId;
  const fileOperation = useRef(null);
  const sharedRecipients = useRef(new Map());
  const pickerScrollYRef = useRef(0);
  const googleAccessTokenRef = useRef("");
  const googleTokenExpiresAtRef = useRef(0);
  const googleAuthRequestRef = useRef(null);
  const clearDriveSession = useCallback(() => {
    fileOperation.current?.abort();
    sharedRecipients.current.clear();
    googleAccessTokenRef.current = "";
    googleTokenExpiresAtRef.current = 0;
    googleAuthRequestRef.current?.abort();
    googleAuthRequestRef.current = null;
    for (const key of ["googleDriveAccessToken", "googleDriveTokenExpiresAt", "googleDriveUserId"]) {
      window.sessionStorage.removeItem(key);
    }
    attachmentsRef.current = []; setAttachments([]);
    setDriveFileId(""); setDriveFileName(""); setDriveFileUrl("");
  }, []);
  useEffect(() => {
    mounted.current = true;
    if (import.meta.env.VITE_GOOGLE_CLIENT_ID) loadScript("https://accounts.google.com/gsi/client").catch(() => {});
    if (window.sessionStorage.getItem("googleDriveUserId") !== userId) clearDriveSession();
    return () => { mounted.current = false; fileOperation.current?.abort(); googleAccessTokenRef.current = ""; googleAuthRequestRef.current?.abort(); };
  }, [userId, clearDriveSession]);

function loadScript(src) {
  if ((src.includes("apis.google.com") && window.gapi) || (src.includes("accounts.google.com") && window.google?.accounts?.oauth2)) return Promise.resolve();
  if (scriptRequests.has(src)) return scriptRequests.get(src);
  const request = new Promise((resolve, reject) => {
    let script = document.querySelector(`script[src="${src}"]`);
    const isNew = !script;
    if (isNew) { script = document.createElement("script"); script.src = src; script.async = true; }
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener("error", () => { script.remove(); scriptRequests.delete(src); reject(new Error("Google 파일 서비스를 불러오지 못했습니다.")); }, { once: true });
    if (isNew) document.body.appendChild(script);
  });
  scriptRequests.set(src, request);
  return request;
}

async function loadGooglePickerLibraries() {
  await Promise.all([
    loadScript("https://apis.google.com/js/api.js"),
    loadScript("https://accounts.google.com/gsi/client"),
  ]);

  await new Promise((resolve) => {
    window.gapi.load("picker", resolve);
  });
}

async function getGoogleAccessToken({ forceConsent = false } = {}) {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  if (!googleClientId) {
    throw new Error(
      "Google Picker 설정이 필요합니다. .env의 VITE_GOOGLE_CLIENT_ID를 확인하세요."
    );
  }

  await loadScript("https://accounts.google.com/gsi/client");

  if (!mounted.current || userId !== currentUserRef.current) throw new Error("계정이 변경되었습니다. 다시 선택해 주세요.");
  const now = Date.now();
  const savedToken = window.sessionStorage.getItem("googleDriveUserId") === userId
    ? window.sessionStorage.getItem("googleDriveAccessToken") || "" : "";
  const savedExpiresAt = Number(
    window.sessionStorage.getItem("googleDriveTokenExpiresAt") || 0
  );

  if (savedToken && savedExpiresAt > now + 60_000) {
    googleAccessTokenRef.current = savedToken;
    googleTokenExpiresAtRef.current = savedExpiresAt;
  }

  const hasValidToken =
    googleAccessTokenRef.current &&
    googleTokenExpiresAtRef.current &&
    googleTokenExpiresAtRef.current > now + 60_000;

  if (hasValidToken && !forceConsent) {
    return googleAccessTokenRef.current;
  }

  googleAuthRequestRef.current?.abort();
  const controller = new AbortController();
  googleAuthRequestRef.current = controller;
  try {
    const owner = userId;
    const tokenResponse = await requestDriveAccessToken({
      oauth2: window.google.accounts.oauth2,
      clientId: googleClientId,
      forceConsent,
      signal: controller.signal,
    });
    if (!mounted.current || owner !== currentUserRef.current) throw new Error("계정이 변경되었습니다. 다시 선택해 주세요.");
    const accessToken = tokenResponse.access_token;
    const expiresAt = Date.now() + Number(tokenResponse.expires_in || 3600) * 1000;
    googleAccessTokenRef.current = accessToken;
    googleTokenExpiresAtRef.current = expiresAt;
    window.sessionStorage.setItem("googleDriveUserId", userId);
    window.sessionStorage.setItem("googleDriveAccessToken", accessToken);
    window.sessionStorage.setItem("googleDriveTokenExpiresAt", String(expiresAt));
    return accessToken;
  } finally {
    if (googleAuthRequestRef.current === controller) googleAuthRequestRef.current = null;
  }
}

function appendFiles(files) {
  const next = multiple ? mergeDriveAttachments(attachmentsRef.current, files) : mergeDriveAttachments([], files.slice(0, 1));
  attachmentsRef.current = next; setAttachments(next);
  const first = next[0]; setDriveFileId(first?.id || ""); setDriveFileName(first?.name || ""); setDriveFileUrl(first?.url || "");
}
function removeAttachment(id) {
  const next = attachmentsRef.current.filter(file => file.id !== id);
  attachmentsRef.current = next; setAttachments(next);
  const first = next[0]; setDriveFileId(first?.id || ""); setDriveFileName(first?.name || ""); setDriveFileUrl(first?.url || "");
}
async function openGooglePicker() {
  const googleApiKey = import.meta.env.VITE_GOOGLE_API_KEY;
  const googleAppId = import.meta.env.VITE_GOOGLE_APP_ID;
  const configError = getGooglePickerConfigError({ googleApiKey, googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID });
  if (configError || !/^\d+$/.test(googleAppId || "")) {
    setMessage(configError || "Google 파일 선택 서비스 설정이 필요합니다. 관리자에게 문의해 주세요.");
    return;
  }
  pickerScrollYRef.current = window.scrollY;

  setMessage("");
  setIsGoogleAuthLoading(true);
  setIsPickerLoading(false);

  try {
    const accessToken = await getGoogleAccessToken();
    await loadGooglePickerLibraries();

    setIsGoogleAuthLoading(false);
    setIsPickerLoading(true);

    const uploadView = new window.google.picker.DocsUploadView();

    const docsView = new window.google.picker.DocsView()
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false);

    const builder = new window.google.picker.PickerBuilder()
      .setOAuthToken(accessToken)
      .setDeveloperKey(googleApiKey)
      .setAppId(googleAppId)
      .addView(docsView)
      .addView(uploadView)
      .setCallback((data) => {
        if (!mounted.current || userId !== currentUserRef.current) return;
        if (data.action === window.google.picker.Action.PICKED) {
          try {
            appendFiles((data.docs || []).map(file => ({ id: file.id, name: file.name || file.title, url: file.url })));
            setMessage(`${attachmentsRef.current.length}개 파일을 첨부했습니다.`);
          } catch (error) { setMessage(error.message); }

        }

        if (
          data.action === window.google.picker.Action.PICKED ||
          data.action === window.google.picker.Action.CANCEL
        ) {
          setIsGoogleAuthLoading(false);
          setIsPickerLoading(false);

          window.requestAnimationFrame(() => {
            window.scrollTo({
              top: pickerScrollYRef.current,
              behavior: "auto",
            });
          });
        }
      })
      ;
    if (multiple) builder.enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED);
    const picker = builder.build();
    picker.setVisible(true);

    window.requestAnimationFrame(() => {
      window.scrollTo({
        top: pickerScrollYRef.current,
        behavior: "auto",
      });
    });

  } catch (error) {
    setMessage(error.message || "Google Picker를 여는 중 오류가 발생했습니다.");
    setIsGoogleAuthLoading(false);
    setIsPickerLoading(false);

    window.requestAnimationFrame(() => {
      window.scrollTo({
        top: pickerScrollYRef.current,
        behavior: "auto",
      });
    });
  }
}

async function uploadDroppedFileToGoogleDrive(input) {
  const files = Array.isArray(input) ? input : [input];
  const selected = multiple ? files.filter(Boolean) : files.filter(Boolean).slice(0, 1);
  if (!selected.length || uploadLock.current) return;
  if (multiple && attachmentsRef.current.length + selected.length > MAX_DRIVE_ATTACHMENTS) { setMessage(`파일은 최대 ${MAX_DRIVE_ATTACHMENTS}개까지 첨부할 수 있습니다.`); return; }
  uploadLock.current = true;
  setMessage(""); setIsUploadingFile(true);
  const owner = userId;
  const controller = new AbortController(); fileOperation.current = controller;
  try {
    const accessToken = await getGoogleAccessToken();
    if (!mounted.current || owner !== currentUserRef.current) throw new Error("계정이 변경되었습니다.");
    for (const [index, file] of selected.entries()) {
      setFileProgress(`${index + 1}/${selected.length} · ${file.name}`);
      const result = await uploadDriveFile(file, accessToken, { signal: controller.signal,
        onProgress: (done, total) => { if (mounted.current) setFileProgress(`${index + 1}/${selected.length} · ${Math.round(done / (total || 1) * 100)}%`); } });
      if (!mounted.current || owner !== currentUserRef.current) return;
      appendFiles([result]);
    }
    setMessage(`${attachmentsRef.current.length}개 파일을 첨부했습니다.`);
  } catch (error) { if (mounted.current && owner === currentUserRef.current) setMessage(error.name === "AbortError" ? "업로드를 중단했습니다. 완료한 첨부는 유지됩니다." : error.message || "파일 업로드에 실패했습니다."); }
  finally { uploadLock.current = false; setIsUploadingFile(false); setFileProgress(""); }
}

async function shareSelectedFile(emails, onProgress) {
  const files = multiple ? attachmentsRef.current : [{ id: driveFileId }];
  if (!files.length || !files[0].id) return;
  const owner = userId;
  const controller = new AbortController(); fileOperation.current = controller;
  const token = await getGoogleAccessToken();
  if (!mounted.current || owner !== currentUserRef.current) throw new Error("계정이 변경되었습니다.");

  const timeout = setTimeout(() => controller.abort(), 600_000);
  try {
    for (const [index, file] of files.entries()) {
      if (!sharedRecipients.current.has(file.id)) sharedRecipients.current.set(file.id, new Set());
      await shareDriveFile(file.id, emails, token, { signal: controller.signal, completed: sharedRecipients.current.get(file.id),
        onProgress: (done, total) => onProgress?.(index * total + done, files.length * total) });
    }
  } catch (error) {
    if (error.name === "AbortError") throw new Error("파일 공유 시간이 초과됐습니다. 다시 전달하면 완료된 학생은 건너뜁니다.");
    throw error;
  } finally { clearTimeout(timeout); }

}

function handleUploadDragOver(event) {
  event.preventDefault();
  setIsUploadDragging(true);
}

function handleUploadDragLeave(event) {
  event.preventDefault();

  const nextTarget = event.relatedTarget;

  if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
    setIsUploadDragging(false);
  }
}

function handleUploadDrop(event) {
  event.preventDefault();
  setIsUploadDragging(false);

  const droppedFile = Array.from(event.dataTransfer.files || []);

  if (!droppedFile.length) {
    setMessage("드롭된 파일을 찾지 못했습니다.");
    return;
  }

  uploadDroppedFileToGoogleDrive(droppedFile);
}


  return { driveFileId, driveFileName, driveFileUrl, isPickerLoading, isGoogleAuthLoading, isUploadDragging, isUploadingFile, setDriveFileId, setDriveFileName, setDriveFileUrl, openGooglePicker, handleUploadDragOver, handleUploadDragLeave, handleUploadDrop, clearDriveSession, uploadLocalFile: uploadDroppedFileToGoogleDrive, shareSelectedFile, attachments, removeAttachment, fileProgress, cancelUpload: () => fileOperation.current?.abort() };
}
