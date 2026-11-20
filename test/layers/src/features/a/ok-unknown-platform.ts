// The preset knows no platform beyond its table, so a package the test adds as a platform is no SDK here.
import { ipcRenderer } from "electron";
export const send = ipcRenderer.send;
export const api = electronAPI;
