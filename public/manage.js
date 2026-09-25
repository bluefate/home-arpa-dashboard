import { initTheme } from "./theme.js";
import { escapeHtml } from "./status.js";
import {
  apiFetch,
  getStoredApiKey,
  setStoredApiKey,
  SUGGESTED_CATEGORIES,
} from "./services-ui.js";

initTheme();

let services = [];
let zones = [];
let editingId = "";

function showMsg(el, text, ok) {
  el.hidden = false;
  el.textContent = text;
  el.classList.toggle("is-ok", !!ok);
  el.classList.toggle("is-err", !ok);
}

function categoryOptions(current) {
  const set = new Set(SUGGESTED_CATEGORIES);
  for (const s of services) {
    if (s.group?.trim()) set.add(s.group.trim());
  }
  if (current?.trim()) set.add(current.trim());
  return [...set].sort((a, b) => {
    if (a === "Paused" && b !== "Paused") return 1;
    if (b === "Paused" && a !== "Paused") return -1;
    return a.localeCompare(b);
  });
}

function fillDatalist() {
  const dl = document.getElementById("manage-categories");
  dl.innerHTML = categoryOptions()
    .map((c) => `<option value="${escapeHtml(c)}"></option>`)
    .join("");
}

function setEditMode(id) {
  editingId = id || "";
  document.getElementById("edit-id").value = editingId;
  const cancel = document.getElementById("reg-cancel");
  const submit = document.getElementById("reg-submit");
  const heading = document.getElementById("reg-heading");
  const hint = document.getElementById("reg-hint");
  cancel.hidden = !editingId;
  if (editingId) {
    submit.textContent = "Update";
    heading.textContent = "Edit service";
    hint.textContent = "Saving patches this entry (PATCH). Cancel to register a new one instead.";
  } else {
    submit.textContent = "Save";
    heading.textContent = "Register (any zone)";
    hint.innerHTML =
      'Same as <code>POST /api/services</code>. For day-to-day WIP, prefer <a href="/dev.html">dev.home.arpa</a>. Use <strong>Edit</strong> on a row to change an existing entry.';
  }
}

function clearForm() {
  const form = document.getElementById("reg-form");
  form.reset();
  form.proxy.checked = true;
  setEditMode("");
}

function startEdit(id) {
  const s = services.find((x) => x.id === id);
  if (!s) return;
  const form = document.getElementById("reg-form");
  form.name.value = s.name || "";
  form.zone.value = s.zone || "";
  form.ip.value = s.ip || "";
  form.port.value = s.port ?? "";
  form.title.value = s.title || "";
  form.group.value = s.group || "";
  form.proxy.checked = !!s.proxy;
  form.paused.checked = !!s.paused;
  setEditMode(s.id);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  form.name.focus();
}

function renderManageList() {
  const list = document.getElementById("manage-list");
  if (!services.length) {
    list.innerHTML = `<p class="empty">No services registered.</p>`;
    return;
  }

  list.innerHTML = services
    .map((s) => {
      const cats = categoryOptions(s.group);
      const opts = cats
        .map((c) => {
          const selected = (s.group || "Services") === c ? " selected" : "";
          return `<option value="${escapeHtml(c)}"${selected}>${escapeHtml(c)}</option>`;
        })
        .join("");
      return `
        <div class="manage-row" data-id="${escapeHtml(s.id)}">
          <div class="manage-info">
            <p class="manage-title">${escapeHtml(s.title || s.name)}</p>
            <p class="manage-host">${escapeHtml(s.hostname)} · ${escapeHtml(s.ip)}${s.port ? `:${s.port}` : ""} · ${escapeHtml(s.zone)}</p>
          </div>
          <div class="manage-controls">
            <label class="manage-cat">
              <span class="sr-only">Category</span>
              <select class="cat-select" data-id="${escapeHtml(s.id)}">
                ${opts}
                <option value="__custom__">Custom…</option>
              </select>
            </label>
            <button type="button" class="btn-secondary btn-sm" data-edit="${escapeHtml(s.id)}">Edit</button>
            <button type="button" class="btn-danger btn-sm" data-delete="${escapeHtml(s.id)}">Delete</button>
          </div>
        </div>`;
    })
    .join("");
}

async function loadServices() {
  const meta = document.getElementById("meta");
  const data = await fetch("/api/services").then((r) => r.json());
  services = data.services || [];
  meta.textContent = `${services.length} service${services.length === 1 ? "" : "s"}`;
  fillDatalist();
  renderManageList();
}

async function changeCategory(id, group) {
  const msg = document.getElementById("manage-msg");
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    showMsg(msg, "Save your API key first.", false);
    return;
  }
  const patch = {
    group,
    paused: group === "Paused",
  };
  try {
    await apiFetch(`/api/services/${id}`, {
      method: "PATCH",
      body: patch,
      apiKey,
    });
    showMsg(msg, `Moved to “${group}”.`, true);
    await loadServices();
  } catch (err) {
    showMsg(msg, String(err.message || err), false);
  }
}

async function deleteService(id) {
  const msg = document.getElementById("manage-msg");
  const s = services.find((x) => x.id === id);
  if (!s) return;
  const label = s.hostname || s.name;
  if (!window.confirm(`Delete ${label}?`)) return;
  if (
    !window.confirm(
      `Really delete ${label}? This removes DNS/Caddy routes and cannot be undone.`,
    )
  ) {
    return;
  }
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    showMsg(msg, "Save your API key first.", false);
    return;
  }
  try {
    await apiFetch(`/api/services/${id}`, { method: "DELETE", apiKey });
    showMsg(msg, `Deleted ${label}.`, true);
    if (editingId === id) clearForm();
    await loadServices();
  } catch (err) {
    showMsg(msg, String(err.message || err), false);
  }
}

function formBody(form) {
  const fd = new FormData(form);
  const portRaw = String(fd.get("port") || "").trim();
  const body = {
    name: String(fd.get("name") || "").trim(),
    zone: String(fd.get("zone") || "").trim(),
    ip: String(fd.get("ip") || "").trim(),
    title: String(fd.get("title") || "").trim() || undefined,
    group: String(fd.get("group") || "").trim() || undefined,
    proxy: fd.get("proxy") === "on",
    paused: fd.get("paused") === "on",
  };
  if (portRaw) body.port = Number(portRaw);
  return body;
}

async function main() {
  const keyInput = document.getElementById("apiKey");
  const keyForm = document.getElementById("key-form");
  const keyMsg = document.getElementById("key-msg");
  const clearBtn = document.getElementById("clear-key");
  const regForm = document.getElementById("reg-form");
  const regZone = document.getElementById("reg-zone");
  const regMsg = document.getElementById("reg-msg");
  const manageList = document.getElementById("manage-list");

  keyInput.value = getStoredApiKey();

  const health = await fetch("/api/health").then((r) => r.json());
  zones = health.zones || ["home.arpa", "dev.home.arpa"];
  regZone.innerHTML = zones
    .map((z) => `<option value="${escapeHtml(z)}">${escapeHtml(z)}</option>`)
    .join("");

  keyForm.addEventListener("submit", (e) => {
    e.preventDefault();
    setStoredApiKey(keyInput.value.trim());
    showMsg(keyMsg, "API key saved in this browser (persists across restarts).", true);
  });

  clearBtn.addEventListener("click", () => {
    setStoredApiKey("");
    keyInput.value = "";
    showMsg(keyMsg, "API key cleared.", true);
  });

  document.getElementById("reg-cancel").addEventListener("click", () => {
    clearForm();
    document.getElementById("reg-msg").hidden = true;
  });

  manageList.addEventListener("change", async (e) => {
    const sel = e.target.closest("select.cat-select");
    if (!sel) return;
    let group = sel.value;
    if (group === "__custom__") {
      const typed = window.prompt("Category name:");
      if (!typed?.trim()) {
        await loadServices();
        return;
      }
      group = typed.trim();
    }
    await changeCategory(sel.dataset.id, group);
  });

  manageList.addEventListener("click", async (e) => {
    const editBtn = e.target.closest("[data-edit]");
    if (editBtn) {
      startEdit(editBtn.dataset.edit);
      return;
    }
    const delBtn = e.target.closest("[data-delete]");
    if (delBtn) await deleteService(delBtn.dataset.delete);
  });

  regForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const apiKey = getStoredApiKey();
    if (!apiKey) {
      showMsg(regMsg, "Save your API key first.", false);
      return;
    }
    const body = formBody(regForm);
    try {
      if (editingId) {
        const result = await apiFetch(`/api/services/${editingId}`, {
          method: "PATCH",
          body,
          apiKey,
        });
        showMsg(regMsg, `Updated ${result.service.hostname}`, true);
        clearForm();
      } else {
        const result = await apiFetch("/api/services", {
          method: "POST",
          body,
          apiKey,
        });
        showMsg(
          regMsg,
          result.created
            ? `Created ${result.service.hostname}`
            : `Updated ${result.service.hostname}`,
          true,
        );
        clearForm();
      }
      await loadServices();
    } catch (err) {
      showMsg(regMsg, String(err.message || err), false);
    }
  });

  try {
    await loadServices();
  } catch (err) {
    document.getElementById("meta").textContent = "Failed to load";
    document.getElementById("manage-list").textContent = String(err);
  }
}

main();
