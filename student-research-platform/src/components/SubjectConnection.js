import {createElement} from "react";
export default function SubjectConnection({sources=[],subject=""}) {
  const source=sources.length ? sources.map(item=>`${item.subject}(${item.topic})`).join(" · "):"선택한 활동·자료";
  return createElement("small",{className:"exploration-subject-connection"},
    createElement("span",null,source),createElement("span",{"aria-hidden":true}," → "),createElement("span",null,subject || "연결할 과목"));
}
