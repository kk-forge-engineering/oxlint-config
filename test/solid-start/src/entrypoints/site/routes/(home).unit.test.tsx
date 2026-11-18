// A test beside a route holds its own logic, and the file router makes no route of it.
import { HomePage } from "../pages/HomePage";

const page = HomePage();
if (page === undefined) {
  throw new Error("HomePage rendered nothing");
}
