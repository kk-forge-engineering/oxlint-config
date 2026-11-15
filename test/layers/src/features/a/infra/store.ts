import type { Store } from "../port";
import { user } from "../../../entities/user/exports";
import { log } from "../../../infra/ok";
import { logger } from "../../../shared/logger/exports";
export const store: Store = { get: () => String(user) };
export const at = Date.now();
export { log, logger };
