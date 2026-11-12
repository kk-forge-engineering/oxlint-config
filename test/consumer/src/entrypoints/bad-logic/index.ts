import { defineBackground } from "wxt/utils/define-background";
import { startLogic } from "./start-logic";

export default defineBackground(() => {
  const port = 8080;
  startLogic(port);
});
