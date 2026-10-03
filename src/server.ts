import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { api } from "./api.js";
import { config } from "./config.js";

const app = new Hono();

app.get("/api", (c) => c.redirect("/api/docs"));
app.get("/docs", (c) => c.redirect("/api/docs"));
app.route("/api", api);

app.use("/*", serveStatic({ root: "./public" }));

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(
    `HomeArpaDashboard listening on http://${info.address}:${info.port}`,
  );
  console.log(`Zones: ${config.allowedZones.join(", ")}`);
});
