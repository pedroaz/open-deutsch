import type { OpenDeutschDesktopBridge } from "@open-deutsch/contracts";

declare global {
  interface Window {
    openDeutsch: OpenDeutschDesktopBridge;
  }
}

export type RendererDocumentEnvironment = Document;

// @ts-expect-error Renderer code must not inherit Node.js ambient globals.
export type RendererNodeProcessLeak = typeof process;
