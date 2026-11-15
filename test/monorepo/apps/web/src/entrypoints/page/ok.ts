import { log } from "@mono/logger";
import { sink } from "@mono/logger/infra";
import { collect } from "@mono/logger/testing";

export const page = [log, sink, collect];
