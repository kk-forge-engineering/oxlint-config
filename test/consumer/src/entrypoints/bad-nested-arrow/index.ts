import { defineBackground } from "wxt/utils/define-background";
import { startBackground } from "./start-background";
import { track } from "./track";

export default defineBackground(() => startBackground(() => track()));
