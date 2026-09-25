import { escapeHtml } from "./status.js";

export const API_KEY_STORAGE = "arpa-api-key";

export function zoneKind(zone) {
  if (zone.startsWith("dev.")) return "dev";
  if (zone.startsWith("test.")) return "test";
  return "home";
}

/** Category (= service.group). Paused sorts last. */
export function groupServices(services) {
  const map = new Map();
  for (const s of services) {
    const key = s.group?.trim() || "Services";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(s);
  }
  return [...map.entries()].sort(([a], [b]) => {
    if (a === "Paused" && b !== "Paused") return 1;
    if (b === "Paused" && a !== "Paused") return -1;
    return a.localeCompare(b);
  });
}

export function accentFor(service) {
  const name = (service.name || "").toLowerCase();
  const map = {
    akaunting: "dark",
    gitea: "green",
    "gitea-ssh": "green",
    "registry-ui": "teal",
    registry: "purple",
    pihole: "pink",
  };
  if (map[name]) return map[name];
  const group = (service.group || "").toLowerCase();
  if (group.includes("business")) return "dark";
  if (group.includes("server")) return "blue";
  if (group.includes("paused")) return "dark";
  return "purple";
}

export function card(service) {
  const kind = zoneKind(service.zone);
  const paused = service.paused ? " is-paused" : "";
  const accent = service.accent || accentFor(service);
  const proxyChip = service.proxy
    ? `<span class="chip chip-proxy">proxy</span>`
    : `<span class="chip chip-direct">direct</span>`;
  const zoneChip = `<span class="chip chip-zone">${escapeHtml(service.zone)}</span>`;
  const kindChip =
    kind === "home" ? "" : `<span class="chip chip-dev">${kind}</span>`;

  const initialStatus = service.paused ? "paused" : "checking";
  const initialLabel = service.paused ? "Paused" : "Checking…";

  return `
    <a class="card card-${accent}${paused}" href="${service.href}" data-service-id="${escapeHtml(service.id)}" ${service.paused ? 'aria-disabled="true"' : ""}>
      <span class="card-status is-${initialStatus}" data-reachability title="Checking backend…">${escapeHtml(initialLabel)}</span>
      <p class="card-title">${escapeHtml(service.title || service.name)}</p>
      <p class="card-desc">${escapeHtml(service.description || service.hostname)}</p>
      <p class="card-host">${escapeHtml(service.hostname)}</p>
      <p class="card-ip">${escapeHtml(service.ip)}${service.port ? `:${service.port}` : ""}</p>
      <div class="chips">${proxyChip}${zoneChip}${kindChip}${(service.tags || [])
        .map((t) => `<span class="chip">${escapeHtml(t)}</span>`)
        .join("")}</div>
    </a>
  `;
}

const STATUS_LABEL = {
  up: "Running",
  down: "Down",
  skipped: "No check",
  paused: "Paused",
};

/** Fetch `/api/reachability` and update card status badges in rootEl. */
export async function applyReachability(rootEl, { zone } = {}) {
  if (!rootEl) return;
  const url = zone
    ? `/api/reachability?zone=${encodeURIComponent(zone)}`
    : "/api/reachability";
  try {
    const data = await fetch(url).then((r) => r.json());
    const byId = new Map((data.results || []).map((r) => [r.id, r]));
    for (const el of rootEl.querySelectorAll("[data-reachability]")) {
      const cardEl = el.closest("[data-service-id]");
      const id = cardEl?.dataset.serviceId;
      const result = id ? byId.get(id) : null;
      if (!result) {
        el.textContent = "Unknown";
        el.className = "card-status is-skipped";
        el.title = "No reachability result";
        continue;
      }
      el.textContent = STATUS_LABEL[result.status] || result.status;
      el.className = `card-status is-${result.status}`;
      el.title = result.ms != null ? `${result.detail} · ${result.ms}ms` : result.detail;
    }
  } catch (err) {
    for (const el of rootEl.querySelectorAll("[data-reachability]")) {
      el.textContent = "Unknown";
      el.className = "card-status is-skipped";
      el.title = String(err.message || err);
    }
  }
}

export function renderCategorySections(services, groupsEl, { zone, probe = true } = {}) {
  const groups = groupServices(services);
  groupsEl.innerHTML = groups
    .map(
      ([name, items]) => `
      <section class="group">
        <div class="group-head">
          <h2>${escapeHtml(name)}</h2>
          <p>${items.length} endpoint${items.length === 1 ? "" : "s"}</p>
        </div>
        <div class="card-grid">
          ${items.map(card).join("")}
        </div>
      </section>`,
    )
    .join("");
  if (probe) {
    void applyReachability(groupsEl, { zone });
  }
}

export function getStoredApiKey() {
  // Prefer localStorage so the key survives tab/browser restarts (admin UX).
  // Fall back to legacy sessionStorage and migrate once found.
  const fromLocal = localStorage.getItem(API_KEY_STORAGE) || "";
  if (fromLocal) return fromLocal;
  const fromSession = sessionStorage.getItem(API_KEY_STORAGE) || "";
  if (fromSession) {
    localStorage.setItem(API_KEY_STORAGE, fromSession);
    sessionStorage.removeItem(API_KEY_STORAGE);
  }
  return fromSession;
}

export function setStoredApiKey(key) {
  if (key) {
    localStorage.setItem(API_KEY_STORAGE, key);
    sessionStorage.removeItem(API_KEY_STORAGE);
  } else {
    localStorage.removeItem(API_KEY_STORAGE);
    sessionStorage.removeItem(API_KEY_STORAGE);
  }
}

export async function apiFetch(path, { method = "GET", body, apiKey } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const key = apiKey ?? getStoredApiKey();
  if (key) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

export const SUGGESTED_CATEGORIES = [
  "Business",
  "Applications",
  "Servers",
  "Development",
  "Paused",
];
