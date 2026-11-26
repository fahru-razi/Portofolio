/**
 * executive_managers.js
 * ─────────────────────
 * List + CRUD (create/edit/deactivate/reset-password) akun manager,
 * dari sisi role Executive.
 *
 * Catatan penting: manager adalah akun JABATAN administratif — tidak
 * pernah punya department_id/WorkSchedule/PicoAccount. Endpoint backend
 * (/executive/managers/*) selalu memfilter role=manager, jadi list ini
 * TIDAK PERNAH menampilkan karyawan biasa.
 */

let _managers = []; // cache hasil terakhir dari GET /executive/managers/api
let _searchTerm = "";

document.addEventListener("DOMContentLoaded", () => {
  loadManagers();

  document
    .getElementById("btn-open-create")
    ?.addEventListener("click", openCreateModal);

  document
    .getElementById("em-search-input")
    ?.addEventListener("input", (e) => {
      _searchTerm = e.target.value.trim().toLowerCase();
      renderTable();
    });

  document.getElementById("btn-mm-submit")?.addEventListener("click", submitManagerForm);
  document.getElementById("btn-rp-submit")?.addEventListener("click", submitResetPassword);
  document.getElementById("btn-dm-submit")?.addEventListener("click", submitDeactivate);

  // Modal close buttons
  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.dataset.close));
  });

  // Overlay click → close
  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.classList.remove("open");
    });
  });
});

// ─── Load & render ───────────────────────────────────────────────────────

async function loadManagers() {
  const tbody = document.getElementById("em-tbody");
  try {
    const res = await fetch(URL_LIST, {
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    if (!res.ok) throw new Error("fetch failed");
    _managers = await res.json();
    renderTable();
  } catch {
    tbody.innerHTML = `<tr><td colspan="5" class="mgr-empty">Gagal memuat data. Coba muat ulang halaman.</td></tr>`;
  }
}

function renderTable() {
  const tbody = document.getElementById("em-tbody");
  const countEl = document.getElementById("em-visible-count");

  const filtered = _managers.filter((m) => {
    if (!_searchTerm) return true;
    return (
      m.full_name.toLowerCase().includes(_searchTerm) ||
      m.email.toLowerCase().includes(_searchTerm)
    );
  });

  if (_managers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="mgr-empty">Belum ada akun manager.</td></tr>`;
    countEl.textContent = "";
    return;
  }

  countEl.textContent = `${filtered.length} manager`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="mgr-empty">Tidak ada hasil untuk pencarian ini.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map((m) => {
      const initials = m.full_name
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();
      const statusPill = m.is_active
        ? `<span class="status-pill pill-present">Aktif</span>`
        : `<span class="status-pill pill-absent">Nonaktif</span>`;

      return `
        <tr class="${m.is_active ? "" : "row-inactive"}" data-user-id="${m.id}">
          <td>
            <div class="emp-name-cell">
              <div class="emp-avatar ${m.is_active ? "" : "avatar-inactive"}">${initials}</div>
              <div>
                <span class="emp-fullname">${_escape(m.full_name)}</span>
                <span class="emp-code">${_escape(m.email)}</span>
              </div>
            </div>
          </td>
          <td class="td-muted">${_escape(m.primary_office || "—")}</td>
          <td class="td-muted">${_escape(m.phone || "—")}</td>
          <td>${statusPill}</td>
          <td class="td-action">
            <div class="action-row">
              <button class="btn-action btn-edit" title="Edit" data-action="edit" data-id="${m.id}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                Edit
              </button>
              <button class="btn-action btn-resetpw" title="Reset password" data-action="resetpw" data-id="${m.id}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Reset PW
              </button>
              ${
                m.is_active
                  ? `<button class="btn-action btn-delete" title="Nonaktifkan" data-action="deactivate" data-id="${m.id}">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                        <path d="M9 6V4h6v2" />
                      </svg>
                    </button>`
                  : ""
              }
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  // Bind action buttons
  tbody.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const mgr = _managers.find((m) => m.id === id);
      if (!mgr) return;
      if (btn.dataset.action === "edit") openEditModal(mgr);
      else if (btn.dataset.action === "resetpw") openResetPwModal(mgr);
      else if (btn.dataset.action === "deactivate") openDeactivateModal(mgr);
    });
  });
}

function _escape(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ─── Toast notifikasi (konfirmasi aksi berhasil/gagal) ────────────────────

function showToast(msg, isError) {
  let t = document.getElementById("mgr-toast-el");
  if (!t) {
    t = document.createElement("div");
    t.id = "mgr-toast-el";
    t.className = "page-success-toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.background = isError ? "#991b1b" : "#166534";
  t.style.display = "block";
  clearTimeout(t._timer);
  t._timer = setTimeout(() => {
    t.style.display = "none";
  }, 3000);
}

// ─── Modal: Create / Edit ─────────────────────────────────────────────────

function openCreateModal() {
  document.getElementById("mm-title").textContent = "Tambah Manager";
  document.getElementById("mm-user-id").value = "";
  document.getElementById("mm-full-name").value = "";
  document.getElementById("mm-email").value = "";
  document.getElementById("mm-password").value = "";
  document.getElementById("mm-phone").value = "";
  document.getElementById("mm-office-id").value = "";
  document.getElementById("mm-is-active").checked = true;
  document.getElementById("mm-error").style.display = "none";

  // Field yang hanya relevan saat create
  document.getElementById("mm-email-group").style.display = "";
  document.getElementById("mm-password-group").style.display = "";
  document.getElementById("mm-active-group").style.display = "none";
  document.getElementById("mm-email").disabled = false;

  openModal("modal-manager");
}

function openEditModal(mgr) {
  document.getElementById("mm-title").textContent = "Edit Manager";
  document.getElementById("mm-user-id").value = mgr.id;
  document.getElementById("mm-full-name").value = mgr.full_name;
  document.getElementById("mm-email").value = mgr.email;
  document.getElementById("mm-password").value = "";
  document.getElementById("mm-phone").value = mgr.phone || "";
  document.getElementById("mm-is-active").checked = mgr.is_active;
  document.getElementById("mm-error").style.display = "none";

  // Cari office_id dari nama primary_office (select box hanya punya id+nama)
  const officeSelect = document.getElementById("mm-office-id");
  const match = Array.from(officeSelect.options).find(
    (o) => o.textContent === mgr.primary_office,
  );
  officeSelect.value = match ? match.value : "";

  // Email & password tidak diedit lewat form ini (email = identitas login,
  // password lewat modal Reset Password terpisah)
  document.getElementById("mm-email-group").style.display = "none";
  document.getElementById("mm-password-group").style.display = "none";
  document.getElementById("mm-active-group").style.display = "";

  openModal("modal-manager");
}

async function submitManagerForm() {
  const btn = document.getElementById("btn-mm-submit");
  const spin = document.getElementById("mm-spin");
  const errEl = document.getElementById("mm-error");
  errEl.style.display = "none";

  const userId = document.getElementById("mm-user-id").value;
  const isEdit = !!userId;

  const fullName = document.getElementById("mm-full-name").value.trim();
  const phone = document.getElementById("mm-phone").value.trim();
  const officeId = document.getElementById("mm-office-id").value;

  if (!fullName) {
    showError(errEl, "Nama lengkap wajib diisi.");
    return;
  }

  let payload;
  let url;
  let method;

  if (isEdit) {
    payload = {
      full_name: fullName,
      phone: phone,
      is_active: document.getElementById("mm-is-active").checked,
    };
    if (officeId) payload.office_id = officeId;
    url = URL_UPDATE.replace("__ID__", userId);
    method = "PUT";
  } else {
    const email = document.getElementById("mm-email").value.trim();
    const password = document.getElementById("mm-password").value;

    if (!email) {
      showError(errEl, "Email wajib diisi.");
      return;
    }
    if (!officeId) {
      showError(errEl, "Kantor wajib dipilih.");
      return;
    }
    if (password.length < 6) {
      showError(errEl, "Password minimal 6 karakter.");
      return;
    }

    payload = {
      full_name: fullName,
      email: email,
      password: password,
      phone: phone,
      office_id: officeId,
    };
    url = URL_CREATE;
    method = "POST";
  }

  setLoading(btn, spin, true);
  try {
    const res = await apiFetch(url, method, payload);
    if (!res.ok) {
      showError(errEl, res.json?.message || "Gagal menyimpan data.");
      return;
    }
    closeModal("modal-manager");
    await loadManagers();
    showToast(res.json?.message || (isEdit ? "Data manager berhasil diperbarui." : "Manager berhasil ditambahkan."));
  } catch {
    showError(errEl, "Terjadi kesalahan jaringan.");
  } finally {
    setLoading(btn, spin, false);
  }
}

// ─── Modal: Reset Password ─────────────────────────────────────────────────

function openResetPwModal(mgr) {
  document.getElementById("rp-user-id").value = mgr.id;
  document.getElementById("rp-user-name").textContent = mgr.full_name;
  document.getElementById("rp-new-password").value = "";
  document.getElementById("rp-error").style.display = "none";
  openModal("modal-resetpw");
}

async function submitResetPassword() {
  const btn = document.getElementById("btn-rp-submit");
  const spin = document.getElementById("rp-spin");
  const errEl = document.getElementById("rp-error");
  errEl.style.display = "none";

  const userId = document.getElementById("rp-user-id").value;
  const newPw = document.getElementById("rp-new-password").value;

  if (newPw.length < 6) {
    showError(errEl, "Password minimal 6 karakter.");
    return;
  }

  setLoading(btn, spin, true);
  try {
    const url = URL_RESETPW.replace("__ID__", userId);
    const res = await apiFetch(url, "POST", { new_password: newPw });
    if (!res.ok) {
      showError(errEl, res.json?.message || "Gagal mereset password.");
      return;
    }
    closeModal("modal-resetpw");
    showToast(res.json?.message || "Password berhasil direset.");
  } catch {
    showError(errEl, "Terjadi kesalahan jaringan.");
  } finally {
    setLoading(btn, spin, false);
  }
}

// ─── Modal: Deactivate ──────────────────────────────────────────────────────

function openDeactivateModal(mgr) {
  document.getElementById("dm-user-id").value = mgr.id;
  document.getElementById("dm-user-name").textContent = mgr.full_name;
  document.getElementById("dm-error").style.display = "none";
  openModal("modal-deactivate");
}

async function submitDeactivate() {
  const btn = document.getElementById("btn-dm-submit");
  const spin = document.getElementById("dm-spin");
  const errEl = document.getElementById("dm-error");
  errEl.style.display = "none";

  const userId = document.getElementById("dm-user-id").value;

  setLoading(btn, spin, true);
  try {
    const url = URL_DELETE.replace("__ID__", userId);
    const res = await apiFetch(url, "DELETE");
    if (!res.ok) {
      showError(errEl, res.json?.message || "Gagal menonaktifkan akun.");
      return;
    }
    closeModal("modal-deactivate");
    await loadManagers();
    showToast(res.json?.message || "Manager berhasil dinonaktifkan.");
  } catch {
    showError(errEl, "Terjadi kesalahan jaringan.");
  } finally {
    setLoading(btn, spin, false);
  }
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

function openModal(id) {
  document.getElementById(id).classList.add("open");
}
function closeModal(id) {
  document.getElementById(id).classList.remove("open");
}
function showError(el, msg) {
  el.textContent = msg;
  el.style.display = "block";
}
function setLoading(btn, spin, loading) {
  btn.disabled = loading;
  spin.style.display = loading ? "inline-block" : "none";
}

async function apiFetch(url, method, body) {
  const opts = {
    method: method,
    headers: { "Content-Type": "application/json", "X-CSRFToken": CSRF_TOKEN },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const resp = await fetch(url, opts);
  const json = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, json };
}