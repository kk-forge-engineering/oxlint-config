// WXT builds an entrypoint from its define* definition, so wxt.json rejects a default export of a bare call.
import { startBackground } from "../background/start-background";

export default startBackground();
