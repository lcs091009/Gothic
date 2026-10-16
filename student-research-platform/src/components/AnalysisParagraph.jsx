import ExplorationEmphasis from "./ExplorationEmphasis.js";
export default function AnalysisParagraph({text}) {
  const bullet=/^\s*[-•]\s+/.test(text),clean=text.replace(/^\s*[-•]\s+/,"");
  const colon=clean.indexOf(":");
  return <div className={`analysis-reading-block${bullet ? " is-bullet":""}`}>
    {colon>0 && colon<=24 && !clean.slice(0,colon).includes("**") ? <p><strong className="analysis-block-label">{clean.slice(0,colon)}</strong><ExplorationEmphasis text={clean.slice(colon+1).trim()} /></p>:<p><ExplorationEmphasis text={clean} /></p>}
  </div>;
}
