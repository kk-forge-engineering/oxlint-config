import { defineBackground } from "wxt/utils/define-background";
import { startBackground } from "./start-background";

export default defineBackground(async () => {
  await startBackground();
});
