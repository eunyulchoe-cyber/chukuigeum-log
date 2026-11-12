import { handle } from "../_shared/handler.ts";

Deno.serve((req) => handle(req, "video-media"));
