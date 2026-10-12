import { uploadDriveFile, shareDriveFile } from "../lib/googleDriveFiles";
const scriptRequests = new Map();
import { requestDriveAccessToken } from "../lib/googleDriveAuth";
import { getGooglePickerConfigError } from "../lib/googlePickerConfig";
import { useCallback, useEffect, useRef, useState } from "react";

export function useGoogleDrive({ setMessage, userId }) {
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

    const picker = new window.google.picker.PickerBuilder()
      .setOAuthToken(accessToken)
      .setDeveloperKey(googleApiKey)
      .setAppId(googleAppId)
      .addView(docsView)
      .addView(uploadView)
      .setCallback((data) => {
        if (!mounted.current || userId !== currentUserRef.current) return;
        if (data.action === window.google.picker.Action.PICKED) {
          const file = data.docs[0];

          setDriveFileId(file.id || "");
          setDriveFileName(file.name || file.title || "");
          setDriveFileUrl(file.url || "");

          setMessage(
            `Google Drive 파일이 선택되었습니다: ${
              file.name || file.title || "파일명 없음"
            }`
          );
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
      .build();

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

async function uploadDroppedFileToGoogleDrive(file) {
  if (!file || uploadLock.current) return;
  uploadLock.current = true;
  setMessage(""); setIsUploadingFile(true);
  const owner = userId;
  const controller = new AbortController(); fileOperation.current = controller;
  try {
    const accessToken = await getGoogleAccessToken();
    if (!mounted.current || owner !== currentUserRef.current) throw new Error("계정이 변경되었습니다.");
    const result = await uploadDriveFile(file, accessToken, { signal: controller.signal });
    if (!mounted.current || owner !== currentUserRef.current) return;
    setDriveFileId(result.id); setDriveFileName(result.name); setDriveFileUrl(result.url);
    setMessage(`첨부 완료: ${result.name}`);
  } catch (error) { if (mounted.current && owner === currentUserRef.current) setMessage(error.name === "AbortError" ? "업로드가 취소되었습니다." : error.message || "파일 업로드에 실패했습니다."); }
  finally { uploadLock.current = false; setIsUploadingFile(false); }
}
async function shareSelectedFile(emails, onProgress) {
  if (!driveFileId) return;
  const owner = userId;
  const controller = new AbortController(); fileOperation.current = controller;
  const token = await getGoogleAccessToken();
  if (!mounted.current || owner !== currentUserRef.current) throw new Error("계정이 변경되었습니다.");
  if (!sharedRecipients.current.has(driveFileId)) sharedRecipients.current.set(driveFileId, new Set());
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    await shareDriveFile(driveFileId, emails, token, { signal: controller.signal, completed: sharedRecipients.current.get(driveFileId), onProgress });
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

  const droppedFile = event.dataTransfer.files?.[0];

  if (!droppedFile) {
    setMessage("드롭된 파일을 찾지 못했습니다.");
    return;
  }

  uploadDroppedFileToGoogleDrive(droppedFile);
}


  return { driveFileId, driveFileName, driveFileUrl, isPickerLoading, isGoogleAuthLoading, isUploadDragging, isUploadingFile, setDriveFileId, setDriveFileName, setDriveFileUrl, openGooglePicker, handleUploadDragOver, handleUploadDragLeave, handleUploadDrop, clearDriveSession, uploadLocalFile: uploadDroppedFileToGoogleDrive, shareSelectedFile };
}
