import {createPortal} from "react-dom";
import "./PickerAccountBar.css";

export default function PickerAccountBar({open,email,onSwitch,onClose}) {
  if(!open) return null;
  return createPortal(<div className="picker-account-bar" role="region" aria-label="파일 선택 Google 계정"><span><small>파일을 선택할 Google 계정</small><strong>{email || "현재 연결된 계정"}</strong></span><div><button type="button" onClick={onSwitch}>계정 변경</button><button type="button" onClick={onClose} aria-label="파일 선택창 닫기">닫기</button></div></div>,document.body);
}
