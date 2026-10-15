import {useRef,useState} from "react";

const empty={grade:"1학년",semester:"1학기",subject:"",title:"",content:""};
export function useResearchDraft(userId) {
  const scope=useRef({userId});
  const [entry,setEntry]=useState(null);
  // A new owner object also invalidates work from an earlier A → B → A switch.
  if(scope.current.userId!==userId) scope.current={userId};
  const owner=scope.current;
  const values=entry?.owner===owner ? entry.values:empty;
  const isCurrent=()=>scope.current===owner;
  function update(changes) {
    if(!isCurrent()) return;
    setEntry(previous=>!isCurrent() ? previous : {
      owner,values:{...(previous?.owner===owner ? previous.values:empty),...changes}
    });
  }
  return {...values,isCurrent,
    setGrade:value=>update({grade:value}),setSemester:value=>update({semester:value}),
    setSubject:value=>update({subject:value}),setTitle:value=>update({title:value}),setContent:value=>update({content:value})};
}
