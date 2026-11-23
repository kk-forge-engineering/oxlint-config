import type { Book } from "@pair/web/entities/book/exports";

export interface OwnPort {
  load(): Book;
}
