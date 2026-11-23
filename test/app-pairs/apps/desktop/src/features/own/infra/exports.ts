// The port names web's entity, so the feature's infra may take it too.
import type { Book } from "@pair/web/entities/book/exports";

import type { OwnPort } from "../port";

export type Adapter = OwnPort & { last?: Book };
