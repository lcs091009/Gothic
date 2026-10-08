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
  const pickerScrollYRef = useRef(0);
  const googleAccessTokenRef = useRef("");
  const googleTokenExpiresAtRef = useRef(0);
  const googleAuthRequestRef = useRef(null);
  const clearDriveSession = useCallback(() => {
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
    if (window.sessionStorage.getItem("googleDriveUserId") !== userId) clearDriveSession();
    return () => { googleAccessTokenRef.current = ""; googleAuthRequestRef.current?.abort(); };
  }, [userId, clearDriveSession]);

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${src}"]`);

    if (existingScript) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.body.appendChild(script);
  });
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

  await loadGooglePickerLibraries();

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
    const tokenResponse = await requestDriveAccessToken({
      oauth2: window.google.accounts.oauth2,
      clientId: googleClientId,
      forceConsent,
      signal: controller.signal,
    });
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

    setIsPickerLoading(false);
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
  if (!file) {
    return;
  }

  setMessage("");
  setIsUploadingFile(true);

  try {
    const accessToken = await getGoogleAccessToken();

    const metadata = {
      name: file.name,
      mimeType: file.type || "application/octet-stream",
    };

    const formData = new FormData();

    formData.append(
      "metadata",
      new Blob([JSON.stringify(metadata)], {
        type: "application/json",
      })
    );

    formData.append("file", file);

    const uploadResponse = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      }
    );

    const uploadedFile = await uploadResponse.json();

    if (!uploadResponse.ok) {
      throw new Error(
        uploadedFile?.error?.message || "Google Drive 업로드에 실패했습니다."
      );
    }

    setDriveFileId(uploadedFile.id || "");
    setDriveFileName(uploadedFile.name || file.name);
    setDriveFileUrl(uploadedFile.webViewLink || "");

    setMessage(`Google Drive에 업로드되었습니다: ${uploadedFile.name || file.name}`);
  } catch (error) {
    setMessage(error.message || "파일 업로드 중 오류가 발생했습니다.");
  } finally {
    setIsUploadingFile(false);
  }
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


  return { driveFileId, driveFileName, driveFileUrl, isPickerLoading, isGoogleAuthLoading, isUploadDragging, isUploadingFile, setDriveFileId, setDriveFileName, setDriveFileUrl, openGooglePicker, handleUploadDragOver, handleUploadDragLeave, handleUploadDrop, clearDriveSession };
}
