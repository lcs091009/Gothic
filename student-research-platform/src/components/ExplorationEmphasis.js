import {createElement,Fragment} from "react";
export default function ExplorationEmphasis({text=""}) {
  return createElement(Fragment,null,...String(text).split(/(\*\*[^*\n]{1,100}\*\*)/g).map((part,index)=>part.startsWith("**") && part.endsWith("**") ? createElement("strong",{key:index,className:"exploration-highlight"},part.slice(2,-2)):part));
}
