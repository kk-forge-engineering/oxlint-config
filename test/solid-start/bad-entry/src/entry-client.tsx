// The mount is logic of its own: it belongs in a start function the launcher calls.
import { mount, StartClient } from "@solidjs/start/client";

mount(() => <StartClient />, document.getElementById("app"));
