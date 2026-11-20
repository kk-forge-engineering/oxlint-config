// The test platform's adapter imports its SDK and uses its global.
import { ipcRenderer } from "electron";
export const send = ipcRenderer.send;
export const api = window.electronAPI;
