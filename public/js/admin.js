/**
 * admin.js — Panel SaaS Rutograma
 */

let allTenants = [];
let currentPage = 'dashboard';

window.addEventListener('DOMContentLoaded', async () => {
  const user = Auth.check();
  if (!user) return;
  if (user.role !== 'superadmin') { location.href = '/app'; return; }

  document.getElementById('adminName').textContent  = user.name;
  document.getElementById('topbarUser').textContent = user.name;

  // Cargar tenants primero (necesarios para filtros y selects)
  allTenants = await api('/saas/tenants').catch(() => []);
  showPage('dashboard');
});

// ── Navegación ─────────────────────────────────────────────────────────────
function showPage(page) {
  document.querySelectorAll('[id^="page-"]').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById(`page-${page}`).style.display = 'block';
  document.getElementById(`nav-${page}`).classList.add('active');

  const titles = {
    dashboard:  '📊 Dashboard',
    tenants:    '🏢 Clientes / Tenants',
    billing:    '💳 Facturación',
    users:      '👥 Usuarios',
    riskpoints: '⚠️ Puntos de Riesgo'
  };
  document.getElementById('pageTitle').textContent = titles[page] || page;
  currentPage = page;

  const loaders = { dashboard: loadDashboard, tenants: loadTenants,
    billing: loadBilling, users: loadUsers, riskpoints: loadRiskPoints };
  loaders[page]?.();
}

// ── Dashboard ──────────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const [stats, billingStats, tenants] = await Promise.all([
      api('/saas/stats'), api('/billing/stats'), api('/saas/tenants')
    ]);
    allTenants = tenants;

    document.getElementById('kpiGrid').innerHTML = `
      <div class="kpi-card blue">
        <div class="kpi-label">Total Clientes</div>
        <div class="kpi-val">${stats.totalTenants}</div>
        <div class="kpi-sub">${stats.activeTenants} activos</div>
      </div>
      <div class="kpi-card blue">
        <div class="kpi-label">Usuarios Totales</div>
        <div class="kpi-val">${stats.totalUsers}</div>
      </div>
      <div class="kpi-card blue">
        <div class="kpi-label">Viajes Realizados</div>
        <div class="kpi-val">${stats.totalTrips}</div>
      </div>
      <div class="kpi-card blue">
        <div class="kpi-label">Puntos de Riesgo</div>
        <div class="kpi-val">${stats.totalRiskPoints}</div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-label">Ingresos del Mes</div>
        <div class="kpi-val">${fmtMoney(billingStats.month_revenue)}</div>
      </div>
      <div class="kpi-card orange">
        <div class="kpi-label">Por Cobrar</div>
        <div class="kpi-val">${stats.pendingInvoices}</div>
        <div class="kpi-sub">${fmtMoney(billingStats.pending_amount)}</div>
      </div>
    `;
    document.getElementById('recentTenantsTable').innerHTML = buildTenantsTable(tenants.slice(0, 5));
  } catch (e) { console.error(e); }
}

// ── Tenants ────────────────────────────────────────────────────────────────
async function loadTenants() {
  try {
    allTenants = await api('/saas/tenants');
    renderTenantsTable(allTenants);
    populateTenantSelects();
  } catch (e) { showAdminToast('Error cargando clientes: ' + e.message, 'error'); }
}

function renderTenantsTable(tenants) {
  document.getElementById('tenantsTable').innerHTML = buildTenantsTable(tenants);
}

function buildTenantsTable(tenants) {
  if (!tenants.length) return '<p style="padding:24px;color:#888;text-align:center">Sin clientes registrados.</p>';
  return `<table>
    <thead><tr>
      <th>Cliente</th><th>Plan</th><th>Estado</th>
      <th>Usuarios</th><th>Vencimiento</th><th style="text-align:right">Acciones</th>
    </tr></thead>
    <tbody>${tenants.map(t => `
      <tr>
        <td>
          ${t.logo_url
            ? `<img src="${t.logo_url}" class="tenant-logo-sm" onerror="this.style.display='none'">`
            : `<span class="tenant-avatar">${t.name.charAt(0).toUpperCase()}</span>`}
          <strong>${esc(t.name)}</strong>
          ${t.contact_email ? `<br><small style="color:#888;margin-left:40px">${esc(t.contact_email)}</small>` : ''}
        </td>
        <td><span class="status plan-${t.plan}">${planLabel(t.plan)}</span></td>
        <td><span class="status status-${t.status}">${statusLabel(t.status)}</span></td>
        <td>${t.active_users || 0} / ${t.max_users}</td>
        <td style="color:${isExpiredSoon(t.expires_at)?'#c62828':'inherit'};font-size:.83rem">
          ${t.expires_at ? fmtDate(t.expires_at) : '<span style="color:#888">♾️ Sin límite</span>'}
        </td>
        <td style="text-align:right;white-space:nowrap">
          <button class="btn btn-secondary btn-sm" onclick="editTenant('${t.id}')" title="Editar">✏️</button>
          <button class="btn-success btn-sm" onclick="renewTenant('${t.id}',event)" title="Renovar">🔄</button>
          <button class="btn ${t.status==='active'?'btn-danger':'btn-success'} btn-sm"
            onclick="suspendTenant('${t.id}',event)" title="${t.status==='active'?'Suspender':'Reactivar'}">
            ${t.status==='active'?'⏸️':'▶️'}
          </button>
          <button class="btn btn-danger btn-sm" onclick="deleteTenant('${t.id}','${escAttr(t.name)}',event)" title="Eliminar definitivo">🗑️</button>
        </td>
      </tr>`).join('')}
    </tbody>
  </table>`;
}

function filterTenants() {
  const q = document.getElementById('tenantSearch').value.toLowerCase();
  renderTenantsTable(allTenants.filter(t =>
    t.name.toLowerCase().includes(q) || (t.domain||'').toLowerCase().includes(q) || (t.contact_email||'').toLowerCase().includes(q)
  ));
}

// ── Modal Tenant ───────────────────────────────────────────────────────────
function openTenantModal(tenantId = null) {
  document.getElementById('tenantId').value = tenantId || '';
  document.getElementById('tenantModalTitle').textContent = tenantId ? 'Editar Cliente' : 'Nuevo Cliente';
  const isNew = !tenantId;
  document.getElementById('adminFields').style.display = 'block';
  // Al editar, cambiar etiquetas para indicar que son opcionales
  if (!isNew) {
    document.getElementById('adminPassField').style.display = 'block';
    document.querySelector('#adminFields p').innerHTML = '👤 Administrador del Tenant <span style="color:#888;font-size:.78rem">(dejar contraseña vacía para no cambiar)</span>';
  } else {
    document.querySelector('#adminFields p').innerHTML = '👤 Administrador del Tenant (solo al crear)';
  }
  switchTab('info');

  // Reset uploads
  resetUploadUI('logo');
  resetUploadUI('favicon');

  if (isNew) {
    ['tName','tDomain','tAdminName','tAdminEmail','tAdminPass',
     'tContactEmail','tContactPhone','tWeatherKey','tAiKey','tAddress'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    selectPlan('basic');
    document.getElementById('tPrimaryColor').value = '#1a73e8';
    document.getElementById('tPrimaryColorHex').value = '#1a73e8';
    const d = new Date(); d.setFullYear(d.getFullYear() + 1);
    document.getElementById('tExpires').value = d.toISOString().slice(0,10);
  } else {
    const t = allTenants.find(x => x.id === tenantId);
    if (!t) return;
    document.getElementById('tName').value          = t.name;
    document.getElementById('tDomain').value        = t.domain || '';
    document.getElementById('tExpires').value       = t.expires_at ? t.expires_at.slice(0,10) : '';
    document.getElementById('tMaxUsers').value      = t.max_users;
    document.getElementById('tMaxMonitors').value   = t.max_monitors;
    document.getElementById('tContactEmail').value  = t.contact_email || '';
    document.getElementById('tContactPhone').value  = t.contact_phone || '';
    document.getElementById('tWeatherKey').value    = t.openweather_api_key || '';
    document.getElementById('tAiKey').value         = t.ai_api_key || '';
    document.getElementById('tAddress').value       = t.address || '';
    document.getElementById('tPrimaryColor').value  = t.primary_color || '#1a73e8';
    document.getElementById('tPrimaryColorHex').value = t.primary_color || '#1a73e8';
    selectPlan(t.plan || 'basic');
    // Cargar datos del admin para poder editarlos (solo al editar tenant)
    const admin = t.users?.find(u => u.role === 'admin');
    if (admin) {
      document.getElementById('tAdminName').value  = admin.name || '';
      document.getElementById('tAdminEmail').value = admin.email || '';
      document.getElementById('tAdminPass').value  = '';
      document.getElementById('tAdminPass').placeholder = 'Dejar vacío para no cambiar';
      document.getElementById('adminPassField').style.display = 'block';
    }
    // Mostrar logo/favicon existentes
    if (t.logo_url) showExistingImage('logoPreview','logoPlaceholder','uploadLogoBtn', t.logo_url);
    if (t.favicon_url) showExistingImage('faviconPreview','faviconPlaceholder','uploadFaviconBtn', t.favicon_url);
    updateBrandPreview(t);
  }
  document.getElementById('tenantModal').classList.add('show');
}

function closeTenantModal() { document.getElementById('tenantModal').classList.remove('show'); }

function switchTab(tab) {
  ['info','api','brand'].forEach(t => {
    document.getElementById('tabcontent-' + t).style.display = t === tab ? 'block' : 'none';
    document.getElementById('tab-' + t).classList.toggle('active', t === tab);
  });
}

function selectPlan(plan) {
  document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected'));
  document.querySelector(`.plan-card[data-plan="${plan}"]`)?.classList.add('selected');
  document.getElementById('tPlan').value = plan;
  const limits = { free:[3,1], basic:[10,3], pro:[30,10], enterprise:[9999,99] };
  const [u, m] = limits[plan] || [10,3];
  document.getElementById('tMaxUsers').value    = u;
  document.getElementById('tMaxMonitors').value = m;
}

async function saveTenant() {
  const id    = document.getElementById('tenantId').value;
  const isNew = !id;
  const body = {
    name:                document.getElementById('tName').value,
    domain:              document.getElementById('tDomain').value || null,
    plan:                document.getElementById('tPlan').value,
    expires_at:          document.getElementById('tExpires').value || null,
    max_users:           parseInt(document.getElementById('tMaxUsers').value),
    max_monitors:        parseInt(document.getElementById('tMaxMonitors').value),
    contact_email:       document.getElementById('tContactEmail').value || null,
    contact_phone:       document.getElementById('tContactPhone').value || null,
    address:             document.getElementById('tAddress').value || null,
    openweather_api_key: document.getElementById('tWeatherKey').value || null,
    ai_api_key:          document.getElementById('tAiKey').value || null,
    primary_color:       document.getElementById('tPrimaryColorHex').value || null
  };
  if (isNew) {
    body.admin_name     = document.getElementById('tAdminName').value;
    body.admin_email    = document.getElementById('tAdminEmail').value;
    body.admin_password = document.getElementById('tAdminPass').value;
  } else {
    // Al editar, permite actualizar admin y contraseña
    const newName  = document.getElementById('tAdminName').value;
    const newEmail = document.getElementById('tAdminEmail').value;
    const newPass  = document.getElementById('tAdminPass').value;
    if (newName || newEmail || newPass) {
      body.update_admin = true;
      if (newName)  body.admin_name = newName;
      if (newEmail) body.admin_email = newEmail;
      if (newPass)  body.admin_password = newPass;
    }
  }
  try {
    if (isNew) await api('/saas/tenants', { method:'POST', body });
    else       await api(`/saas/tenants/${id}`, { method:'PUT', body });
    closeTenantModal();
    loadTenants();
    showAdminToast('Cliente guardado correctamente.', 'success');
  } catch (e) { showAdminToast(e.message, 'error'); }
}

async function editTenant(id) { openTenantModal(id); }

async function suspendTenant(id, e) {
  e.stopPropagation();
  const t = allTenants.find(x => x.id === id);
  if (!t) return;
  const newStatus = t.status === 'active' ? 'suspended' : 'active';
  if (!confirm(`¿${newStatus==='suspended'?'Suspender':'Reactivar'} el cliente "${t.name}"?`)) return;
  try {
    await api(`/saas/tenants/${id}`, { method:'PUT', body:{ status: newStatus }});
    loadTenants();
    showAdminToast('Estado actualizado.', 'success');
  } catch (e) { showAdminToast(e.message, 'error'); }
}

async function renewTenant(id, e) {
  e.stopPropagation();
  const months = prompt('¿Renovar por cuántos meses?', '12');
  if (!months || isNaN(months)) return;
  const t = allTenants.find(x => x.id === id);
  const base = t?.expires_at && new Date(t.expires_at) > new Date()
    ? new Date(t.expires_at) : new Date();
  base.setMonth(base.getMonth() + parseInt(months));
  try {
    await api(`/saas/tenants/${id}`, { method:'PUT', body:{ expires_at: base.toISOString().slice(0,10), status:'active' }});
    loadTenants();
    showAdminToast(`Renovado hasta ${fmtDate(base.toISOString())}.`, 'success');
  } catch (e) { showAdminToast(e.message, 'error'); }
}

async function deleteTenant(id, name, e) {
  e.stopPropagation();
  if (!confirm(`¿ELIMINAR DEFINITIVAMENTE el cliente "${name}"?\n\nSe borrarán TODOS sus datos: usuarios, vehículos, viajes, facturas, etc.\nEsta acción NO se puede deshacer.`)) return;
  if (!confirm(`¿ESTÁ SEGURO? Esta acción es irreversible.`)) return;
  try {
    await api(`/saas/tenants/${id}`, { method:'DELETE' });
    loadTenants();
    showAdminToast('Cliente eliminado definitivamente.', 'success');
  } catch (e) { showAdminToast(e.message, 'error'); }
}

async function deleteUser(id, name) {
  if (!confirm(`¿ELIMINAR DEFINITIVAMENTE al usuario "${name}"?\n\nEsta acción NO se puede deshacer.`)) return;
  try {
    await api(`/users/${id}`, { method:'DELETE' });
    loadUsers();
    showAdminToast('Usuario eliminado definitivamente.', 'success');
  } catch (e) { showAdminToast(e.message, 'error'); }
}

// ── Upload Logo / Favicon ──────────────────────────────────────────────────
function previewImage(inputId, previewId, placeholderId) {
  const file = document.getElementById(inputId).files[0];
  if (!file) return;
  if (file.size > 600 * 1024) { showAdminToast('La imagen no debe superar 500KB.','error'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.getElementById(previewId);
    img.src = e.target.result;
    img.style.display = 'block';
    document.getElementById(placeholderId).style.display = 'none';
    // Mostrar botón de guardar
    const btnId = inputId.includes('logo') ? 'uploadLogoBtn' : 'uploadFaviconBtn';
    document.getElementById(btnId).style.display = 'block';
    // Actualizar vista previa de marca
    if (inputId.includes('logo')) {
      document.getElementById('previewHeaderLogo').src = e.target.result;
      document.getElementById('previewHeaderLogo').style.display = 'block';
    }
  };
  reader.readAsDataURL(file);
}

function showExistingImage(previewId, placeholderId, btnId, url) {
  const img = document.getElementById(previewId);
  img.src = url; img.style.display = 'block';
  document.getElementById(placeholderId).style.display = 'none';
  document.getElementById(btnId).style.display = 'none'; // ya guardado
}

function resetUploadUI(type) {
  const previewId    = type + 'Preview';
  const placeholderId = type + 'Placeholder';
  const btnId        = 'upload' + (type === 'logo' ? 'Logo' : 'Favicon') + 'Btn';
  const img = document.getElementById(previewId);
  if (img) { img.src = ''; img.style.display = 'none'; }
  const ph = document.getElementById(placeholderId);
  if (ph) ph.style.display = 'flex';
  const btn = document.getElementById(btnId);
  if (btn) btn.style.display = 'none';
}

async function uploadImage(type) {
  const tenantId = document.getElementById('tenantId').value;
  if (!tenantId) { showAdminToast('Guarde el cliente primero.', 'error'); return; }

  const inputId  = type + 'Input';
  const file = document.getElementById(inputId).files[0];
  if (!file) { showAdminToast('Seleccione una imagen primero.', 'error'); return; }

  const reader = new FileReader();
  reader.onload = async (e) => {
    const btnId = 'upload' + (type === 'logo' ? 'Logo' : 'Favicon') + 'Btn';
    const btn = document.getElementById(btnId);
    btn.textContent = '⏳ Subiendo...'; btn.disabled = true;
    try {
      const res = await api(`/saas/tenants/${tenantId}/upload`, {
        method: 'POST', body: { type, data_url: e.target.result }
      });
      showAdminToast(`${type === 'logo' ? 'Logo' : 'Favicon'} guardado correctamente.`, 'success');
      btn.style.display = 'none';
      // Actualizar lista de tenants
      const t = allTenants.find(x => x.id === tenantId);
      if (t) { if (type === 'logo') t.logo_url = res.url; else t.favicon_url = res.url; }
    } catch (err) { showAdminToast(err.message, 'error'); }
    btn.textContent = `☁️ Guardar ${type === 'logo' ? 'Logo' : 'Favicon'}`;
    btn.disabled = false;
  };
  reader.readAsDataURL(file);
}

function updateBrandPreview(tenant) {
  if (tenant.logo_url) {
    const logo = document.getElementById('previewHeaderLogo');
    logo.src = tenant.logo_url; logo.style.display = 'block';
  }
  document.getElementById('previewHeaderName').textContent = tenant.name || 'Empresa';
  const header = document.getElementById('brandHeaderPreview');
  if (header && tenant.primary_color) header.style.background = tenant.primary_color;
}

// ── Billing ────────────────────────────────────────────────────────────────
async function loadBilling() {
  try {
    const [stats, invoices] = await Promise.all([api('/billing/stats'), api('/billing/invoices')]);
    document.getElementById('billingKpiGrid').innerHTML = `
      <div class="kpi-card green"><div class="kpi-label">Ingresos Totales</div><div class="kpi-val">${fmtMoney(stats.total_revenue)}</div></div>
      <div class="kpi-card green"><div class="kpi-label">Ingresos del Mes</div><div class="kpi-val">${fmtMoney(stats.month_revenue)}</div></div>
      <div class="kpi-card orange"><div class="kpi-label">Por Cobrar</div><div class="kpi-val">${fmtMoney(stats.pending_amount)}</div></div>
      <div class="kpi-card red"><div class="kpi-label">Facturas Vencidas</div><div class="kpi-val">${stats.overdue}</div></div>
    `;
    document.getElementById('invoicesTable').innerHTML = buildInvoicesTable(invoices);
  } catch (e) { console.error(e); }
}

function buildInvoicesTable(invoices) {
  if (!invoices.length) return '<p style="padding:24px;text-align:center;color:#888">Sin facturas.</p>';
  return `<table>
    <thead><tr><th>Cliente</th><th>Monto</th><th>Descripción</th><th>Estado</th><th>Vence</th><th style="text-align:right">Acciones</th></tr></thead>
    <tbody>${invoices.map(inv => `
      <tr>
        <td><strong>${esc(inv.tenant_name)}</strong></td>
        <td><strong>${inv.currency==='PEN'?'S/ '+inv.amount:inv.currency+' '+inv.amount}</strong></td>
        <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(inv.description||'—')}</td>
        <td><span class="status status-${inv.status}">${statusLabel(inv.status)}</span></td>
        <td style="color:${inv.status==='pending'&&inv.due_date&&new Date(inv.due_date)<new Date()?'#c62828':'inherit'};font-size:.82rem">
          ${inv.due_date ? fmtDate(inv.due_date) : '—'}
        </td>
        <td style="text-align:right;white-space:nowrap">
          ${inv.status==='pending'?`<button class="btn btn-success btn-sm" onclick="markPaid('${inv.id}')">✅ Cobrada</button>`:''}
          ${inv.status==='pending'?`<button class="btn btn-danger btn-sm" onclick="cancelInvoice('${inv.id}')">❌</button>`:''}
        </td>
      </tr>`).join('')}
    </tbody>
  </table>`;
}

function openInvoiceModal() {
  if (!allTenants.length) { showAdminToast('Cargando clientes...','error'); loadTenants().then(openInvoiceModal); return; }
  populateTenantSelects();
  document.getElementById('invoiceModal').classList.add('show');
}
function closeInvoiceModal() { document.getElementById('invoiceModal').classList.remove('show'); }

async function saveInvoice() {
  try {
    await api('/billing/invoices', { method:'POST', body:{
      tenant_id:    document.getElementById('invTenant').value,
      amount:       parseFloat(document.getElementById('invAmount').value),
      currency:     document.getElementById('invCurrency').value,
      description:  document.getElementById('invDesc').value || null,
      period_start: document.getElementById('invStart').value || null,
      period_end:   document.getElementById('invEnd').value || null,
      due_date:     document.getElementById('invDue').value || null
    }});
    closeInvoiceModal();
    loadBilling();
    showAdminToast('Factura creada.', 'success');
  } catch (e) { showAdminToast(e.message, 'error'); }
}

async function markPaid(id) {
  if (!confirm('¿Marcar factura como pagada?')) return;
  try { await api(`/billing/invoices/${id}/pay`, { method:'PUT' }); loadBilling(); showAdminToast('Factura pagada.','success'); }
  catch (e) { showAdminToast(e.message,'error'); }
}

async function cancelInvoice(id) {
  if (!confirm('¿Cancelar esta factura?')) return;
  try { await api(`/billing/invoices/${id}/cancel`, { method:'PUT' }); loadBilling(); showAdminToast('Factura cancelada.','success'); }
  catch (e) { showAdminToast(e.message,'error'); }
}

// ── Users ──────────────────────────────────────────────────────────────────
async function loadUsers() {
  // Asegurarse de tener tenants cargados
  if (!allTenants.length) allTenants = await api('/saas/tenants').catch(() => []);
  populateTenantSelects();

  const tenantId = document.getElementById('userTenantFilter')?.value || '';
  try {
    let allUsers;
    if (tenantId) {
      allUsers = await api(`/users?tenant_id=${tenantId}`);
    } else {
      const results = await Promise.all(allTenants.map(t =>
        api(`/users?tenant_id=${t.id}`).catch(() => [])
      ));
      allUsers = results.flat();
    }

    if (!allUsers.length) {
      document.getElementById('usersTable').innerHTML =
        '<p style="padding:24px;color:#888;text-align:center">Sin usuarios. Seleccione un cliente o cree uno nuevo.</p>';
      return;
    }

    document.getElementById('usersTable').innerHTML = `<table>
      <thead><tr>
        <th>Nombre</th><th>Email</th><th>Cliente</th>
        <th>Rol</th><th>Estado</th><th>Último Acceso</th>
        <th style="text-align:right">Acciones</th>
      </tr></thead>
      <tbody>${allUsers.map(u => {
        const tenantName = allTenants.find(t => t.id === u.tenant_id)?.name || '—';
        return `<tr>
          <td><strong>${esc(u.name)}</strong></td>
          <td style="font-size:.82rem;color:#666">${esc(u.email)}</td>
          <td style="font-size:.82rem">${esc(tenantName)}</td>
          <td><span class="status plan-${u.role==='admin'?'pro':u.role==='monitor'?'basic':'free'}">${roleLabel(u.role)}</span></td>
          <td><span class="status status-${u.is_active?'active':'suspended'}">${u.is_active?'Activo':'Inactivo'}</span></td>
          <td style="font-size:.8rem;color:#888">${u.last_login ? fmtDate(u.last_login) : 'Nunca'}</td>
          <td style="text-align:right;white-space:nowrap">
            <button class="btn btn-secondary btn-sm" title="Editar usuario"
              onclick="openEditUser('${u.id}')">✏️ Editar</button>
            <button class="btn-warning btn-sm" title="Cambiar contraseña"
              onclick="openChangePassword('${u.id}','${escAttr(u.name)}')">🔑</button>
            <button class="btn ${u.is_active?'btn-danger':'btn-success'} btn-sm"
              title="${u.is_active?'Desactivar':'Activar'}" onclick="toggleUser('${u.id}',${u.is_active})">
              ${u.is_active?'⏸️':'▶️'}
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteUser('${u.id}','${escAttr(u.name)}')" title="Eliminar definitivo">🗑️</button>
          </td>
        </tr>`;
      }).join('')}
      </tbody></table>`;
  } catch (e) { console.error(e); showAdminToast('Error cargando usuarios.','error'); }
}

// ── Cache rápido de usuarios para edición ─────────────────────────────────
let _usersCache = [];

function openUserModal() {
  if (!allTenants.length) { showAdminToast('Cargando clientes...','error'); return; }
  populateTenantSelects();
  document.getElementById('uId').value = '';
  document.getElementById('userModalTitle').textContent = '👤 Nuevo Usuario';
  document.getElementById('uTenantWrap').style.display = 'block';
  document.getElementById('uPassLabel').textContent = 'Contraseña *';
  document.getElementById('uPassHint').style.display = 'none';
  ['uName','uEmail','uPass','uPhone'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('uRole').value = 'user';
  document.getElementById('uEmail').readOnly = false;
  document.getElementById('userModal').classList.add('show');
}

async function openEditUser(userId) {
  // Buscar usuario en cache o hacer fetch
  let u = _usersCache.find(x => x.id === userId);
  if (!u) {
    // Buscar en todos los tenants
    for (const t of allTenants) {
      try {
        const users = await api(`/users?tenant_id=${t.id}`);
        _usersCache.push(...users.filter(x => !_usersCache.find(c => c.id === x.id)));
        u = users.find(x => x.id === userId);
        if (u) { u.tenant_id = t.id; break; }
      } catch {}
    }
  }
  if (!u) { showAdminToast('No se encontró el usuario.','error'); return; }

  populateTenantSelects();
  document.getElementById('uId').value              = u.id;
  document.getElementById('userModalTitle').textContent = '✏️ Editar Usuario';
  document.getElementById('uTenantWrap').style.display  = 'none';
  document.getElementById('uPassLabel').textContent      = 'Nueva Contraseña (opcional)';
  document.getElementById('uPassHint').style.display     = 'inline';
  document.getElementById('uName').value     = u.name;
  document.getElementById('uEmail').value    = u.email;
  document.getElementById('uEmail').readOnly = true;
  document.getElementById('uPass').value     = '';
  document.getElementById('uRole').value     = u.role;
  document.getElementById('uPhone').value    = u.phone || '';
  document.getElementById('userModal').classList.add('show');
}

function closeUserModal() { document.getElementById('userModal').classList.remove('show'); }

async function saveUser() {
  const id = document.getElementById('uId').value;
  const isEdit = !!id;

  const name   = document.getElementById('uName').value.trim();
  const email  = document.getElementById('uEmail').value.trim();
  const pass   = document.getElementById('uPass').value.trim();
  const role   = document.getElementById('uRole').value;
  const phone  = document.getElementById('uPhone').value.trim() || null;

  if (!name) { showAdminToast('El nombre es requerido.','error'); return; }
  if (!isEdit && !email) { showAdminToast('El email es requerido.','error'); return; }
  if (!isEdit && !pass)  { showAdminToast('La contraseña es requerida al crear.','error'); return; }

  try {
    if (isEdit) {
      const body = { name, role, phone };
      if (pass) body.password = pass;
      await api(`/users/${id}`, { method:'PUT', body });
      _usersCache = _usersCache.filter(u => u.id !== id); // invalidar cache
      showAdminToast('Usuario actualizado correctamente.','success');
    } else {
      await api('/users', { method:'POST', body:{
        tenant_id: document.getElementById('uTenant').value,
        name, email, password: pass, role, phone
      }});
      showAdminToast('Usuario creado correctamente.','success');
    }
    closeUserModal();
    loadUsers();
  } catch (e) { showAdminToast(e.message,'error'); }
}

async function toggleUser(id, isActive) {
  try {
    await api(`/users/${id}`, { method:'PUT', body:{ is_active: isActive ? 0 : 1 }});
    loadUsers();
    showAdminToast(`Usuario ${isActive?'desactivado':'activado'}.`,'success');
  } catch (e) { showAdminToast(e.message,'error'); }
}

// ── Cambio de Contraseña ───────────────────────────────────────────────────
function openChangePassword(userId, userName) {
  document.getElementById('changePassUserId').value   = userId;
  document.getElementById('changePassUserName').textContent = userName;
  document.getElementById('newPassInput').value      = '';
  document.getElementById('confirmPassInput').value  = '';
  document.getElementById('changePassModal').classList.add('show');
}

function closeChangePassword() {
  document.getElementById('changePassModal').classList.remove('show');
}

async function saveNewPassword() {
  const id      = document.getElementById('changePassUserId').value;
  const newPass = document.getElementById('newPassInput').value.trim();
  const confirm = document.getElementById('confirmPassInput').value.trim();

  if (!newPass || newPass.length < 6) {
    showAdminToast('La contraseña debe tener al menos 6 caracteres.', 'error'); return;
  }
  if (newPass !== confirm) {
    showAdminToast('Las contraseñas no coinciden.', 'error'); return;
  }
  try {
    await api(`/users/${id}`, { method:'PUT', body:{ password: newPass }});
    closeChangePassword();
    showAdminToast('✅ Contraseña actualizada correctamente.', 'success');
  } catch (e) { showAdminToast('Error: ' + e.message, 'error'); }
}

// ── Risk Points ────────────────────────────────────────────────────────────
async function loadRiskPoints() {
  if (!allTenants.length) allTenants = await api('/saas/tenants').catch(() => []);
  try {
    const results = await Promise.all(allTenants.map(t =>
      api(`/riskpoints?tenant_id=${t.id}`).catch(() => [])
    ));
    const all = results.flatMap((pts, i) => pts.map(r => ({ ...r, _tenant: allTenants[i]?.name || '—' })));

    document.getElementById('riskTable').innerHTML = all.length
      ? `<table>
          <thead><tr><th>Tipo</th><th>Descripción</th><th>Severidad</th><th>Ubicación</th><th>Cliente</th><th>Fecha</th></tr></thead>
          <tbody>${all.slice(0,100).map(r => {
            const rc = getRiskConfig(r.type);
            const sc = getSeverityConfig(r.severity);
            return `<tr>
              <td>${rc.icon} <strong>${rc.label}</strong></td>
              <td style="font-size:.82rem">${esc(r.description || r.name || '—')}</td>
              <td><span style="color:${sc.color};font-weight:700;font-size:.8rem">${sc.label}</span></td>
              <td style="font-size:.78rem;color:#888">${r.lat?.toFixed(4)}, ${r.lng?.toFixed(4)}</td>
              <td style="font-size:.82rem">${esc(r._tenant)}</td>
              <td style="font-size:.78rem;color:#888">${fmtDate(r.created_at)}</td>
            </tr>`;
          }).join('')}</tbody>
         </table>`
      : '<p style="padding:24px;text-align:center;color:#888">Sin puntos de riesgo registrados.</p>';
  } catch (e) { console.error(e); }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function populateTenantSelects() {
  ['invTenant','uTenant','userTenantFilter'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const hasAll = id === 'userTenantFilter';
    el.innerHTML = (hasAll ? '<option value="">— Todos los clientes —</option>' : '') +
      allTenants.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  });
}

function togglePass(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.type = el.type === 'password' ? 'text' : 'password';
}

function fmtMoney(n) {
  if (!n) return 'S/ 0.00';
  return 'S/ ' + parseFloat(n).toFixed(2);
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es', { day:'2-digit', month:'short', year:'numeric' });
}

function isExpiredSoon(dateStr) {
  if (!dateStr) return false;
  const diff = new Date(dateStr) - new Date();
  return diff > 0 && diff < 30 * 86400000;
}

function planLabel(p) {
  return { free:'Free', basic:'Basic', pro:'Pro', enterprise:'Enterprise' }[p] || p;
}

function statusLabel(s) {
  return { active:'Activo', suspended:'Suspendido', expired:'Vencido', pending:'Pendiente', paid:'Pagado', overdue:'Vencida', cancelled:'Cancelada' }[s] || s;
}

function roleLabel(r) {
  return { superadmin:'Super Admin', admin:'Admin', monitor:'Monitor', user:'Usuario' }[r] || r;
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
// Para atributos onclick que usan comillas simples
function escAttr(str) {
  if (!str) return '';
  return String(str).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
}

function showAdminToast(msg, type = 'info') {
  const colors = { success:'#2e7d32', error:'#c62828', warning:'#f57f17', info:'#1565c0' };
  const div = document.createElement('div');
  div.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 20px;
    border-radius:10px;font-weight:600;font-size:.88rem;
    box-shadow:0 4px 20px rgba(0,0,0,.25);max-width:340px;line-height:1.4;
    background:${colors[type]||colors.info};color:#fff;
    animation:slideInRight .25s ease;`;
  div.textContent = msg;
  document.body.appendChild(div);
  setTimeout(() => { div.style.opacity='0'; div.style.transition='opacity .3s'; setTimeout(()=>div.remove(),300); }, 3500);
}

// CSS para animación del toast
const toastStyle = document.createElement('style');
toastStyle.textContent = '@keyframes slideInRight{from{transform:translateX(60px);opacity:0}to{transform:none;opacity:1}}';
document.head.appendChild(toastStyle);
