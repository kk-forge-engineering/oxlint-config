import { defineBackground } from "wxt/utils/define-background";
import { readConfig } from "./config";
import { startBackground } from "./start-background";

export default defineBackground(() => startBackground(readConfig()));
