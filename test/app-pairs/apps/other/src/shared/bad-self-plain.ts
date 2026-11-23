// An app without exports still names its own src/ through #/, never through its own name.
import { x } from "@pair/other/shared/x";

export const own = x;
