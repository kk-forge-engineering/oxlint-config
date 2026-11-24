// package.json declares #/*, which the layers do not read: #src/* names src/.
import { port } from "#/infra/ok-env";

export const own = port;
