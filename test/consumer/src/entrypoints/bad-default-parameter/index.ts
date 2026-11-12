import { defineBackground } from "wxt/utils/define-background";
import { openPort } from "./port";
import { startBackground } from "./start-background";

export default defineBackground((port = openPort()) => startBackground(port));
