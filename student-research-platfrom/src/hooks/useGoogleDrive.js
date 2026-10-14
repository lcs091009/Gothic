import { uploadDriveFile, shareDriveFileWithTokenRefresh, mergeDriveAttachments, validatePickedFiles, MAX_DRIVE_ATTACHMENTS } from "../lib/googleDriveFiles";
const scriptRequests = new Map();
import { requestDriveAccessToken } from "../lib/googleDriveAuth";
import { getGooglePickerConfigError } from "../lib/googlePickerConfig";
import { getDriveAccount, assertDriveAccount } from "../lib/googleDriveAccount";
import { pendingLoginDriveToken } from "../lib/loginDriveToken";
import { useCallback, useEffect, useRef, useState } from "react";

export function useGoogleDrive({ setMessage, userId, multiple = false, initialAttachments = [] }) {
  const [attachments, setAttachments] = useState(() => mergeDriveAttachments([], initialAttachments));
  const attachmentsRef = useRef(attachments);
  const attachmentOwner = useRef(userId);
  const [fileProgress, setFileProgress] = useState("");
  const [driveFileId, setDriveFileId] = useState(attachments[0]?.id || "");
  const [driveFileName, setDriveFileName] = useState(attachments[0]?.name || "");
  const [driveFileUrl, setDriveFileUrl] = useState(attachments[0]?.url || "");
  const [isPickerLoading, setIsPickerLoading] = useState(false);
  const [isPickerOpen,setIsPickerOpen]=useState(false);
  const [driveAccountEmail,setDriveAccountEmail]=useState("");
  const pickerRef=useRef(null),pickerVersion=useRef(0),lastPickerOptions=useRef({});
  const closeGooglePicker=useCallback(()=>{
    ++pickerVersion.current;
    pickerRef.current?.setVisible(false);pickerRef.current=null;
    setIsPickerOpen(false);setIsPickerLoading(false);
  },[]);
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
  const driveAccount = useRef(null);
  const identityToken = useRef("");
  const clearDriveSession = useCallback(({ keepAttachments = false } = {}) => {
    closeGooglePicker();setDriveAccountEmail("");
    fileOperation.current?.abort();
    sharedRecipients.current.clear();
    googleAccessTokenRef.current = "";
    googleTokenExpiresAtRef.current = 0;
    driveAccount.current = null; identityToken.current = "";
    googleAuthRequestRef.current?.abort();
    googleAuthRequestRef.current = null;
    for (const key of ["googleDriveAccessToken", "googleDriveTokenExpiresAt", "googleDriveUserId", "googleDriveAccountEmail", "googleDriveClientId"]) {
      window.sessionStorage.removeItem(key);
    }
    if (!keepAttachments) {
      attachmentsRef.current = []; setAttachments([]);
      setDriveFileId(""); setDriveFileName(""); setDriveFileUrl("");
    }
  }, [closeGooglePicker]);
  useEffect(() => {
    mounted.current = true;
    if (import.meta.env.VITE_GOOGLE_CLIENT_ID) loadScript("https://accounts.google.com/gsi/client").catch(() => {});
    if (userId && window.sessionStorage.getItem("googleDriveUserId") && (window.sessionStorage.getItem("googleDriveUserId") !== userId || window.sessionStorage.getItem("googleDriveClientId") !== import.meta.env.VITE_GOOGLE_CLIENT_ID)) clearDriveSession({ keepAttachments: attachmentOwner.current === userId });
    attachmentOwner.current = userId;
    return () => { mounted.current = false;closeGooglePicker();fileOperation.current?.abort(); googleAccessTokenRef.current = ""; googleAuthRequestRef.current?.abort(); };
  }, [userId, clearDriveSession,closeGooglePicker]);

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

async function getGoogleAccessToken({ forceConsent = false, selectAccount = false } = {}) {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  if (!googleClientId) {
    throw new Error(
      "Google Picker 설정이 필요합니다. .env의 VITE_GOOGLE_CLIENT_ID를 확인하세요."
    );
  }

  const loginToken = pendingLoginDriveToken(userId);
  if (loginToken && !forceConsent && !selectAccount) {
    if (!await loginToken) throw new Error("Google Drive 접근 승인이 필요합니다. Google Drive 버튼을 다시 눌러 주세요.");
    // The verified token is now cached; no new authorization popup is needed.
  }

  // Safari requires authorization to start in the original button gesture.
  // If the SDK is still loading, prepare it and ask for a fresh click instead.

  if (!mounted.current || userId !== currentUserRef.current) throw new Error("계정이 변경되었습니다. 다시 선택해 주세요.");
  const now = Date.now();
  const savedToken = window.sessionStorage.getItem("googleDriveUserId") === userId && window.sessionStorage.getItem("googleDriveClientId") === googleClientId
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

  if (hasValidToken && !forceConsent && !selectAccount) {
    if (identityToken.current !== googleAccessTokenRef.current) {
      driveAccount.current = await getDriveAccount(googleAccessTokenRef.current, { signal: AbortSignal.timeout(15_000) });
      if (!mounted.current || userId !== currentUserRef.current) throw new Error("계정이 변경되었습니다.");
      identityToken.current = googleAccessTokenRef.current;
    }
    setDriveAccountEmail(driveAccount.current?.email || "");
    return googleAccessTokenRef.current;
  }

  googleAuthRequestRef.current?.abort();
  if (!window.google?.accounts?.oauth2) {
    await loadScript("https://accounts.google.com/gsi/client");
    throw new Error("Google 연결 준비가 끝났습니다. 버튼을 다시 눌러 주세요.");
  }
  if (navigator.userActivation && !navigator.userActivation.isActive) {
    const error = new Error("Google 인증을 갱신해야 합니다. ‘Google Drive’ 또는 ‘Google 계정 다시 연결’ 버튼을 눌러 주세요. 첨부와 입력은 유지됩니다.");
    error.scope = "driveSharing";
    throw error;
  }
  const controller = new AbortController();
  googleAuthRequestRef.current = controller;
  try {
    const owner = userId;
    const tokenResponse = await requestDriveAccessToken({
      oauth2: window.google.accounts.oauth2,
      clientId: googleClientId,
      forceConsent, selectAccount,
      loginHint: window.sessionStorage.getItem("googleDriveAccountEmail") || "",
      signal: controller.signal,
    });
    if (!mounted.current || owner !== currentUserRef.current) throw new Error("계정이 변경되었습니다. 다시 선택해 주세요.");
    const accessToken = tokenResponse.access_token;
    const account = await getDriveAccount(accessToken, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
    if (!mounted.current || owner !== currentUserRef.current) throw new Error("계정이 변경되었습니다. 다시 선택해 주세요.");
    driveAccount.current = account; identityToken.current = accessToken;
    setDriveAccountEmail(account.email);
    const expiresAt = Date.now() + Number(tokenResponse.expires_in || 3600) * 1000;
    googleAccessTokenRef.current = accessToken;
    googleTokenExpiresAtRef.current = expiresAt;
    window.sessionStorage.setItem("googleDriveUserId", userId);
    window.sessionStorage.setItem("googleDriveClientId", googleClientId);
    window.sessionStorage.setItem("googleDriveAccountEmail", account.email);
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
async function openGooglePicker({ uploadFirst = false, selectAccount = false } = {}) {
  closeGooglePicker();
  const version=pickerVersion.current;
  lastPickerOptions.current={uploadFirst};
  const googleApiKey = import.meta.env.VITE_GOOGLE_API_KEY;
  const googleAppId = import.meta.env.VITE_GOOGLE_APP_ID;
  const configError = getGooglePickerConfigError({ googleApiKey, googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID, googleAppId });
  if (configError) {
    setMessage(configError);
    return;
  }
  pickerScrollYRef.current = window.scrollY;

  setMessage("");
  setIsGoogleAuthLoading(true);
  setIsPickerLoading(false);

  try {
    const accessToken = await getGoogleAccessToken({selectAccount});
    const pickerAccount = driveAccount.current;
    await loadGooglePickerLibraries();
    if(!mounted.current || version!==pickerVersion.current || userId!==currentUserRef.current) return;

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
      .addView(uploadFirst ? uploadView : docsView)
      .addView(uploadFirst ? docsView : uploadView)
      .setCallback(async (data) => {
        if (!mounted.current || userId !== currentUserRef.current || version!==pickerVersion.current) return;
        if (data.action === window.google.picker.Action.PICKED) {
          try {
            const files = (data.docs || []).map(file => ({ id: file.id, name: file.name || file.title, url: file.url, accountId: pickerAccount.id }));
            mergeDriveAttachments(multiple ? attachmentsRef.current : [], files);
            setMessage("선택한 파일의 접근 권한을 확인하고 있습니다…");
            const controller = new AbortController(); fileOperation.current = controller;
            await validatePickedFiles(files, accessToken, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
            if (!mounted.current || userId !== currentUserRef.current || version!==pickerVersion.current) return;
            appendFiles(files);
            setMessage(`${attachmentsRef.current.length}개 파일을 첨부했습니다.`);
          } catch (error) { if (mounted.current && userId === currentUserRef.current && version===pickerVersion.current) setMessage(error.name === "AbortError" ? "파일 접근 확인을 완료하지 못했습니다. 다시 선택해 주세요." : error.message); }

        }

        if (
          data.action === window.google.picker.Action.PICKED ||
          data.action === window.google.picker.Action.CANCEL
        ) {
          if(version!==pickerVersion.current) return;
          closeGooglePicker();
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
    pickerRef.current=picker;
    setIsPickerOpen(true);
    picker.setVisible(true);

    window.requestAnimationFrame(() => {
      window.scrollTo({
        top: pickerScrollYRef.current,
        behavior: "auto",
      });
    });

  } catch (error) {
    if(!mounted.current || version!==pickerVersion.current) return;
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
    const uploadAccount = driveAccount.current;
    if (!mounted.current || owner !== currentUserRef.current) throw new Error("계정이 변경되었습니다.");
    for (const [index, file] of selected.entries()) {
      setFileProgress(`${index + 1}/${selected.length} · ${file.name}`);
      const result = await uploadDriveFile(file, accessToken, { signal: controller.signal,
        onProgress: (done, total) => { if (mounted.current) setFileProgress(`${index + 1}/${selected.length} · ${Math.round(done / (total || 1) * 100)}%`); } });
      if (!mounted.current || owner !== currentUserRef.current) return;
      appendFiles([{ ...result, accountId: uploadAccount.id }]);
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
  let token = await getGoogleAccessToken();
  assertDriveAccount(driveAccount.current, files);
  if (!mounted.current || owner !== currentUserRef.current) throw new Error("계정이 변경되었습니다.");

  const timeout = setTimeout(() => controller.abort(), 600_000);
  try {
    for (const [index, file] of files.entries()) {
      if (!sharedRecipients.current.has(file.id)) sharedRecipients.current.set(file.id, new Set());
      const options = { signal: controller.signal, completed: sharedRecipients.current.get(file.id),
        onProgress: (done, total) => onProgress?.(index * total + done, files.length * total) };
      try { token = await shareDriveFileWithTokenRefresh(file.id, emails, token, async () => {
        const nextToken = await getGoogleAccessToken({ forceConsent: true });
        assertDriveAccount(driveAccount.current, files);
        if (!mounted.current || owner !== currentUserRef.current) throw new Error("계정이 변경되었습니다.");
        return nextToken;
      }, options); } catch (error) {
        if (error.scope === "driveSharing" && file.name && !error.message.startsWith(`${file.name}:`)) error.message = `${file.name}: ${error.message}`;
        throw error;
      }

    }
  } catch (error) {
    if (error.name === "AbortError") throw new Error("파일 공유 시간이 초과됐습니다. 다시 전달하면 완료된 학생은 건너뜁니다.");
    throw error;
  } finally { clearTimeout(timeout); }

}

async function reconnectGoogleDrive() {
  clearDriveSession({ keepAttachments: true });
  setIsGoogleAuthLoading(true); setMessage("");
  try {
    await getGoogleAccessToken({ forceConsent: true, selectAccount: true });
    setMessage("Google 계정을 다시 연결했습니다. 첨부는 유지됩니다. 다시 전달해 주세요.");
  } catch (error) { setMessage(error.message || "Google 계정 연결에 실패했습니다."); }
  finally { setIsGoogleAuthLoading(false); }
}

function switchPickerAccount() {
  return openGooglePicker({...lastPickerOptions.current,selectAccount:true});
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


  return { driveFileId, driveFileName, driveFileUrl, isPickerLoading, isPickerOpen,driveAccountEmail,switchPickerAccount,closeGooglePicker,isGoogleAuthLoading, isUploadDragging, isUploadingFile, setDriveFileId, setDriveFileName, setDriveFileUrl, openGooglePicker, handleUploadDragOver, handleUploadDragLeave, handleUploadDrop, clearDriveSession, uploadLocalFile: uploadDroppedFileToGoogleDrive, shareSelectedFile, attachments, removeAttachment, reconnectGoogleDrive, fileProgress, cancelUpload: () => fileOperation.current?.abort() };
}
