// Two features of web make one action here, which counts as two features. It alone takes web's relay entity.
import type { Relay } from "@pair/web/entities/relay/exports";
import type { Shelf } from "@pair/web/features/library/exports";
import type { Page } from "@pair/web/features/reader/exports";

export type Sync = [Shelf, Page, Relay];
