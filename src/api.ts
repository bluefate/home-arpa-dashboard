import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { swaggerUI } from "@hono/swagger-ui";
import {
  ServiceInputSchema,
  ServicePatchSchema,
  config,
  publicUrl,
} from "./config.js";
import {
  deleteService,
  getService,
  listServices,
  patchService,
  upsertService,
} from "./store.js";
import { syncPiholeDns } from "./integrations/pihole.js";
import {
  dashboardPayload,
  syncCaddySnippet,
} from "./integrations/caddy.js";
import { buildOpenApiDocument } from "./openapi.js";
import { probeServices } from "./probe.js";

type Variables = {
  authed: boolean;
};

export const api = new Hono<{ Variables: Variables }>();

function requireAuth(authHeader: string | undefined): void {
  if (!authHeader?.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Missing Bearer token" });
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token || token !== config.apiKey) {
    throw new HTTPException(403, { message: "Invalid API key" });
  }
}

api.get("/openapi.json", (c) => c.json(buildOpenApiDocument()));

api.get(
  "/docs",
  swaggerUI({
    url: "/api/openapi.json",
    title: "HomeArpaDashboard API",
  }),
);

api.get("/health", (c) => {
  const piholeEnabled = Boolean(config.piholeUrl && config.piholePassword);
  const caddyEnabled = Boolean(config.caddySnippetPath);
  const caddyReload = Boolean(
    config.caddyAdminUrl && config.caddyCaddyfilePath,
  );

  let caddyDetail: string;
  if (!caddyEnabled) {
    caddyDetail =
      "Not configured — set CADDY_SNIPPET_PATH and import that file from Caddy, or add routes by hand";
  } else if (config.dryRunIntegrations) {
    caddyDetail =
      "Configured, but DRY_RUN_INTEGRATIONS=true — snippet writes are simulated only";
  } else if (caddyReload) {
    caddyDetail =
      "Enabled — writes CADDY_SNIPPET_PATH and reloads Caddy via CADDY_ADMIN_URL";
  } else {
    caddyDetail =
      "Enabled — writes CADDY_SNIPPET_PATH (import that file from Caddy; set CADDY_ADMIN_URL + CADDY_CADDYFILE_PATH to auto-reload)";
  }

  return c.json({
    ok: true,
    zones: config.allowedZones,
    caddyIpConfigured: Boolean(config.caddyIp),
    dryRunIntegrations: config.dryRunIntegrations,
    integrations: {
      registry: {
        enabled: true,
        label: "Service registry",
        detail: "Always on — stores services for the dashboard",
      },
      pihole: {
        enabled: piholeEnabled,
        label: "Pi-hole Local DNS",
        detail: piholeEnabled
          ? config.dryRunIntegrations
            ? "Configured, but DRY_RUN_INTEGRATIONS=true — DNS writes are simulated only"
            : "Enabled — create/update/delete via API writes Pi-hole Local DNS (dns.hosts)"
          : "Not configured — set PIHOLE_URL and PIHOLE_PASSWORD in .env to automate DNS",
      },
      caddySnippet: {
        enabled: caddyEnabled,
        reload: caddyReload,
        label: "Caddy snippet writer",
        detail: caddyDetail,
      },
    },
    // legacy booleans for older clients
    pihole: piholeEnabled,
    caddySnippet: caddyEnabled,
  });
});

api.get("/services", async (c) => {
  const zone = c.req.query("zone")?.trim().toLowerCase();
  let services = await listServices();
  if (zone) {
    services = services.filter((s) => s.zone.toLowerCase() === zone);
  }
  return c.json({ services: dashboardPayload(services), zone: zone || null });
});

/** Best-effort HTTP reachability of each service backend (ip:port). */
api.get("/reachability", async (c) => {
  const zone = c.req.query("zone")?.trim().toLowerCase();
  let services = await listServices();
  if (zone) {
    services = services.filter((s) => s.zone.toLowerCase() === zone);
  }
  const results = await probeServices(services);
  return c.json({
    results,
    zone: zone || null,
    checked_at: new Date().toISOString(),
  });
});

api.get("/services/:id", async (c) => {
  const service = await getService(c.req.param("id"));
  if (!service) throw new HTTPException(404, { message: "Not found" });
  return c.json({ service: { ...service, href: publicUrl(service) } });
});

api.post("/services", async (c) => {
  requireAuth(c.req.header("authorization"));
  const body = await c.req.json();
  const parsed = ServiceInputSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: parsed.error.issues.map((i) => i.message).join("; "),
    });
  }

  try {
    const { service, created } = await upsertService(parsed.data);
    const dns = await syncPiholeDns(service, "upsert");
    const all = await listServices();
    const caddy = await syncCaddySnippet(all);

    return c.json(
      {
        created,
        service: { ...service, href: publicUrl(service) },
        integrations: { dns, caddy },
      },
      created ? 201 : 200,
    );
  } catch (err) {
    throw new HTTPException(400, {
      message: err instanceof Error ? err.message : "Failed to upsert",
    });
  }
});

api.patch("/services/:id", async (c) => {
  requireAuth(c.req.header("authorization"));
  const body = await c.req.json();
  const parsed = ServicePatchSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: parsed.error.issues.map((i) => i.message).join("; "),
    });
  }

  try {
    const service = await patchService(c.req.param("id"), parsed.data);
    if (!service) throw new HTTPException(404, { message: "Not found" });

    const dns = await syncPiholeDns(service, "upsert");
    const all = await listServices();
    const caddy = await syncCaddySnippet(all);

    return c.json({
      service: { ...service, href: publicUrl(service) },
      integrations: { dns, caddy },
    });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    throw new HTTPException(400, {
      message: err instanceof Error ? err.message : "Failed to patch",
    });
  }
});

api.delete("/services/:id", async (c) => {
  requireAuth(c.req.header("authorization"));
  const service = await deleteService(c.req.param("id"));
  if (!service) throw new HTTPException(404, { message: "Not found" });

  const dns = await syncPiholeDns(service, "delete");
  const all = await listServices();
  const caddy = await syncCaddySnippet(all);

  return c.json({
    deleted: true,
    service: { ...service, href: publicUrl(service) },
    integrations: { dns, caddy },
  });
});
