import type { OpenDeutschDesktopBridge } from "@open-deutsch/contracts";

declare global {
  interface Window {
    openDeutsch: OpenDeutschDesktopBridge;
  }
}

export {};
