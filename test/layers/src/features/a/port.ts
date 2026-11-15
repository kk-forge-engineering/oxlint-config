import type { User } from "../../entities/user/exports";
export type Store = { get(key: string): User | undefined };
