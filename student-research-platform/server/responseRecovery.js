// Read only complete JSON values already present in the response. A cut-off
// string is never completed, and model text is never evaluated as code.
export function recoverResponsePrefix(text) {
  let index=text.indexOf("{"),nodes=0;
  if(index<0 || text.length>100000) return null;
  const space=()=>{while(index<text.length && /\s/.test(text[index])) index++;};
  function string() {
    const start=index++;
    let escaped=false;
    while(index<text.length) {
      const char=text[index++];
      if(escaped) escaped=false;
      else if(char==="\\") escaped=true;
      else if(char==='"') {try{return {value:JSON.parse(text.slice(start,index)),complete:true};}catch{return null;}}
    }
    return null;
  }
  function read(depth) {
    if(depth>8 || ++nodes>1000) return null;
    space();const char=text[index];
    if(char==='"') return string();
    if(char==="{" || char==="[") {
      const object=char==="{",value=object ? Object.create(null):[],closing=object ? "}":"]";
      index++;space();
      while(index<text.length) {
        if(text[index]===closing) {index++;return {value,complete:true};}
        let key;
        if(object) {
          if(text[index]!=='"') return {value,complete:false};
          const name=string();if(!name) return {value,complete:false};key=name.value;space();
          if(text[index++]!==":") return {value,complete:false};
        }
        const child=read(depth+1);
        if(!child) return {value,complete:false};
        if(object) value[key]=child.value;else value.push(child.value);
        if(!child.complete) return {value,complete:false};
        space();if(text[index]===closing) {index++;return {value,complete:true};}
        if(text[index++]!==",") return {value,complete:false};space();
      }
      return {value,complete:false};
    }
    const start=index;while(index<text.length && !/[\s,}\]]/.test(text[index])) index++;
    if(start===index) return null;
    try {return {value:JSON.parse(text.slice(start,index)),complete:true};}catch{return null;}
  }
  const result=read(0);
  return result?.value && !Array.isArray(result.value) && typeof result.value==="object" ? result.value:null;
}
