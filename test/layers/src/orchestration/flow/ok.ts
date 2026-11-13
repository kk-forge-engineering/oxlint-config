import { a } from "../../features/a/exports";
import { user } from "../../entities/user/exports";
export type { B } from "@/features/b/exports";
export { a, user };
export const pair = () => import("../../entities/pair/exports");
