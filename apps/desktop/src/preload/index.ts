import {
  desktopIpcEventSchema,
  desktopIpcRequestSchema,
  desktopIpcResponseSchema,
  type DesktopIpcEvent,
  type DesktopIpcRequest,
  type OpenDeutschDesktopBridge,
} from "@open-deutsch/contracts";
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

const invoke = (async (request: DesktopIpcRequest) => {
  const parsedRequest = desktopIpcRequestSchema.safeParse(request);
  if (!parsedRequest.success) throw new Error("OD_IPC_REQUEST_INVALID");
  const parsedResponse = desktopIpcResponseSchema.safeParse(
    await ipcRenderer.invoke("open-deutsch:invoke", parsedRequest.data),
  );
  if (!parsedResponse.success) throw new Error("OD_IPC_RESPONSE_INVALID");
  return parsedResponse.data;
}) as OpenDeutschDesktopBridge["invoke"];

const bridge: OpenDeutschDesktopBridge = Object.freeze({
  invoke,
  subscribe: (listener: (event: DesktopIpcEvent) => void) => {
    const receive = (_event: IpcRendererEvent, value: unknown) => {
      const parsed = desktopIpcEventSchema.safeParse(value);
      if (parsed.success) listener(parsed.data);
    };
    ipcRenderer.on("open-deutsch:event", receive);
    return () => ipcRenderer.removeListener("open-deutsch:event", receive);
  },
  ready: () => {
    ipcRenderer.send("open-deutsch:renderer-ready");
  },
});

contextBridge.exposeInMainWorld("openDeutsch", bridge);
