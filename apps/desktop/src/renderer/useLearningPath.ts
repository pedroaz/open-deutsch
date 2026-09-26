import { useCallback, useEffect, useRef, useState } from "react";
import type { DesktopIpcResponse, OpenDeutschError } from "@open-deutsch/contracts";
import { invokeDesktop, normalizeDesktopError, subscribeDesktop } from "./ipc.js";
export type LearningPathSnapshot = Extract<
  DesktopIpcResponse,
  { status: "ok"; channel: "learning-path/read" }
>["result"];
export function useLearningPath() {
  const [snapshot, setSnapshot] = useState<LearningPathSnapshot>();
  const [error, setError] = useState<OpenDeutschError>();
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const value = await invokeDesktop("learning-path/read", {});
      if (current === sequence.current) {
        setSnapshot(value);
        setError(undefined);
      }
    } catch (cause) {
      if (current === sequence.current) setError(normalizeDesktopError(cause).detail);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const unsubscribe = subscribeDesktop((event) => {
      if (event.event === "state-invalidated" && ["dashboard", "history"].includes(event.scope))
        void refresh();
    });
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      sequence.current++;
      unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);
  return { snapshot, error, refresh };
}
