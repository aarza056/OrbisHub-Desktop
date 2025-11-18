(function() {
  // Safe fallbacks for lock helpers (defined later in app-main.js)
  function getLockHelpers() {
    return {
      createLockButton: (window.createLockButton || ((type, id) => '')),
      isCardLocked: (window.isCardLocked || (() => false)),
      toggleCardLock: (window.toggleCardLock || (() => {}))
    }
  }

  // Render environments into #envList
  function renderEnvs(filter = '') {
    const envList = document.getElementById('envList')
    if (!envList) return
    const db = store.readSync()
    const environments = db.environments || []
    if (!Array.isArray(environments)) {
      console.error('db.environments is not an array:', environments)
      db.environments = []
      store.write(db)
      return
    }

    const { createLockButton, isCardLocked, toggleCardLock } = getLockHelpers()

    const q = (filter || '').toLowerCase()
    envList.innerHTML = ''
    environments
      .filter(e => !q || e.name.toLowerCase().includes(q) || e.url.toLowerCase().includes(q))
      .forEach(env => {
        const mappedServerIds = env.mappedServers || []
        const mappedServers = mappedServerIds.map(id => db.servers?.find(s => s.id === id)).filter(Boolean)

        let uptimeSectionHTML = ''
        if (mappedServers.length > 0) {
          const serversByType = { 'Front End': [], 'Back End': [], 'Win Server': [], 'Web Server': [] }
          mappedServers.forEach(srv => { if (serversByType[srv.type]) serversByType[srv.type].push(srv) })
          let uptimeRowsHTML = ''
          Object.keys(serversByType).forEach(type => {
            const servers = serversByType[type]
            if (servers.length > 0) {
              servers.forEach(server => {
                uptimeRowsHTML += `<div class="uptime-row" data-server-id="${server.id}"><span>${server.displayName}</span><span class="uptime-value">—</span></div>`
              })
            }
          })
          uptimeSectionHTML = `<div class="env__uptime">${uptimeRowsHTML}</div>`
        }

        const el = document.createElement('div')
        el.className = 'card env'
        if (isCardLocked('environment', env.id)) el.classList.add('is-locked')
        el.draggable = true
        el.dataset.envId = env.id
        el.innerHTML = `
          ${createLockButton('environment', env.id)}
          <button class="env__delete-btn" data-action="delete" data-id="${env.id}" title="Delete environment">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
          <div class="env__health ${(env.health || 'ok') === 'faulty' ? 'is-faulty' : (env.health || 'ok') === 'warning' ? 'is-warning' : 'is-ok'}" 
               title="Health: ${env.health === 'faulty' ? 'Faulty' : env.health === 'warning' ? 'Warning' : 'OK'}"></div>
          <div class="title">${env.name}</div>
          <div class="meta muted">${env.type} • ${env.url}</div>
          ${uptimeSectionHTML}
          <div class="actions row">
            <button class="btn btn-icon" data-action="open-url" data-url="${env.url}" title="Open ${env.url}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
            </button>
            <button class="btn" data-action="details" data-id="${env.id}">Show Details</button>
            <button class="btn btn-ghost" data-action="edit" data-id="${env.id}">Edit</button>
          </div>
        `

        const lockBtn = el.querySelector('.card-lock-btn')
        if (lockBtn) {
          lockBtn.addEventListener('click', (e) => {
            e.stopPropagation()
            toggleCardLock(el, 'environment', env.id)
          })
        }

        el.addEventListener('dragstart', (e) => {
          el.classList.add('dragging')
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/html', el.innerHTML)
        })

        el.addEventListener('dragend', () => {
          el.classList.remove('dragging')
          const cards = Array.from(envList.querySelectorAll('.env'))
          const newOrder = cards.map(card => card.dataset.envId)
          const db = store.readSync()
          db.environments.sort((a, b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id))
          store.write(db)
        })

        el.addEventListener('dragover', (e) => {
          e.preventDefault()
          const draggingCard = document.querySelector('.dragging')
          if (draggingCard && draggingCard !== el) {
            const rect = el.getBoundingClientRect()
            const midpoint = rect.left + rect.width / 2
            if (e.clientX < midpoint) envList.insertBefore(draggingCard, el)
            else envList.insertBefore(draggingCard, el.nextSibling)
          }
        })

        el.querySelectorAll('button[data-action]').forEach(b => b.addEventListener('click', (ev) => {
          const id = b.dataset.id
          const action = b.dataset.action
          if (action === 'open-url') {
            const url = b.dataset.url
            if (url && window.electronAPI && window.electronAPI.openExternal) window.electronAPI.openExternal(url)
            else if (url) window.open(url, '_blank')
            return
          }
          const db = store.readSync()
          const env = db.environments.find(x => x.id === id)
          if (env) onEnvAction(env, action)
        }))

        const existingCard = envList.querySelector(`[data-env-id="${env.id}"]`)
        if (!existingCard) el.classList.add('env--entering')
        envList.appendChild(el)

        // After DOM insert, resolve uptimes for mapped servers
        if (mappedServers.length > 0) {
          updateEnvUptimes(el, mappedServers)
        }
      })
  }

  // Delete Environment modal handling
  const deleteEnvModal = document.getElementById('deleteEnvModal')
  let envToDelete = null

  function closeDeleteEnvModal() {
    try { deleteEnvModal.close() } catch (e) {}
    try { deleteEnvModal.removeAttribute('open') } catch (e) {}
    const focused = deleteEnvModal.querySelector(':focus')
    if (focused && typeof focused.blur === 'function') focused.blur()
    envToDelete = null
  }

  if (deleteEnvModal) {
    deleteEnvModal.addEventListener('close', () => {
      if (deleteEnvModal.returnValue === 'confirm' && envToDelete) {
        const envToRemove = envToDelete
        const cardToDelete = document.querySelector(`.env[data-env-id="${envToRemove.id}"]`)
        const performDelete = () => {
          const db = store.readSync()
          const idx = db.environments.findIndex(x => x.id === envToRemove.id)
          if (idx >= 0) {
            const envName = db.environments[idx].name
            const envId = db.environments[idx].id
            store.deleteFromDatabase('environment', envId).catch(err => console.error('Failed to delete from database:', err))
            db.environments.splice(idx, 1)
            store.write(db)
            logAudit('delete', 'environment', envName, {})
            ToastManager?.success?.('Environment Deleted', `${envName} has been removed from your environments`, 4000)
            const searchInput = document.getElementById('search')
            renderEnvs(searchInput ? searchInput.value : '')
            if (typeof renderServers === 'function') renderServers()
          }
        }
        if (cardToDelete) {
          cardToDelete.classList.add('env--exiting')
          setTimeout(performDelete, 300)
        } else {
          performDelete()
        }
      }
      envToDelete = null
    })

    deleteEnvModal.addEventListener('click', (e) => { if (e.target === deleteEnvModal) closeDeleteEnvModal() })
    const cancelBtn = deleteEnvModal.querySelector('button[value="cancel"]')
    if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); closeDeleteEnvModal() })
  }

  function onEnvAction(env, action) {
    if (action === 'export') queueJob(`Export ${env.name}`, 3000)
    if (action === 'import') queueJob(`Import → ${env.name}`, 4000)
    if (action === 'backup') queueJob(`Backup ${env.name}`, 2500)
    if (action === 'list-solutions') alert('Stub: show solutions for ' + env.name)
    if (action === 'details') showEnvDetails(env)
    if (action === 'edit') openEditEnv(env)
    if (action === 'delete') {
      envToDelete = env
      const nameSpan = document.getElementById('deleteEnvName')
      if (nameSpan) nameSpan.textContent = env.name
      try { deleteEnvModal.showModal(); deleteEnvModal.querySelector('button[value="confirm"]')?.focus() } catch (e) { deleteEnvModal.setAttribute('open', '') }
    }
  }

  // Environment Details modal
  const envDetailsModal = document.getElementById('envDetailsModal')
  function showEnvDetails(env) {
    if (!envDetailsModal) return
    const content = document.getElementById('envDetailsContent')
    if (content) {
      const healthStatus = env.health === 'faulty' ? 'Faulty' : env.health === 'warning' ? 'Warning' : 'OK'
      const healthColor = env.health === 'faulty' ? '#ef4444' : env.health === 'warning' ? '#facc15' : '#4ade80'
      content.innerHTML = `
        <div style="display: grid; gap: 16px;">
          <div class="detail-row"><div class="detail-label">Name</div><div class="detail-value">${env.name}</div></div>
          <div class="detail-row"><div class="detail-label">URL</div><div class="detail-value"><a href="${env.url}" target="_blank" style="color: var(--primary); text-decoration: none;">${env.url}</a></div></div>
          <div class="detail-row"><div class="detail-label">Type</div><div class="detail-value">${env.type}</div></div>
          <div class="detail-row"><div class="detail-label">Health Status</div><div class="detail-value"><span style="display: inline-flex; align-items: center; gap: 8px;"><span style="width: 12px; height: 12px; border-radius: 50%; background: ${healthColor};"></span>${healthStatus}</span></div></div>
          <div class="detail-row"><div class="detail-label">Environment ID</div><div class="detail-value" style="font-family: monospace; font-size: 12px; color: #9aa3b2; opacity: 0.8;">${env.id}</div></div>
        </div>`
    }
    envDetailsModal.dataset.envId = env.id
    try { envDetailsModal.showModal() } catch (e) { envDetailsModal.setAttribute('open', '') }
  }

  // Map Servers modal
  const mapServersModal = document.getElementById('mapServersModal')
  let currentMappingEnv = null

  function openMapServers(env) {
    if (!mapServersModal) return
    currentMappingEnv = env
    const envNameSpan = document.getElementById('mapServersEnvName')
    if (envNameSpan) envNameSpan.textContent = env.name
    populateAllServerTypes(env)
    try { mapServersModal.showModal() } catch (e) { mapServersModal.setAttribute('open', '') }
  }

  function populateAllServerTypes(env) {
    const allTypesContainer = document.getElementById('mapServersAllTypes')
    if (!allTypesContainer || !env) return
    const db = store.readSync()
    const servers = db.servers || []
    const existingMappedServers = env.mappedServers || []
    const compatibleServers = servers.filter(server => server.serverGroup === env.type)
    if (compatibleServers.length === 0) {
      allTypesContainer.innerHTML = '<div style="color: var(--muted); font-size: 14px; padding: 8px;">No compatible servers found for this environment type.</div>'
      return
    }
    const serversByType = { 'Front End': [], 'Back End': [], 'Win Server': [], 'Web Server': [] }
    compatibleServers.forEach(server => { if (serversByType[server.type]) serversByType[server.type].push(server) })
    let html = ''
    Object.keys(serversByType).forEach(type => {
      const serversOfType = serversByType[type]
      if (serversOfType.length > 0) {
        html += `<div style="margin-bottom: 20px;"><h4 style="margin: 0 0 8px 0; color: var(--text); font-size: 14px; font-weight: 600;">${type}</h4><div style="padding-left: 8px; border-left: 2px solid var(--border);">`
        serversOfType.forEach(server => {
          const isChecked = existingMappedServers.includes(server.id)
          html += `<label style="display: flex; align-items: center; gap: 8px; padding: 4px 0; cursor: pointer;"><input type="checkbox" value="${server.id}" ${isChecked ? 'checked' : ''}><span style="flex: 1;">${server.displayName}</span><span style="color: var(--muted); font-size: 12px; font-family: monospace;">${server.ipAddress || 'N/A'}</span></label>`
        })
        html += '</div></div>'
      }
    })
    if (html === '') html = '<div style="color: var(--muted); font-size: 14px; padding: 8px;">No servers available for this environment type.</div>'
    allTypesContainer.innerHTML = html
  }

  function closeMapServersModal() {
    try { mapServersModal.close() } catch (e) {}
    try { mapServersModal.removeAttribute('open') } catch (e) {}
    currentMappingEnv = null
  }

  if (mapServersModal) {
    const cancelBtn = mapServersModal.querySelector('button[value="cancel"]')
    if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); closeMapServersModal() })
    mapServersModal.addEventListener('click', (e) => { if (e.target === mapServersModal) closeMapServersModal() })
  }

  const saveMapServersBtn = document.getElementById('saveMapServersBtn')
  if (saveMapServersBtn) {
    saveMapServersBtn.addEventListener('click', (e) => {
      e.preventDefault()
      if (!currentMappingEnv) return
      const allTypesContainer = document.getElementById('mapServersAllTypes')
      const checkboxes = allTypesContainer.querySelectorAll('input[type="checkbox"]:checked')
      const selectedServerIds = Array.from(checkboxes).map(cb => cb.value)
      const db = store.readSync()
      const env = db.environments.find(e => e.id === currentMappingEnv.id)
      if (env) {
        const oldServers = env.mappedServers || []
        env.mappedServers = selectedServerIds
        store.write(db)
        logAudit('update', 'environment', env.name, { old: { mappedServers: oldServers }, new: { mappedServers: selectedServerIds } })
        renderEnvs(document.getElementById('search')?.value || '')
      }
      closeMapServersModal()
    })
  }

  const envDetailsDeployBtn = document.getElementById('envDetailsDeployBtn')
  const envDetailsSolutionsBtn = document.getElementById('envDetailsSolutionsBtn')
  const envDetailsMapServersBtn = document.getElementById('envDetailsMapServersBtn')

  if (envDetailsDeployBtn && envDetailsModal) {
    envDetailsDeployBtn.addEventListener('click', () => {
      const envId = envDetailsModal.dataset.envId
      if (envId) {
        const db = store.readSync()
        const env = db.environments.find(e => e.id === envId)
        if (env) { queueJob(`Deploy to ${env.name}`, 5000); try { envDetailsModal.close() } catch (e) {} }
      }
    })
  }

  if (envDetailsSolutionsBtn && envDetailsModal) {
    envDetailsSolutionsBtn.addEventListener('click', () => {
      const envId = envDetailsModal.dataset.envId
      if (envId) {
        const db = store.readSync()
        const env = db.environments.find(e => e.id === envId)
        if (env) alert('Stub: show solutions for ' + env.name)
      }
    })
  }

  if (envDetailsMapServersBtn && envDetailsModal) {
    envDetailsMapServersBtn.addEventListener('click', () => {
      const envId = envDetailsModal.dataset.envId
      if (envId) {
        const db = store.readSync()
        const env = db.environments.find(e => e.id === envId)
        if (env) { openMapServers(env); try { envDetailsModal.close() } catch (e) {} }
      }
    })
  }

  // Edit Environment modal
  const editEnvModal = document.getElementById('editEnvModal')
  function openEditEnv(env) {
    if (!editEnvModal) return
    document.getElementById('editEnvId').value = env.id
    document.getElementById('editEnvName').value = env.name
    document.getElementById('editEnvUrl').value = env.url
    document.getElementById('editEnvType').value = env.type
    try { editEnvModal.showModal(); document.getElementById('editEnvName').focus() } catch (e) { editEnvModal.setAttribute('open','') }
  }

  function closeEditEnvModal() {
    try { editEnvModal.close() } catch (e) {}
    try { editEnvModal.removeAttribute('open') } catch (e) {}
    const f = editEnvModal?.querySelector(':focus'); if (f && f.blur) f.blur()
  }

  if (editEnvModal) {
    const cancelEdit = editEnvModal.querySelector('button[value="cancel"]')
    if (cancelEdit) cancelEdit.addEventListener('click', (e) => { e.preventDefault(); closeEditEnvModal() })
    editEnvModal.addEventListener('click', (e) => { if (e.target === editEnvModal) closeEditEnvModal() })
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && editEnvModal.hasAttribute('open')) closeEditEnvModal() })
    const editForm = editEnvModal.querySelector('form')
    if (editForm) editForm.addEventListener('submit', (e) => {
      e.preventDefault()
      const id = document.getElementById('editEnvId').value
      const name = document.getElementById('editEnvName').value.trim()
      const url = document.getElementById('editEnvUrl').value.trim()
      const type = document.getElementById('editEnvType').value
      if (!id || !name || !url) return
      const db = store.readSync()
      const env = db.environments.find(x => x.id === id)
      if (env) {
        const oldValues = { name: env.name, url: env.url, type: env.type }
        env.name = name; env.url = url; env.type = type
        store.write(db)
        logAudit('update', 'environment', name, { old: oldValues, new: { name, url, type } })
        ToastManager?.success?.('Environment Updated', `${name} has been successfully updated`, 4000)
        const searchInput = document.getElementById('search')
        renderEnvs(searchInput ? searchInput.value : '')
      }
      closeEditEnvModal()
    })
  }

  // Add environment modal
  const addEnvBtn = document.getElementById('addEnvBtn')
  const envModal = document.getElementById('envModal')

  function closeEnvModal() {
    if (!envModal) return
    try { envModal.close() } catch (e) {}
    try { envModal.removeAttribute('open') } catch (e) {}
    try { const focused = envModal.querySelector(':focus'); if (focused && typeof focused.blur === 'function') focused.blur() } catch (e) {}
    const nameEl = document.getElementById('envName')
    const urlEl = document.getElementById('envUrl')
    const typeEl = document.getElementById('envType')
    if (nameEl) nameEl.value = ''
    if (urlEl) urlEl.value = ''
    if (typeEl) typeEl.value = 'Production'
    try { addEnvBtn && addEnvBtn.focus() } catch (e) {}
  }

  if (addEnvBtn && envModal) {
    addEnvBtn.addEventListener('click', () => {
      try { envModal.showModal(); envModal.querySelector('#envName')?.focus() } catch (e) { envModal.setAttribute('open', '') }
    })
  }

  const cancelBtn = document.querySelector('#envModal button[value="cancel"]')
  if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); closeEnvModal() })
  if (envModal) envModal.addEventListener('click', (e) => { if (e.target === envModal) closeEnvModal() })
  document.addEventListener('keydown', (e) => { if (envModal && e.key === 'Escape' && envModal.hasAttribute('open')) closeEnvModal() })

  const envForm = envModal ? envModal.querySelector('form') : null
  if (envForm) {
    envForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      const name = document.getElementById('envName').value.trim()
      const url = document.getElementById('envUrl').value.trim()
      const type = document.getElementById('envType').value
      if (!name || !url) return
      try {
        const db = store.readSync()
        const newEnv = { id: uid(), name, url, type, health: 'ok', mappedServers: [], createdAt: Date.now() }
        db.environments.push(newEnv)
        await store.write(db)
        memoryCache = db
        logAudit('create', 'environment', name, { url, type })
        ToastManager?.success?.('Environment Created', `${name} has been successfully added to ${type}`, 4000)
        document.getElementById('envName').value = ''
        document.getElementById('envUrl').value = ''
        document.getElementById('envType').value = 'Production'
        try { envModal.close() } catch (e) {}
        const searchInput = document.getElementById('search')
        renderEnvs(searchInput ? searchInput.value : '')
      } catch (error) {
        console.error('❌ Failed to create environment:', error)
        alert('Failed to create environment: ' + error.message)
      }
    })
  }

  // Environments search
  const searchInput = document.getElementById('search')
  if (searchInput) searchInput.addEventListener('input', (e) => renderEnvs(e.target.value))

  // Expose APIs used elsewhere
  window.renderEnvs = renderEnvs
  window.openEditEnv = openEditEnv
  window.showEnvDetails = showEnvDetails
  window.openMapServers = openMapServers
})()

// Lightweight uptime cache to reduce repeated IPC calls during re-renders
const __uptimeCache = {}

function formatUptime(seconds) {
  if (typeof seconds !== 'number' || seconds < 0) return '—'
  const d = Math.floor(seconds / 86400)
  seconds %= 86400
  const h = Math.floor(seconds / 3600)
  seconds %= 3600
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const hh = String(h).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return d > 0 ? `${d}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`
}

async function fetchServerUptime(server) {
  try {
    if (!window.electronAPI || !window.electronAPI.getServerUptime) return null
    const db = store.readSync()
    let username = ''
    let password = ''
    if (server.credentialId) {
      const cred = (db.credentials || []).find(c => c.id === server.credentialId)
      if (cred) { username = cred.username || ''; password = cred.password || '' }
    }
    const res = await window.electronAPI.getServerUptime({
      host: server.ipAddress || server.hostname,
      osType: server.os || 'Windows',
      username,
      password,
      port: server.os === 'Linux' ? (server.port || 22) : (server.port || 5985)
    })
    if (res && res.success) return res.seconds
    // Attach error tooltip to help diagnose N/A state
    if (res && res.error) {
      try {
        const row = document.querySelector(`.uptime-row[data-server-id="${server.id}"] .uptime-value`)
        if (row) row.title = String(res.error)
      } catch {}
    }
    return null
  } catch (e) {
    return null
  }
}

function updateEnvUptimes(envCardEl, servers) {
  const now = Date.now()
  servers.forEach(async (server) => {
    const row = envCardEl.querySelector(`.uptime-row[data-server-id="${server.id}"] .uptime-value`)
    if (!row) return
    const cacheKey = server.id
    const cached = __uptimeCache[cacheKey]
    if (cached && now - cached.ts < 60_000) {
      row.textContent = formatUptime(cached.seconds)
      return
    }
    row.textContent = '…'
    const seconds = await fetchServerUptime(server)
    if (typeof seconds === 'number') {
      __uptimeCache[cacheKey] = { seconds, ts: Date.now() }
      row.textContent = formatUptime(seconds)
    } else {
      row.textContent = 'N/A'
    }
  })
}

// Periodically refresh uptimes when Environments view is visible
;(function setupUptimeAutoRefresh() {
  try {
    const refresh = () => {
      const view = document.getElementById('view-environments')
      if (!view || !view.classList.contains('is-visible')) return
      const db = store.readSync()
      const environments = db.environments || []
      environments.forEach(env => {
        const card = document.querySelector(`.env[data-env-id="${env.id}"]`)
        if (!card) return
        const mappedServerIds = env.mappedServers || []
        if (!mappedServerIds.length) return
        const servers = (db.servers || []).filter(s => mappedServerIds.includes(s.id))
        if (servers.length) updateEnvUptimes(card, servers)
      })
    }
    // Initial slight delay to allow first render, then every 60s
    setTimeout(refresh, 1500)
    setInterval(refresh, 60_000)
  } catch (e) {
    // noop
  }
})()
