import { useMemo, useRef, useState } from "react";
import { createMessageScope } from "../lib/messageScope";

export function useScopedMessage(scope) {
  const controller = useRef(null);
  if (!controller.current) controller.current = createMessageScope(scope);
  const generation = controller.current.activate(scope);
  const [entry, setEntry] = useState(null);
  const setMessage = useMemo(() => controller.current.writer(setEntry, scope, generation), [scope, generation]);
  function transitionMessage(nextScope, text = "") {
    controller.current.activate(nextScope);
    const report = controller.current.writer(setEntry);
    report(text);
    return report;
  }
  return { message: controller.current.visible(entry), setMessage, transitionMessage };
}
