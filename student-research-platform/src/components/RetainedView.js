import {createElement,useEffect,useState} from "react";
// Mount on first visit, then hide rather than unmount. The parent keys this
// boundary by authenticated user so state cannot cross accounts.
export default function RetainedView({active,children}) {
  const [visited,setVisited]=useState(active);
  useEffect(()=>{if(active) setVisited(true);},[active]);
  return active || visited ? createElement("div",{className:"retained-view",hidden:!active},children) : null;
}
