// A feature's infra builds on the root infra, which the feature's other code may not import.
import { log } from "../../../infra/ok";
import { logger } from "../../../shared/logger/exports";
export const store = { log, logger };
