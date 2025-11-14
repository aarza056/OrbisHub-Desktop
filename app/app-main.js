// Simple router between views
// Updated: 2025-11-10 - Login system v2

// Desktop app - no API server needed, using Electron IPC directly
// Empty API_BASE_URL since app.js intercepts all /api/ calls
const API_BASE_URL = ''

// Session management (in-memory only)
let currentUser = null

function getSession() {
    return currentUser
}

function setSession(user) {
    currentUser = user
}

function clearSession() {
    currentUser = null
}

function isAuthenticated() {
    return currentUser !== null
}

// Get local IP address (cached)
let cachedLocalIP = '127.0.0.1'

async function initLocalIP() {
    try {
        if (window.electronAPI && window.electronAPI.getLocalIP) {
            cachedLocalIP = await window.electronAPI.getLocalIP()
            console.log('Local IP:', cachedLocalIP)
        }
    } catch (e) {
        console.log('Could not get local IP:', e)
    }
}

function getLocalIP() {
    return cachedLocalIP
}

// Initialize local IP on load
if (window.electronAPI) {
    initLocalIP()
}

// In-memory cache for database (no localStorage)
let memoryCache = null

// Database-only store with in-memory cache
const store = {
    async checkDatabaseConnection() {
        try {
            const config = await window.electronAPI.getDbConfig()
            if (!config || !config.server || !config.database) {
                return false
            }
            // Test actual connection
            const testResult = await window.electronAPI.testDbConnection(config)
            return testResult && testResult.success === true
        } catch (error) {
            return false
        }
    },

    // Database-only read: Load from SQL and cache in memory
    async read() {
        try {
            const isConnected = await this.checkDatabaseConnection()
            
            if (!isConnected) {
                console.warn('⚠️ Database unavailable')
                return memoryCache || this.getEmptyDb()
            }
            
            console.log('📊 Loading data from database...')
            const dbData = await this.loadFromDatabase()
            
            if (dbData) {
                console.log('✅ Data loaded from database')
                memoryCache = dbData
                return dbData
            }
            
            console.log('🆕 No data found, returning empty structure')
            return memoryCache || this.getEmptyDb()
            
        } catch (e) {
            console.error('Failed to read data:', e)
            return memoryCache || this.getEmptyDb()
        }
    },
    
    // Synchronous read from in-memory cache (for non-async contexts)
    readSync() {
        return memoryCache || this.getEmptyDb()
    },
    
    // Ensure database structure has all required fields
    ensureDbStructure(db) {
        if (!db.notificationSettings) {
            db.notificationSettings = {
                builds: { enabled: false, on: 'all', channel: '', recipients: '' },
                system: { enabled: false, level: 'all', channel: '', recipients: '' },
                summary: { enabled: false, time: '09:00', channel: '', recipients: '' },
                health: { enabled: false, status: 'all', channel: '', recipients: '' }
            }
        }
        if (!db.locks) db.locks = {}
        if (!db.integrations) db.integrations = []
        if (!db.credentials) db.credentials = []
        if (!db.auditLogs) db.auditLogs = []
        if (!db.builds) db.builds = []
        if (!db.servers) db.servers = []
        if (!db.scripts) db.scripts = []
        if (!db.environments) db.environments = []
        if (!db.users) db.users = []
        if (!db.jobs) db.jobs = []
        if (!db.features) db.features = { claude_sonnet_4: true }
        
        // Migration: Update user objects with lastActivity if missing
        if (db.users) {
            db.users.forEach(user => {
                if (!user.lastActivity) user.lastActivity = user.lastLogin || Date.now()
                if (!user.position) user.position = ''
                if (!user.squad) user.squad = ''
            })
        }
        
        // Migration: Update servers with credentialId if missing
        if (db.servers) {
            db.servers.forEach(server => {
                if (!server.credentialId) server.credentialId = null
            })
        }
    },
    
    getEmptyDb() {
        return {
            environments: [],
            jobs: [],
            users: [],
            integrations: [],
            credentials: [],
            auditLogs: [],
            builds: [],
            servers: [],
            scripts: [],
            notificationSettings: {
                builds: { enabled: false, on: 'all', channel: '', recipients: '' },
                system: { enabled: false, level: 'all', channel: '', recipients: '' },
                summary: { enabled: false, time: '09:00', channel: '', recipients: '' },
                health: { enabled: false, status: 'all', channel: '', recipients: '' }
            },
            locks: {},
            features: { claude_sonnet_4: true }
        }
    },

    // Database-only write
    async write(db) {
        await this.syncToDatabase(db).catch(err => {
            console.error('Database sync failed:', err.message)
            throw err
        })
        return true
    },

    async syncToDatabase(db) {
        const isConnected = await this.checkDatabaseConnection()
        if (!isConnected) {
            throw new Error('Database not connected')
        }

        try {
            console.log('🔄 Syncing data to database...')
            const response = await fetch(`${API_BASE_URL}/api/sync-data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    environments: db.environments || [],
                    servers: db.servers || [],
                    credentials: db.credentials || [],
                    users: db.users || [],
                    builds: db.builds || []
                })
            })
            const result = await response.json()
            if (result.success) {
                console.log('✅ Data synced to database successfully')
            } else {
                throw new Error(result.error || 'Sync failed')
            }
        } catch (error) {
            console.error('❌ Failed to sync to database:', error.message)
            throw error
        }
    },

    async loadFromDatabase() {
        const isConnected = await this.checkDatabaseConnection()
        if (!isConnected) {
            return null
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/load-data`)
            const result = await response.json()
            
            if (result.success) {
                return result.data
            } else {
                console.error('❌ Failed to load from database:', result.error)
                return null
            }
        } catch (error) {
            console.error('❌ Load from database failed:', error.message)
            return null
        }
    },

    async deleteFromDatabase(entityType, id) {
        const isConnected = await this.checkDatabaseConnection()
        if (!isConnected) {
            throw new Error('Database not connected')
        }

        console.log(`🗑️ Attempting to delete ${entityType} with ID: ${id}`)

        try {
            const response = await fetch(`${API_BASE_URL}/api/delete-record`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entityType, id })
            })
            
            const result = await response.json()
            
            if (result.success) {
                console.log(`✅ Successfully deleted ${entityType} ${id} from database`)
            } else {
                console.error(`❌ Failed to delete ${entityType} ${id}:`, result.error || result.message)
            }
            
            return result
        } catch (error) {
            console.error(`❌ Delete ${entityType} ${id} failed:`, error.message)
            throw error
        }
    }
}

// Small stable id helper with a crypto fallback for older browsers
function uid() {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
    } catch (e) {}

    // Fallback for older environments
    return 'id-' + Math.random().toString(36).slice(2, 10)
}

// Storage utility removed - database-only architecture

// Clean up audit logs in database
async function cleanupAuditLogs(keepCount = 100) {
    try {
        const db = store.readSync()
        if (db.auditLogs && db.auditLogs.length > keepCount) {
            const removed = db.auditLogs.length - keepCount
            db.auditLogs = db.auditLogs.slice(0, keepCount)
            await store.write(db)
            console.log(`Cleaned up ${removed} old audit log entries`)
            return removed
        }
        return 0
    } catch (e) {
        console.error('Failed to cleanup audit logs:', e)
        return 0
    }
}

// Emergency database cleanup
async function emergencyStorageCleanup() {
    try {
        console.log('Running emergency storage cleanup...')
        const db = store.readSync()
        
        // Remove all audit logs
        if (db.auditLogs) {
            const count = db.auditLogs.length
            db.auditLogs = []
            console.log(`Removed ${count} audit logs`)
        }
        
        // Keep only 50 most recent builds
        if (db.builds && db.builds.length > 50) {
            const removed = db.builds.length - 50
            db.builds = db.builds.slice(0, 50)
            console.log(`Removed ${removed} old builds`)
        }
        
        store.write(db)
        const usage = getStorageUsage()
        console.log(`Storage cleanup complete. Now using ${usage.sizeMB}MB (${usage.percentUsed}%)`)
        return true
    } catch (e) {
        console.error('Emergency cleanup failed:', e)
        return false
    }
}

// Populate server dropdowns for builds
function populateServerDropdowns() {
    try {
        const db = store.readSync()
        let servers = []
        
        // Safely get servers array
        try {
            servers = Array.isArray(db.servers) ? db.servers : []
        } catch (e) {
            console.error('Error accessing servers array:', e)
            servers = []
        }
        
        console.log('Populating server dropdowns. Found servers:', servers.length)
        
        // Filter out invalid servers with extra safety
        const validServers = []
        for (let i = 0; i < servers.length; i++) {
            try {
                const server = servers[i]
                if (server && typeof server === 'object' && server.id) {
                    validServers.push(server)
                } else {
                    console.warn('Skipping invalid server at index', i, ':', server)
                }
            } catch (e) {
                console.warn('Error processing server at index', i, ':', e.message)
            }
        }
        
        console.log('Valid servers after filtering:', validServers.length)
        
        const buildServerSelect = document.getElementById('buildServer')
        const editBuildServerSelect = document.getElementById('editBuildServer')
        
        console.log('Build server select found:', !!buildServerSelect)
        console.log('Edit build server select found:', !!editBuildServerSelect)
        
        // Process each select element that exists
        const selectElements = []
        if (buildServerSelect) selectElements.push(buildServerSelect)
        if (editBuildServerSelect) selectElements.push(editBuildServerSelect)
        
        selectElements.forEach(select => {
            try {
                // Keep the first option (placeholder)
                const currentValue = select.value
                select.innerHTML = '<option value="">-- Select Server --</option>'
                
                console.log('Processing select element, adding', validServers.length, 'valid servers')
                
                for (let i = 0; i < validServers.length; i++) {
                    try {
                        const server = validServers[i]
                        const option = document.createElement('option')
                        option.value = server.id || ''
                        const displayName = server.displayName || server.name || 'Unnamed Server'
                        const serverType = server.type || 'Unknown'
                        option.textContent = `${displayName} (${serverType})`
                        select.appendChild(option)
                        console.log('Added server option:', displayName, serverType)
                    } catch (e) {
                        console.error('Error adding server at index', i, ':', e)
                    }
                }
                
                // Restore selection if it was set
                if (currentValue) select.value = currentValue
            } catch (e) {
                console.error('Error processing select element:', e)
            }
        })
    } catch (error) {
        console.error('Error populating server dropdowns:', error)
    }
}

// Audit logging function - async and database-first
async function logAudit(action, entityType, entityName, details = {}) {
	try {
		const user = currentUser || { name: 'System', username: 'system' }
		const ip = '127.0.0.1' // In a real app, this would be from backend
		
		const auditEntry = {
			id: uid(),
			action, // 'create', 'update', 'delete'
			entityType, // 'environment', 'user', 'database', 'credential'
			entityName,
			user: user.name,
			username: user.username,
			timestamp: new Date().toISOString(),
			ip,
			details // Additional context like what changed
		}

		// Save directly to database
		try {
			const response = await fetch(`${API_BASE_URL}/api/sync-data`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					auditLogs: [auditEntry]
				})
			})
			const result = await response.json()
			if (result.success) {
				console.log('📝 Audit log saved to database:', action, entityType, entityName)
				
				
				const db = store.readSync()
				db.auditLogs.push(auditEntry)
				
			}
		} catch (syncError) {
			console.error('⚠️ Failed to sync audit log to database:', syncError)
		}
	} catch (e) {
		console.error('❌ Audit logging failed:', e)
		// Don't throw - audit failures shouldn't break the main operation
	}
}

// ========== CARD LOCK FUNCTIONALITY ==========
function toggleCardLock(cardElement, entityType, entityId) {
	const isLocked = cardElement.classList.contains('is-locked')
	const db = store.readSync()
	
	// Initialize locks object if it doesn't exist
	if (!db.locks) db.locks = {}
	if (!db.locks[entityType]) db.locks[entityType] = {}
	
	// Toggle lock state
	if (isLocked) {
		cardElement.classList.remove('is-locked')
		delete db.locks[entityType][entityId]
	} else {
		cardElement.classList.add('is-locked')
		db.locks[entityType][entityId] = true
	}
	
	store.write(db)
	
	// Update lock button icon
	const lockBtn = cardElement.querySelector('.card-lock-btn')
	if (lockBtn) {
		lockBtn.classList.toggle('is-locked', !isLocked)
		lockBtn.title = isLocked ? 'Lock card to prevent deletion' : 'Unlock card'
	}
}

function isCardLocked(entityType, entityId) {
	const db = store.readSync()
	return db.locks && db.locks[entityType] && db.locks[entityType][entityId]
}

function createLockButton(entityType, entityId) {
	const isLocked = isCardLocked(entityType, entityId)
	return `
		<button class="card-lock-btn ${isLocked ? 'is-locked' : ''}" 
				data-lock-type="${entityType}" 
				data-lock-id="${entityId}"
				title="${isLocked ? 'Unlock card' : 'Lock card to prevent deletion'}">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				${isLocked ? 
					'<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>' : 
					'<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path>'
				}
			</svg>
		</button>
	`
}

// Render environments into #envList (simple, minimal UI used by the demo)
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
	const q = (filter || '').toLowerCase()
	envList.innerHTML = ''
	environments.filter(e => !q || e.name.toLowerCase().includes(q) || e.url.toLowerCase().includes(q)).forEach(env => {
		// Get mapped servers info
		const mappedServerIds = env.mappedServers || []
		const mappedServers = mappedServerIds.map(id => db.servers?.find(s => s.id === id)).filter(Boolean)
		
		// Build uptime section only if there are mapped servers
		let uptimeSectionHTML = ''
		
		if (mappedServers.length > 0) {
			// Group mapped servers by type
			const serversByType = {
				'Front End': [],
				'Back End': [],
				'Win Server': [],
				'Web Server': []
			}
			
			mappedServers.forEach(srv => {
				if (serversByType[srv.type]) {
					serversByType[srv.type].push(srv)
				}
			})
			
			// Build uptime rows based on mapped servers
			let uptimeRowsHTML = ''
			
			Object.keys(serversByType).forEach(type => {
				const servers = serversByType[type]
				
				if (servers.length > 0) {
					// Show server names
					servers.forEach(server => {
						uptimeRowsHTML += `<div class="uptime-row"><span>${server.displayName}</span><span class="uptime-value">00:00:00</span></div>`
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
	`		// Lock button handler
		const lockBtn = el.querySelector('.card-lock-btn')
		if (lockBtn) {
			lockBtn.addEventListener('click', (e) => {
				e.stopPropagation()
				toggleCardLock(el, 'environment', env.id)
			})
		}
		
		// Drag and drop handlers
		el.addEventListener('dragstart', (e) => {
			el.classList.add('dragging')
			e.dataTransfer.effectAllowed = 'move'
			e.dataTransfer.setData('text/html', el.innerHTML)
		})
		
		el.addEventListener('dragend', (e) => {
			el.classList.remove('dragging')
			// Save new order to database
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
				if (e.clientX < midpoint) {
					envList.insertBefore(draggingCard, el)
				} else {
					envList.insertBefore(draggingCard, el.nextSibling)
				}
			}
		})
		
		// Wire action handlers
		el.querySelectorAll('button[data-action]').forEach(b => b.addEventListener('click', (ev) => {
			const id = b.dataset.id
			const action = b.dataset.action
			
			// Handle open-url action - use external browser
			if (action === 'open-url') {
				const url = b.dataset.url
				if (url && window.electronAPI && window.electronAPI.openExternal) {
					window.electronAPI.openExternal(url)
				} else if (url) {
					window.open(url, '_blank')
				}
				return
			}
			
			// Get current environment from database
			const db = store.readSync()
			const env = db.environments.find(x => x.id === id)
			if (env) onEnvAction(env, action)
		}))
		
		// Check if this is a newly created environment (by checking if it's the first one or was just added)
		const existingCard = envList.querySelector(`[data-env-id="${env.id}"]`)
		if (!existingCard) {
			el.classList.add('env--entering')
		}
		
		envList.appendChild(el)
	})
}


// Environment delete confirmation modal handling
const deleteEnvModal = document.getElementById('deleteEnvModal')
let envToDelete = null

// Delete user modal handling
const deleteUserModal = document.getElementById('deleteUserModal')
let userToDelete = null

function closeDeleteUserModal() {
    try { deleteUserModal.close() } catch (e) { /* ignore */ }
    try { deleteUserModal.removeAttribute('open') } catch (e) {}
    const focused = deleteUserModal.querySelector(':focus')
    if (focused && typeof focused.blur === 'function') focused.blur()
    userToDelete = null
}

if (deleteUserModal) {
    deleteUserModal.addEventListener('close', async () => {
        if (deleteUserModal.returnValue === 'confirm' && userToDelete) {
            const db = store.readSync()
            const idx = db.users.findIndex(x => x.id === userToDelete.id)
            if (idx >= 0) {
                const userName = db.users[idx].name
                const userId = db.users[idx].id
                
                console.log('🗑️ Deleting user:', userName, 'ID:', userId)
                
                // Delete from database FIRST
                console.log('📡 Calling deleteFromDatabase...')
                try {
                    const result = await store.deleteFromDatabase('user', userId)
                    console.log('✅ Database delete result:', JSON.stringify(result))
                    if (!result || !result.success) {
                        console.error('❌ Database delete failed:', JSON.stringify(result))
                        alert('Failed to delete user from database: ' + (result?.error || 'Unknown error'))
                        return // Stop if database delete failed
                    }
                    console.log('✅ User successfully deleted from database')
                } catch (error) {
                    console.error('❌ Failed to delete user from database:', error)
                    alert('Failed to delete user from database: ' + error.message)
                    return // Stop if database delete failed
                }
                
                
                db.users.splice(idx, 1)
                store.write(db, true) // Skip sync - we already deleted from DB
                
                // User deleted from database
                
                // Reload users from database
                console.log('🔄 Reloading users from database...')
                try {
                    const reloadResponse = await fetch(`${API_BASE_URL}/api/load-data`)
                    const reloadData = await reloadResponse.json()
                    if (reloadData.success && reloadData.data && reloadData.data.users) {
                        // [Removed - database-only architecture]
                        freshDb.users = reloadData.data.users
                        store.write(freshDb, true) // Skip sync - we just loaded from DB
                        console.log('✅ Users reloaded from database')
                    }
                } catch (reloadError) {
                    console.warn('⚠️ Could not reload users from database:', reloadError)
                }
                
                // Audit log
                await logAudit('delete', 'user', userName, {})
                
                renderUsers()
            }
        }
        userToDelete = null
    })

    deleteUserModal.addEventListener('click', (e) => {
        if (e.target === deleteUserModal) closeDeleteUserModal()
    })

    const deleteUserCancel = deleteUserModal.querySelector('button[value="cancel"]')
    if (deleteUserCancel) {
        deleteUserCancel.addEventListener('click', (e) => { e.preventDefault(); closeDeleteUserModal() })
    }
}

// Edit User modal logic
const editUserModal = document.getElementById('editUserModal')
function openEditUser(user) {
    if (!editUserModal) return
    document.getElementById('editUserId').value = user.id
    document.getElementById('editUserName').value = user.name
    document.getElementById('editUserUsername').value = user.username || ''
    document.getElementById('editUserPassword').value = '' // Don't show current password
    document.getElementById('editUserChangePassword').checked = user.changePasswordOnLogin || false
    document.getElementById('editUserEmail').value = user.email
    document.getElementById('editUserPosition').value = user.position || ''
    document.getElementById('editUserSquad').value = user.squad || ''
    document.getElementById('editUserRole').value = user.role
    try { editUserModal.showModal(); document.getElementById('editUserName').focus() } catch (e) { editUserModal.setAttribute('open','') }
}

function closeEditUserModal() {
    try { editUserModal.close() } catch (e) {}
    try { editUserModal.removeAttribute('open') } catch (e) {}
    const f = editUserModal.querySelector(':focus'); if (f && f.blur) f.blur()
}

if (editUserModal) {
    const cancelEdit = editUserModal.querySelector('button[value="cancel"]')
    if (cancelEdit) cancelEdit.addEventListener('click', (e) => { e.preventDefault(); closeEditUserModal() })
    
    editUserModal.addEventListener('click', (e) => { if (e.target === editUserModal) closeEditUserModal() })
    
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && editUserModal.hasAttribute('open')) closeEditUserModal() })
    
    const editForm = editUserModal.querySelector('form')
    if (editForm) editForm.addEventListener('submit', (e) => {
        e.preventDefault()
        const id = document.getElementById('editUserId').value
        const name = document.getElementById('editUserName').value.trim()
        const username = document.getElementById('editUserUsername').value.trim()
        const password = document.getElementById('editUserPassword').value.trim()
        const changePassword = document.getElementById('editUserChangePassword').checked
        const email = document.getElementById('editUserEmail').value.trim()
        const role = document.getElementById('editUserRole').value
        if (!id || !name || !username || !email) return
        
        const db = store.readSync()
        const user = db.users.find(x => x.id === id)
        if (user) {
            user.name = name
            user.username = username
            if (password) user.password = password // Only update if new password provided
            user.changePasswordOnLogin = changePassword
            user.email = email
            user.role = role
            store.write(db)
            renderUsers()
        }
        closeEditUserModal()
    })
}

function closeDeleteEnvModal() {
    try { deleteEnvModal.close() } catch (e) { /* ignore */ }
    try { deleteEnvModal.removeAttribute('open') } catch (e) {}
    const focused = deleteEnvModal.querySelector(':focus')
    if (focused && typeof focused.blur === 'function') focused.blur()
    envToDelete = null
}

if (deleteEnvModal) {
    // Handle confirmation result
    deleteEnvModal.addEventListener('close', () => {
        console.log('Modal closed. returnValue:', deleteEnvModal.returnValue, 'envToDelete:', envToDelete)
        if (deleteEnvModal.returnValue === 'confirm' && envToDelete) {
            console.log('Confirmed delete for:', envToDelete.name, envToDelete.id)
            
            // Capture the environment to delete before clearing the global variable
            const envToRemove = envToDelete
            
            // Find the card element and animate it out
            const cardToDelete = document.querySelector(`.env[data-env-id="${envToRemove.id}"]`)
            console.log('Card found:', !!cardToDelete)
            
            if (cardToDelete) {
                cardToDelete.classList.add('env--exiting')
                
                // Wait for animation to complete before removing from DOM and database
                setTimeout(() => {
                    const db = store.readSync()
                    const idx = db.environments.findIndex(x => x.id === envToRemove.id)
                    console.log('Environment index to delete:', idx, 'Total envs before delete:', db.environments.length)
                    if (idx >= 0) {
                        const envName = db.environments[idx].name
                        const envId = db.environments[idx].id
                        
                        // Delete from database FIRST
                        store.deleteFromDatabase('environment', envId).catch(err => {
                            console.error('Failed to delete from database:', err)
                        })
                        
                        
                        db.environments.splice(idx, 1)
                        console.log('Spliced environment. Total envs after delete:', db.environments.length)
                        store.write(db)
                        
                        // Audit log
                        logAudit('delete', 'environment', envName, {})
                        
                        // Show success toast
                        ToastManager.success(
                            'Environment Deleted',
                            `${envName} has been removed from your environments`,
                            4000
                        )
                        
                        const searchInput = document.getElementById('search')
                        renderEnvs(searchInput ? searchInput.value : '')
                        renderServers()
                    }
                }, 300) // Match animation duration
            } else {
                // Fallback if card not found
                console.log('Card not found, using fallback')
                const db = store.readSync()
                const idx = db.environments.findIndex(x => x.id === envToRemove.id)
                console.log('Fallback - Environment index to delete:', idx)
                if (idx >= 0) {
                    const envName = db.environments[idx].name
                    const envId = db.environments[idx].id
                    
                    // Delete from database FIRST
                    store.deleteFromDatabase('environment', envId).catch(err => {
                        console.error('Failed to delete from database:', err)
                    })
                    
                    
                    db.environments.splice(idx, 1)
                    store.write(db)
                    
                    // Audit log
                    logAudit('delete', 'environment', envName, {})
                    
                    const searchInput = document.getElementById('search')
                    renderEnvs(searchInput ? searchInput.value : '')
                    renderServers()
                }
            }
        }
        envToDelete = null
    })

    // Close when clicking backdrop
    deleteEnvModal.addEventListener('click', (e) => {
        if (e.target === deleteEnvModal) closeDeleteEnvModal()
    })

    // Close on cancel button
    const cancelBtn = deleteEnvModal.querySelector('button[value="cancel"]')
    if (cancelBtn) {
        cancelBtn.addEventListener('click', (e) => {
            e.preventDefault()
            closeDeleteEnvModal()
        })
    }
}

function onEnvAction(env, action) {
    if (action === 'export') queueJob(`Export ${env.name}`, 3000)
    if (action === 'import') queueJob(`Import → ${env.name}`, 4000)
    if (action === 'backup') queueJob(`Backup ${env.name}`, 2500)
    if (action === 'list-solutions') alert('Stub: show solutions for ' + env.name)
    if (action === 'details') showEnvDetails(env)
    if (action === 'edit') openEditEnv(env)
    if (action === 'delete') {
        // Show delete confirmation modal
        envToDelete = env
        const nameSpan = document.getElementById('deleteEnvName')
        if (nameSpan) nameSpan.textContent = env.name
        try {
            deleteEnvModal.showModal()
            deleteEnvModal.querySelector('button[value="confirm"]')?.focus()
        } catch (e) {
            deleteEnvModal.setAttribute('open', '')
        }
    }
}

// Show Environment Details modal
const envDetailsModal = document.getElementById('envDetailsModal')
function showEnvDetails(env) {
    if (!envDetailsModal) return
    
    const content = document.getElementById('envDetailsContent')
    if (content) {
        const healthStatus = env.health === 'faulty' ? 'Faulty' : env.health === 'warning' ? 'Warning' : 'OK'
        const healthColor = env.health === 'faulty' ? '#ef4444' : env.health === 'warning' ? '#facc15' : '#4ade80'
        
        content.innerHTML = `
            <div style="display: grid; gap: 16px;">
                <div class="detail-row">
                    <div class="detail-label">Name</div>
                    <div class="detail-value">${env.name}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">URL</div>
                    <div class="detail-value"><a href="${env.url}" target="_blank" style="color: var(--primary); text-decoration: none;">${env.url}</a></div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Type</div>
                    <div class="detail-value">${env.type}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Health Status</div>
                    <div class="detail-value">
                        <span style="display: inline-flex; align-items: center; gap: 8px;">
                            <span style="width: 12px; height: 12px; border-radius: 50%; background: ${healthColor};"></span>
                            ${healthStatus}
                        </span>
                    </div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Environment ID</div>
                    <div class="detail-value" style="font-family: monospace; font-size: 12px; color: #9aa3b2; opacity: 0.8;">${env.id}</div>
                </div>
            </div>
        `
    }
    
    // Store env ID for button actions
    envDetailsModal.dataset.envId = env.id
    
    try {
        envDetailsModal.showModal()
    } catch (e) {
        envDetailsModal.setAttribute('open', '')
    }
}

// Map Servers modal
const mapServersModal = document.getElementById('mapServersModal')
let currentMappingEnv = null

function openMapServers(env) {
    if (!mapServersModal) return
    
    currentMappingEnv = env
    const envNameSpan = document.getElementById('mapServersEnvName')
    if (envNameSpan) envNameSpan.textContent = env.name
    
    // Populate all server types at once
    populateAllServerTypes(env)
    
    try {
        mapServersModal.showModal()
    } catch (e) {
        mapServersModal.setAttribute('open', '')
    }
}

function populateAllServerTypes(env) {
    const allTypesContainer = document.getElementById('mapServersAllTypes')
    if (!allTypesContainer || !env) return
    
    const db = store.readSync()
    const servers = db.servers || []
    const existingMappedServers = env.mappedServers || []
    
    // Filter servers to match environment type (Production servers for Production env, etc.)
    const compatibleServers = servers.filter(server => server.serverGroup === env.type)
    
    if (compatibleServers.length === 0) {
        allTypesContainer.innerHTML = '<div style="color: var(--muted); font-size: 14px; padding: 8px;">No compatible servers found for this environment type.</div>'
        return
    }
    
    // Group servers by type
    const serversByType = {
        'Front End': [],
        'Back End': [],
        'Win Server': [],
        'Web Server': []
    }
    
    compatibleServers.forEach(server => {
        if (serversByType[server.type]) {
            serversByType[server.type].push(server)
        }
    })
    
    let html = ''
    
    Object.keys(serversByType).forEach(type => {
        const serversOfType = serversByType[type]
        
        if (serversOfType.length > 0) {
            html += `<div style="margin-bottom: 20px;">
                <h4 style="margin: 0 0 8px 0; color: var(--text); font-size: 14px; font-weight: 600;">${type}</h4>
                <div style="padding-left: 8px; border-left: 2px solid var(--border);">
            `
            
            serversOfType.forEach(server => {
                const isChecked = existingMappedServers.includes(server.id)
                html += `
                    <label style="display: flex; align-items: center; gap: 8px; padding: 4px 0; cursor: pointer;">
                        <input type="checkbox" value="${server.id}" ${isChecked ? 'checked' : ''}>
                        <span style="flex: 1;">${server.displayName}</span>
                        <span style="color: var(--muted); font-size: 12px; font-family: monospace;">${server.ipAddress || 'N/A'}</span>
                    </label>
                `
            })
            
            html += '</div></div>'
        }
    })
    
    if (html === '') {
        html = '<div style="color: var(--muted); font-size: 14px; padding: 8px;">No servers available for this environment type.</div>'
    }
    
    allTypesContainer.innerHTML = html
}

function closeMapServersModal() {
    try { mapServersModal.close() } catch (e) {}
    try { mapServersModal.removeAttribute('open') } catch (e) {}
    currentMappingEnv = null
}

// Map Servers modal handlers
if (mapServersModal) {
    const cancelBtn = mapServersModal.querySelector('button[value="cancel"]')
    if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); closeMapServersModal() })
    
    mapServersModal.addEventListener('click', (e) => { if (e.target === mapServersModal) closeMapServersModal() })
}

// Type selector is no longer used - servers are now shown grouped by type in a single view

// Save mapped servers
const saveMapServersBtn = document.getElementById('saveMapServersBtn')
if (saveMapServersBtn) {
    saveMapServersBtn.addEventListener('click', (e) => {
        e.preventDefault()
        
        if (!currentMappingEnv) return
        
        // Get all checked servers from all types
        const allTypesContainer = document.getElementById('mapServersAllTypes')
        const checkboxes = allTypesContainer.querySelectorAll('input[type="checkbox"]:checked')
        const selectedServerIds = Array.from(checkboxes).map(cb => cb.value)
        
        const db = store.readSync()
        const env = db.environments.find(e => e.id === currentMappingEnv.id)
        
        if (env) {
            const oldServers = env.mappedServers || []
            
            // Simply replace with the new selection (all selected servers across all types)
            const newMappedServers = selectedServerIds
            
            env.mappedServers = newMappedServers
            store.write(db)
            
            // Audit log
            logAudit('update', 'environment', env.name, {
                old: { mappedServers: oldServers },
                new: { mappedServers: newMappedServers }
            })
            
            renderEnvs(document.getElementById('search')?.value || '')
        }
        
        closeMapServersModal()
    })
}

// Environment Details modal action buttons
const envDetailsDeployBtn = document.getElementById('envDetailsDeployBtn')
const envDetailsSolutionsBtn = document.getElementById('envDetailsSolutionsBtn')

if (envDetailsDeployBtn) {
    envDetailsDeployBtn.addEventListener('click', () => {
        const envId = envDetailsModal.dataset.envId
        if (envId) {
            const db = store.readSync()
            const env = db.environments.find(e => e.id === envId)
            if (env) {
                queueJob(`Deploy to ${env.name}`, 5000)
                envDetailsModal.close()
            }
        }
    })
}

if (envDetailsSolutionsBtn) {
    envDetailsSolutionsBtn.addEventListener('click', () => {
        const envId = envDetailsModal.dataset.envId
        if (envId) {
            const db = store.readSync()
            const env = db.environments.find(e => e.id === envId)
            if (env) {
                alert('Stub: show solutions for ' + env.name)
            }
        }
    })
}

const envDetailsMapServersBtn = document.getElementById('envDetailsMapServersBtn')
if (envDetailsMapServersBtn) {
    envDetailsMapServersBtn.addEventListener('click', () => {
        const envId = envDetailsModal.dataset.envId
        if (envId) {
            const db = store.readSync()
            const env = db.environments.find(e => e.id === envId)
            if (env) {
                openMapServers(env)
                envDetailsModal.close()
            }
        }
    })
}

// Edit Environment modal logic
const editEnvModal = document.getElementById('editEnvModal')
function openEditEnv(env) {
    if (!editEnvModal) return
    // Prefill fields
    document.getElementById('editEnvId').value = env.id
    document.getElementById('editEnvName').value = env.name
    document.getElementById('editEnvUrl').value = env.url
    document.getElementById('editEnvType').value = env.type
    try { editEnvModal.showModal(); document.getElementById('editEnvName').focus() } catch (e) { editEnvModal.setAttribute('open','') }
}

function closeEditEnvModal() {
    try { editEnvModal.close() } catch (e) {}
    try { editEnvModal.removeAttribute('open') } catch (e) {}
    const f = editEnvModal.querySelector(':focus'); if (f && f.blur) f.blur()
}

if (editEnvModal) {
    // Cancel button
    const cancelEdit = editEnvModal.querySelector('button[value="cancel"]')
    if (cancelEdit) cancelEdit.addEventListener('click', (e) => { e.preventDefault(); closeEditEnvModal() })
    // Backdrop click
    editEnvModal.addEventListener('click', (e) => { if (e.target === editEnvModal) closeEditEnvModal() })
    // Escape key
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && editEnvModal.hasAttribute('open')) closeEditEnvModal() })
    // Submit handler
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
            const oldValues = {
                name: env.name,
                url: env.url,
                type: env.type
            }
            
            env.name = name
            env.url = url
            env.type = type
            store.write(db)
            
            // Audit log with old and new values
            logAudit('update', 'environment', name, { 
                old: oldValues,
                new: { name, url, type }
            })
            
            // Show success toast
            ToastManager.success(
                'Environment Updated',
                `${name} has been successfully updated`,
                4000
            )
            
            const searchInput = document.getElementById('search')
            renderEnvs(searchInput ? searchInput.value : '')
        }
        closeEditEnvModal()
    })
}


// Jobs
function queueJob(title, durationMs) {
	const db = store.readSync()
	const job = { id: uid(), title, status: 'Queued', startedAt: Date.now(), progress: 0 }
db.jobs.unshift(job)
store.write(db)
renderJobs()
simulate(job.id, durationMs)
}


// Render servers (uses environments data)
function renderServers() {
	const serversList = document.getElementById('serversList')
	if (!serversList) return
	const db = store.readSync()
	const servers = db.servers || []
	
	if (servers.length === 0) {
		serversList.innerHTML = '<p class="muted" style="text-align:center; padding:40px; grid-column: 1/-1;">No servers configured yet. Click "+ Add Server" to create one.</p>'
		return
	}
	
	// Group servers by group name
	const grouped = {}
	servers.forEach(server => {
		const groupName = server.serverGroup || 'Ungrouped'
		if (!grouped[groupName]) grouped[groupName] = []
		grouped[groupName].push(server)
	})
	
	serversList.innerHTML = ''
	
	// Render each group
	Object.keys(grouped).sort().forEach(groupName => {
		// Group container
		const groupContainer = document.createElement('div')
		groupContainer.style.cssText = 'grid-column: 1/-1; margin-bottom:32px;'
		
		// Group header
		const groupHeader = document.createElement('h3')
		groupHeader.style.cssText = 'margin:0 0 16px 0; font-size:16px; font-weight:600; color:var(--text);'
		groupHeader.textContent = groupName
		groupContainer.appendChild(groupHeader)
		
		// Create table
		const table = document.createElement('table')
		table.className = 'server-table'
		table.style.cssText = 'width:100%; border-collapse: separate; border-spacing: 0; background:var(--panel); border-radius:12px; overflow:hidden; border:1px solid var(--border);'
		
		// Table header
		const thead = document.createElement('thead')
		thead.innerHTML = `
			<tr style="background:var(--bg); border-bottom:1px solid var(--border);">
				<th style="padding:12px 16px; text-align:left; font-size:12px; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:0.5px; width:40px;">Status</th>
				<th style="padding:12px 16px; text-align:left; font-size:12px; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:0.5px;">Name</th>
				<th style="padding:12px 16px; text-align:left; font-size:12px; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:0.5px;">Host</th>
                <th style="padding:12px 16px; text-align:left; font-size:12px; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:0.5px;">Type</th>
                <th style="padding:12px 16px; text-align:left; font-size:12px; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:0.5px;">OS</th>
				<th style="padding:12px 16px; text-align:left; font-size:12px; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:0.5px;">Credential</th>
				<th style="padding:12px 16px; text-align:right; font-size:12px; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:0.5px; width:200px;">Actions</th>
			</tr>
		`
		table.appendChild(thead)
		
		// Table body
		const tbody = document.createElement('tbody')
		
		grouped[groupName].forEach((server, index) => {
			const health = server.health || 'ok'
			const credentialName = server.credentialId ? 
				(db.credentials || []).find(c => c.id === server.credentialId)?.name || 'Not found' : 
				'Not assigned'
			
			const locked = isCardLocked('server', server.id)
			
			const tr = document.createElement('tr')
			tr.style.cssText = `border-bottom:1px solid var(--border); transition:background 0.2s; ${locked ? 'opacity:0.6; pointer-events:none;' : ''}`
			tr.onmouseenter = function() { if (!locked) this.style.background = 'var(--bg)' }
			tr.onmouseleave = function() { this.style.background = 'transparent' }
			
			tr.innerHTML = `
				<td style="padding:12px 16px;">
					<div style="width:10px; height:10px; border-radius:50%; background:${health === 'ok' ? '#22c55e' : '#ef4444'}; box-shadow:0 0 8px ${health === 'ok' ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)'};" title="${health === 'ok' ? 'Online' : 'Offline'}"></div>
				</td>
				<td style="padding:12px 16px;">
					<div style="font-weight:600; font-size:14px; color:var(--text); margin-bottom:2px;">${server.displayName}</div>
					<div style="font-size:12px; color:var(--muted); font-family:monospace;">${server.hostname}</div>
				</td>
				<td style="padding:12px 16px;">
					<span style="font-family:monospace; font-size:13px; color:var(--text);">${server.ipAddress}</span>
				</td>
                <td style="padding:12px 16px;">
                    <span style="font-size:13px; color:var(--muted);">${server.type}</span>
                </td>
                <td style="padding:12px 16px;">
                    <span style="font-size:13px; color:var(--muted);">${server.os || 'Windows'}</span>
                </td>
				<td style="padding:12px 16px;">
					<span style="font-size:12px; color:${server.credentialId ? '#10b981' : 'var(--muted)'};">${credentialName}</span>
				</td>
				<td style="padding:12px 16px; text-align:right;">
					<div style="display:inline-flex; gap:6px;">
						${locked ? `<button class="btn btn-sm" data-action="unlock" data-id="${server.id}" style="padding:4px 10px; font-size:12px;">
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
								<path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
							</svg>
						</button>` : ''}
						<button class="btn btn-sm" data-action="server-connect" data-id="${server.id}" style="padding:4px 12px; font-size:12px; background:linear-gradient(135deg, #10b981 0%, #059669 100%); color:white; border:none;">
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;">
								<rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
								<line x1="8" y1="21" x2="16" y2="21"></line>
								<line x1="12" y1="17" x2="12" y2="21"></line>
							</svg>
							Connect
						</button>
						<button class="btn btn-sm btn-ghost" data-action="server-edit" data-id="${server.id}" style="padding:4px 12px; font-size:12px;">Edit</button>
						<button class="btn btn-sm btn-ghost" data-action="server-delete" data-id="${server.id}" style="padding:4px 12px; font-size:12px; color:#ef4444; border-color:#ef4444;">Delete</button>
					</div>
				</td>
			`
			
			tbody.appendChild(tr)
			
			// Event listeners
			const unlockBtn = tr.querySelector('[data-action="unlock"]')
			if (unlockBtn) {
				unlockBtn.addEventListener('click', () => {
					unlockCard('server', server.id)
					renderServers()
				})
			}
			
			const connectBtn = tr.querySelector('[data-action="server-connect"]')
			if (connectBtn) connectBtn.addEventListener('click', () => connectToServer(server))
			
			const editBtn = tr.querySelector('[data-action="server-edit"]')
			if (editBtn) editBtn.addEventListener('click', () => openEditServer(server))
			
			const deleteBtn = tr.querySelector('[data-action="server-delete"]')
			if (deleteBtn) deleteBtn.addEventListener('click', () => openDeleteServer(server))
		})
		
		table.appendChild(tbody)
		groupContainer.appendChild(table)
		serversList.appendChild(groupContainer)
	})
}

let serverToDelete = null

// Test server connectivity using backend API
async function testServerConnection(ipAddress, serverName, port = 3389) {
    try {
        console.log(`🔍 Testing connection to ${serverName} (${ipAddress})...`)
        
        const response = await fetch(`${API_BASE_URL}/api/test-server`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ipAddress: ipAddress,
                serverName: serverName,
                port
            }),
            signal: AbortSignal.timeout(5000) // 5 second timeout
        })
        
        const result = await response.json()
        
        console.log(`📊 Connection test result for ${serverName}:`, result)
        
        if (result.success && result.reachable) {
            console.log(`✅ ${serverName} is reachable`)
            return true
        } else {
            console.warn(`❌ ${serverName} is not reachable: ${result.message || 'Unknown error'}`)
            if (result.debug) {
                console.log('Debug output:', result.debug.stdout)
            }
            return false
        }
    } catch (error) {
        console.warn(`⚠️ Connection test failed for ${serverName}:`, error.message)
        // If backend is not available or timeout, return true to not block server creation
        return true
    }
}

async function connectToServer(server) {
	const db = store.readSync()
	
	// Check if credential is assigned
	if (!server.credentialId) {
		alert('No credential assigned to this server. Please edit the server and assign a credential first.')
		return
	}
	
	// Find the credential
	const credential = (db.credentials || []).find(c => c.id === server.credentialId)
	
	if (!credential) {
		alert('Assigned credential not found. Please edit the server and assign a valid credential.')
		return
	}

    const os = server.os || 'Windows'
    if (os === 'Linux') {
        // SSH/PuTTY
        try {
            if (window.electronAPI && window.electronAPI.connectSSH) {
                const result = await window.electronAPI.connectSSH({
                    displayName: server.displayName,
                    ipAddress: server.ipAddress,
                    hostname: server.hostname,
                    port: server.port || 22
                }, credential)
                if (result.success) {
                    await logAudit('connect', 'server', server.displayName, { ipAddress: server.ipAddress, username: credential.username, protocol: 'ssh' })
                    ToastManager.success('SSH Connection', `Launching SSH to ${server.displayName}...`, 3000)
                } else {
                    alert(`Failed to launch SSH connection: ${result.error}`)
                }
            } else {
                alert('SSH connection is only available in the desktop application.')
            }
        } catch (error) {
            console.error('❌ SSH connection error:', error)
            alert(`Failed to launch SSH connection: ${error.message}`)
        }
        return
    }

    // Windows → RDP
    // Generate RDP file content
    const rdpContent = `full address:s:${server.ipAddress}
username:s:${credential.username}
domain:s:${credential.domain || ''}
screen mode id:i:2
use multimon:i:0
desktopwidth:i:1920
desktopheight:i:1080
session bpp:i:32
compression:i:1
keyboardhook:i:2
audiocapturemode:i:0
videoplaybackmode:i:1
connection type:i:7
networkautodetect:i:1
bandwidthautodetect:i:1
displayconnectionbar:i:1
enableworkspacereconnect:i:0
disable wallpaper:i:0
allow font smoothing:i:1
allow desktop composition:i:1
disable full window drag:i:0
disable menu anims:i:0
disable themes:i:0
disable cursor setting:i:0
bitmapcachepersistenable:i:1
audiomode:i:0
redirectprinters:i:0
redirectcomports:i:0
redirectsmartcards:i:1
redirectclipboard:i:1
redirectposdevices:i:0
autoreconnection enabled:i:1
authentication level:i:2
prompt for credentials:i:0
negotiate security layer:i:1
remoteapplicationmode:i:0
alternate shell:s:
shell working directory:s:
gatewayhostname:s:
gatewayusagemethod:i:4
gatewaycredentialssource:i:4
gatewayprofileusagemethod:i:0
promptcredentialonce:i:0
gatewaybrokeringtype:i:0
use redirection server name:i:0
rdgiskdcproxy:i:0
kdcproxyname:s:`

    // Launch RDP using Electron IPC
    try {
        console.log('🖥️ Launching RDP connection to:', server.displayName)
        if (window.electronAPI && window.electronAPI.connectRDP) {
            const result = await window.electronAPI.connectRDP(
                { displayName: server.displayName, ipAddress: server.ipAddress, hostname: server.hostname, port: server.port || 3389 },
                credential,
                rdpContent
            )
            if (result.success) {
                await logAudit('connect', 'server', server.displayName, { ipAddress: server.ipAddress, username: credential.username, protocol: 'rdp' })
                ToastManager.success('RDP Connection', `Launching Remote Desktop to ${server.displayName}...`, 3000)
            } else {
                alert(`Failed to launch RDP connection: ${result.error}`)
            }
        } else {
            alert('RDP connection is only available in the desktop application.')
        }
    } catch (error) {
        console.error('❌ RDP connection error:', error)
        alert(`Failed to launch RDP connection: ${error.message}`)
    }
}

function openEditServer(server) {
	const db = store.readSync()
	const currentUser = null  || 'admin'
	
	// Populate credential dropdown
	const credentialSelect = document.getElementById('editServerCredential')
	if (credentialSelect) {
		credentialSelect.innerHTML = '<option value="">-- Select Credential --</option>'
		const credentials = db.credentials || []
		credentials.forEach(cred => {
			const option = document.createElement('option')
			option.value = cred.id
			option.textContent = `${cred.name} (${cred.username})`
			credentialSelect.appendChild(option)
		})
	}
	
	// Set form values
	document.getElementById('editServerId').value = server.id
	document.getElementById('editServerDisplayName').value = server.displayName
	document.getElementById('editServerHostname').value = server.hostname
	document.getElementById('editServerIp').value = server.ipAddress
	document.getElementById('editServerType').value = server.type || ''
    document.getElementById('editServerOS').value = server.os || 'Windows'
	document.getElementById('editServerGroup').value = server.serverGroup || ''
	document.getElementById('editServerCredential').value = server.credentialId || ''
	
	const modal = document.getElementById('editServerModal')
	if (modal) {
		try {
			modal.showModal()
		} catch (e) {
			modal.setAttribute('open', '')
		}
	}
}

function openDeleteServer(server) {
	serverToDelete = server
	const modal = document.getElementById('deleteServerModal')
	if (modal) {
		try {
			modal.showModal()
		} catch (e) {
			modal.setAttribute('open', '')
		}
	}
}

function populateEnvironmentDropdowns() {
	const db = store.readSync()
	const environments = db.environments || []
	
	const serverEnvSelect = document.getElementById('serverEnvironment')
	const editServerEnvSelect = document.getElementById('editServerEnvironment')
	
	// Populate add server dropdown
	if (serverEnvSelect) {
		const currentValue = serverEnvSelect.value
		serverEnvSelect.innerHTML = '<option value="">-- Select Environment --</option>'
		
		environments.forEach(env => {
			const option = document.createElement('option')
			option.value = env.id
			option.textContent = `${env.name} (${env.type})`
			serverEnvSelect.appendChild(option)
		})
		
		if (currentValue) serverEnvSelect.value = currentValue
	}
	
	// Populate edit server dropdown
	if (editServerEnvSelect) {
		const currentValue = editServerEnvSelect.value
		editServerEnvSelect.innerHTML = '<option value="">-- Select Environment --</option>'
		
		environments.forEach(env => {
			const option = document.createElement('option')
			option.value = env.id
			option.textContent = `${env.name} (${env.type})`
			editServerEnvSelect.appendChild(option)
		})
		
		if (currentValue) editServerEnvSelect.value = currentValue
	}
}


function renderJobs() {
	const jobList = document.getElementById('jobList')
	if (!jobList) return
	const db = store.readSync()
jobList.innerHTML = ''
db.jobs.forEach(j => jobList.appendChild(jobRow(j)))
}

// --- Admin / Users (simple CRUD for demo) ---
function renderUsers() {
    const userListEl = document.getElementById('userList')
    if (!userListEl) return
    const db = store.readSync()
    if (!userListEl) return
    userListEl.innerHTML = ''
    const users = db.users || []
    users.forEach(u => userListEl.appendChild(userRow(u)))
}

function userRow(u) {
    const el = document.createElement('div')
    el.className = 'card row'
    const lastLogin = u.lastLogin && u.lastLogin !== '—' ? new Date(u.lastLogin).toLocaleString() : '—'
    const passwordStatus = u.changePasswordOnLogin ? '<span style="color:#facc15;">⚠ Must change password</span>' : ''
    const positionSquad = `${u.position || '—'} | ${u.squad || '—'}`
    
    // Determine online status based on last activity (within last 5 minutes = online)
    const isOnline = u.lastActivity && (Date.now() - new Date(u.lastActivity).getTime() < 5 * 60 * 1000)
    const statusColor = isOnline ? '#10b981' : '#6b7280'
    const statusText = isOnline ? 'Online' : 'Offline'
    
    el.innerHTML = `
        <div style="min-width:240px">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                <div style="width:10px; height:10px; border-radius:50%; background:${statusColor}; box-shadow:0 0 8px ${statusColor};"></div>
                <strong>${u.name}</strong> ${u.username ? `<span class="muted">(@${u.username})</span>` : ''}
                <span style="font-size:11px; color:${statusColor}; font-weight:500;">${statusText}</span>
            </div>
            <div class="muted">${u.email}</div>
            <div class="muted" style="font-size:12px; margin-top:4px;">
                ${positionSquad}
            </div>
            <div class="muted" style="font-size:12px; margin-top:2px;">
                Last login: ${lastLogin} | IP: ${u.ip || '—'} ${passwordStatus}
            </div>
        </div>
        <div class="badge">${u.role}</div>
        <div style="flex:1"></div>
        <button class="btn btn-ghost" data-id="${u.id}" data-action="edit">Edit</button>
        <button class="btn btn-ghost" data-id="${u.id}" data-action="delete">Delete</button>
    `
    const del = el.querySelector('button[data-action="delete"]')
    del.addEventListener('click', () => {
        // show nice confirmation modal instead of window.confirm
        userToDelete = u
        const nameSpan = document.getElementById('deleteUserName')
        if (nameSpan) nameSpan.textContent = u.name
        try {
            deleteUserModal.showModal()
            deleteUserModal.querySelector('button[value="confirm"]')?.focus()
        } catch (e) {
            deleteUserModal.setAttribute('open', '')
        }
    })
    
    const edit = el.querySelector('button[data-action="edit"]')
    if (edit) edit.addEventListener('click', () => openEditUser(u))
    
    return el
}


// ========== DATABASE MANAGEMENT ==========
function renderIntegrations(filter = '') {
    const integrationListEl = document.getElementById('integrationList')
    if (!integrationListEl) return
    const db = store.readSync()
    const q = (filter || '').toLowerCase()
    integrationListEl.innerHTML = ''
    
    const integrations = db.integrations || []
    integrations
        .filter(i => !q || i.name.toLowerCase().includes(q) || i.type.toLowerCase().includes(q))
        .forEach(integration => {
            const el = document.createElement('div')
            el.className = 'card integration'
            
            // Check if card is locked
            const locked = isCardLocked('integration', integration.id)
            if (locked) {
                el.classList.add('is-locked')
            }
            
            el.innerHTML = `
                ${createLockButton('integration', integration.id)}
                <div class="title">${integration.name}</div>
                <div class="meta muted">${integration.type}</div>
                ${integration.description ? `<div class="muted" style="font-size:12px; margin-top:8px;">${integration.description}</div>` : ''}
                <div class="muted" style="font-size:11px; margin-top:8px; font-family:monospace; word-break:break-all; opacity:0.7;">
                    ${integration.connection ? integration.connection.substring(0, 60) + (integration.connection.length > 60 ? '...' : '') : ''}
                </div>
                <div style="margin-top:16px; display:grid; grid-template-columns:auto auto; gap:8px; width:fit-content;">
                    <button class="btn" data-action="test" data-id="${integration.id}" style="background:linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color:white; border:none; font-size:13px; padding:8px 12px; display:flex; align-items:center; gap:6px; white-space:nowrap;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        Test Connection
                    </button>
                    <button class="btn btn-ghost" data-action="edit" data-id="${integration.id}" style="white-space:nowrap;">Edit</button>
                    <button class="btn btn-ghost" data-action="delete" data-id="${integration.id}" style="white-space:nowrap;">Delete</button>
                </div>
            `
            
            // Lock button event listener
            const lockBtn = el.querySelector('.card-lock-btn')
            if (lockBtn) {
                lockBtn.addEventListener('click', (e) => {
                    e.stopPropagation()
                    toggleCardLock(el, 'integration', integration.id)
                })
            }
            
            el.querySelectorAll('button[data-action]').forEach(b => b.addEventListener('click', (ev) => {
                const id = b.dataset.id
                const action = b.dataset.action
                const db = store.readSync()
                const integration = (db.integrations || []).find(x => x.id === id)
                if (integration) onIntegrationAction(integration, action, b)
            }))
            
            integrationListEl.appendChild(el)
        })
}

function onIntegrationAction(integration, action, buttonEl) {
    if (action === 'edit') {
        openEditIntegration(integration)
    } else if (action === 'delete') {
        integrationToDelete = integration
        try {
            deleteIntegrationModal.showModal()
        } catch (e) {
            deleteIntegrationModal.setAttribute('open', '')
        }
    } else if (action === 'test') {
        testIntegrationConnection(integration, buttonEl)
    }
}

async function testIntegrationConnection(integration, buttonEl) {
    // Disable button and show loading
    buttonEl.disabled = true
    const originalHTML = buttonEl.innerHTML
    buttonEl.innerHTML = `
        <div class="spinner-ring" style="width:14px; height:14px; border-width:2px; margin-right:6px;"></div>
        Testing...
    `
    
    try {
        // Call backend API to test integration connection
        console.log('Testing integration connection:', integration.name)
        
        const response = await fetch(`${API_BASE_URL}/api/test-integration`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: integration.type,
                connection: integration.connection
            })
        })
        
        const result = await response.json()
        
        if (result.success) {
            // Success
            buttonEl.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Connected!
            `
            buttonEl.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
            
            // Log audit
            logAudit('test', 'integration', integration.name, { status: 'success' })
        } else {
            throw new Error(result.error || 'Connection failed')
        }
        
    } catch (error) {
        console.error('Integration connection test failed:', error)
        
        // Show error
        buttonEl.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
            Failed
        `
        buttonEl.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
        
        // Show error details
        alert(`Connection test failed: ${error.message}`)
        
        // Log audit
        logAudit('test', 'integration', integration.name, { status: 'failed', error: error.message })
    }
    
    // Reset after 3 seconds
    setTimeout(() => {
        buttonEl.disabled = false
        buttonEl.innerHTML = originalHTML
        buttonEl.style.background = 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)'
    }, 3000)
}

function openEditIntegration(integration) {
    document.getElementById('editIntegrationId').value = integration.id
    document.getElementById('editIntegrationName').value = integration.name
    document.getElementById('editIntegrationType').value = integration.type || ''
    document.getElementById('editIntegrationConnection').value = integration.connection || ''
    document.getElementById('editIntegrationDescription').value = integration.description || ''
    
    const modal = document.getElementById('editIntegrationModal')
    if (modal) {
        try {
            modal.showModal()
        } catch (e) {
            modal.setAttribute('open', '')
        }
    }
}

let integrationToDelete = null

// Add Integration button
const addIntegrationBtn = document.getElementById('addIntegrationBtn')
if (addIntegrationBtn) {
    addIntegrationBtn.addEventListener('click', () => {
        // Clear form
        document.getElementById('integrationName').value = ''
        document.getElementById('integrationType').value = 'Exchange Server'
        document.getElementById('integrationConnection').value = ''
        document.getElementById('integrationDescription').value = ''
        
        const modal = document.getElementById('integrationModal')
        if (modal) {
            try {
                modal.showModal()
            } catch (e) {
                modal.setAttribute('open', '')
            }
        }
    })
}

// Save Integration button
const saveIntegrationBtn = document.getElementById('saveIntegrationBtn')
if (saveIntegrationBtn) {
    saveIntegrationBtn.addEventListener('click', () => {
        const name = document.getElementById('integrationName').value.trim()
        const type = document.getElementById('integrationType').value
        const connection = document.getElementById('integrationConnection').value.trim()
        const description = document.getElementById('integrationDescription').value.trim()
        
        if (!name || !connection) {
            alert('Please fill in all required fields.')
            return
        }
        
        const db = store.readSync()
        db.integrations = db.integrations || []
        db.integrations.push({
            id: Date.now() + Math.random(),
            name,
            type,
            connection,
            description,
            createdAt: new Date().toISOString()
        })
        store.write(db)
        renderIntegrations()
        logAudit('create', 'integration', name)
    })
}

// Save Edit Integration button
const saveEditIntegrationBtn = document.getElementById('saveEditIntegrationBtn')
if (saveEditIntegrationBtn) {
    saveEditIntegrationBtn.addEventListener('click', () => {
        const id = parseFloat(document.getElementById('editIntegrationId').value)
        const name = document.getElementById('editIntegrationName').value.trim()
        const type = document.getElementById('editIntegrationType').value
        const connection = document.getElementById('editIntegrationConnection').value.trim()
        const description = document.getElementById('editIntegrationDescription').value.trim()
        
        if (!name || !connection) {
            alert('Please fill in all required fields.')
            return
        }
        
        const db = store.readSync()
        const integration = db.integrations.find(x => x.id === id)
        if (integration) {
            integration.name = name
            integration.type = type
            integration.connection = connection
            integration.description = description
            integration.updatedAt = new Date().toISOString()
            store.write(db)
            renderIntegrations()
            logAudit('update', 'integration', name)
        }
    })
}

// Delete Integration confirmation
const confirmDeleteIntegrationBtn = document.getElementById('confirmDeleteIntegrationBtn')
const deleteIntegrationModal = document.getElementById('deleteIntegrationModal')
if (confirmDeleteIntegrationBtn && deleteIntegrationModal) {
    confirmDeleteIntegrationBtn.addEventListener('click', () => {
        if (integrationToDelete) {
            const db = store.readSync()
            const idx = db.integrations.findIndex(x => x.id === integrationToDelete.id)
            if (idx > -1) {
                const integrationName = db.integrations[idx].name
                db.integrations.splice(idx, 1)
                store.write(db)
                logAudit('delete', 'integration', integrationName)
                integrationToDelete = null
                renderIntegrations()
            }
        }
    })
}

// Integration search input
const integrationSearchInput = document.getElementById('integrationSearchInput')
if (integrationSearchInput) {
    integrationSearchInput.addEventListener('input', (e) => renderIntegrations(e.target.value))
}




// ========== CREDENTIALS MANAGEMENT ==========
async function renderCredentials(filter = '') {
    const credListEl = document.getElementById('credentialList')
    if (!credListEl) return
    
    const q = (filter || '').toLowerCase()
    credListEl.innerHTML = '<div style="padding:20px; text-align:center; color:var(--muted);">Loading credentials...</div>'
    
    console.log('📋 Loading credentials from database...')
    
    // Load from database
    let credentials = []
    try {
        const response = await fetch(`${API_BASE_URL}/api/load-data`)
        const result = await response.json()
        
        if (result.success && result.data) {
            credentials = result.data.credentials || []
            console.log('📋 Loaded from database:', credentials.length, 'credentials')
            
            
            const db = store.readSync()
            db.credentials = credentials
            
        } else {
            
            console.log('⚠️ Database load failed')
            const db = store.readSync()
            credentials = db.credentials || []
        }
    } catch (error) {
        console.error('❌ Failed to load from database:', error)
        
        const db = store.readSync()
        credentials = db.credentials || []
    }
    
    credListEl.innerHTML = ''
    
    credentials
        .filter(c => !q || c.name.toLowerCase().includes(q) || (c.type && c.type.toLowerCase().includes(q)) || (c.username && c.username.toLowerCase().includes(q)))
        .forEach(credential => {
            const el = document.createElement('div')
            el.className = 'card'
            el.innerHTML = `
                <div class="title">${credential.name}</div>
                <div class="meta muted">${credential.type}</div>
                ${credential.username ? `<div class="muted" style="font-size:12px; margin-top:8px;">Username: ${credential.username}</div>` : ''}
                ${credential.description ? `<div class="muted" style="font-size:12px; margin-top:4px;">${credential.description}</div>` : ''}
                <div class="muted" style="font-size:11px; margin-top:8px; font-family:monospace;">
                    Password: ${'•'.repeat(12)}
                </div>
                <div class="actions row" style="margin-top:12px;">
                    <button class="btn" data-action="edit" data-id="${credential.id}">Edit</button>
                    <button class="btn btn-ghost" data-action="delete" data-id="${credential.id}">Delete</button>
                </div>
            `
            
            el.querySelectorAll('button[data-action]').forEach(b => b.addEventListener('click', (ev) => {
                const id = b.dataset.id
                const action = b.dataset.action
                const db = store.readSync()
                const cred = (db.credentials || []).find(x => x.id === id)
                if (cred) onCredentialAction(cred, action)
            }))
            
            credListEl.appendChild(el)
        })
}

function onCredentialAction(credential, action) {
    if (action === 'edit') {
        openEditCredential(credential)
    } else if (action === 'delete') {
        credentialToDelete = credential
        const db = store.readSync()
        const serversUsing = (db.servers || []).filter(s => s.credentialId === credential.id)

        const nameEl = document.getElementById('deleteCredName')
        const sCount = document.getElementById('deleteCredUsageServers')
        const details = document.getElementById('deleteCredUsageDetails')

        if (nameEl) nameEl.textContent = credential.name || '(unnamed)'
        if (sCount) sCount.textContent = String(serversUsing.length)
        if (details) {
            if (serversUsing.length === 0) {
                details.innerHTML = '<em>No current assignments.</em>'
            } else {
                const serverItems = serversUsing.map(s => `<li>Server: ${s.displayName || s.name || s.hostname || s.ipAddress}</li>`).join('')
                details.innerHTML = `<ul style="margin:0 0 8px 16px;">${serverItems}</ul>`
            }
        }

        try {
            deleteCredentialModal.showModal()
        } catch (e) {
            deleteCredentialModal.setAttribute('open', '')
        }
    }
}

function openEditCredential(credential) {
    document.getElementById('editCredId').value = credential.id
    document.getElementById('editCredName').value = credential.name
    document.getElementById('editCredType').value = credential.type
    document.getElementById('editCredUsername').value = credential.username || ''
    document.getElementById('editCredPassword').value = '' // Don't show password
    document.getElementById('editCredDescription').value = credential.description || ''
    try {
        editCredentialModal.showModal()
    } catch (e) {
        editCredentialModal.setAttribute('open', '')
    }
}


// ========== BUILDS RENDERING ==========
async function renderBuilds() {
    const container = document.getElementById('buildsList')
    if (!container) return
    
    console.log('🔨 Loading builds from database...')
    
    let builds = []
    try {
        const response = await fetch(`${API_BASE_URL}/api/load-data`)
        const result = await response.json()
        
        if (result.success && result.data) {
            builds = result.data.builds || []
            console.log('🔨 Loaded from database:', builds.length, 'builds')
            
            
            const db = store.readSync()
            db.builds = builds
            
        } else {
            
            const db = store.readSync()
            builds = db.builds || []
            console.log('⚠️ Database fallback:', builds.length, 'builds')
        }
    } catch (error) {
        console.error('❌ Failed to load builds from database:', error)
        const db = store.readSync()
        builds = db.builds || []
        console.log('⚠️ Database fallback:', builds.length, 'builds')
    }
    
    if (builds.length === 0) {
        container.innerHTML = '<p class="muted" style="text-align:center; padding:40px;">No builds configured yet. Create your first build to get started.</p>'
        return
    }
    
    // Helper function to format relative time
    const formatRelativeTime = (timestamp) => {
        if (!timestamp) return 'Never'
        const now = Date.now()
        const diff = now - timestamp
        const minutes = Math.floor(diff / 60000)
        const hours = Math.floor(diff / 3600000)
        const days = Math.floor(diff / 86400000)
        
        if (minutes < 1) return 'Just now'
        if (minutes < 60) return `${minutes}m ago`
        if (hours < 24) return `${hours}h ago`
        if (days < 7) return `${days}d ago`
        return new Date(timestamp).toLocaleDateString()
    }
    
    // Helper function to format elapsed time
    const formatElapsedTime = (startTime) => {
        const elapsed = Date.now() - startTime
        const seconds = Math.floor(elapsed / 1000)
        const minutes = Math.floor(seconds / 60)
        const hours = Math.floor(minutes / 60)
        
        if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`
        return `${seconds}s`
    }
    
    // Helper function to format duration from milliseconds
    const formatDuration = (ms) => {
        if (!ms) return ''
        const seconds = Math.floor(ms / 1000)
        const minutes = Math.floor(seconds / 60)
        const hours = Math.floor(minutes / 60)
        
        if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`
        return `${seconds}s`
    }
    
    // Get db reference for server lookups
    const db = store.readSync()
    
    container.innerHTML = ''
    builds.forEach(build => {
        const card = document.createElement('div')
        card.className = 'card'
        card.style.padding = '20px'
        card.id = `build-card-${build.id}`
        
        const server = db.servers?.find(s => s.id === build.serverId)
        const serverName = server ? (server.displayName || server.name || 'Unknown Server') : 'Unknown Server'
        
        // Progress bar HTML (only if build is running)
        let progressBarHtml = ''
        if (build.isRunning) {
            const elapsedTime = formatElapsedTime(build.runStartTime)
            progressBarHtml = `
                <div style="background:rgba(99,102,241,0.1); border:1px solid rgba(99,102,241,0.3); border-radius:8px; padding:12px; margin:12px 0;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <div class="spinner-ring" style="width:16px; height:16px; border:2px solid #6366f1; border-top-color:transparent; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
                            <span style="font-size:13px; font-weight:600; color:#6366f1;">Build in Progress</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:12px;">
                            <div style="display:flex; align-items:center; gap:6px;">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <polyline points="12 6 12 12 16 14"></polyline>
                                </svg>
                                <span style="font-size:12px; color:#6366f1; font-weight:500;">${elapsedTime}</span>
                            </div>
                            <span style="font-size:13px; font-weight:600; color:#6366f1;">${build.currentProgress || 0}%</span>
                        </div>
                    </div>
                    <div style="height:6px; background:rgba(99,102,241,0.2); border-radius:3px; overflow:hidden;">
                        <div style="height:100%; background:linear-gradient(90deg, #6366f1 0%, #8b5cf6 100%); width:${build.currentProgress || 0}%; transition:width 0.3s ease;"></div>
                    </div>
                </div>
            `
        }
        
        // Build status info HTML
        let statusInfoHtml = '<div style="display:flex; gap:24px; margin:12px 0 16px 0; flex-wrap:wrap;">'
        
        if (build.lastRun) {
            const runByUser = build.lastRunBy ? ` by ${build.lastRunBy}` : ''
            statusInfoHtml += `
                <div style="display:flex; align-items:center; gap:6px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    <span style="font-size:13px; color:var(--muted);">Last Run:</span>
                    <span style="font-size:13px; font-weight:600; color:var(--text);">${formatRelativeTime(build.lastRun)}${runByUser}</span>
                </div>
            `
        }
        
        if (build.lastSuccess) {
            const successByUser = build.lastSuccessBy ? ` by ${build.lastSuccessBy}` : ''
            const successElapsed = build.lastSuccessElapsed ? ` (${formatDuration(build.lastSuccessElapsed)})` : ''
            statusInfoHtml += `
                <div style="display:flex; align-items:center; gap:6px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                    <span style="font-size:13px; color:#10b981;">Last Success:</span>
                    <span style="font-size:13px; font-weight:600; color:#10b981;">${formatRelativeTime(build.lastSuccess)}${successByUser}${successElapsed}</span>
                </div>
            `
        }
        
        if (build.lastFail) {
            const failByUser = build.lastFailBy ? ` by ${build.lastFailBy}` : ''
            const failElapsed = build.lastFailElapsed ? ` (${formatDuration(build.lastFailElapsed)})` : ''
            statusInfoHtml += `
                <div style="display:flex; align-items:center; gap:6px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="15" y1="9" x2="9" y2="15"></line>
                        <line x1="9" y1="9" x2="15" y2="15"></line>
                    </svg>
                    <span style="font-size:13px; color:#ef4444;">Last Fail:</span>
                    <span style="font-size:13px; font-weight:600; color:#ef4444;">${formatRelativeTime(build.lastFail)}${failByUser}${failElapsed}</span>
                </div>
            `
        }
        
        if (!build.lastRun && !build.lastSuccess && !build.lastFail) {
            statusInfoHtml += `
                <div style="display:flex; align-items:center; gap:6px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <span style="font-size:13px; color:var(--muted); font-style:italic;">Never executed</span>
                </div>
            `
        }
        
        statusInfoHtml += '</div>'
        
        card.innerHTML = `
            <div style="display:flex; align-items:center; gap:16px; margin-bottom:8px;">
                <div style="flex:1;">
                    <strong style="font-size:16px;">${build.name}</strong>
                </div>
                <div style="display:flex; gap:8px;">
                    ${build.isRunning ? `
                        <button class="btn" data-build-stop="${build.id}" style="background:linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color:white; border:none;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <rect x="6" y="6" width="12" height="12" rx="2"></rect>
                            </svg>
                            Stop
                        </button>
                    ` : `
                        <button class="btn" data-build-run="${build.id}" style="background:linear-gradient(135deg, #10b981 0%, #059669 100%); color:white; border:none;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polygon points="5 3 19 12 5 21 5 3"></polygon>
                            </svg>
                            Run
                        </button>
                    `}
                    <button class="btn btn-ghost" data-build-edit="${build.id}" ${build.isRunning ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>Edit</button>
                    <button class="btn btn-ghost" data-build-delete="${build.id}" ${build.isRunning ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : 'style="color:#ef4444;"'}>Delete</button>
                </div>
            </div>
            ${progressBarHtml}
            ${statusInfoHtml}
            <div style="display:flex; gap:24px; padding-top:12px; border-top:1px solid var(--border);">
                <div style="flex:1;">
                    <div style="font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Script</div>
                    <div style="font-family:monospace; font-size:13px;">${build.script}</div>
                </div>
                <div style="flex:1;">
                    <div style="font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Server</div>
                    <div>${serverName}</div>
                </div>
            </div>
        `
        
        // Event listeners
        const runBtn = card.querySelector(`[data-build-run="${build.id}"]`)
        if (runBtn) runBtn.addEventListener('click', () => runBuild(build))
        
        const stopBtn = card.querySelector(`[data-build-stop="${build.id}"]`)
        if (stopBtn) stopBtn.addEventListener('click', () => stopBuild(build))
        
        const editBtn = card.querySelector(`[data-build-edit="${build.id}"]`)
        if (editBtn) editBtn.addEventListener('click', () => openEditBuild(build))
        
        const deleteBtn = card.querySelector(`[data-build-delete="${build.id}"]`)
        if (deleteBtn) deleteBtn.addEventListener('click', () => openDeleteBuild(build))
        
        container.appendChild(card)
    })
    
    // Auto-refresh for running builds (update elapsed time and progress)
    const hasRunningBuilds = builds.some(b => b.isRunning)
    if (hasRunningBuilds) {
        // Clear any existing interval
        if (window.buildRefreshInterval) {
            clearInterval(window.buildRefreshInterval)
        }
        // Set up new interval to refresh every second
        window.buildRefreshInterval = setInterval(() => {
            const currentDb = store.read()
            const stillHasRunningBuilds = currentDb.builds?.some(b => b.isRunning)
            if (stillHasRunningBuilds) {
                renderBuilds()
            } else {
                // No more running builds, clear the interval
                if (window.buildRefreshInterval) {
                    clearInterval(window.buildRefreshInterval)
                    window.buildRefreshInterval = null
                }
            }
        }, 1000)
    }
}

function runBuild(build) {
    const db = store.readSync()
    const server = db.servers?.find(s => s.id === build.serverId)
    const serverName = server ? (server.displayName || server.name || 'Unknown Server') : 'Unknown Server'
    
    // Get current user
    const currentUser = window.currentUser || { name: 'Administrator' }
    
    // Update lastRun timestamp and lastRunBy user
    const buildInDb = db.builds.find(b => b.id === build.id)
    if (buildInDb) {
        buildInDb.lastRun = Date.now()
        buildInDb.lastRunBy = currentUser.name
        buildInDb.isRunning = true
        buildInDb.currentProgress = 0
        buildInDb.runStartTime = Date.now()
        store.write(db)
    }
    
    // Create a job for the build
    const job = { 
        id: uid(), 
        title: `${build.name} on ${serverName}`, 
        status: 'Running', 
        startedAt: Date.now(), 
        progress: 0 
    }
    db.jobs.push(job)
    store.write(db)
    
    // Audit log
    logAudit('run', 'build', build.name, { script: build.script, server: serverName, user: currentUser.name })
    
    renderJobs()
    renderBuilds()
    
    // Show beautiful build started modal
    showBuildStartedModal(build.name, build.script, serverName)
    
    // Call backend API to execute the build
    fetch(`${API_BASE_URL}/api/run-build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            buildId: build.id,
            userId: currentUser.name
        })
    })
    .then(response => response.json())
    .then(async result => {
        const db = store.readSync()
        const j = db.jobs.find(x => x.id === job.id)
        const buildInDb = db.builds.find(b => b.id === build.id)
        
        if (result.success) {
            console.log('✅ Build execution completed:', result)
            
            if (j) {
                j.status = result.buildSuccess ? 'Success' : 'Failed'
                j.progress = 100
            }
            
            if (buildInDb) {
                buildInDb.isRunning = false
                buildInDb.currentProgress = 100
                
                if (result.buildSuccess) {
                    buildInDb.lastSuccess = result.timestamp
                    buildInDb.lastSuccessBy = currentUser.name
                    buildInDb.lastSuccessElapsed = result.elapsedMs
                } else {
                    buildInDb.lastFail = result.timestamp
                    buildInDb.lastFailBy = currentUser.name
                    buildInDb.lastFailElapsed = result.elapsedMs
                }
            }
            
            
            store.write(db)
            
            // Then sync to database
            await store.syncToDatabase(db)
            
            // Reload from database
            await renderBuilds()
            renderJobs()
            
            // Show result notification
            if (result.buildSuccess) {
                showNotification(`Build "${build.name}" completed successfully!`, 'success')
                if (result.output) {
                    console.log(`Build output:\n${result.output}`)
                }
            } else {
                showNotification(`Build "${build.name}" failed: ${result.error}`, 'error')
                console.error(`Build error:\n${result.error}`)
            }
        } else {
            console.error('❌ Build execution failed:', result.error)
            
            if (j) {
                j.status = 'Failed'
                j.progress = 0
            }
            
            if (buildInDb) {
                buildInDb.isRunning = false
                buildInDb.currentProgress = 0
                buildInDb.lastFail = Date.now()
                buildInDb.lastFailBy = currentUser.name
                buildInDb.lastFailElapsed = 0
            }
            
            store.write(db)
            await store.syncToDatabase(db)
            await renderBuilds()
            renderJobs()
            
            showNotification(`Build execution failed: ${result.error}`, 'error')
        }
    })
    .catch(async error => {
        console.error('❌ Failed to execute build:', error)
        
        const db = store.readSync()
        const j = db.jobs.find(x => x.id === job.id)
        const buildInDb = db.builds.find(b => b.id === build.id)
        
        if (j) {
            j.status = 'Failed'
            j.progress = 0
        }
        
        if (buildInDb) {
            buildInDb.isRunning = false
            buildInDb.currentProgress = 0
            buildInDb.lastFail = Date.now()
            buildInDb.lastFailBy = currentUser.name
            buildInDb.lastFailElapsed = 0
        }
        
        store.write(db)
        await store.syncToDatabase(db)
        await renderBuilds()
        renderJobs()
        
        showNotification(`Failed to execute build: ${error.message}`, 'error')
    })
}

function stopBuild(build) {
    const db = store.readSync()
    const buildInDb = db.builds.find(b => b.id === build.id)
    
    if (!buildInDb || !buildInDb.isRunning) return
    
    // Get current user
    const currentUser = window.currentUser || { name: 'Administrator' }
    
    // Stop the build
    buildInDb.isRunning = false
    buildInDb.currentProgress = buildInDb.currentProgress || 0
    const elapsedMs = Date.now() - buildInDb.runStartTime
    
    // Mark as failed since it was stopped manually
    buildInDb.lastFail = Date.now()
    buildInDb.lastFailBy = currentUser.name
    buildInDb.lastFailElapsed = elapsedMs
    
    // Find and update the job
    const job = db.jobs?.find(j => j.title.includes(build.name) && j.status === 'Running')
    if (job) {
        job.status = 'Stopped'
        job.progress = buildInDb.currentProgress
    }
    
    store.write(db)
    
    // Audit log
    logAudit('stop', 'build', build.name, { user: currentUser.name, progress: buildInDb.currentProgress })
    
    // Show toast notification
    if (typeof ToastManager !== 'undefined') {
        ToastManager.warning('Build Stopped', `Build "${build.name}" was stopped manually`)
    }
    
    renderJobs()
    renderBuilds()
}

function showBuildStartedModal(buildName, script, serverName) {
    const modal = document.getElementById('buildStartedModal')
    if (!modal) return
    
    const messageEl = document.getElementById('buildStartedMessage')
    const scriptEl = document.getElementById('buildStartedScript')
    const serverEl = document.getElementById('buildStartedServer')
    
    if (messageEl) messageEl.textContent = `"${buildName}" is now executing on ${serverName}`
    if (scriptEl) scriptEl.textContent = script
    if (serverEl) serverEl.textContent = serverName
    
    try {
        modal.showModal()
    } catch (e) {
        modal.setAttribute('open', '')
    }
    
    // Auto-close after 3 seconds
    setTimeout(() => {
        try {
            modal.close()
        } catch (e) {
            modal.removeAttribute('open')
        }
    }, 3000)
}

let buildToDelete = null

function openDeleteBuild(build) {
    buildToDelete = build
    const nameElement = document.getElementById('deleteBuildName')
    if (nameElement) {
        nameElement.textContent = `Are you sure you want to delete "${build.name}"? This action cannot be undone.`
    }
    const modal = document.getElementById('deleteBuildModal')
    if (modal) {
        try {
            modal.showModal()
        } catch (e) {
            modal.setAttribute('open', '')
        }
    }
}

function openEditBuild(build) {
    // Update URL to reflect current action
    const url = new URL(window.location)
    url.searchParams.set('view', 'builds')
    url.searchParams.set('action', 'edit')
    url.searchParams.set('id', build.id)
    window.history.pushState({ view: 'builds', action: 'edit', id: build.id }, '', url)
    
    document.getElementById('editBuildId').value = build.id
    document.getElementById('editBuildName').value = build.name
    document.getElementById('editBuildScript').value = build.script
    document.getElementById('editBuildTargetOverride').value = build.targetOverride || ''
    
    // Populate server dropdown first, then set the value
    populateServerDropdowns()
    
    // Set server value after dropdown is populated
    document.getElementById('editBuildServer').value = build.serverId
    
    const modal = document.getElementById('editBuildModal')
    if (modal) {
        try {
            modal.showModal()
        } catch (e) {
            modal.setAttribute('open', '')
        }
    }
}

// ========== AUDIT LOGS PAGINATION ==========
let auditPagination = {
    currentPage: 1,
    pageSize: 7,
    totalItems: 0,
    filteredLogs: []
}

async function renderAuditLogs(searchQuery = '', actionFilter = '', entityFilter = '') {
    const tbody = document.getElementById('auditLogsTableBody')
    if (!tbody) return
    
    console.log('📋 Loading audit logs from database...')
    
    let logs = []
    try {
        const response = await fetch(`${API_BASE_URL}/api/load-data`)
        const result = await response.json()
        
        if (result.success && result.data) {
            logs = result.data.auditLogs || []
            console.log('📋 Loaded from database:', logs.length, 'audit logs')
            
            
            const db = store.readSync()
            db.auditLogs = logs
            
        } else {
            
            const db = store.readSync()
            logs = db.auditLogs || []
        }
    } catch (error) {
        console.error('❌ Failed to load audit logs from database:', error)
        const db = store.readSync()
        logs = db.auditLogs || []
    }
    
    const q = (searchQuery || '').toLowerCase()
    
    // Filter logs
    const filtered = logs.filter(log => {
        const matchesSearch = !q || 
            log.user.toLowerCase().includes(q) ||
            log.entityName.toLowerCase().includes(q) ||
            log.action.toLowerCase().includes(q) ||
            log.username.toLowerCase().includes(q)
        
        const matchesAction = !actionFilter || log.action === actionFilter
        const matchesEntity = !entityFilter || log.entityType === entityFilter
        
        return matchesSearch && matchesAction && matchesEntity
    })
    
    // Sort by timestamp (newest first)
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    
    // Update pagination state
    auditPagination.filteredLogs = filtered
    auditPagination.totalItems = filtered.length
    auditPagination.currentPage = Math.max(1, Math.min(auditPagination.currentPage, Math.ceil(filtered.length / auditPagination.pageSize)))
    
    // Show/hide pagination
    const paginationContainer = document.getElementById('auditPaginationContainer')
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px; color:var(--muted);">No audit logs found</td></tr>'
        if (paginationContainer) paginationContainer.style.display = 'none'
        return
    }
    
    if (paginationContainer) {
        paginationContainer.style.display = filtered.length > auditPagination.pageSize ? 'flex' : 'none'
    }
    
    // Calculate pagination
    const startIndex = (auditPagination.currentPage - 1) * auditPagination.pageSize
    const endIndex = Math.min(startIndex + auditPagination.pageSize, filtered.length)
    const pageData = filtered.slice(startIndex, endIndex)
    
    // Render table rows
    tbody.innerHTML = ''
    pageData.forEach(log => {
        const row = document.createElement('tr')
        const timestamp = new Date(log.timestamp)
        const formattedTime = timestamp.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        })
        
        // Format details to show old vs new values
        let detailsStr = '—'
        let detailsTitle = ''
        
        if (log.details && Object.keys(log.details).length > 0) {
            if (log.action === 'update' && log.details.old && log.details.new) {
                // Show what changed
                const changes = []
                for (const key in log.details.new) {
                    if (log.details.old[key] !== log.details.new[key]) {
                        changes.push(`${key}: "${log.details.old[key]}" → "${log.details.new[key]}"`)
                    }
                }
                detailsStr = changes.length > 0 ? changes.join(', ') : 'No changes'
                detailsTitle = changes.join('\n')
            } else {
                detailsStr = JSON.stringify(log.details)
                detailsTitle = detailsStr
            }
        }
        
        row.innerHTML = `
            <td class="audit-timestamp">${formattedTime}</td>
            <td><strong>${log.user}</strong><br><span style="font-size:12px; color:var(--muted);">@${log.username}</span></td>
            <td><span class="audit-action action-${log.action}">${log.action}</span></td>
            <td><span class="audit-entity-type">${log.entityType}</span></td>
            <td><strong>${log.entityName}</strong></td>
            <td style="font-family:monospace; font-size:13px;">${log.ip}</td>
            <td class="audit-details" title="${detailsTitle}">${detailsStr}</td>
        `
        tbody.appendChild(row)
    })
    
    // Update pagination UI
    updateAuditPaginationUI()
}

function updateAuditPaginationUI() {
    const totalPages = Math.ceil(auditPagination.totalItems / auditPagination.pageSize)
    const startItem = (auditPagination.currentPage - 1) * auditPagination.pageSize + 1
    const endItem = Math.min(auditPagination.currentPage * auditPagination.pageSize, auditPagination.totalItems)
    
    // Update page info
    const pageInfo = document.getElementById('auditPageInfo')
    if (pageInfo) {
        pageInfo.textContent = `Showing ${startItem}-${endItem} of ${auditPagination.totalItems} entries`
    }
    
    // Update page size selector
    const pageSize = document.getElementById('auditPageSize')
    if (pageSize) {
        pageSize.value = auditPagination.pageSize.toString()
    }
    
    // Update navigation buttons
    const firstBtn = document.getElementById('auditFirstPageBtn')
    const prevBtn = document.getElementById('auditPrevPageBtn')
    const nextBtn = document.getElementById('auditNextPageBtn')
    const lastBtn = document.getElementById('auditLastPageBtn')
    
    if (firstBtn) firstBtn.disabled = auditPagination.currentPage === 1
    if (prevBtn) prevBtn.disabled = auditPagination.currentPage === 1
    if (nextBtn) nextBtn.disabled = auditPagination.currentPage === totalPages
    if (lastBtn) lastBtn.disabled = auditPagination.currentPage === totalPages
    
    // Update page numbers
    updateAuditPageNumbers(totalPages)
}

function updateAuditPageNumbers(totalPages) {
    const pagesContainer = document.getElementById('auditPaginationPages')
    if (!pagesContainer) return
    
    pagesContainer.innerHTML = ''
    
    if (totalPages <= 1) return
    
    const current = auditPagination.currentPage
    let startPage = Math.max(1, current - 2)
    let endPage = Math.min(totalPages, current + 2)
    
    // Adjust range to always show 5 pages when possible
    if (endPage - startPage < 4) {
        if (startPage === 1) {
            endPage = Math.min(totalPages, startPage + 4)
        } else if (endPage === totalPages) {
            startPage = Math.max(1, endPage - 4)
        }
    }
    
    // Add first page + ellipsis if needed
    if (startPage > 1) {
        addPageButton(pagesContainer, 1, false)
        if (startPage > 2) {
            const ellipsis = document.createElement('div')
            ellipsis.className = 'pagination-ellipsis'
            ellipsis.textContent = '...'
            pagesContainer.appendChild(ellipsis)
        }
    }
    
    // Add page numbers
    for (let i = startPage; i <= endPage; i++) {
        addPageButton(pagesContainer, i, i === current)
    }
    
    // Add ellipsis + last page if needed
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            const ellipsis = document.createElement('div')
            ellipsis.className = 'pagination-ellipsis'
            ellipsis.textContent = '...'
            pagesContainer.appendChild(ellipsis)
        }
        addPageButton(pagesContainer, totalPages, false)
    }
}

function addPageButton(container, pageNum, isActive) {
    const button = document.createElement('button')
    button.className = `pagination-page${isActive ? ' active' : ''}`
    button.textContent = pageNum.toString()
    button.onclick = () => goToAuditPage(pageNum)
    container.appendChild(button)
}

function goToAuditPage(page) {
    auditPagination.currentPage = page
    
    // Preserve current filters when changing pages
    const search = auditSearchInput?.value || ''
    const action = auditActionFilter?.value || ''
    const entity = auditEntityFilter?.value || ''
    renderAuditLogs(search, action, entity)
}

function changeAuditPageSize(newSize) {
    auditPagination.pageSize = parseInt(newSize)
    auditPagination.currentPage = 1
    
    // Preserve current filters when changing page size
    const search = auditSearchInput?.value || ''
    const action = auditActionFilter?.value || ''
    const entity = auditEntityFilter?.value || ''
    renderAuditLogs(search, action, entity)
}

// Initialize pagination event listeners
function initializeAuditPagination() {
    const pageSize = document.getElementById('auditPageSize')
    if (pageSize) {
        pageSize.addEventListener('change', (e) => changeAuditPageSize(e.target.value))
    }
    
    const firstBtn = document.getElementById('auditFirstPageBtn')
    if (firstBtn) {
        firstBtn.addEventListener('click', () => goToAuditPage(1))
    }
    
    const prevBtn = document.getElementById('auditPrevPageBtn')
    if (prevBtn) {
        prevBtn.addEventListener('click', () => goToAuditPage(auditPagination.currentPage - 1))
    }
    
    const nextBtn = document.getElementById('auditNextPageBtn')
    if (nextBtn) {
        nextBtn.addEventListener('click', () => goToAuditPage(auditPagination.currentPage + 1))
    }
    
    const lastBtn = document.getElementById('auditLastPageBtn')
    if (lastBtn) {
        lastBtn.addEventListener('click', () => {
            const totalPages = Math.ceil(auditPagination.totalItems / auditPagination.pageSize)
            goToAuditPage(totalPages)
        })
    }
}


function jobRow(j) {
const $ = document.createElement('div')
$.className = 'card row'
$.innerHTML = `
<div style="min-width: 240px"><strong>${j.title}</strong></div>
<div class="badge">${j.status}</div>
<div class="progress-bar">
  <div class="progress-bar__fill" style="width:${j.progress}%"></div>
</div>
<button class="btn btn-ghost" data-id="${j.id}">Details</button>
`
return $
}


function simulate(id, ms) {
const start = Date.now()
const timer = setInterval(() => {
	const db = store.readSync()
	const j = db.jobs.find(x => x.id === id)
if (!j) return clearInterval(timer)
const t = Date.now() - start
j.progress = Math.min(100, Math.floor((t / ms) * 100))
j.status = j.progress >= 100 ? 'Completed' : 'Running'
store.write(db)
renderJobs()
if (j.progress >= 100) clearInterval(timer)
}, 100)
}


// Add environment modal
const addEnvBtn = document.getElementById('addEnvBtn')
const envModal = document.getElementById('envModal')

function closeEnvModal() {
    try { envModal.close() } catch (e) { /* ignore */ }
    // ensure open attribute removed and blur any focused control inside
    try { envModal.removeAttribute('open') } catch (e) {}
    const focused = envModal.querySelector(':focus')
    if (focused && typeof focused.blur === 'function') focused.blur()
    
    // Clear form fields when closing
    document.getElementById('envName').value = ''
    document.getElementById('envUrl').value = ''
    document.getElementById('envType').value = 'Production'
    
    // move focus back to the Add button so keyboard users continue where they left off
    try { addEnvBtn.focus() } catch (e) {}
}

addEnvBtn.addEventListener('click', () => {
	// show modal and focus first input
	try { envModal.showModal(); envModal.querySelector('#envName')?.focus() } catch (e) { envModal.setAttribute('open', '') }
})

// Add Server button (opens server modal)
const addServerBtn = document.getElementById('addServerBtn')
if (addServerBtn) {
	addServerBtn.addEventListener('click', () => {
		const modal = document.getElementById('serverModal')
		if (modal) {
			try { 
				modal.showModal()
				modal.querySelector('#serverDisplayName')?.focus()
			} catch (e) { 
				modal.setAttribute('open', '') 
			}
		}
	})
}

// Ensure cancel closes fully
const cancelBtn = document.querySelector('#envModal button[value="cancel"]')
if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); closeEnvModal() })

// close when clicking backdrop (dialog element) or pressing Escape
envModal.addEventListener('click', (e) => { if (e.target === envModal) closeEnvModal() })
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && envModal.hasAttribute('open')) closeEnvModal() })


// Handle env form submission (supports Enter key)
const envForm = envModal.querySelector('form')
if (envForm) {
    envForm.addEventListener('submit', async (e) => {
        e.preventDefault()
        const name = document.getElementById('envName').value.trim()
        const url = document.getElementById('envUrl').value.trim()
        const type = document.getElementById('envType').value
        if (!name || !url) return

        try {
            const db = store.readSync()
            const newEnv = { 
                id: uid(), 
                name, 
                url, 
                type, 
                health: 'ok',
                mappedServers: []
            }
            
            db.environments.push(newEnv)
            
            // Save to database and update memory cache
            await store.write(db)
            memoryCache = db
            
            // Audit log
            logAudit('create', 'environment', name, { url, type })
            
            console.log('✅ Environment created successfully:', name)
            
            // Show success toast
            ToastManager.success(
                'Environment Created',
                `${name} has been successfully added to ${type}`,
                4000
            )
            
            // Clear form fields
            document.getElementById('envName').value = ''
            document.getElementById('envUrl').value = ''
            document.getElementById('envType').value = 'Production' // Reset to default

            try { envModal.close() } catch (e) { /* ignore */ }
            
            const searchInput = document.getElementById('search')
            renderEnvs(searchInput ? searchInput.value : '')
            
        } catch (error) {
            console.error('❌ Failed to create environment:', error)
            alert('Failed to create environment: ' + error.message)
        }
    })
}

// Wire Admin create user action
const createUserBtn = document.getElementById('createUserBtn')
const addUserBtn = document.getElementById('addUserBtn')
const createUserModal = document.getElementById('createUserModal')

function closeCreateUserModal() {
    try { createUserModal.close() } catch (e) {}
    try { createUserModal.removeAttribute('open') } catch (e) {}
    const f = createUserModal.querySelector(':focus'); if (f && f.blur) f.blur()
    // Clear form
    document.getElementById('userName').value = ''
    document.getElementById('userUsername').value = ''
    document.getElementById('userPassword').value = ''
    document.getElementById('userChangePassword').checked = false
    document.getElementById('userEmail').value = ''
    document.getElementById('userPosition').value = ''
    document.getElementById('userSquad').value = ''
    document.getElementById('userRole').value = 'Admin'
    try { addUserBtn.focus() } catch (e) {}
}

if (addUserBtn && createUserModal) {
    addUserBtn.addEventListener('click', () => {
        try { 
            createUserModal.showModal()
            document.getElementById('userName')?.focus()
        } catch (e) { 
            createUserModal.setAttribute('open', '')
        }
    })
    
    // Cancel button
    const cancelBtn = createUserModal.querySelector('button[value="cancel"]')
    if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); closeCreateUserModal() })
    
    // Backdrop click
    createUserModal.addEventListener('click', (e) => { if (e.target === createUserModal) closeCreateUserModal() })
    
    // Escape key
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && createUserModal.hasAttribute('open')) closeCreateUserModal() })
}

if (createUserBtn) {
    createUserBtn.addEventListener('click', (e) => {
        e.preventDefault()
        const name = document.getElementById('userName').value.trim()
        const username = document.getElementById('userUsername').value.trim()
        const password = document.getElementById('userPassword').value.trim()
        const changePassword = document.getElementById('userChangePassword').checked
        const email = document.getElementById('userEmail').value.trim()
        const position = document.getElementById('userPosition').value.trim()
        const squad = document.getElementById('userSquad').value.trim()
        const role = document.getElementById('userRole').value
        if (!name || !email || !username || !password) return
        const db = store.readSync()
        db.users = db.users || []
        db.users.unshift({ 
            id: uid(), 
            name,
            username,
            password,
            changePasswordOnLogin: changePassword,
            email,
            position: position || '—',
            squad: squad || '—',
            role,
            lastLogin: '—',
            lastActivity: Date.now(),
            ip: '—',
            isActive: true
        })
        store.write(db)
        
        // Audit log
        logAudit('create', 'user', name, { username, email, role })
        
        // clear inputs
        document.getElementById('userName').value = ''
        document.getElementById('userUsername').value = ''
        document.getElementById('userPassword').value = ''
        document.getElementById('userChangePassword').checked = false
        document.getElementById('userEmail').value = ''
        document.getElementById('userPosition').value = ''
        document.getElementById('userSquad').value = ''
        document.getElementById('userRole').value = 'Admin'
        renderUsers()
        closeCreateUserModal()
    })
}

// Wire up edit user form submission
const saveEditUserBtn = document.getElementById('saveEditUserBtn')
if (saveEditUserBtn) {
    const editUserForm = editUserModal.querySelector('form')
    if (editUserForm) {
        editUserForm.addEventListener('submit', (e) => {
            e.preventDefault()
            const id = document.getElementById('editUserId').value
            const name = document.getElementById('editUserName').value.trim()
            const username = document.getElementById('editUserUsername').value.trim()
            const password = document.getElementById('editUserPassword').value.trim()
            const changePassword = document.getElementById('editUserChangePassword').checked
            const email = document.getElementById('editUserEmail').value.trim()
            const position = document.getElementById('editUserPosition').value.trim()
            const squad = document.getElementById('editUserSquad').value.trim()
            const role = document.getElementById('editUserRole').value
            if (!id || !name || !email || !username) return
            
            const db = store.readSync()
            const user = db.users.find(x => x.id === id)
            if (user) {
                const oldValues = {
                    name: user.name,
                    username: user.username,
                    email: user.email,
                    position: user.position,
                    squad: user.squad,
                    role: user.role
                }
                
                user.name = name
                user.username = username
                if (password) user.password = password // Only update if not empty
                user.changePasswordOnLogin = changePassword
                user.email = email
                user.position = position || '—'
                user.squad = squad || '—'
                user.role = role
                store.write(db)
                
                // Audit log with old and new values
                logAudit('update', 'user', name, { 
                    old: oldValues,
                    new: { name, username, email, position: position || '—', squad: squad || '—', role }
                })
                
                renderUsers()
            }
            try { editUserModal.close() } catch (e) { editUserModal.removeAttribute('open') }
        })
    }
}


// ========== DATABASE MODAL HANDLERS ==========
const databaseModal = document.getElementById('databaseModal')
const editDatabaseModal = document.getElementById('editDatabaseModal')
const deleteDatabaseModal = document.getElementById('deleteDatabaseModal')
const addDatabaseBtn = document.getElementById('addDatabaseBtn')
let databaseToDelete = null

function closeDatabaseModal() {
    try { databaseModal.close() } catch (e) {}
    try { databaseModal.removeAttribute('open') } catch (e) {}
    document.getElementById('dbName').value = ''
    document.getElementById('dbType').value = 'PostgreSQL'
    document.getElementById('dbConnectionString').value = ''
    document.getElementById('dbDescription').value = ''
}

function closeEditDatabaseModal() {
    try { editDatabaseModal.close() } catch (e) {}
    try { editDatabaseModal.removeAttribute('open') } catch (e) {}
}

function closeDeleteDatabaseModal() {
    try { deleteDatabaseModal.close() } catch (e) {}
    try { deleteDatabaseModal.removeAttribute('open') } catch (e) {}
    databaseToDelete = null
}

// Add database button
if (addDatabaseBtn && databaseModal) {
    addDatabaseBtn.addEventListener('click', () => {
        try {
            databaseModal.showModal()
            document.getElementById('dbName')?.focus()
        } catch (e) {
            databaseModal.setAttribute('open', '')
        }
    })
    
    const cancelBtn = databaseModal.querySelector('button[value="cancel"]')
    if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); closeDatabaseModal() })
    
    databaseModal.addEventListener('click', (e) => { if (e.target === databaseModal) closeDatabaseModal() })
}

// Save new database
const saveDbBtn = document.getElementById('saveDbBtn')
if (saveDbBtn) {
    saveDbBtn.addEventListener('click', (e) => {
        e.preventDefault()
        const name = document.getElementById('dbName').value.trim()
        const type = document.getElementById('dbType').value
        const connectionString = document.getElementById('dbConnectionString').value.trim()
        const description = document.getElementById('dbDescription').value.trim()
        
        if (!name || !connectionString) return
        
        const db = store.readSync()
        db.databases = db.databases || []
        db.databases.push({
            id: uid(),
            name,
            type,
            connectionString,
            description
        })
        store.write(db)
        
        // Audit log
        logAudit('create', 'database', name, { type })
        
        renderDatabases()
        closeDatabaseModal()
    })
}

// Edit database modal
if (editDatabaseModal) {
    const cancelBtn = editDatabaseModal.querySelector('button[value="cancel"]')
    if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); closeEditDatabaseModal() })
    
    editDatabaseModal.addEventListener('click', (e) => { if (e.target === editDatabaseModal) closeEditDatabaseModal() })
}

// Save edited database
const saveEditDbBtn = document.getElementById('saveEditDbBtn')
if (saveEditDbBtn) {
    saveEditDbBtn.addEventListener('click', (e) => {
        e.preventDefault()
        const id = document.getElementById('editDbId').value
        const name = document.getElementById('editDbName').value.trim()
        const type = document.getElementById('editDbType').value
        const connectionString = document.getElementById('editDbConnectionString').value.trim()
        const description = document.getElementById('editDbDescription').value.trim()
        
        if (!id || !name || !connectionString) return
        
        const db = store.readSync()
        const database = db.databases.find(x => x.id === id)
        if (database) {
            const oldValues = {
                name: database.name,
                type: database.type,
                connectionString: database.connectionString,
                description: database.description
            }
            
            database.name = name
            database.type = type
            database.connectionString = connectionString
            database.description = description
            store.write(db)
            
            // Audit log with old and new values
            logAudit('update', 'database', name, { 
                old: oldValues,
                new: { name, type, connectionString, description }
            })
            
            renderDatabases()
        }
        closeEditDatabaseModal()
    })
}

// Delete database modal
if (deleteDatabaseModal) {
    const cancelBtn = deleteDatabaseModal.querySelector('button[value="cancel"]')
    if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); closeDeleteDatabaseModal() })
    
    deleteDatabaseModal.addEventListener('click', (e) => { if (e.target === deleteDatabaseModal) closeDeleteDatabaseModal() })
}

// Confirm delete database
const confirmDeleteDbBtn = document.getElementById('confirmDeleteDbBtn')
if (confirmDeleteDbBtn) {
    confirmDeleteDbBtn.addEventListener('click', (e) => {
        e.preventDefault()
        if (databaseToDelete) {
            const db = store.readSync()
            const idx = db.databases.findIndex(x => x.id === databaseToDelete.id)
            if (idx >= 0) {
                const dbName = db.databases[idx].name
                db.databases.splice(idx, 1)
                store.write(db)
                
                // Audit log
                logAudit('delete', 'database', dbName, {})
                
                renderDatabases()
            }
        }
        closeDeleteDatabaseModal()
    })
}

// Database search
const databaseSearchInput = document.getElementById('databaseSearchInput')
if (databaseSearchInput) {
    databaseSearchInput.addEventListener('input', (e) => renderDatabases(e.target.value))
}

// Test Database Connection from list
const testDbConnectionFromListBtn = document.getElementById('testDbConnectionFromListBtn')
const buildDbBtn = document.getElementById('buildDbBtn')

if (testDbConnectionFromListBtn) {
    testDbConnectionFromListBtn.addEventListener('click', async () => {
        const db = store.readSync()
        const databases = db.databases || []
        
        if (databases.length === 0) {
            alert('No databases found. Please add a database connection first.')
            return
        }
        
        // Use the first database or selected one
        const database = databases[0]
        
        // Disable button and show loading
        testDbConnectionFromListBtn.disabled = true
        testDbConnectionFromListBtn.innerHTML = `
            <div class="spinner-ring" style="width:16px; height:16px; border-width:2px; margin-right:8px;"></div>
            Testing...
        `
        
        // Simulate connection test (replace with actual API call)
        setTimeout(() => {
            // Success
            testDbConnectionFromListBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Connection Successful!
            `
            testDbConnectionFromListBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
            
            // Enable Build DB button
            buildDbBtn.disabled = false
            buildDbBtn.style.opacity = '1'
            
            // Reset after 3 seconds
            setTimeout(() => {
                testDbConnectionFromListBtn.disabled = false
                testDbConnectionFromListBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    Test Connection
                `
                testDbConnectionFromListBtn.style.background = 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)'
            }, 3000)
        }, 2000)
    })
}

// Build Database
if (buildDbBtn) {
    buildDbBtn.addEventListener('click', () => {
        // Open the database initialization modal
        const modal = document.getElementById('dbInitProgressModal')
        const progressList = document.getElementById('dbInitProgressList')
        const progressBar = document.getElementById('dbInitProgressBar')
        const progressPercent = document.getElementById('dbInitProgressPercent')
        const closeBtn = document.getElementById('closeDbInitProgressBtn')
        
        if (!modal) {
            alert('Database initialization modal not found.')
            return
        }
        
        // Reset modal
        progressList.innerHTML = ''
        progressBar.style.width = '0%'
        progressPercent.textContent = '0%'
        closeBtn.disabled = true
        
        modal.showModal()
        
        // Tables to create
        const tables = [
            { name: 'Users', description: 'User accounts and authentication' },
            { name: 'Environments', description: 'Environment configurations' },
            { name: 'Servers', description: 'Server inventory and status' },
            { name: 'Scripts', description: 'PowerShell script repository' },
            { name: 'Builds', description: 'Build execution history' },
            { name: 'Credentials', description: 'Encrypted credentials vault' },
            { name: 'DatabaseConnections', description: 'Database connection strings' },
            { name: 'AuditLogs', description: 'System activity tracking' },
            { name: 'Sessions', description: 'User session management' }
        ]
        
        let completed = 0
        const total = tables.length
        
        // Simulate table creation (replace with actual API calls)
        tables.forEach((table, index) => {
            setTimeout(() => {
                const item = document.createElement('div')
                item.style.cssText = 'display:flex; align-items:center; gap:12px; padding:12px; background:var(--bg-secondary); border-radius:8px;'
                item.innerHTML = `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <div style="flex:1;">
                        <div style="font-weight:600; margin-bottom:2px;">${table.name}</div>
                        <div style="font-size:12px; color:var(--muted);">${table.description}</div>
                    </div>
                `
                progressList.appendChild(item)
                
                completed++
                const percent = Math.round((completed / total) * 100)
                progressBar.style.width = percent + '%'
                progressPercent.textContent = percent + '%'
                
                if (completed === total) {
                    closeBtn.disabled = false
                    
                    // Add final success message
                    setTimeout(() => {
                        const successItem = document.createElement('div')
                        successItem.style.cssText = 'padding:16px; background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); border-radius:8px; margin-top:8px;'
                        successItem.innerHTML = `
                            <div style="display:flex; align-items:center; gap:12px;">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                                </svg>
                                <div>
                                    <div style="font-weight:700; font-size:16px; color:#10b981; margin-bottom:4px;">Database Built Successfully!</div>
                                    <div style="font-size:13px; color:var(--muted);">All tables created and ready to use.</div>
                                </div>
                            </div>
                        `
                        progressList.appendChild(successItem)
                        
                        // Log audit
                        logAudit('create', 'database', 'OrbisHub Schema', 'Initialized database schema with all tables')
                    }, 300)
                }
            }, (index + 1) * 800)
        })
    })
}


// ========== CREDENTIALS MODAL HANDLERS ==========
const credentialModal = document.getElementById('credentialModal')
const editCredentialModal = document.getElementById('editCredentialModal')
const deleteCredentialModal = document.getElementById('deleteCredentialModal')
const addCredentialBtn = document.getElementById('addCredentialBtn')
let credentialToDelete = null

function closeCredentialModal() {
    try { credentialModal.close() } catch (e) {}
    try { credentialModal.removeAttribute('open') } catch (e) {}
    document.getElementById('credName').value = ''
    document.getElementById('credType').value = 'Username/Password'
    document.getElementById('credUsername').value = ''
    document.getElementById('credPassword').value = ''
    document.getElementById('credDescription').value = ''
}

function closeEditCredentialModal() {
    try { editCredentialModal.close() } catch (e) {}
    try { editCredentialModal.removeAttribute('open') } catch (e) {}
}

function closeDeleteCredentialModal() {
    try { deleteCredentialModal.close() } catch (e) {}
    try { deleteCredentialModal.removeAttribute('open') } catch (e) {}
    credentialToDelete = null
}

// Add credential button
if (addCredentialBtn && credentialModal) {
    addCredentialBtn.addEventListener('click', () => {
        try {
            credentialModal.showModal()
            document.getElementById('credName')?.focus()
        } catch (e) {
            credentialModal.setAttribute('open', '')
        }
    })
    
    const cancelBtn = credentialModal.querySelector('button[value="cancel"]')
    if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); closeCredentialModal() })
    
    credentialModal.addEventListener('click', (e) => { if (e.target === credentialModal) closeCredentialModal() })
}

// Save new credential
const saveCredBtn = document.getElementById('saveCredBtn')
if (saveCredBtn) {
    saveCredBtn.addEventListener('click', async (e) => {
        e.preventDefault()
        const name = document.getElementById('credName').value.trim()
        const type = document.getElementById('credType').value
        const username = document.getElementById('credUsername').value.trim()
        const password = document.getElementById('credPassword').value.trim()
        const description = document.getElementById('credDescription').value.trim()
        
        if (!name) return
        
        const newCred = {
            id: uid(),
            name,
            type,
            username,
            password,
            description
        }
        
        console.log('➕ Saving credential to database:', newCred)
        
        // Save directly to database
        try {
            const response = await fetch(`${API_BASE_URL}/api/sync-data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    credentials: [newCred]
                })
            })
            
            const result = await response.json()
            console.log('✅ Database save result:', result)
            
            if (result.success) {
                console.log('✅ Credential saved to database')
                
                
                const db = store.readSync()
                db.credentials = db.credentials || []
                db.credentials.push(newCred)
                store.write(db, true) // Skip sync - we already saved to DB
                
                // Credential saved to database
                
                // Audit log
                await logAudit('create', 'credential', name, { type, username })
                
                // Re-render from database
                await renderCredentials()
                closeCredentialModal()
            } else {
                alert('Failed to save credential: ' + (result.error || 'Unknown error'))
            }
        } catch (error) {
            console.error('❌ Failed to save credential:', error)
            alert('Failed to save credential: ' + error.message)
        }
    })
}

// Edit credential modal
if (editCredentialModal) {
    const cancelBtn = editCredentialModal.querySelector('button[value="cancel"]')
    if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); closeEditCredentialModal() })
    
    editCredentialModal.addEventListener('click', (e) => { if (e.target === editCredentialModal) closeEditCredentialModal() })
}

// Save edited credential
const saveEditCredBtn = document.getElementById('saveEditCredBtn')
if (saveEditCredBtn) {
    saveEditCredBtn.addEventListener('click', async (e) => {
        e.preventDefault()
        const id = document.getElementById('editCredId').value
        const name = document.getElementById('editCredName').value.trim()
        const type = document.getElementById('editCredType').value
        const username = document.getElementById('editCredUsername').value.trim()
        const password = document.getElementById('editCredPassword').value.trim()
        const description = document.getElementById('editCredDescription').value.trim()
        
        if (!id || !name) return
        
        console.log('✏️ Updating credential in database:', id)
        
        try {
            const db = store.readSync()
            const credential = db.credentials.find(x => x.id === id)
            if (!credential) {
                alert('Credential not found')
                return
            }
            
            const oldValues = {
                name: credential.name,
                type: credential.type,
                username: credential.username,
                description: credential.description
            }
            
            // Update credential object
            credential.name = name
            credential.type = type
            credential.username = username
            if (password) credential.password = password // Only update if not empty
            credential.description = description
            
            // Save to database
            const response = await fetch(`${API_BASE_URL}/api/sync-data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    credentials: [credential]
                })
            })
            
            const result = await response.json()
            console.log('✅ Database update result:', result)
            
            if (result.success) {
                console.log('✅ Credential updated in database')
                
                
                store.write(db, true) // Skip sync - we already updated DB
                
                // Credential updated in database
                
                // Audit log with old and new values
                await logAudit('update', 'credential', name, { 
                    old: oldValues,
                    new: { name, type, username, description }
                })
                
                // Re-render from database
                await renderCredentials()
                closeEditCredentialModal()
            } else {
                alert('Failed to update credential: ' + (result.error || 'Unknown error'))
            }
        } catch (error) {
            console.error('❌ Failed to update credential:', error)
            alert('Failed to update credential: ' + error.message)
        }
    })
}

// Delete credential modal
if (deleteCredentialModal) {
    const cancelBtn = deleteCredentialModal.querySelector('button[value="cancel"]')
    if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); closeDeleteCredentialModal() })
    
    deleteCredentialModal.addEventListener('click', (e) => { if (e.target === deleteCredentialModal) closeDeleteCredentialModal() })
}

// Confirm delete credential
const confirmDeleteCredBtn = document.getElementById('confirmDeleteCredBtn')
if (confirmDeleteCredBtn) {
    confirmDeleteCredBtn.addEventListener('click', async (e) => {
        e.preventDefault()
        if (credentialToDelete) {
            const db = store.readSync()
            const idx = db.credentials.findIndex(x => x.id === credentialToDelete.id)
            if (idx >= 0) {
                const credName = db.credentials[idx].name
                const credId = db.credentials[idx].id
                
                console.log('🗑️ Deleting credential:', credName, 'ID:', credId)
                
                // 1) Unassign credential from servers and environments first (to satisfy FK constraints)
                const updatedServers = []
                if (Array.isArray(db.servers)) {
                    db.servers.forEach(s => {
                        if (s.credentialId === credId) {
                            s.credentialId = null
                            updatedServers.push({ ...s })
                        }
                    })
                }

                // If in use, persist the reference clear before deleting the row
                if (updatedServers.length > 0) {
                    try {
                        console.log('🔄 Clearing credential references in DB...', { servers: updatedServers.length })
                        const syncRes = await fetch(`${API_BASE_URL}/api/sync-data`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                servers: updatedServers
                            })
                        })
                        const syncJson = await syncRes.json()
                        if (!syncJson.success) {
                            console.error('❌ Could not clear references before delete:', syncJson.error)
                            alert('Failed to clear references before delete. Please try again.')
                            closeDeleteCredentialModal()
                            return
                        }
                    } catch (syncErr) {
                        console.error('❌ Failed to clear references before delete:', syncErr)
                        alert('Failed to clear references before delete: ' + (syncErr?.message || syncErr))
                        closeDeleteCredentialModal()
                        return
                    }
                }

                // 2) Now delete the credential row
                console.log('📡 Calling deleteFromDatabase...')
                try {
                    const result = await store.deleteFromDatabase('credential', credId)
                    console.log('✅ Database delete result:', JSON.stringify(result))
                    
                    if (!result || !result.success) {
                        console.error('❌ Database delete failed:', JSON.stringify(result))
                        alert('Failed to delete credential from database: ' + (result?.error || 'Unknown error'))
                        closeDeleteCredentialModal()
                        return // Stop if database delete failed
                    }
                    
                    console.log('✅ Credential successfully deleted from database')
                } catch (error) {
                    console.error('❌ Failed to delete credential from database:', error)
                    alert('Failed to delete credential from database: ' + error.message)
                    closeDeleteCredentialModal()
                    return // Stop if database delete failed
                }

                // 3) Update local store after DB delete
                db.credentials.splice(idx, 1)
                store.write(db, true) // Skip sync - DB already updated
                
                // Credential deleted from database
                
                // Reload credentials from database
                console.log('🔄 Reloading credentials from database...')
                try {
                    const reloadResponse = await fetch(`${API_BASE_URL}/api/load-data`)
                    const reloadData = await reloadResponse.json()
                    if (reloadData.success && reloadData.data && reloadData.data.credentials) {
                        const dbReload = store.readSync()
                        dbReload.credentials = reloadData.data.credentials
                        store.write(dbReload, true)
                        console.log('✅ Credentials reloaded from database')
                    }
                } catch (reloadError) {
                    console.warn('⚠️ Could not reload credentials from database:', reloadError)
                }
                
                // Audit log
                await logAudit('delete', 'credential', credName, {})
                
                // Re-render from database
                await renderCredentials()
                renderServers()
                renderEnvs(document.getElementById('search')?.value || '')
            }
        }
        closeDeleteCredentialModal()
    })
}

// Credential search
const credentialSearchInput = document.getElementById('credentialSearchInput')
if (credentialSearchInput) {
    credentialSearchInput.addEventListener('input', (e) => renderCredentials(e.target.value))
}


// ========== BUILD MODALS ==========
const buildModal = document.getElementById('buildModal')
const editBuildModal = document.getElementById('editBuildModal')
const deleteBuildModal = document.getElementById('deleteBuildModal')
const addBuildBtn = document.getElementById('addBuildBtn')

function closeBuildModal() {
    // Clear URL parameters
    const url = new URL(window.location)
    url.searchParams.delete('action')
    url.searchParams.delete('id')
    window.history.pushState({ view: url.searchParams.get('view') || 'builds' }, '', url)
    
    try { buildModal.close() } catch (e) {}
    try { buildModal.removeAttribute('open') } catch (e) {}
    document.getElementById('buildName').value = ''
    document.getElementById('buildScript').value = ''
    document.getElementById('buildServer').value = ''
    document.getElementById('buildTargetOverride').value = ''
}

function closeEditBuildModal() {
    // Clear URL parameters
    const url = new URL(window.location)
    url.searchParams.delete('action')
    url.searchParams.delete('id')
    window.history.pushState({ view: url.searchParams.get('view') || 'builds' }, '', url)
    
    try { editBuildModal.close() } catch (e) {}
    try { editBuildModal.removeAttribute('open') } catch (e) {}
    document.getElementById('editBuildTargetOverride').value = ''
}

function closeDeleteBuildModal() {
    // Clear URL parameters
    const url = new URL(window.location)
    url.searchParams.delete('action')
    url.searchParams.delete('id')
    window.history.pushState({ view: url.searchParams.get('view') || 'builds' }, '', url)
    
    try { deleteBuildModal.close() } catch (e) {}
    try { deleteBuildModal.removeAttribute('open') } catch (e) {}
}

// Build button event listener moved to DOMContentLoaded section

// Add build modal handlers
if (buildModal) {
    const cancelBtn = buildModal.querySelector('button[value="cancel"]')
    if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); closeBuildModal() })
    
    buildModal.addEventListener('click', (e) => { if (e.target === buildModal) closeBuildModal() })
}

// Create build
const saveBuildBtn = document.getElementById('saveBuildBtn')
if (saveBuildBtn) {
    saveBuildBtn.addEventListener('click', async (e) => {
        e.preventDefault()
        console.log('💾 Creating new build...')
        const name = document.getElementById('buildName').value.trim()
        const script = document.getElementById('buildScript').value
        const serverId = document.getElementById('buildServer').value
        const targetOverride = document.getElementById('buildTargetOverride').value.trim()
        
        if (!name || !script || !serverId) {
            console.log('❌ Missing required fields')
            return
        }
        
        const db = store.readSync()
        db.builds = db.builds || []
        db.builds.push({
            id: uid(),
            name,
            script,
            serverId,
            targetOverride: targetOverride || null
        })
        
        // Sync to database first
        await store.syncToDatabase(db)
        console.log('✅ Build synced to database')
        
        
        store.write(db, true) // skipSync since we just synced
        // Build saved to database
        
        // Audit log
        const server = db.servers?.find(s => s.id === serverId)
        const serverName = server ? (server.displayName || server.name || 'Unknown') : 'Unknown'
        await logAudit('create', 'build', name, { script, server: serverName, targetOverride })
        console.log('✅ Audit log created')
        
        console.log('🔄 Re-rendering builds from database...')
        await renderBuilds()
        console.log('✅ Builds re-rendered')
        closeBuildModal()
    })
}

// Edit build modal
if (editBuildModal) {
    const cancelBtn = editBuildModal.querySelector('button[value="cancel"]')
    if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); closeEditBuildModal() })
    
    editBuildModal.addEventListener('click', (e) => { if (e.target === editBuildModal) closeEditBuildModal() })
}

// Save edited build
const saveEditBuildBtn = document.getElementById('saveEditBuildBtn')
if (saveEditBuildBtn) {
    saveEditBuildBtn.addEventListener('click', async (e) => {
        e.preventDefault()
        console.log('✏️ Editing build...')
        const id = document.getElementById('editBuildId').value
        const name = document.getElementById('editBuildName').value.trim()
        const script = document.getElementById('editBuildScript').value
        const serverId = document.getElementById('editBuildServer').value
        const targetOverride = document.getElementById('editBuildTargetOverride').value.trim()
        
        if (!id || !name || !script || !serverId) {
            console.log('❌ Missing required fields for edit')
            return
        }
        
        const db = store.readSync()
        const build = db.builds.find(x => x.id === id)
        if (build) {
            const oldValues = {
                name: build.name,
                script: build.script,
                serverId: build.serverId,
                targetOverride: build.targetOverride
            }
            
            build.name = name
            build.script = script
            build.serverId = serverId
            build.targetOverride = targetOverride || null
            
            // Sync to database first
            await store.syncToDatabase(db)
            console.log('✅ Build synced to database')
            
            
            store.write(db, true) // skipSync since we just synced
            // Build updated in database
            
            // Audit log with old and new values
            await logAudit('update', 'build', name, { 
                old: oldValues,
                new: { name, script, serverId, targetOverride }
            })
            console.log('✅ Audit log created')
            
            console.log('🔄 Re-rendering builds from database...')
            await renderBuilds()
            console.log('✅ Builds re-rendered')
        } else {
            console.log('❌ Build not found with id:', id)
        }
        closeEditBuildModal()
    })
}

// Delete build modal
if (deleteBuildModal) {
    const cancelBtn = deleteBuildModal.querySelector('button[value="cancel"]')
    if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); closeDeleteBuildModal() })
    
    deleteBuildModal.addEventListener('click', (e) => { if (e.target === deleteBuildModal) closeDeleteBuildModal() })
}

// Build started modal
const buildStartedModal = document.getElementById('buildStartedModal')
if (buildStartedModal) {
    buildStartedModal.addEventListener('click', (e) => { 
        if (e.target === buildStartedModal) {
            try {
                buildStartedModal.close()
            } catch (e) {
                buildStartedModal.removeAttribute('open')
            }
        }
    })
}

// Confirm delete build
const confirmDeleteBuildBtn = document.getElementById('confirmDeleteBuildBtn')
if (confirmDeleteBuildBtn) {
    confirmDeleteBuildBtn.addEventListener('click', async (e) => {
        e.preventDefault()
        console.log('🗑️ Deleting build...')
        if (buildToDelete) {
            const buildName = buildToDelete.name
            const buildId = buildToDelete.id
            console.log('Deleting build:', buildName, 'with id:', buildId)
            
            // Delete from database first
            try {
                console.log('Sending delete request to database...')
                const response = await fetch(`${API_BASE_URL}/api/delete-record`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        entityType: 'builds',
                        id: buildId
                    })
                })
                const result = await response.json()
                console.log('Delete response:', result)
            } catch (error) {
                console.error('❌ Failed to delete build from database:', error)
            }
            
            
            const db = store.readSync()
            const idx = db.builds.findIndex(x => x.id === buildId)
            if (idx >= 0) {
                db.builds.splice(idx, 1)
                store.write(db, true) // skipSync since we already deleted from DB
                // Build removed from database
            }
            
            // Audit log
            await logAudit('delete', 'build', buildName, {})
            console.log('✅ Audit log created')
            
            // Re-render from database
            console.log('🔄 Re-rendering builds from database...')
            await renderBuilds()
            console.log('✅ Builds re-rendered')
        }
        closeDeleteBuildModal()
    })
}


// ========== SERVER MODALS ==========
const serverModal = document.getElementById('serverModal')
const editServerModal = document.getElementById('editServerModal')
const deleteServerModal = document.getElementById('deleteServerModal')

function closeServerModal() {
    try { serverModal.close() } catch (e) {}
    try { serverModal.removeAttribute('open') } catch (e) {}
    document.getElementById('serverDisplayName').value = ''
    document.getElementById('serverHostname').value = ''
    document.getElementById('serverIp').value = ''
    document.getElementById('serverType').value = ''
    const osSel = document.getElementById('serverOS'); if (osSel) osSel.value = 'Windows'
    document.getElementById('serverGroup').value = ''
}

function closeEditServerModal() {
    try { editServerModal.close() } catch (e) {}
    try { editServerModal.removeAttribute('open') } catch (e) {}
}

function closeDeleteServerModal() {
    try { deleteServerModal.close() } catch (e) {}
    try { deleteServerModal.removeAttribute('open') } catch (e) {}
}

// Server modal handlers
if (serverModal) {
    const cancelBtn = serverModal.querySelector('button[value="cancel"]')
    if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); closeServerModal() })
    
    serverModal.addEventListener('click', (e) => { if (e.target === serverModal) closeServerModal() })
}

// Create server
const saveServerBtn = document.getElementById('saveServerBtn')
if (saveServerBtn) {
    saveServerBtn.addEventListener('click', async (e) => {
        e.preventDefault()
        const displayName = document.getElementById('serverDisplayName').value.trim()
        const hostname = document.getElementById('serverHostname').value.trim()
        const ip = document.getElementById('serverIp').value.trim()
        const type = document.getElementById('serverType').value
        const os = (document.getElementById('serverOS')?.value) || 'Windows'
        const group = document.getElementById('serverGroup').value.trim()
        
        console.log('🔍 Server form values:', { displayName, hostname, ip, type, os, group })
        
        if (!displayName || !hostname || !ip || !type) {
            console.warn('❌ Missing required fields')
            return
        }
        
        try {
            // Disable button while processing
            saveServerBtn.disabled = true
            saveServerBtn.textContent = 'Testing Connection...'
            
            const newServer = {
                id: uid(),
                displayName,
                hostname,
                ipAddress: ip,
                type,
                os,
                status: 'active',
                serverGroup: group || 'Ungrouped',
                health: 'checking'
            }
            
            // Test connection based on OS (RDP 3389 vs SSH 22)
            const testPort = os === 'Linux' ? 22 : 3389
            const isReachable = await testServerConnection(ip, displayName, testPort)
            newServer.health = isReachable ? 'ok' : 'error'
            newServer.port = testPort
            
            // Save to database FIRST
            console.log('💾 Saving server to database...')
            try {
                const response = await fetch(`${API_BASE_URL}/api/sync-data`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        servers: [newServer]
                    })
                })
                const dbResult = await response.json()
                if (!dbResult.success) {
                    throw new Error(dbResult.error || 'Failed to save to database')
                }
                console.log('✅ Server saved to database')
            } catch (dbError) {
                console.error('❌ Database save failed:', dbError)
                throw new Error('Failed to save server to database: ' + dbError.message)
            }
            
            
            const db = store.readSync()
            db.servers.push(newServer)
            store.write(db, true) // Skip sync - we already saved to DB
            
            // Audit log
            await logAudit('create', 'server', displayName, { 
                hostname, 
                ip, 
                type, os,
                group: group || 'Ungrouped',
                connectionTest: isReachable ? 'success' : 'failed'
            })
            
            console.log('✅ Server created successfully:', displayName)
            
            // Show appropriate toast based on connection test
            if (isReachable) {
                ToastManager.success(
                    'Server Added & Reachable',
                    `${displayName} has been registered and is responding`,
                    5000
                )
            } else {
                ToastManager.warning(
                    'Server Added (Unreachable)',
                    `${displayName} was registered but connection test failed`,
                    6000
                )
            }
            
            renderServers()
            closeServerModal()
        } catch (error) {
            console.error('❌ Failed to create server:', error)
            ToastManager.error('Server Creation Failed', error.message, 5000)
        } finally {
            saveServerBtn.disabled = false
            saveServerBtn.textContent = 'Add Server'
        }
    })
}

// Edit server modal
if (editServerModal) {
    const cancelBtn = editServerModal.querySelector('button[value="cancel"]')
    if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); closeEditServerModal() })
    
    editServerModal.addEventListener('click', (e) => { if (e.target === editServerModal) closeEditServerModal() })
}

// Save edited server
const saveEditServerBtn = document.getElementById('saveEditServerBtn')
if (saveEditServerBtn) {
    saveEditServerBtn.addEventListener('click', async (e) => {
        e.preventDefault()
        const id = document.getElementById('editServerId').value
        const displayName = document.getElementById('editServerDisplayName').value.trim()
        const hostname = document.getElementById('editServerHostname').value.trim()
        const ip = document.getElementById('editServerIp').value.trim()
        const type = document.getElementById('editServerType').value
        const os = (document.getElementById('editServerOS')?.value) || 'Windows'
        const group = document.getElementById('editServerGroup').value.trim()
        const credentialId = document.getElementById('editServerCredential').value
        
        if (!id || !displayName || !hostname || !ip || !type) return
        
        try {
            // Disable button while processing
            saveEditServerBtn.disabled = true
            saveEditServerBtn.textContent = 'Testing Connection...'
            
            const db = store.readSync()
            const server = db.servers.find(x => x.id === id)
            if (server) {
                const oldValues = {
                    displayName: server.displayName,
                    hostname: server.hostname,
                    ipAddress: server.ipAddress,
                    type: server.type,
                    serverGroup: server.serverGroup,
                    credentialId: server.credentialId,
                    health: server.health
                }
                
                // Always test connection on save (not just when IP changes)
                console.log(`🔍 Testing connection for ${displayName}...`)
                const testPort = os === 'Linux' ? 22 : (server.port || 3389)
                const isReachable = await testServerConnection(ip, displayName, testPort)
                server.health = isReachable ? 'ok' : 'error'
                
                server.displayName = displayName
                server.hostname = hostname
                server.ipAddress = ip
                server.type = type
                server.os = os
                server.serverGroup = group || 'Ungrouped'
                server.credentialId = credentialId || null
                server.port = testPort
                
                // Sync to database FIRST
                console.log('💾 Updating server in database...')
                try {
                    const response = await fetch(`${API_BASE_URL}/api/sync-data`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            servers: [server]
                        })
                    })
                    const dbResult = await response.json()
                    if (!dbResult.success) {
                        throw new Error(dbResult.error || 'Failed to update in database')
                    }
                    console.log('✅ Server updated in database')
                } catch (dbError) {
                    console.error('❌ Database update failed:', dbError)
                    throw new Error('Failed to update server in database: ' + dbError.message)
                }
                
                
                store.write(db, true) // Skip sync - we already updated DB
                
                // Audit log with old and new values
                await logAudit('update', 'server', displayName, { 
                    old: oldValues,
                    new: { displayName, hostname, ipAddress: ip, type, os, serverGroup: group || 'Ungrouped', credentialId, health: server.health }
                })
                
                // Show appropriate toast based on connection test
                if (isReachable) {
                    ToastManager.success('Server Updated & Reachable', `${displayName} has been updated and is responding`, 5000)
                } else {
                    ToastManager.warning('Server Updated (Unreachable)', `${displayName} was updated but connection test failed`, 6000)
                }
                
                renderServers()
            }
        } catch (error) {
            console.error('❌ Failed to update server:', error)
            ToastManager.error('Server Update Failed', error.message, 5000)
        } finally {
            saveEditServerBtn.disabled = false
            saveEditServerBtn.textContent = 'Save Changes'
            closeEditServerModal()
        }
    })
}

// Delete server modal
if (deleteServerModal) {
    const cancelBtn = deleteServerModal.querySelector('button[value="cancel"]')
    if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); closeDeleteServerModal() })
    
    deleteServerModal.addEventListener('click', (e) => { if (e.target === deleteServerModal) closeDeleteServerModal() })
}

// Confirm delete server
const confirmDeleteServerBtn = document.getElementById('confirmDeleteServerBtn')
if (confirmDeleteServerBtn) {
    confirmDeleteServerBtn.addEventListener('click', async (e) => {
        e.preventDefault()
        if (serverToDelete) {
            const db = store.readSync()
            const idx = db.servers.findIndex(x => x.id === serverToDelete.id)
            if (idx >= 0) {
                const serverName = db.servers[idx].displayName
                const serverId = db.servers[idx].id
                
                console.log('🗑️ Deleting server:', serverName, 'ID:', serverId)
                
                // Delete from database FIRST
                console.log('📡 Calling deleteFromDatabase...')
                try {
                    const result = await store.deleteFromDatabase('server', serverId)
                    console.log('✅ Database delete result:', JSON.stringify(result))
                    if (!result || !result.success) {
                        console.error('❌ Database delete failed:', JSON.stringify(result))
                        alert('Failed to delete server from database: ' + (result?.error || 'Unknown error'))
                        closeDeleteServerModal()
                        return // Stop if database delete failed
                    }
                    console.log('✅ Server successfully deleted from database')
                } catch (error) {
                    console.error('❌ Failed to delete server from database:', error)
                    alert('Failed to delete server from database: ' + error.message)
                    closeDeleteServerModal()
                    return // Stop if database delete failed
                }
                
                
                db.servers.splice(idx, 1)
                store.write(db, true) // Skip sync - we already deleted from DB
                
                // Server deleted from database
                
                // Reload servers from database
                console.log('🔄 Reloading servers from database...')
                try {
                    const reloadResponse = await fetch(`${API_BASE_URL}/api/load-data`)
                    const reloadData = await reloadResponse.json()
                    if (reloadData.success && reloadData.data && reloadData.data.servers) {
                        // [Removed - database-only architecture]
                        freshDb.servers = reloadData.data.servers
                        store.write(freshDb, true) // Skip sync - we just loaded from DB
                        console.log('✅ Servers reloaded from database')
                    }
                } catch (reloadError) {
                    console.warn('⚠️ Could not reload servers from database:', reloadError)
                }
                
                // Audit log
                await logAudit('delete', 'server', serverName, {})
                
                renderServers()
            }
        }
        closeDeleteServerModal()
    })
}


// ========== AUDIT LOGS SEARCH AND FILTERS ==========
const auditSearchInput = document.getElementById('auditSearchInput')
const auditActionFilter = document.getElementById('auditActionFilter')
const auditEntityFilter = document.getElementById('auditEntityFilter')

function applyAuditFilters() {
    const search = auditSearchInput?.value || ''
    const action = auditActionFilter?.value || ''
    const entity = auditEntityFilter?.value || ''
    
    // Reset to first page when applying filters
    auditPagination.currentPage = 1
    renderAuditLogs(search, action, entity)
}

if (auditSearchInput) {
    auditSearchInput.addEventListener('input', applyAuditFilters)
}

if (auditActionFilter) {
    auditActionFilter.addEventListener('change', applyAuditFilters)
}

if (auditEntityFilter) {
    auditEntityFilter.addEventListener('change', applyAuditFilters)
}

const refreshAuditBtn = document.getElementById('refreshAuditBtn')
if (refreshAuditBtn) {
    refreshAuditBtn.addEventListener('click', () => {
        const icon = document.getElementById('refreshAuditIcon')
        if (icon) {
            icon.classList.add('spinning')
            setTimeout(() => {
                icon.classList.remove('spinning')
            }, 600)
        }
        applyAuditFilters()
    })
}

const clearAuditBtn = document.getElementById('clearAuditBtn')
if (clearAuditBtn) {
    clearAuditBtn.addEventListener('click', () => {
        const modal = document.getElementById('clearAuditModal')
        if (modal) modal.showModal()
    })
}

// Clear audit modal handlers
const clearAuditModal = document.getElementById('clearAuditModal')
if (clearAuditModal) {
    const cancelBtn = clearAuditModal.querySelector('button[value="cancel"]')
    if (cancelBtn) {
        cancelBtn.addEventListener('click', (e) => {
            e.preventDefault()
            clearAuditModal.close()
        })
    }
    
    clearAuditModal.addEventListener('click', (e) => {
        if (e.target === clearAuditModal) clearAuditModal.close()
    })
}

const confirmClearAuditBtn = document.getElementById('confirmClearAuditBtn')
if (confirmClearAuditBtn) {
    confirmClearAuditBtn.addEventListener('click', async (e) => {
        e.preventDefault()
        
        try {
            
            const db = store.readSync()
            db.auditLogs = []
            store.write(db, true) // Skip auto-sync since we'll handle it manually
            
            // Clear from database
            try {
                const response = await fetch(`${API_BASE_URL}/api/clear-audit-logs`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                })
                
                const result = await response.json()
                if (result.success) {
                    console.log('✅ Audit logs cleared from database')
                } else {
                    console.warn('⚠️ Failed to clear audit logs from database:', result.error)
                }
            } catch (dbError) {
                console.warn('⚠️ Could not clear audit logs from database:', dbError.message)
                // Continue anyway
            }
            
            // Reset pagination and re-render
            auditPagination.currentPage = 1
            await renderAuditLogs()
            
            // Show success message
            ToastManager.success('Audit Logs Cleared', 'All audit log entries have been deleted', 3000)
            
            clearAuditModal.close()
        } catch (error) {
            console.error('❌ Failed to clear audit logs:', error)
            ToastManager.error('Clear Failed', error.message, 3000)
        }
    })
}


// Search
const searchInput = document.getElementById('search')
if (searchInput) {
    searchInput.addEventListener('input', (e) => renderEnvs(e.target.value))
}


// Initial render - moved to after authentication
async function renderAllViews() {
    // Load data from database (database-first approach)
    try {
        console.log('🔄 Loading data from database...')
        const db = await store.read()
        
        console.log('✅ Data loaded successfully')
    } catch (error) {
        console.error('❌ Failed to load data:', error)
    }
    
    // Restore last active view or default to summary
    try {
        const lastView = null 
        if (lastView) {
            showView(lastView)
        } else {
            showView('summary')
        }
    } catch (e) {
        showView('summary')
    }
    
    // Render all views using cached data
    try {
        console.log('🔄 Starting app initialization...')
        renderEnvs()
        console.log('✅ Environments rendered')
        renderServers()
        console.log('✅ Servers rendered')
        renderJobs()
        console.log('✅ Jobs rendered')
        renderUsers()
        console.log('✅ Users rendered')
        await renderCredentials()
        console.log('✅ Credentials rendered')
        await renderAuditLogs()
        console.log('✅ Audit logs rendered')
        await renderBuilds()
        console.log('✅ Builds rendered')
        renderScripts()
        console.log('✅ Scripts rendered')
        renderIntegrations()
        console.log('✅ Integrations rendered')
        console.log('🎉 App initialization complete!')
    } catch (error) {
        console.error('❌ Error initializing app data:', error)
        // Still show the app even if some data fails to load
    }
}

// ============================================
// SCRIPTS MANAGEMENT
// ============================================

function renderScripts() {
    const db = store.readSync()
    let scripts = db.scripts || []
    if (!Array.isArray(scripts)) {
        scripts = []
    }
    const list = document.getElementById('scriptsList')
    if (!list) return

    list.innerHTML = ''

    if (scripts.length === 0) {
        list.innerHTML = '<div class="card" style="text-align:center; padding:40px;"><p class="muted">No scripts uploaded yet. Click "+ New Script" to upload your first PowerShell script.</p></div>'
        return
    }

    scripts.forEach(script => {
        const card = document.createElement('div')
        card.className = 'card'
        card.style.cursor = 'pointer'
        
        const fileSize = script.fileSize ? `${(script.fileSize / 1024).toFixed(2)} KB` : 'N/A'
        const uploadDate = script.uploadDate ? new Date(script.uploadDate).toLocaleDateString() : 'Unknown'
        
        card.innerHTML = `
            <div style="display:flex; align-items:flex-start; gap:16px;">
                <div style="width:48px; height:48px; border-radius:12px; background:linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="16 18 22 12 16 6"></polyline>
                        <polyline points="8 6 2 12 8 18"></polyline>
                    </svg>
                </div>
                <div style="flex:1; min-width:0;">
                    <h3 style="margin:0 0 8px 0; font-size:16px;">${script.name}</h3>
                    ${script.description ? `<p style="margin:0 0 12px 0; color:var(--muted); font-size:14px;">${script.description}</p>` : ''}
                    <div style="display:flex; gap:16px; flex-wrap:wrap; font-size:12px; color:var(--muted);">
                        <div style="display:flex; align-items:center; gap:4px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                                <polyline points="13 2 13 9 20 9"></polyline>
                            </svg>
                            ${script.fileName || 'script.ps1'}
                        </div>
                        <div style="display:flex; align-items:center; gap:4px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                            ${fileSize}
                        </div>
                        <div style="display:flex; align-items:center; gap:4px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            ${uploadDate}
                        </div>
                    </div>
                </div>
            </div>
            <div style="display:flex; gap:8px; margin-top:16px; padding-top:16px; border-top:1px solid var(--border);">
                <button class="btn btn-ghost" data-script-view="${script.id}" style="flex:1;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    View
                </button>
                <button class="btn btn-ghost" data-script-edit="${script.id}" style="flex:1;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                    Edit
                </button>
                <button class="btn btn-ghost" data-script-delete="${script.id}" style="color:#ef4444;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    Delete
                </button>
            </div>
        `

        // View button
        const viewBtn = card.querySelector(`[data-script-view="${script.id}"]`)
        if (viewBtn) viewBtn.addEventListener('click', (e) => {
            e.stopPropagation()
            viewScript(script)
        })

        // Edit button
        const editBtn = card.querySelector(`[data-script-edit="${script.id}"]`)
        if (editBtn) editBtn.addEventListener('click', (e) => {
            e.stopPropagation()
            editScript(script)
        })

        // Delete button
        const deleteBtn = card.querySelector(`[data-script-delete="${script.id}"]`)
        if (deleteBtn) deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation()
            deleteScript(script)
        })

        list.appendChild(card)
    })
}

function viewScript(script) {
    const modal = document.getElementById('viewScriptModal')
    const titleEl = document.getElementById('viewScriptTitle')
    const descEl = document.getElementById('viewScriptDescription')
    const contentEl = document.getElementById('viewScriptContent')
    const copyBtn = document.getElementById('copyScriptBtn')

    titleEl.textContent = script.name
    descEl.textContent = script.description || 'No description'
    contentEl.textContent = script.content || '// Script content not available'

    copyBtn.onclick = () => {
        navigator.clipboard.writeText(script.content || '').then(() => {
            const originalText = copyBtn.textContent
            copyBtn.textContent = 'Copied!'
            setTimeout(() => {
                copyBtn.textContent = originalText
            }, 2000)
        })
    }

    modal.showModal()
}

function editScript(script) {
    const modal = document.getElementById('editScriptModal')
    document.getElementById('editScriptId').value = script.id
    document.getElementById('editScriptName').value = script.name
    document.getElementById('editScriptDescription').value = script.description || ''
    document.getElementById('editScriptFile').value = ''
    document.getElementById('editScriptFilePreview').style.display = 'none'
    modal.showModal()
}

function deleteScript(script) {
    const modal = document.getElementById('deleteScriptModal')
    const nameEl = document.getElementById('deleteScriptName')
    nameEl.textContent = `Are you sure you want to delete "${script.name}"? This action cannot be undone.`
    
    modal.dataset.scriptId = script.id
    modal.showModal()
}

// Add Script Button
const addScriptBtn = document.getElementById('addScriptBtn')
if (addScriptBtn) {
    addScriptBtn.addEventListener('click', () => {
        const modal = document.getElementById('scriptModal')
        document.getElementById('scriptName').value = ''
        document.getElementById('scriptDescription').value = ''
        document.getElementById('scriptFile').value = ''
        document.getElementById('scriptFilePreview').style.display = 'none'
        modal.showModal()
    })
}

// File preview for new script
const scriptFileInput = document.getElementById('scriptFile')
if (scriptFileInput) {
    scriptFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0]
        if (file) {
            const reader = new FileReader()
            reader.onload = (event) => {
                const preview = document.getElementById('scriptFilePreview')
                const content = document.getElementById('scriptFileContent')
                content.textContent = event.target.result
                preview.style.display = 'block'
            }
            reader.readAsText(file)
        }
    })
}

// File preview for edit script
const editScriptFileInput = document.getElementById('editScriptFile')
if (editScriptFileInput) {
    editScriptFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0]
        if (file) {
            const reader = new FileReader()
            reader.onload = (event) => {
                const preview = document.getElementById('editScriptFilePreview')
                const content = document.getElementById('editScriptFileContent')
                content.textContent = event.target.result
                preview.style.display = 'block'
            }
            reader.readAsText(file)
        }
    })
}

// Save Script
const saveScriptBtn = document.getElementById('saveScriptBtn')
if (saveScriptBtn) {
    saveScriptBtn.addEventListener('click', (e) => {
        e.preventDefault()
        
        const name = document.getElementById('scriptName').value.trim()
        const description = document.getElementById('scriptDescription').value.trim()
        const fileInput = document.getElementById('scriptFile')
        const file = fileInput.files[0]

        if (!name || !file) {
            alert('Please provide a script name and select a file.')
            return
        }

        const reader = new FileReader()
        reader.onload = (event) => {
            const db = store.readSync()
            let scripts = db.scripts || []
            if (!Array.isArray(scripts)) {
                scripts = []
            }
            
            const newScript = {
                id: Date.now().toString(),
                name: name,
                description: description,
                fileName: file.name,
                fileSize: file.size,
                content: event.target.result,
                uploadDate: new Date().toISOString(),
                uploadedBy: (window.currentUser || currentUser || {}).username || 'Administrator'
            }

            scripts.push(newScript)
            db.scripts = scripts
            store.write(db)
            
            logAudit('create', 'script', name, `Uploaded PowerShell script: ${file.name}`)
            renderScripts()
            
            // Close modal
            document.getElementById('scriptModal').close()
        }
        reader.readAsText(file)
    })
}

// Save Edit Script
const saveEditScriptBtn = document.getElementById('saveEditScriptBtn')
if (saveEditScriptBtn) {
    saveEditScriptBtn.addEventListener('click', (e) => {
        e.preventDefault()
        
        const id = document.getElementById('editScriptId').value
        const name = document.getElementById('editScriptName').value.trim()
        const description = document.getElementById('editScriptDescription').value.trim()
        const fileInput = document.getElementById('editScriptFile')
        const file = fileInput.files[0]

        if (!name) {
            alert('Please provide a script name.')
            return
        }

        const db = store.readSync()
        const scripts = db.scripts || []
        const script = scripts.find(s => s.id === id)
        
        if (!script) return

        script.name = name
        script.description = description

        if (file) {
            const reader = new FileReader()
            reader.onload = (event) => {
                script.fileName = file.name
                script.fileSize = file.size
                script.content = event.target.result
                script.lastModified = new Date().toISOString()
                script.lastModifiedBy = (window.currentUser || currentUser || {}).username || 'Administrator'

                db.scripts = scripts
                store.write(db)
                logAudit('update', 'script', name, 'Updated script content')
                renderScripts()
                
                // Close modal
                document.getElementById('editScriptModal').close()
            }
            reader.readAsText(file)
        } else {
            script.lastModified = new Date().toISOString()
            script.lastModifiedBy = (window.currentUser || currentUser || {}).username || 'Administrator'
            db.scripts = scripts
            store.write(db)
            logAudit('update', 'script', name, 'Updated script details')
            renderScripts()
            
            // Close modal
            document.getElementById('editScriptModal').close()
        }
    })
}

// Delete Script Confirmation
const confirmDeleteScriptBtn = document.getElementById('confirmDeleteScriptBtn')
if (confirmDeleteScriptBtn) {
    confirmDeleteScriptBtn.addEventListener('click', () => {
        const modal = document.getElementById('deleteScriptModal')
        const scriptId = modal.dataset.scriptId
        
        if (scriptId) {
            const db = store.readSync()
            const scripts = db.scripts || []
            const script = scripts.find(s => s.id === scriptId)
            const scriptName = script ? script.name : 'Unknown'
            
            const filtered = scripts.filter(s => s.id !== scriptId)
            db.scripts = filtered
            store.write(db)
            
            logAudit('delete', 'script', scriptName, 'Deleted PowerShell script')
            renderScripts()
        }
    })
}

// ============================================
// END SCRIPTS MANAGEMENT
// ============================================

// ============================================
// DATABASE SETUP MANAGEMENT
// ============================================

// Navigate to Database Setup view
const dbSetupCard = document.querySelector('.admin-card[data-admin-section="dbsetup"]')
if (dbSetupCard) {
    dbSetupCard.addEventListener('click', () => {
        switchView('admin-dbsetup')
        populateDbSetupConnections()
    })
}

// Back to Admin button
const backToAdminFromDbSetupBtn = document.getElementById('backToAdminFromDbSetupBtn')
if (backToAdminFromDbSetupBtn) {
    backToAdminFromDbSetupBtn.addEventListener('click', () => {
        switchView('admin')
    })
}

// Populate database connections dropdown
function populateDbSetupConnections() {
    const select = document.getElementById('dbSetupConnectionSelect')
    if (!select) return
    
    const db = store.readSync()
    const databases = db.databases || []
    
    select.innerHTML = '<option value="">-- Select Database --</option>'
    
    databases.forEach(database => {
        const option = document.createElement('option')
        option.value = database.id
        option.textContent = `${database.name} (${database.type})`
        option.dataset.type = database.type
        option.dataset.connectionString = database.connectionString
        select.appendChild(option)
    })
}

// Handle database selection
const dbSetupConnectionSelect = document.getElementById('dbSetupConnectionSelect')
if (dbSetupConnectionSelect) {
    dbSetupConnectionSelect.addEventListener('change', (e) => {
        const selectedOption = e.target.selectedOptions[0]
        const infoDiv = document.getElementById('dbSetupConnectionInfo')
        const testBtn = document.getElementById('testDbConnectionBtn')
        const initBtn = document.getElementById('initializeDbSchemaBtn')
        const migrateBtn = document.getElementById('migrateDataBtn')
        
        if (selectedOption.value) {
            // Show connection info
            document.getElementById('dbSetupType').textContent = selectedOption.dataset.type
            document.getElementById('dbSetupConnString').textContent = selectedOption.dataset.connectionString
            infoDiv.style.display = 'block'
            
            // Enable buttons
            testBtn.disabled = false
            initBtn.disabled = false
            migrateBtn.disabled = false
        } else {
            infoDiv.style.display = 'none'
            testBtn.disabled = true
            initBtn.disabled = true
            migrateBtn.disabled = true
        }
    })
}

// Initialize Database Schema
const initializeDbSchemaBtn = document.getElementById('initializeDbSchemaBtn')
if (initializeDbSchemaBtn) {
    initializeDbSchemaBtn.addEventListener('click', () => {
        // Get selected database connection
        const selectElement = document.getElementById('dbSetupConnectionSelect')
        const selectedDbId = selectElement.value
        
        if (!selectedDbId) {
            alert('Please select a database connection first.')
            return
        }
        
        // Find the selected database from storage
        const db = store.readSync()
        const selectedDatabase = db.databases.find(database => database.id === selectedDbId)
        
        if (!selectedDatabase) {
            alert('Selected database connection not found.')
            return
        }
        
        // Call the buildDatabase function with the selected database
        buildDatabase(selectedDatabase)
    })
}

// Close progress modal
const closeDbInitProgressBtn = document.getElementById('closeDbInitProgressBtn')
if (closeDbInitProgressBtn) {
    closeDbInitProgressBtn.addEventListener('click', () => {
        document.getElementById('dbInitProgressModal').close()
    })
}

// [Migration function removed - database-only]
const migrateDataBtn = document.getElementById('migrateDataBtn')
if (migrateDataBtn) {
    migrateDataBtn.addEventListener('click', () => {
        const modal = document.getElementById('dbMigrateModal')
        const db = store.readSync()
        
        // Count records
        document.getElementById('migrateCountUsers').textContent = (db.users || []).length
        document.getElementById('migrateCountEnvs').textContent = (db.environments || []).length
        document.getElementById('migrateCountServers').textContent = (db.servers || []).length
        document.getElementById('migrateCountScripts').textContent = (db.scripts || []).length
        document.getElementById('migrateCountBuilds').textContent = (db.builds || []).length
        
        const total = (db.users || []).length + (db.environments || []).length + (db.servers || []).length + 
                      (db.scripts || []).length + (db.builds || []).length
        document.getElementById('migrateCountTotal').textContent = total
        
        modal.showModal()
    })
}

// Confirm Migration
const confirmMigrateBtn = document.getElementById('confirmMigrateBtn')
if (confirmMigrateBtn) {
    confirmMigrateBtn.addEventListener('click', async () => {
        const modal = document.getElementById('dbMigrateModal')
        const btn = confirmMigrateBtn
        
        // Disable button and show progress
        btn.disabled = true
        btn.innerHTML = `
            <div class="spinner-ring" style="width:16px; height:16px; border-width:2px; margin-right:8px;"></div>
            Migrating...
        `
        
        // Simulate migration (you'll need to implement actual API calls)
        setTimeout(() => {
            btn.disabled = false
            btn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Migration Complete!
            `
            btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
            
            setTimeout(() => {
                modal.close()
                
                // Show success message
                const statusDiv = document.getElementById('dbSetupStatus')
                statusDiv.style.display = 'block'
                statusDiv.style.background = 'rgba(16,185,129,0.1)'
                statusDiv.style.border = '1px solid rgba(16,185,129,0.3)'
                statusDiv.innerHTML = `
                    <div style="display:flex; align-items:center; gap:12px;">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                            <polyline points="22 4 12 14.01 9 11.01"></polyline>
                        </svg>
                        <div style="flex:1;">
                            <div style="font-weight:700; font-size:16px; color:#10b981; margin-bottom:4px;">Data Migration Complete!</div>
                            <div style="font-size:13px; color:var(--muted);">All data successfully transferred to SQL Server database</div>
                        </div>
                    </div>
                `
                
                // Reset button
                btn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <polyline points="19 12 12 19 5 12"></polyline>
                    </svg>
                    Start Migration
                `
                btn.style.background = 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)'
            }, 1500)
        }, 3000)
    })
}

// ============================================
// END DATABASE SETUP MANAGEMENT
// ============================================

// ============================================
// NOTIFICATIONS CONFIGURATION
// ============================================

// Navigate to Notifications view
const notificationsCard = document.querySelector('.admin-card[data-admin-section="notifications"]')
if (notificationsCard) {
    notificationsCard.addEventListener('click', () => {
        switchView('admin-notifications')
        loadNotificationSettings()
        populateNotificationChannels()
    })
}

// Populate integration channels for all notification dropdowns
function populateNotificationChannels() {
    const db = store.readSync()
    const integrations = db.integrations || []
    
    // Filter only communication integrations
    const channels = integrations.filter(int => 
        ['Exchange Server', 'SMTP Server', 'Slack', 'Microsoft Teams', 'Webhook'].includes(int.type)
    )
    
    const channelSelects = [
        'notifyBuildsChannel',
        'notifySystemChannel',
        'notifySummaryChannel',
        'notifyHealthChannel'
    ]
    
    channelSelects.forEach(selectId => {
        const select = document.getElementById(selectId)
        if (!select) return
        
        select.innerHTML = '<option value="">-- Select Integration --</option>'
        
        channels.forEach(channel => {
            const option = document.createElement('option')
            option.value = channel.id
            option.textContent = `${channel.name} (${channel.type})`
            select.appendChild(option)
        })
    })
}

// Load saved notification settings
function loadNotificationSettings() {
    const db = store.readSync()
    const settings = db.notificationSettings || {
        builds: {
            enabled: false,
            on: 'all',
            channel: '',
            recipients: ''
        },
        system: {
            enabled: false,
            level: 'all',
            channel: '',
            recipients: ''
        },
        summary: {
            enabled: false,
            time: '09:00',
            channel: '',
            recipients: ''
        },
        health: {
            enabled: false,
            status: 'all',
            channel: '',
            recipients: ''
        }
    }
    
    // Load build notifications
    document.getElementById('notifyBuildsEnabled').checked = settings.builds.enabled
    document.getElementById('notifyBuildsOn').value = settings.builds.on
    document.getElementById('notifyBuildsChannel').value = settings.builds.channel
    document.getElementById('notifyBuildsRecipients').value = settings.builds.recipients
    
    // Load system alerts
    document.getElementById('notifySystemEnabled').checked = settings.system.enabled
    document.getElementById('notifySystemLevel').value = settings.system.level
    document.getElementById('notifySystemChannel').value = settings.system.channel
    document.getElementById('notifySystemRecipients').value = settings.system.recipients
    
    // Load daily summary
    document.getElementById('notifySummaryEnabled').checked = settings.summary.enabled
    document.getElementById('notifySummaryTime').value = settings.summary.time
    document.getElementById('notifySummaryChannel').value = settings.summary.channel
    document.getElementById('notifySummaryRecipients').value = settings.summary.recipients
    
    // Load health monitoring
    document.getElementById('notifyHealthEnabled').checked = settings.health.enabled
    document.getElementById('notifyHealthStatus').value = settings.health.status
    document.getElementById('notifyHealthChannel').value = settings.health.channel
    document.getElementById('notifyHealthRecipients').value = settings.health.recipients
}

// Save notification settings
const saveNotificationsBtn = document.getElementById('saveNotificationsBtn')
if (saveNotificationsBtn) {
    saveNotificationsBtn.addEventListener('click', () => {
        const db = store.readSync()
        
        db.notificationSettings = {
            builds: {
                enabled: document.getElementById('notifyBuildsEnabled').checked,
                on: document.getElementById('notifyBuildsOn').value,
                channel: document.getElementById('notifyBuildsChannel').value,
                recipients: document.getElementById('notifyBuildsRecipients').value
            },
            system: {
                enabled: document.getElementById('notifySystemEnabled').checked,
                level: document.getElementById('notifySystemLevel').value,
                channel: document.getElementById('notifySystemChannel').value,
                recipients: document.getElementById('notifySystemRecipients').value
            },
            summary: {
                enabled: document.getElementById('notifySummaryEnabled').checked,
                time: document.getElementById('notifySummaryTime').value,
                channel: document.getElementById('notifySummaryChannel').value,
                recipients: document.getElementById('notifySummaryRecipients').value
            },
            health: {
                enabled: document.getElementById('notifyHealthEnabled').checked,
                status: document.getElementById('notifyHealthStatus').value,
                channel: document.getElementById('notifyHealthChannel').value,
                recipients: document.getElementById('notifyHealthRecipients').value
            }
        }
        
        store.write(db)
        
        // Show success message
        const btn = saveNotificationsBtn
        const originalText = btn.innerHTML
        btn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Saved Successfully!
        `
        btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
        
        setTimeout(() => {
            btn.innerHTML = originalText
            btn.style.background = 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
        }, 2000)
    })
}

// Send test notification
const testNotificationBtn = document.getElementById('testNotificationBtn')
if (testNotificationBtn) {
    testNotificationBtn.addEventListener('click', async () => {
        const db = store.readSync()
        
        // Get first enabled notification channel
        let testChannel = null
        let testRecipients = ''
        
        if (document.getElementById('notifyBuildsEnabled').checked) {
            testChannel = document.getElementById('notifyBuildsChannel').value
            testRecipients = document.getElementById('notifyBuildsRecipients').value
        } else if (document.getElementById('notifySystemEnabled').checked) {
            testChannel = document.getElementById('notifySystemChannel').value
            testRecipients = document.getElementById('notifySystemRecipients').value
        } else if (document.getElementById('notifySummaryEnabled').checked) {
            testChannel = document.getElementById('notifySummaryChannel').value
            testRecipients = document.getElementById('notifySummaryRecipients').value
        } else if (document.getElementById('notifyHealthEnabled').checked) {
            testChannel = document.getElementById('notifyHealthChannel').value
            testRecipients = document.getElementById('notifyHealthRecipients').value
        }
        
        if (!testChannel) {
            alert('Please enable at least one notification type and select a channel.')
            return
        }
        
        if (!testRecipients) {
            alert('Please specify recipients for the test notification.')
            return
        }
        
        // Find integration details
        const integration = db.integrations.find(int => int.id === testChannel)
        
        if (!integration) {
            alert('Selected integration channel not found.')
            return
        }
        
        const btn = testNotificationBtn
        const originalText = btn.innerHTML
        btn.innerHTML = `
            <div class="spinner-ring" style="width:16px; height:16px; border-width:2px; margin-right:8px;"></div>
            Sending...
        `
        btn.disabled = true
        
        try {
            // Call backend API to send test notification
            const response = await fetch(`${API_BASE_URL}/api/send-notification`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    integration: integration,
                    recipients: testRecipients,
                    subject: 'OrbisHub Test Notification',
                    message: 'This is a test notification from OrbisHub. If you receive this, your notification configuration is working correctly.'
                })
            })
            
            const result = await response.json()
            
            if (result.success) {
                btn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    Test Sent Successfully!
                `
                btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                btn.style.color = 'white'
                btn.style.border = 'none'
                
                setTimeout(() => {
                    btn.innerHTML = originalText
                    btn.style.background = ''
                    btn.style.color = ''
                    btn.style.border = ''
                    btn.disabled = false
                }, 3000)
            } else {
                throw new Error(result.error || 'Failed to send test notification')
            }
        } catch (error) {
            btn.innerHTML = originalText
            btn.disabled = false
            alert(`Failed to send test notification: ${error.message}`)
        }
    })
}

// ============================================
// END NOTIFICATIONS CONFIGURATION
// ============================================

// ============================================
// SUMMARY DASHBOARD
// ============================================

function updateSummaryDashboard() {
    const db = store.readSync()
    
    // Environments stats
    const environments = db.environments || []
    document.getElementById('summaryEnvCount').textContent = environments.length
    const healthyEnvs = environments.filter(e => e.health === 'healthy').length
    const issueEnvs = environments.length - healthyEnvs
    document.getElementById('summaryEnvHealthy').textContent = healthyEnvs
    document.getElementById('summaryEnvIssues').textContent = issueEnvs
    
    // Servers stats
    const servers = db.servers || []
    document.getElementById('summaryServerCount').textContent = servers.length
    const onlineServers = servers.filter(s => s.health === 'ok').length
    const offlineServers = servers.filter(s => s.health === 'error').length
    document.getElementById('summaryServerOnline').textContent = onlineServers
    document.getElementById('summaryServerOffline').textContent = offlineServers
    
    // Scripts stats
    const scripts = db.scripts || []
    document.getElementById('summaryScriptCount').textContent = scripts.length
    const psScripts = scripts.filter(s => s.language === 'powershell').length
    const bashScripts = scripts.filter(s => s.language === 'bash').length
    document.getElementById('summaryScriptPS').textContent = psScripts
    document.getElementById('summaryScriptBash').textContent = bashScripts
    
    // Builds stats
    const builds = db.builds || []
    document.getElementById('summaryBuildCount').textContent = builds.length
    const successBuilds = builds.filter(b => b.status === 'success').length
    const failedBuilds = builds.filter(b => b.status === 'failed').length
    document.getElementById('summaryBuildSuccess').textContent = successBuilds
    document.getElementById('summaryBuildFailed').textContent = failedBuilds
    
    // Recent activity
    updateRecentActivity(db)
}

function updateRecentActivity(db) {
    const activityContainer = document.getElementById('summaryRecentActivity')
    const activities = []
    
    // Get recent builds
    const builds = (db.builds || []).slice(-5).reverse()
    builds.forEach(build => {
        activities.push({
            type: 'build',
            icon: '🔨',
            text: `Build "${build.name}" ${build.status === 'success' ? 'completed successfully' : 'failed'}`,
            time: build.timestamp,
            status: build.status
        })
    })
    
    // Get recently added environments
    const environments = (db.environments || []).slice(-3).reverse()
    environments.forEach(env => {
        activities.push({
            type: 'environment',
            icon: '🌍',
            text: `Environment "${env.name}" created`,
            time: env.createdAt || Date.now(),
            status: 'info'
        })
    })
    
    // Get recently added servers
    const servers = (db.servers || []).slice(-3).reverse()
    servers.forEach(server => {
        activities.push({
            type: 'server',
            icon: '🖥️',
            text: `Server "${server.name}" added`,
            time: server.createdAt || Date.now(),
            status: 'info'
        })
    })
    
    // Sort by time and take latest 10
    activities.sort((a, b) => b.time - a.time)
    const recentActivities = activities.slice(0, 10)
    
    if (recentActivities.length === 0) {
        activityContainer.innerHTML = '<p class="muted">No recent activity</p>'
        return
    }
    
    activityContainer.innerHTML = recentActivities.map(activity => {
        const timeAgo = getTimeAgo(activity.time)
        const statusColor = activity.status === 'success' ? '#10b981' : 
                           activity.status === 'failed' ? '#ef4444' : 
                           'var(--muted)'
        
        return `
            <div style="display:flex; align-items:center; gap:12px; padding:12px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:8px; margin-bottom:8px;">
                <div style="font-size:24px;">${activity.icon}</div>
                <div style="flex:1;">
                    <div style="font-size:14px; font-weight:500;">${activity.text}</div>
                    <div style="font-size:12px; color:var(--muted); margin-top:2px;">${timeAgo}</div>
                </div>
                <div style="width:8px; height:8px; border-radius:50%; background:${statusColor};"></div>
            </div>
        `
    }).join('')
}

function getTimeAgo(timestamp) {
    const now = Date.now()
    const diff = now - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    
    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`
    return `${days} day${days > 1 ? 's' : ''} ago`
}

// ============================================
// END SUMMARY DASHBOARD
// ============================================

// Clear all jobs button and confirmation
const clearJobsBtn = document.getElementById('clearJobsBtn')
const confirmModal = document.getElementById('confirmModal')

function closeConfirmModal() {
    try { confirmModal.close() } catch (e) { /* ignore */ }
    try { confirmModal.removeAttribute('open') } catch (e) {}
    const focused = confirmModal.querySelector(':focus')
    if (focused && typeof focused.blur === 'function') focused.blur()
    try { clearJobsBtn.focus() } catch (e) {}
}

if (clearJobsBtn && confirmModal) {
    clearJobsBtn.addEventListener('click', () => {
        try { 
            confirmModal.showModal()
            confirmModal.querySelector('button[value="confirm"]')?.focus()
        } catch (e) { 
            confirmModal.setAttribute('open', '')
        }
    })

    // Handle confirmation result
    confirmModal.addEventListener('close', () => {
        if (confirmModal.returnValue === 'confirm') {
            const db = store.readSync()
            db.jobs = []
            store.write(db)
            renderJobs()
        }
    })

    // Close when clicking backdrop
    confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) closeConfirmModal()
    })

    // Close on cancel button
    const cancelBtn = confirmModal.querySelector('button[value="cancel"]')
    if (cancelBtn) {
        cancelBtn.addEventListener('click', (e) => {
            e.preventDefault()
            closeConfirmModal()
        })
    }
}

// --- Simple router and settings (theme) handling ---
async function showView(name, updateUrl = true) {
    const target = document.getElementById('view-' + name)
    const actual = target ? name : 'summary'
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('is-visible', v.id === 'view-' + actual))
    document.querySelectorAll('.nav__btn').forEach(b => b.classList.toggle('is-active', b.dataset.view === actual))
    
    // Update active state for top nav buttons (like Messages)
    document.querySelectorAll('.config-status-btn[data-view]').forEach(b => {
        if (b.dataset.view === actual) {
            b.style.background = 'rgba(59, 130, 246, 0.1)'
            b.style.borderColor = 'var(--primary)'
        } else {
            b.style.background = ''
            b.style.borderColor = ''
        }
    })
    
    // Update URL with current view
    if (updateUrl) {
        const url = new URL(window.location)
        url.searchParams.set('view', actual)
        window.history.pushState({ view: actual }, '', url)
    }
    
    // Auto-refresh data from database when switching views
    try {
        console.log(`🔄 Auto-refreshing data for view: ${actual}`)
        
        switch (actual) {
            case 'summary':
                updateSummaryDashboard()
                break
                
            case 'servers':
                // Load fresh server data from database
                const serversResponse = await fetch(`${API_BASE_URL}/api/load-data`)
                const serversResult = await serversResponse.json()
                if (serversResult.success && serversResult.data) {
                    const db = store.readSync()
                    db.servers = serversResult.data.servers || []
                    store.write(db, true) // Skip sync back to DB
                    renderServers()
                    console.log(`✅ Loaded ${db.servers.length} servers from database`)
                }
                break
                
            case 'admin-users':
                // Load fresh user data from database
                const usersResponse = await fetch(`${API_BASE_URL}/api/load-data`)
                const usersResult = await usersResponse.json()
                if (usersResult.success && usersResult.data) {
                    const db = store.readSync()
                    db.users = usersResult.data.users || []
                    store.write(db, true)
                    renderUsers()
                    console.log(`✅ Loaded ${db.users.length} users from database`)
                }
                break
                
            case 'credentials':
                // Load fresh credential data from database
                await renderCredentials() // This function already loads from DB
                console.log('✅ Credentials refreshed from database')
                break
                
            case 'audit-logs':
                // Load fresh audit logs from database
                await renderAuditLogs()
                console.log('✅ Audit logs refreshed from database')
                break
                
            case 'builds':
                // Load fresh builds from database
                await renderBuilds() // This function already loads from DB
                console.log('✅ Builds refreshed from database')
                break
                
            case 'environments':
                // Load fresh environment data from database
                const envsResponse = await fetch(`${API_BASE_URL}/api/load-data`)
                const envsResult = await envsResponse.json()
                if (envsResult.success && envsResult.data) {
                    const db = store.readSync()
                    db.environments = envsResult.data.environments || []
                    store.write(db, true)
                    renderEnvs()
                    console.log(`✅ Loaded ${db.environments.length} environments from database`)
                }
                break
                
            case 'messages':
                // Load messaging view with users and conversations
                await initializeMessagingView()
                console.log('✅ Messaging view initialized')
                break
        }
    } catch (error) {
        console.warn('⚠️ Auto-refresh failed:', error.message)
        // Continue anyway - use cached data
    }
    
    // [View persistence removed]
    try {  } catch (e) { /* ignore */ }
}

// Handle browser back/forward buttons
window.addEventListener('popstate', (event) => {
    if (event.state && event.state.view) {
        showView(event.state.view, false)
    } else {
        const urlParams = new URLSearchParams(window.location.search)
        const view = urlParams.get('view') || 'summary'
        showView(view, false)
    }
})

// Initialize from URL on page load
function initializeFromUrl() {
    const urlParams = new URLSearchParams(window.location.search)
    const view = urlParams.get('view')
    const action = urlParams.get('action')
    const id = urlParams.get('id')
    
    if (view) {
        showView(view, false)
    }
    
    // Handle actions (edit, delete, etc.)
    if (action && id) {
        handleUrlAction(view, action, id)
    }
}

// Handle URL actions (edit, delete, etc.)
function handleUrlAction(view, action, id) {
    console.log(`📍 URL Action: ${action} ${view} with id: ${id}`)
    
    // Map view to entity type
    const entityMap = {
        'servers': 'server',
        'credentials': 'credential',
        'admin-users': 'user',
        'builds': 'build'
    }
    
    const entityType = entityMap[view]
    if (!entityType) return
    
    // Wait a moment for the view to render
    setTimeout(() => {
        if (action === 'edit') {
            // Find and trigger edit based on entity type
            const db = store.readSync()
            let item = null
            
            if (entityType === 'server') item = db.servers?.find(s => s.id === id)
            else if (entityType === 'credential') item = db.credentials?.find(c => c.id === id)
            else if (entityType === 'user') item = db.users?.find(u => u.id === id)
            else if (entityType === 'build') item = db.builds?.find(b => b.id === id)
            
            if (item) {
                if (entityType === 'server') openEditServer(item)
                else if (entityType === 'credential') openEditCredential(item)
                else if (entityType === 'user') openEditUser(item)
                else if (entityType === 'build') openEditBuild(item)
            }
        }
    }, 100)
}

// Wire navigation buttons to views
document.querySelectorAll('.nav__btn').forEach(btn => {
	btn.addEventListener('click', () => {
		const view = btn.dataset.view
		showView(view)
	})
})

// Wire top nav buttons (Messages button) to views
document.querySelectorAll('.config-status-btn[data-view]').forEach(btn => {
	btn.addEventListener('click', () => {
		const view = btn.dataset.view
		if (view) {
			showView(view)
		}
	})
})

// Restore last active view on page load - moved to after app initialization
// This will be called from showApp() or initializeApp()

// Admin dashboard navigation
document.querySelectorAll('.admin-card').forEach(card => {
    card.addEventListener('click', () => {
        const section = card.dataset.adminSection
        if (section === 'users') {
            showView('admin-users')
        } else if (section === 'databases') {
            showView('admin-databases')
        } else if (section === 'credentials') {
            showView('admin-credentials')
        } else if (section === 'audit') {
            showView('admin-audit')
        } else if (section === 'documentation') {
            showView('admin-documentation')
        } else if (section === 'dbsetup') {
            showView('admin-dbsetup')
        } else if (section === 'notifications') {
            showView('admin-notifications')
        } else {
            // Placeholder for other sections
            alert(`${section.charAt(0).toUpperCase() + section.slice(1)} management coming soon`)
        }
    })
})

// Back to admin button
const backToAdminBtn = document.getElementById('backToAdminBtn')
if (backToAdminBtn) {
    backToAdminBtn.addEventListener('click', () => {
        showView('admin')
    })
}

// User menu dropdown
const userMenuBtn = document.getElementById('userMenuBtn')
const userMenuDropdown = document.getElementById('userMenuDropdown')
const viewProfileBtn = document.getElementById('viewProfileBtn')
const signOutBtn = document.getElementById('signOutBtn')

if (userMenuBtn && userMenuDropdown) {
    userMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        userMenuDropdown.classList.toggle('is-open')
    })

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!userMenuDropdown.contains(e.target) && e.target !== userMenuBtn) {
            userMenuDropdown.classList.remove('is-open')
        }
    })

    // View Profile action
    if (viewProfileBtn) {
        viewProfileBtn.addEventListener('click', () => {
            userMenuDropdown.classList.remove('is-open')
            alert('View Profile functionality coming soon')
            // TODO: Navigate to profile view or open profile modal
        })
    }

    // Sign Out action
    if (signOutBtn) {
        signOutBtn.addEventListener('click', () => {
            userMenuDropdown.classList.remove('is-open')
            signOut()
        })
    }
}

// Login system
const loginScreen = document.getElementById('loginScreen')
const appSidebar = document.getElementById('appSidebar')
const appMain = document.getElementById('appMain')
const loginForm = document.getElementById('loginForm')
const loginError = document.getElementById('loginError')
const loginDbStatus = document.getElementById('loginDbStatus')

function showLoginScreen() {
    if (loginScreen) {
        loginScreen.style.display = 'flex'
        loginScreen.classList.add('show')
    }
    if (appSidebar) appSidebar.style.display = 'none'
    if (appMain) appMain.style.display = 'none'
    
    // Check database status when login screen is shown
    updateLoginDbStatus()
}

async function updateLoginDbStatus() {
    if (!loginDbStatus) return
    
    // Show checking state
    loginDbStatus.className = 'login-db-status is-checking'
    loginDbStatus.innerHTML = `
        <div class="login-db-status-icon">
            <div class="spinner-ring" style="width:12px; height:12px; border-width:2px;"></div>
        </div>
        <span class="login-db-status-text">Checking database...</span>
    `
    
    try {
        const config = await window.electronAPI.getDbConfig()
        
        if (!config || !config.server || !config.database) {
            // No config
            loginDbStatus.className = 'login-db-status is-disconnected'
            loginDbStatus.innerHTML = `
                <div class="login-db-status-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="15" y1="9" x2="9" y2="15"></line>
                        <line x1="9" y1="9" x2="15" y2="15"></line>
                    </svg>
                </div>
                <span class="login-db-status-text">Database not configured</span>
            `
            return
        }
        
        const testResult = await window.electronAPI.testDbConnection(config)
        
        if (testResult && testResult.success) {
            // Connected
            loginDbStatus.className = 'login-db-status is-connected'
            loginDbStatus.innerHTML = `
                <div class="login-db-status-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                </div>
                <span class="login-db-status-text">Database connected: ${config.server}\\${config.database}</span>
            `
        } else {
            // Connection failed
            loginDbStatus.className = 'login-db-status is-disconnected'
            loginDbStatus.innerHTML = `
                <div class="login-db-status-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                </div>
                <span class="login-db-status-text">Database connection failed</span>
            `
        }
    } catch (error) {
        console.error('Error checking database status:', error)
        loginDbStatus.className = 'login-db-status is-disconnected'
        loginDbStatus.innerHTML = `
            <div class="login-db-status-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="15" y1="9" x2="9" y2="15"></line>
                    <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
            </div>
            <span class="login-db-status-text">Error checking database</span>
        `
    }
}

async function showApp() {
    if (loginScreen) {
        loginScreen.style.display = 'none'
        loginScreen.classList.remove('show')
    }
    if (appSidebar) appSidebar.style.display = 'block'
    if (appMain) appMain.style.display = 'block'
    // Update user menu with current user info
    updateUserMenu()
    // Initialize app content after showing
    await renderAllViews()
    // Initialize from URL parameters
    initializeFromUrl()
    // Initialize messaging system after DOM is ready
    // initMessaging() // Disabled - requires Socket.IO backend server
    
    // Check database connection status initially
    checkSystemConfiguration(false)
    
    // Set up periodic database connection check (every 10 seconds)
    setInterval(() => {
        checkSystemConfiguration(false)
    }, 10000)
}

function updateUserMenu() {
    const session = getSession()
    if (session) {
        const nameEl = document.getElementById('userProfileName')
        const emailEl = document.getElementById('userProfileEmail')
        const roleEl = document.getElementById('userProfileRole')
        const welcomeNameEl = document.getElementById('welcomeUserName')
        
        if (nameEl) nameEl.textContent = session.name || 'User'
        if (emailEl) emailEl.textContent = session.email || ''
        if (roleEl) roleEl.textContent = session.role || 'User'
        if (welcomeNameEl) welcomeNameEl.textContent = session.name || session.username || 'User'
    }
}

function showLoginError(message) {
    if (loginError) {
        loginError.textContent = message
        loginError.classList.add('is-visible')
        setTimeout(() => {
            loginError.classList.remove('is-visible')
        }, 5000)
    }
}

function signOut() {
    const signOutModal = document.getElementById('signOutModal')
    if (signOutModal) {
        try {
            signOutModal.showModal()
        } catch (e) {
            signOutModal.setAttribute('open', '')
        }
    }
}

function performSignOut() {
    clearSession()
    showLoginScreen()
    // Clear form
    if (loginForm) loginForm.reset()
    // Reset to default view
    showView('summary')
}

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault()
        
        const username = document.getElementById('loginUsername').value.trim()
        const password = document.getElementById('loginPassword').value.trim()
        
        if (!username || !password) {
            showLoginError('Please enter both username and password')
            return
        }
        
        // Show loading screen
        const loadingScreen = document.getElementById('loadingScreen')
        if (loadingScreen) {
            loadingScreen.classList.add('is-visible')
        }
        
        try {
            // Authenticate against SQL database (database-first approach)
            console.log('🔍 Authenticating against database...')
            console.log('📝 Username:', username)
            console.log('📝 Password length:', password.length)
            
            const userQuery = await window.electronAPI.dbQuery(
                'SELECT * FROM Users WHERE username = @param0 AND password = @param1',
                [{ value: username }, { value: password }]
            )
            
            console.log('📊 User query result:', userQuery)
            
            // Also check if user exists at all (for debugging)
            const checkUserExists = await window.electronAPI.dbQuery(
                'SELECT username, id FROM Users WHERE username = @param0',
                [{ value: username }]
            )
            console.log('🔍 User exists check:', checkUserExists)
            
            // Check all users in database (for debugging)
            const allUsers = await window.electronAPI.dbQuery(
                'SELECT username, id FROM Users',
                []
            )
            console.log('👥 All users in database:', allUsers)
            
            if (!userQuery || !userQuery.success || !userQuery.data || userQuery.data.length === 0) {
                if (loadingScreen) {
                    loadingScreen.classList.remove('is-visible')
                }
                
                // More helpful error message
                if (checkUserExists && checkUserExists.data && checkUserExists.data.length > 0) {
                    showLoginError('Invalid password for user: ' + username)
                } else {
                    showLoginError('User not found. Please contact your system administrator.')
                }
                return
            }
            
            const dbUser = userQuery.data[0]
            console.log('✅ Login successful using database')
            
            // Convert database user format to app format
            const user = {
                id: dbUser.id,
                username: dbUser.username,
                password: dbUser.password,
                name: dbUser.name || dbUser.username,
                email: dbUser.email || '',
                role: dbUser.role || 'viewer',
                position: dbUser.position || '',
                squad: dbUser.squad || '',
                lastLogin: dbUser.lastLogin,
                lastActivity: dbUser.lastActivity || Date.now(),
                ip: dbUser.ip || getLocalIP(),
                isActive: dbUser.isActive !== undefined ? dbUser.isActive : true,
                changePasswordOnLogin: dbUser.changePasswordOnLogin !== undefined ? dbUser.changePasswordOnLogin : false
            }
            
            // Update user's IP and last login info in database
            await window.electronAPI.dbExecute(
                `UPDATE Users SET ip = @param0, lastLogin = @param1, lastActivity = @param2 WHERE id = @param3`,
                [
                    { value: getLocalIP() },
                    { value: Date.now() },
                    { value: Date.now() },
                    { value: user.id }
                ]
            )
            
            // Check if password change required
            if (user.changePasswordOnLogin) {
                // Hide loading screen
                if (loadingScreen) {
                    loadingScreen.classList.remove('is-visible')
                }
                // Store user temporarily and show password change modal
                document.getElementById('changePasswordUserId').value = user.id
                const changePasswordModal = document.getElementById('changePasswordModal')
                if (changePasswordModal) {
                    try {
                        changePasswordModal.showModal()
                        document.getElementById('newPassword').focus()
                    } catch (e) {
                        changePasswordModal.setAttribute('open', '')
                    }
                }
                return
            }
            
            // Set session and show app
            setTimeout(() => {
                setSession(user)
                showApp()
                
                // Clear form
                loginForm.reset()
                
                // Hide loading screen
                if (loadingScreen) {
                    loadingScreen.classList.remove('is-visible')
                }
            }, 600)
            
        } catch (error) {
            console.error('Login error:', error)
            if (loadingScreen) {
                loadingScreen.classList.remove('is-visible')
            }
            showLoginError('Database connection error. Please check your configuration.')
        }
    })
}

// Change password modal handler
const changePasswordBtn = document.getElementById('changePasswordBtn')
if (changePasswordBtn) {
    changePasswordBtn.addEventListener('click', async (e) => {
        e.preventDefault()
        
        const userId = document.getElementById('changePasswordUserId').value
        const newPassword = document.getElementById('newPassword').value
        const confirmPassword = document.getElementById('confirmPassword').value
        const changePasswordModal = document.getElementById('changePasswordModal')
        const errorEl = document.getElementById('changePasswordError')
        
        // Helper to show error in modal
        const showError = (msg) => {
            if (errorEl) {
                errorEl.textContent = msg
                errorEl.classList.add('is-visible')
                errorEl.style.display = 'block'
            }
        }
        
        // Clear previous errors
        if (errorEl) {
            errorEl.textContent = ''
            errorEl.classList.remove('is-visible')
            errorEl.style.display = 'none'
        }
        
        // Validate
        if (!newPassword || !confirmPassword) {
            showError('Please fill in both password fields')
            return
        }
        
        if (newPassword !== confirmPassword) {
            showError('Passwords do not match')
            return
        }
        
        if (newPassword.length < 4) {
            showError('Password must be at least 4 characters')
            return
        }
        
        // Update user password in database
        try {
            const updateResult = await window.electronAPI.dbExecute(
                'UPDATE Users SET password = @param0, changePasswordOnLogin = 0 WHERE id = @param1',
                [
                    { name: 'param0', type: 'NVarChar', value: newPassword },
                    { name: 'param1', type: 'NVarChar', value: userId }
                ]
            )
            
            if (!updateResult || !updateResult.success) {
                showError('Failed to update password in database')
                return
            }
            
            // Fetch updated user from database
            const userResult = await window.electronAPI.dbQuery(
                'SELECT * FROM Users WHERE id = @param0',
                [{ name: 'param0', type: 'NVarChar', value: userId }]
            )
            
            if (!userResult || !userResult.success || !userResult.data || userResult.data.length === 0) {
                showError('Failed to retrieve updated user')
                return
            }
            
            const user = userResult.data[0]
            
            
            const db = store.readSync()
            const cachedUser = db.users.find(u => u.id === userId)
            if (cachedUser) {
                cachedUser.password = newPassword
                cachedUser.changePasswordOnLogin = false
                store.write(db)
            }
            
            // Close modal and log in
            if (changePasswordModal) {
                changePasswordModal.close()
            }
            
            // Clear form
            document.getElementById('newPassword').value = ''
            document.getElementById('confirmPassword').value = ''
            document.getElementById('changePasswordUserId').value = ''
            
            // Set session and show app
            setSession(user)
            showApp()
            
            // Clear login form
            const loginForm = document.getElementById('loginForm')
            if (loginForm) {
                loginForm.reset()
            }
        } catch (error) {
            console.error('Password change error:', error)
            showError('Failed to update password: ' + error.message)
        }
    })
}

// Sign out confirmation handler
const confirmSignOutBtn = document.getElementById('confirmSignOutBtn')
const signOutModal = document.getElementById('signOutModal')
if (confirmSignOutBtn && signOutModal) {
    confirmSignOutBtn.addEventListener('click', () => {
        performSignOut()
        signOutModal.close()
    })
}

// ============================================
// SYSTEM CONFIGURATION MODAL
// ============================================

const configStatusBtn = document.getElementById('configStatusBtn')
const systemConfigModal = document.getElementById('systemConfigModal')
const testConfigConnectionBtn = document.getElementById('testConfigConnectionBtn')

// Check database connection status
let lastDatabaseStatus = null

async function checkSystemConfiguration(showNotification = false) {
    let databaseStatus = false
    let pendingCount = 0

    // Check database status by actually testing the connection
    try {
        const config = await window.electronAPI.getDbConfig()
        
        if (config && config.server && config.database) {
            // Test actual connection
            const testResult = await window.electronAPI.testDbConnection(config)
            databaseStatus = testResult && testResult.success === true
            
            // Update database connection info display
            const dbInfoDiv = document.getElementById('currentDbConnectionInfo')
            const dbDetails = document.getElementById('currentDbDetails')
            if (dbInfoDiv && dbDetails && databaseStatus) {
                const authType = config.authType === 'sql' ? 'SQL Server Authentication' : 'Windows Authentication'
                dbDetails.textContent = `${config.database} on ${config.server} (${authType})`
                dbInfoDiv.style.display = 'block'
            } else if (dbInfoDiv) {
                dbInfoDiv.style.display = 'none'
            }
            
            // Show success notification if database just came online
            if (databaseStatus && lastDatabaseStatus === false && showNotification) {
                ToastManager.success('Database Connected', `Connected to ${config.database} on ${config.server}`, 5000)
            }
            
            // Show warning if connection failed
            if (!databaseStatus && lastDatabaseStatus === true && showNotification) {
                ToastManager.warning('Database Disconnected', 'Lost connection to database', 5000)
            }
        } else {
            databaseStatus = false
            const dbInfoDiv = document.getElementById('currentDbConnectionInfo')
            if (dbInfoDiv) dbInfoDiv.style.display = 'none'
        }
    } catch (error) {
        databaseStatus = false
        console.log('Database status check failed:', error.message)
        const dbInfoDiv = document.getElementById('currentDbConnectionInfo')
        if (dbInfoDiv) dbInfoDiv.style.display = 'none'
    }

    // Count pending configurations
    if (!databaseStatus) pendingCount++

    // Update UI
    updateConfigurationUI(databaseStatus, pendingCount)
    
    // Store last status
    lastDatabaseStatus = databaseStatus
    
    return { databaseStatus, pendingCount }
}

function updateConfigurationUI(databaseStatus, pendingCount) {
    const configBtn = document.getElementById('configStatusBtn')
    const configBadge = document.getElementById('configStatusBadge')
    const configText = document.getElementById('configStatusText')
    const databaseCard = document.getElementById('databaseConfigCard')
    const databaseStatusText = document.getElementById('databaseStatusText')
    const databaseSetupSection = document.getElementById('databaseSetupSection')

    // Update button
    if (configBtn) {
        if (pendingCount === 0) {
            configBtn.classList.add('configured')
            if (configText) configText.textContent = 'System Configured'
            if (configBadge) configBadge.style.display = 'none'
        } else {
            configBtn.classList.remove('configured')
            if (configText) configText.textContent = 'Configure Database'
            if (configBadge) {
                configBadge.textContent = pendingCount
                configBadge.style.display = 'inline-flex'
            }
        }
    }
    
    // Show/hide database setup section based on connection status
    if (databaseSetupSection) {
        if (databaseStatus) {
            databaseSetupSection.style.display = 'none'
        } else {
            databaseSetupSection.style.display = 'block'
        }
    }

    // Update database card
    if (databaseCard) {
        if (databaseStatus) {
            databaseCard.style.border = '2px solid rgba(34,197,94,0.3)'
            databaseCard.style.background = 'rgba(34,197,94,0.05)'
            const icon = databaseCard.querySelector('.config-status-icon')
            if (icon) {
                icon.classList.remove('config-status-icon--error')
                icon.classList.add('config-status-icon--success')
                icon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>'
            }
            if (databaseStatusText) {
                databaseStatusText.textContent = 'Connected'
                databaseStatusText.style.color = '#22c55e'
            }
        } else {
            databaseCard.style.border = '2px solid rgba(239,68,68,0.3)'
            databaseCard.style.background = 'rgba(239,68,68,0.05)'
            if (databaseStatusText) {
                databaseStatusText.textContent = 'Not Connected'
                databaseStatusText.style.color = 'var(--muted)'
            }
        }
    }
}

// Open configuration modal
if (configStatusBtn && systemConfigModal) {
    configStatusBtn.addEventListener('click', () => {
        if (systemConfigModal.showModal) {
            systemConfigModal.showModal()
        } else {
            systemConfigModal.setAttribute('open', '')
        }
        // Refresh status when modal opens
        checkSystemConfiguration()
    })
}

// Test connection button
if (testConfigConnectionBtn) {
    testConfigConnectionBtn.addEventListener('click', async () => {
        testConfigConnectionBtn.disabled = true
        testConfigConnectionBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px; animation: spin 1s linear infinite;"><circle cx="12" cy="12" r="10"></circle></svg>Testing...'
        
        const result = await checkSystemConfiguration(true)
        
        setTimeout(() => {
            testConfigConnectionBtn.disabled = false
            testConfigConnectionBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;"><polyline points="20 6 9 17 4 12"></polyline></svg>Test Connection Now'
            
            // Show result notification
            if (result.databaseStatus) {
                ToastManager.success('Database Connected', 'Database configuration is complete!', 5000)
            } else {
                ToastManager.error('Configuration Required', 'Please configure database connection.', 5000)
            }
        }, 1500)
    })
}

// Check configuration on app load
setTimeout(() => {
    checkSystemConfiguration(true)
}, 2000)

// Periodically check database status (every 10 seconds)
setInterval(() => {
    checkSystemConfiguration(false)
}, 10000)

// ============================================
// DATABASE CONNECTION CONFIGURATION
// ============================================

// Add current connection info display above the form
const dbFormContainer = document.querySelector('#dbConfigServer')?.closest('div[style*="display:grid"]')?.parentElement
if (dbFormContainer && !document.getElementById('currentDbConnectionInfo')) {
    const infoDiv = document.createElement('div')
    infoDiv.id = 'currentDbConnectionInfo'
    infoDiv.style.display = 'none'
    infoDiv.style.background = 'rgba(34,197,94,0.1)'
    infoDiv.style.border = '1px solid rgba(34,197,94,0.3)'
    infoDiv.style.borderRadius = '8px'
    infoDiv.style.padding = '12px'
    infoDiv.style.marginBottom = '16px'
    infoDiv.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:#22c55e;">
                <path d="M20 6L9 17l-5-5"></path>
            </svg>
            <div style="flex:1;">
                <div style="font-size:13px; font-weight:500; color:#22c55e; margin-bottom:4px;">Currently Connected</div>
                <div id="currentDbDetails" style="font-size:12px; color:var(--muted);"></div>
            </div>
        </div>
    `
    
    // Insert before the first child (which should be the heading)
    const heading = dbFormContainer.querySelector('h4')
    if (heading && heading.nextElementSibling) {
        dbFormContainer.insertBefore(infoDiv, heading.nextElementSibling)
    }
}

// Toggle SQL auth fields based on authentication type
const dbConfigAuthType = document.getElementById('dbConfigAuthType')
const sqlAuthFields = document.getElementById('sqlAuthFields')
if (dbConfigAuthType && sqlAuthFields) {
    dbConfigAuthType.addEventListener('change', (e) => {
        if (e.target.value === 'sql') {
            sqlAuthFields.style.display = 'block'
        } else {
            sqlAuthFields.style.display = 'none'
        }
    })
}

// Test database connection
const testDbConnectionBtn = document.getElementById('testDbConnectionBtn')
if (testDbConnectionBtn) {
    testDbConnectionBtn.addEventListener('click', async () => {
        const resultDiv = document.getElementById('dbConnectionResult')
        const server = document.getElementById('dbConfigServer').value.trim()
        const database = document.getElementById('dbConfigDatabase').value.trim()
        const authType = document.getElementById('dbConfigAuthType').value
        const user = document.getElementById('dbConfigUser').value.trim()
        const password = document.getElementById('dbConfigPassword').value
        const encrypt = document.getElementById('dbConfigEncrypt').checked
        const trustCert = document.getElementById('dbConfigTrustCert').checked
        
        if (!server || !database) {
            resultDiv.style.display = 'block'
            resultDiv.style.background = 'rgba(239,68,68,0.1)'
            resultDiv.style.border = '1px solid rgba(239,68,68,0.3)'
            resultDiv.style.color = '#ef4444'
            resultDiv.textContent = '❌ Server and Database fields are required'
            return
        }
        
        if (authType === 'sql' && (!user || !password)) {
            resultDiv.style.display = 'block'
            resultDiv.style.background = 'rgba(239,68,68,0.1)'
            resultDiv.style.border = '1px solid rgba(239,68,68,0.3)'
            resultDiv.style.color = '#ef4444'
            resultDiv.textContent = '❌ Username and Password are required for SQL Server Authentication'
            return
        }
        
        testDbConnectionBtn.disabled = true
        testDbConnectionBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px; animation: spin 1s linear infinite;"><circle cx="12" cy="12" r="10"></circle></svg>Testing...'
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/test-db-connection`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    server,
                    database,
                    authType,
                    user: authType === 'sql' ? user : null,
                    password: authType === 'sql' ? password : null,
                    encrypt,
                    trustCert
                })
            })
            
            const result = await response.json()
            
            resultDiv.style.display = 'block'
            if (result.success) {
                resultDiv.style.background = 'rgba(34,197,94,0.1)'
                resultDiv.style.border = '1px solid rgba(34,197,94,0.3)'
                resultDiv.style.color = '#22c55e'
                resultDiv.textContent = `✅ ${result.message}`
                
                ToastManager.success('Connection Successful', result.message, 3000)
            } else {
                resultDiv.style.background = 'rgba(239,68,68,0.1)'
                resultDiv.style.border = '1px solid rgba(239,68,68,0.3)'
                resultDiv.style.color = '#ef4444'
                resultDiv.textContent = `❌ ${result.error || 'Connection failed'}`
            }
        } catch (error) {
            resultDiv.style.display = 'block'
            resultDiv.style.background = 'rgba(239,68,68,0.1)'
            resultDiv.style.border = '1px solid rgba(239,68,68,0.3)'
            resultDiv.style.color = '#ef4444'
            resultDiv.textContent = `❌ Connection failed: ${error.message}`
        } finally {
            testDbConnectionBtn.disabled = false
            testDbConnectionBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;"><polyline points="20 6 9 17 4 12"></polyline></svg>Test Connection'
        }
    })
}

// Save database configuration
const saveDbConfigBtn = document.getElementById('saveDbConfigBtn')
if (saveDbConfigBtn) {
    saveDbConfigBtn.addEventListener('click', async () => {
        const resultDiv = document.getElementById('dbConnectionResult')
        const server = document.getElementById('dbConfigServer').value.trim()
        const database = document.getElementById('dbConfigDatabase').value.trim()
        const authType = document.getElementById('dbConfigAuthType').value
        const user = document.getElementById('dbConfigUser').value.trim()
        const password = document.getElementById('dbConfigPassword').value
        const encrypt = document.getElementById('dbConfigEncrypt').checked
        const trustCert = document.getElementById('dbConfigTrustCert').checked
        
        if (!server || !database) {
            resultDiv.style.display = 'block'
            resultDiv.style.background = 'rgba(239,68,68,0.1)'
            resultDiv.style.border = '1px solid rgba(239,68,68,0.3)'
            resultDiv.style.color = '#ef4444'
            resultDiv.textContent = '❌ Server and Database fields are required'
            return
        }
        
        if (authType === 'sql' && (!user || !password)) {
            resultDiv.style.display = 'block'
            resultDiv.style.background = 'rgba(239,68,68,0.1)'
            resultDiv.style.border = '1px solid rgba(239,68,68,0.3)'
            resultDiv.style.color = '#ef4444'
            resultDiv.textContent = '❌ Username and Password are required for SQL Server Authentication'
            return
        }
        
        try {
            const configToSave = {
                server,
                database,
                authType,
                user: authType === 'sql' ? user : '',
                password: authType === 'sql' ? password : '',
                encrypt,
                trustCert,
                connected: true
            }
            
            await window.electronAPI.saveDbConfig(configToSave)
            
            resultDiv.style.display = 'block'
            resultDiv.style.background = 'rgba(34,197,94,0.1)'
            resultDiv.style.border = '1px solid rgba(34,197,94,0.3)'
            resultDiv.style.color = '#22c55e'
            resultDiv.textContent = '✅ Configuration saved successfully'
            
            // Update configuration status
            checkSystemConfiguration(false)
            ToastManager.success('Configuration Saved', 'Database configuration saved successfully', 3000)
        } catch (error) {
            resultDiv.style.display = 'block'
            resultDiv.style.background = 'rgba(239,68,68,0.1)'
            resultDiv.style.border = '1px solid rgba(239,68,68,0.3)'
            resultDiv.style.color = '#ef4444'
            resultDiv.textContent = `❌ Failed to save: ${error.message}`
        }
    })
}

// Create database
const createDatabaseBtn = document.getElementById('createDatabaseBtn')
if (createDatabaseBtn) {
    createDatabaseBtn.addEventListener('click', async () => {
        const resultDiv = document.getElementById('dbConnectionResult')
        const server = document.getElementById('dbConfigServer').value.trim()
        const database = document.getElementById('dbConfigDatabase').value.trim()
        const authType = document.getElementById('dbConfigAuthType').value
        const user = document.getElementById('dbConfigUser').value.trim()
        const password = document.getElementById('dbConfigPassword').value
        const encrypt = document.getElementById('dbConfigEncrypt').checked
        const trustCert = document.getElementById('dbConfigTrustCert').checked
        
        if (!server || !database) {
            resultDiv.style.display = 'block'
            resultDiv.style.background = 'rgba(239,68,68,0.1)'
            resultDiv.style.border = '1px solid rgba(239,68,68,0.3)'
            resultDiv.style.color = '#ef4444'
            resultDiv.textContent = '❌ Server and Database fields are required'
            return
        }
        
        if (authType === 'sql' && (!user || !password)) {
            resultDiv.style.display = 'block'
            resultDiv.style.background = 'rgba(239,68,68,0.1)'
            resultDiv.style.border = '1px solid rgba(239,68,68,0.3)'
            resultDiv.style.color = '#ef4444'
            resultDiv.textContent = '❌ Username and Password are required for SQL Server Authentication'
            return
        }
        
        createDatabaseBtn.disabled = true
        createDatabaseBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px; animation: spin 1s linear infinite;"><circle cx="12" cy="12" r="10"></circle></svg>Creating...'
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/create-database`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    server,
                    database,
                    authType,
                    user: authType === 'sql' ? user : null,
                    password: authType === 'sql' ? password : null,
                    encrypt,
                    trustCert
                })
            })
            
            const result = await response.json()
            
            resultDiv.style.display = 'block'
            if (result.success) {
                resultDiv.style.background = 'rgba(34,197,94,0.1)'
                resultDiv.style.border = '1px solid rgba(34,197,94,0.3)'
                resultDiv.style.color = '#22c55e'
                resultDiv.textContent = `✅ ${result.message}`
                
                // Run migrations to create tables
                ToastManager.info('Creating Tables', 'Running database migrations...', 3000)
                
                const configToSave = {
                    server,
                    database,
                    authType,
                    user: authType === 'sql' ? user : '',
                    password: authType === 'sql' ? password : '',
                    encrypt,
                    trustCert,
                    connected: true
                }
                
                const migrationsResult = await window.electronAPI.runMigrations(configToSave)
                
                if (migrationsResult.success) {
                    // Save the configuration after successful setup
                    await window.electronAPI.saveDbConfig(configToSave)
                    
                    resultDiv.textContent = `✅ Database created and tables initialized successfully`
                    
                    // Update configuration status
                    checkSystemConfiguration(false)
                    ToastManager.success('Database Ready', 'Database and all tables created successfully', 5000)
                } else {
                    resultDiv.textContent = `✅ Database created but migrations failed: ${migrationsResult.error}`
                    ToastManager.warning('Partial Success', 'Database created but table creation failed', 5000)
                }
            } else {
                resultDiv.style.background = 'rgba(239,68,68,0.1)'
                resultDiv.style.border = '1px solid rgba(239,68,68,0.3)'
                resultDiv.style.color = '#ef4444'
                resultDiv.textContent = `❌ ${result.error || 'Database creation failed'}`
            }
        } catch (error) {
            resultDiv.style.display = 'block'
            resultDiv.style.background = 'rgba(239,68,68,0.1)'
            resultDiv.style.border = '1px solid rgba(239,68,68,0.3)'
            resultDiv.style.color = '#ef4444'
            resultDiv.textContent = `❌ Backend server is not running. Please start the backend first.`
        } finally {
            createDatabaseBtn.disabled = false
            createDatabaseBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M3 5v14c0 3 4.5 4 9 4s9-1 9-4V5"></path></svg>Create Database'
        }
    })
}

// ============================================
// END DATABASE CONNECTION CONFIGURATION
// ============================================

// ============================================
// END SYSTEM CONFIGURATION
// ============================================

// Reset database button functionality removed - no longer needed

// Initialize authentication state
function initAuth() {
    const session = getSession()
    if (session) {
        currentUser = session
        showApp()
    } else {
        showLoginScreen()
    }
}

// Call initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Log storage usage on startup
        const usage = getStorageUsage()
        console.log(`Storage usage: ${usage.sizeMB}MB / ${usage.limitMB}MB (${usage.percentUsed}%)`)
        if (usage.percentUsed > 80) {
            console.warn('Storage is over 80% full. Consider cleaning up old data.')
        }
        
        initAuth()
        initBuildModal()
        initRefreshButtons()
        initStatusMonitoring()
        initializeAuditPagination()
    })
} else {
    initAuth()
    initBuildModal()
    initRefreshButtons()
    initStatusMonitoring()
    initializeAuditPagination()
}

// Initialize build modal event listeners after DOM is ready
function initBuildModal() {
    const addBuildBtn = document.getElementById('addBuildBtn')
    const buildModal = document.getElementById('buildModal')
    
    if (addBuildBtn && buildModal) {
        addBuildBtn.addEventListener('click', () => {
            populateServerDropdowns()
            try {
                buildModal.showModal()
            } catch (e) {
                buildModal.setAttribute('open', '')
            }
        })
    }
}

// Initialize refresh buttons
function initRefreshButtons() {
    const refreshServersBtn = document.getElementById('refreshServersBtn')
    const refreshBuildsBtn = document.getElementById('refreshBuildsBtn')
    const refreshUsersBtn = document.getElementById('refreshUsersBtn')
    const refreshCredentialsBtn = document.getElementById('refreshCredentialsBtn')
    
    if (refreshServersBtn) {
        refreshServersBtn.addEventListener('click', async () => {
            refreshServersBtn.disabled = true
            refreshServersBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg> Refreshing...'
            await renderServers()
            refreshServersBtn.disabled = false
            refreshServersBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg> Refresh'
            showNotification('Servers refreshed from database', 'success')
        })
    }
    
    if (refreshBuildsBtn) {
        refreshBuildsBtn.addEventListener('click', async () => {
            refreshBuildsBtn.disabled = true
            refreshBuildsBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg> Refreshing...'
            await renderBuilds()
            refreshBuildsBtn.disabled = false
            refreshBuildsBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg> Refresh'
            showNotification('Builds refreshed from database', 'success')
        })
    }
    
    if (refreshUsersBtn) {
        refreshUsersBtn.addEventListener('click', async () => {
            refreshUsersBtn.disabled = true
            refreshUsersBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg> Refreshing...'
            
            try {
                // Load fresh data from database
                const response = await fetch(`${API_BASE_URL}/api/load-data`)
                const result = await response.json()
                
                if (result.success && result.data) {
                    const db = store.readSync()
                    db.users = result.data.users || []
                    await store.write(db)
                    
                    console.log(`✅ Loaded ${db.users.length} users from database`)
                    
                    // Re-render users
                    renderUsers()
                    
                    showNotification(`Users refreshed from database (${db.users.length} users)`, 'success')
                } else {
                    throw new Error('Failed to load users from database')
                }
            } catch (error) {
                console.error('❌ Failed to refresh users:', error)
                showNotification('Failed to refresh users from database', 'error')
            } finally {
                refreshUsersBtn.disabled = false
                refreshUsersBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg> Refresh'
            }
        })
    }
    
    if (refreshCredentialsBtn) {
        refreshCredentialsBtn.addEventListener('click', async () => {
            refreshCredentialsBtn.disabled = true
            refreshCredentialsBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg> Refreshing...'
            await renderCredentials()
            refreshCredentialsBtn.disabled = false
            refreshCredentialsBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg> Refresh'
            showNotification('Credentials refreshed from database', 'success')
        })
    }
}

// ========== STATUS MONITORING ==========
// Disabled
let serverStatusCheck = null
let dbStatusCheck = null

function initStatusMonitoring() {
    // Disabled
    console.log('Status monitoring disabled')
}

async function checkServerStatus() {
    const indicator = document.getElementById('serverStatusIndicator')
    if (!indicator) return
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/health`, {
            method: 'GET',
            timeout: 5000
        })
        
        if (response.ok) {
            // Server is online
            indicator.style.display = 'none'
            console.log('✅ Node.js Server: Online')
        } else {
            throw new Error('Server responded with error')
        }
    } catch (error) {
        // Server is offline
        indicator.style.display = 'flex'
        indicator.title = 'Node.js Server Offline - Click for details'
        console.log('❌ Node.js Server: Offline')
    }
}

async function checkDatabaseStatus() {
    const indicator = document.getElementById('dbStatusIndicator')
    if (!indicator) return
    
    try {
        // Check if we have any database connections configured
        const db = store.readSync()
        const hasDbConnections = db.databases && db.databases.length > 0
        
        if (!hasDbConnections) {
            // No database connections configured
            indicator.style.display = 'flex'
            indicator.title = 'No Database Connections Configured - Click for details'
            indicator.classList.remove('status-indicator--error')
            indicator.classList.add('status-indicator--warning')
            console.log('⚠️ Database: Not configured')
            return
        }
        
        // Test the first database connection
        const firstDb = db.databases[0]
        const response = await fetch(`${API_BASE_URL}/api/test-connection`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                connectionString: firstDb.connectionString
            }),
            timeout: 5000
        })
        
        const result = await response.json()
        
        if (result.success) {
            // Database is connected
            indicator.style.display = 'none'
            console.log('✅ Database: Connected')
        } else {
            throw new Error(result.error || 'Database connection failed')
        }
    } catch (error) {
        // Database is not connected
        indicator.style.display = 'flex'
        indicator.title = 'Database Connection Failed - Click for details'
        indicator.classList.remove('status-indicator--warning')
        indicator.classList.add('status-indicator--error')
        console.log('❌ Database: Connection failed')
    }
}

function showServerStatusDetails() {
    hideAllStatusPopups()
    
    const popup = document.createElement('div')
    popup.className = 'status-popup'
    popup.id = 'serverStatusPopup'
    popup.innerHTML = `
        <button class="status-popup__close" onclick="hideStatusPopup('serverStatusPopup')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
        <div class="status-popup__header">
            <div class="status-popup__icon status-popup__icon--error">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
            </div>
            <div>
                <h3 class="status-popup__title">Node.js Server Offline</h3>
                <p class="status-popup__subtitle">Backend API is not responding</p>
            </div>
        </div>
        <div class="status-popup__content">
            <p class="status-popup__description">The backend API server is not responding. Many features will be unavailable until the server is started.</p>
            <div class="status-popup__code">Expected: ${API_BASE_URL}/api/health</div>
            <p style="font-size:13px; font-weight:600; margin:12px 0 8px 0; color:var(--text);">Troubleshooting Steps:</p>
            <ol class="status-popup__steps">
                <li>Navigate to project directory</li>
                <li>Run <code>npm start</code> in terminal</li>
                <li>Check if port 3000 is available</li>
                <li>Verify Node.js is installed</li>
                <li>Check server logs for errors</li>
            </ol>
        </div>
        <div class="status-popup__actions">
            <button class="btn" onclick="showServerStartInstructions()" style="background:linear-gradient(135deg, #10b981 0%, #059669 100%); color:white; border:none;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M12 6v6l4 2"></path>
                </svg>
                Start Server Guide
            </button>
            <button class="btn btn-ghost" onclick="checkServerStatus()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <polyline points="1 20 1 14 7 14"></polyline>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                </svg>
                Check Again
            </button>
        </div>
    `
    
    document.body.appendChild(popup)
    setTimeout(() => popup.classList.add('show'), 10)
    
    // Auto-hide after 15 seconds
    setTimeout(() => hideStatusPopup('serverStatusPopup'), 15000)
}

function showDatabaseStatusDetails() {
    hideAllStatusPopups()
    
    const db = store.readSync()
    const hasDbConnections = db.databases && db.databases.length > 0
    
    const popup = document.createElement('div')
    popup.className = 'status-popup'
    popup.id = 'dbStatusPopup'
    
    if (!hasDbConnections) {
        popup.innerHTML = `
            <button class="status-popup__close" onclick="hideStatusPopup('dbStatusPopup')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
            <div class="status-popup__header">
                <div class="status-popup__icon status-popup__icon--warning">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                        <path d="M3 5v14c0 3 4.5 4 9 4s9-1 9-4V5"></path>
                        <line x1="3" y1="12" x2="21" y2="12"></line>
                    </svg>
                </div>
                <div>
                    <h3 class="status-popup__title">No Database Configured</h3>
                    <p class="status-popup__subtitle">Database connections need to be set up</p>
                </div>
            </div>
            <div class="status-popup__content">
                <p class="status-popup__description">No database connections have been configured. You'll need to set up a database connection to use data persistence features.</p>
                <p style="font-size:13px; font-weight:600; margin:12px 0 8px 0; color:var(--text);">Next Steps:</p>
                <ol class="status-popup__steps">
                    <li>Go to Admin Panel → Database Management</li>
                    <li>Click "+ Add Database"</li>
                    <li>Configure your SQL Server connection</li>
                    <li>Test the connection</li>
                    <li>Initialize database schema</li>
                </ol>
            </div>
            <div class="status-popup__actions">
                <button class="btn" onclick="navigateToAdminDatabases()" style="background:linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color:white; border:none;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                        <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                        <line x1="12" y1="22.08" x2="12" y2="12"></line>
                    </svg>
                    Setup Database
                </button>
                <button class="btn btn-ghost" onclick="checkDatabaseStatus()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;">
                        <polyline points="23 4 23 10 17 10"></polyline>
                        <polyline points="1 20 1 14 7 14"></polyline>
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                    </svg>
                    Check Again
                </button>
            </div>
        `
    } else {
        popup.innerHTML = `
            <button class="status-popup__close" onclick="hideStatusPopup('dbStatusPopup')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
            <div class="status-popup__header">
                <div class="status-popup__icon status-popup__icon--error">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                        <path d="M3 5v14c0 3 4.5 4 9 4s9-1 9-4V5"></path>
                        <line x1="3" y1="12" x2="21" y2="12"></line>
                        <line x1="15" y1="9" x2="9" y2="15"></line>
                        <line x1="9" y1="9" x2="15" y2="15"></line>
                    </svg>
                </div>
                <div>
                    <h3 class="status-popup__title">Database Connection Failed</h3>
                    <p class="status-popup__subtitle">Cannot connect to configured database</p>
                </div>
            </div>
            <div class="status-popup__content">
                <p class="status-popup__description">Cannot connect to the configured database. Data persistence features will not work until the connection is restored.</p>
                <div class="status-popup__code">Database: ${db.databases[0].name}<br>Type: ${db.databases[0].type}</div>
                <p style="font-size:13px; font-weight:600; margin:12px 0 8px 0; color:var(--text);">Troubleshooting Steps:</p>
                <ol class="status-popup__steps">
                    <li>Verify SQL Server is running</li>
                    <li>Check connection string credentials</li>
                    <li>Test connection in Admin Panel</li>
                    <li>Verify network connectivity</li>
                    <li>Check firewall settings</li>
                </ol>
            </div>
            <div class="status-popup__actions">
                <button class="btn" onclick="navigateToAdminDatabases()" style="background:linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color:white; border:none;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;">
                        <wrench x1="14.7" y1="6.3" x2="19" y2="2" />
                        <path d="M20.1 15.9 20 20l-4.1-.9M20.1 15.9A4.5 4.5 0 0 0 22 12c0-1-.2-2-.6-2.8l-.9.9a3.5 3.5 0 0 1 0 3.8z" />
                    </svg>
                    Fix Connection
                </button>
                <button class="btn btn-ghost" onclick="checkDatabaseStatus()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;">
                        <polyline points="23 4 23 10 17 10"></polyline>
                        <polyline points="1 20 1 14 7 14"></polyline>
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                    </svg>
                    Check Again
                </button>
            </div>
        `
    }
    
    document.body.appendChild(popup)
    setTimeout(() => popup.classList.add('show'), 10)
    
    // Auto-hide after 15 seconds
    setTimeout(() => hideStatusPopup('dbStatusPopup'), 15000)
}

// Helper functions for status popups
function hideStatusPopup(popupId) {
    const popup = document.getElementById(popupId)
    if (popup) {
        popup.classList.remove('show')
        setTimeout(() => popup.remove(), 300)
    }
}

function hideAllStatusPopups() {
    const popups = document.querySelectorAll('.status-popup')
    popups.forEach(popup => {
        popup.classList.remove('show')
        setTimeout(() => popup.remove(), 300)
    })
}

// Server management functions
function showServerStartInstructions() {
    hideAllStatusPopups()
    
    const popup = document.createElement('div')
    popup.className = 'status-popup'
    popup.id = 'serverInstructionsPopup'
    
    popup.innerHTML = `
        <button class="status-popup__close" onclick="hideStatusPopup('serverInstructionsPopup')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
        <div class="status-popup__header">
            <div class="status-popup__icon status-popup__icon--info">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                    <line x1="9" y1="9" x2="9.01" y2="9"></line>
                    <line x1="15" y1="9" x2="15.01" y2="9"></line>
                </svg>
            </div>
            <div>
                <h3 class="status-popup__title">How to Start Node.js Server</h3>
                <p class="status-popup__subtitle">Manual terminal setup required</p>
            </div>
        </div>
        <div class="status-popup__content">
            <p class="status-popup__description">Due to browser security restrictions, the server must be started manually in a terminal.</p>
            
            <div style="background: var(--surface-elevated); border-radius: 8px; padding: 16px; margin: 16px 0; border-left: 4px solid #3b82f6;">
                <p style="font-weight: 600; margin: 0 0 8px 0; color: var(--text);">💡 Quick Start Commands:</p>
                <div class="status-popup__code" style="background: var(--background); padding: 12px; border-radius: 6px; font-family: 'Courier New', monospace; margin: 8px 0;">
                    <div style="color: #10b981; margin-bottom: 4px;"># Navigate to project folder</div>
                    <div style="color: var(--text-muted);">cd d:\\xampp\\htdocs</div>
                    <div style="color: #10b981; margin: 8px 0 4px 0;"># Start the server</div>
                    <div style="color: var(--text-muted);">npm start</div>
                </div>
            </div>
            
            <p style="font-size:13px; font-weight:600; margin:16px 0 8px 0; color:var(--text);">Step-by-Step Instructions:</p>
            <ol class="status-popup__steps">
                <li>Open <strong>PowerShell</strong> or <strong>Command Prompt</strong></li>
                <li>Navigate to: <code>d:\\xampp\\htdocs</code></li>
                <li>Run: <code>npm start</code></li>
                <li>Server will start on <code>${API_BASE_URL}</code></li>
                <li>Click "Check Again" below to verify connection</li>
            </ol>
            
            <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 12px; margin: 12px 0;">
                <div style="display: flex; align-items: center; color: #92400e;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                        <line x1="12" y1="9" x2="12" y2="13"></line>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                    <strong>Note:</strong> Keep the terminal window open while using the app
                </div>
            </div>
        </div>
        <div class="status-popup__actions">
            <button class="btn" onclick="copyStartCommands()" style="background:linear-gradient(135deg, #10b981 0%, #059669 100%); color:white; border:none;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                Copy Commands
            </button>
            <button class="btn btn-ghost" onclick="checkServerStatus(); hideStatusPopup('serverInstructionsPopup')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <polyline points="1 20 1 14 7 14"></polyline>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                </svg>
                Check Again
            </button>
        </div>
    `
    
    document.body.appendChild(popup)
    setTimeout(() => popup.classList.add('show'), 10)
    
    // Auto-hide after 30 seconds (longer for instructions)
    setTimeout(() => hideStatusPopup('serverInstructionsPopup'), 30000)
}

function copyStartCommands() {
    const commands = `cd d:\\xampp\\htdocs
npm start`
    
    if (navigator.clipboard) {
        navigator.clipboard.writeText(commands).then(() => {
            showNotification('Commands copied to clipboard!', 'success')
        }).catch(() => {
            showNotification('Could not copy to clipboard. Please copy manually.', 'warning')
        })
    } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea')
        textArea.value = commands
        document.body.appendChild(textArea)
        textArea.select()
        try {
            document.execCommand('copy')
            showNotification('Commands copied to clipboard!', 'success')
        } catch (err) {
            showNotification('Could not copy to clipboard. Please copy manually.', 'warning')
        }
        document.body.removeChild(textArea)
    }
}

function navigateToAdminDatabases() {
    hideAllStatusPopups()
    
    // Navigate to admin databases view
    const adminBtn = document.querySelector('[data-admin-section="databases"]')
    if (adminBtn) {
        adminBtn.click()
    } else {
        // Fallback: navigate to admin panel first, then databases
        const adminNavBtn = document.querySelector('[data-view="admin"]')
        if (adminNavBtn) {
            adminNavBtn.click()
            setTimeout(() => {
                const dbAdminBtn = document.querySelector('[data-admin-section="databases"]')
                if (dbAdminBtn) dbAdminBtn.click()
            }, 100)
        }
    }
}

// Notification system for status updates
function showNotification(message, type = 'info') {
    const notification = document.createElement('div')
    notification.className = `notification notification--${type}`
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 16px;
        border-radius: 8px;
        color: white;
        font-size: 14px;
        font-weight: 500;
        z-index: 1001;
        opacity: 0;
        transform: translateY(-10px);
        transition: all 0.3s ease;
        max-width: 350px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.2);
    `
    
    // Set background based on type
    switch (type) {
        case 'success':
            notification.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
            break
        case 'error':
            notification.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
            break
        case 'warning':
            notification.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
            break
        default:
            notification.style.background = 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)'
    }
    
    notification.textContent = message
    document.body.appendChild(notification)
    
    // Animate in
    setTimeout(() => {
        notification.style.opacity = '1'
        notification.style.transform = 'translateY(0)'
    }, 10)
    
    // Auto remove after 4 seconds
    setTimeout(() => {
        notification.style.opacity = '0'
        notification.style.transform = 'translateY(-10px)'
        setTimeout(() => notification.remove(), 300)
    }, 4000)
}

// ============================================
// AI CHAT ASSISTANT
// ============================================

// Initialize AI chat when document is ready
function initAIChat() {
    const aiChatWidget = document.getElementById('aiChatWidget')
    const aiChatToggle = document.getElementById('aiChatToggle')
    const closeChatBtn = document.getElementById('closeChatBtn')
    const aiChatInput = document.getElementById('aiChatInput')
    const aiChatSend = document.getElementById('aiChatSend')
    const aiChatMessages = document.getElementById('aiChatMessages')
    
    console.log('🤖 Initializing AI Chat...', {
        aiChatWidget: !!aiChatWidget,
        aiChatToggle: !!aiChatToggle,
        closeChatBtn: !!closeChatBtn,
        aiChatInput: !!aiChatInput,
        aiChatSend: !!aiChatSend,
        aiChatMessages: !!aiChatMessages
    })

    let chatHistory = []

    // Toggle chat widget
    if (aiChatToggle) {
        aiChatToggle.addEventListener('click', () => {
            console.log('🤖 Chat toggle clicked')
            aiChatWidget.classList.toggle('is-open')
            if (aiChatWidget.classList.contains('is-open')) {
                aiChatInput.focus()
            }
        })
    } else {
        console.error('❌ aiChatToggle button not found')
    }

    if (closeChatBtn) {
        closeChatBtn.addEventListener('click', () => {
            console.log('🤖 Chat close clicked')
            aiChatWidget.classList.remove('is-open')
        })
    }

    // Send message
    function sendMessage() {
        const message = aiChatInput.value.trim()
        if (!message) return
        
        console.log('🤖 Sending message:', message)
        
        // Add user message to chat
        addUserMessage(message)
        chatHistory.push({ role: 'user', content: message })
        
        // Clear input
        aiChatInput.value = ''
        
        // Show typing indicator
        showTypingIndicator()
        
        // Get AI response
        getAIResponse(message)
    }

    if (aiChatSend) {
        aiChatSend.addEventListener('click', sendMessage)
    }

    if (aiChatInput) {
        aiChatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage()
            }
        })
    }

    function addUserMessage(message) {
        const messageEl = document.createElement('div')
        messageEl.className = 'user-message'
        messageEl.innerHTML = `
            <div class="user-message-avatar">${currentUser?.name?.charAt(0).toUpperCase() || 'U'}</div>
            <div class="user-message-content">${escapeHtml(message)}</div>
        `
        aiChatMessages.appendChild(messageEl)
        scrollChatToBottom()
    }

    function addAIMessage(message) {
        // Remove typing indicator if exists
        const typingIndicator = aiChatMessages.querySelector('.ai-typing-container')
        if (typingIndicator) {
            typingIndicator.remove()
        }
        
        const messageEl = document.createElement('div')
        messageEl.className = 'ai-message'
        messageEl.innerHTML = `
            <div class="ai-message-avatar">
                <img src="media/qeri.png" alt="Քեռի AI" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">
            </div>
            <div class="ai-message-content">${formatAIMessage(message)}</div>
        `
        aiChatMessages.appendChild(messageEl)
        scrollChatToBottom()
    }

    function showTypingIndicator() {
        const typingEl = document.createElement('div')
        typingEl.className = 'ai-message ai-typing-container'
        typingEl.innerHTML = `
            <div class="ai-message-avatar">
                <img src="media/qeri.png" alt="Քեռի AI" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">
            </div>
            <div class="ai-message-content">
                <div class="ai-typing">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        `
        aiChatMessages.appendChild(typingEl)
        scrollChatToBottom()
    }

    function scrollChatToBottom() {
        aiChatMessages.scrollTop = aiChatMessages.scrollHeight
    }

    function formatAIMessage(message) {
        // Basic markdown-like formatting
        let formatted = escapeHtml(message)
        
        // Convert **bold** to <strong>
        formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        
        // Convert *italic* to <em>
        formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>')
        
        // Convert `code` to <code>
        formatted = formatted.replace(/`(.+?)`/g, '<code style="background: var(--bg); padding: 2px 6px; border-radius: 4px; font-family: monospace;">$1</code>')
        
        // Convert line breaks to <br>
        formatted = formatted.replace(/\n/g, '<br>')
        
        return formatted
    }

    function escapeHtml(text) {
        const div = document.createElement('div')
        div.textContent = text
        return div.innerHTML
    }

    // Simple AI using Hugging Face Inference API (free, no API key needed for basic models)
    async function getAIResponse(userMessage) {
        try {
            // First, check if this is a command (create, delete, update)
            const commandResult = handleCommand(userMessage)
            if (commandResult) {
                addAIMessage(commandResult)
                chatHistory.push({ role: 'assistant', content: commandResult })
                return
            }
            
            // Use a simple conversational model
            const response = await fetch('https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    inputs: userMessage,
                    parameters: {
                        max_length: 200,
                        temperature: 0.7
                    }
                })
            })
            
            if (!response.ok) {
                throw new Error('AI service temporarily unavailable')
            }
            
            const data = await response.json()
            let aiResponse = data[0]?.generated_text || "I'm having trouble understanding. Could you rephrase that?"
            
            // Remove the user's input from the response if it's included
            if (aiResponse.startsWith(userMessage)) {
                aiResponse = aiResponse.substring(userMessage.length).trim()
            }
            
            chatHistory.push({ role: 'assistant', content: aiResponse })
            addAIMessage(aiResponse)
            
        } catch (error) {
            console.error('AI Error:', error)
            
            // Fallback to simple rule-based responses
            const fallbackResponse = getFallbackResponse(userMessage)
            chatHistory.push({ role: 'assistant', content: fallbackResponse })
            addAIMessage(fallbackResponse)
        }
    }
    
    // Handle commands like "create environment", "add server", etc.
    function handleCommand(message) {
        const lowerMessage = message.toLowerCase()
        
        // ========== CREATE COMMANDS ==========
        
        // CREATE ENVIRONMENT
        if ((lowerMessage.includes('create') || lowerMessage.includes('add')) && (lowerMessage.includes('environment') || lowerMessage.includes('env'))) {
            const nameMatch = message.match(/(?:named?|called)\s+["']?([^"'\n]+?)["']?(?:\s+at|\s+url|\s+with|$)/i)
            const urlMatch = message.match(/(?:url|at|on)\s+["']?(https?:\/\/[^\s"']+)["']?/i)
            const typeMatch = message.match(/(?:type|environment)\s+(production|staging|development|testing)/i)
            
            if (!nameMatch || !urlMatch) {
                return "To create an environment, I need a name and URL. For example:\n`Create environment named Prod at https://example.com`"
            }
            
            const name = nameMatch[1].trim()
            const url = urlMatch[1].trim()
            const type = typeMatch ? typeMatch[1].charAt(0).toUpperCase() + typeMatch[1].slice(1) : 'Production'
            
            try {
                const db = store.readSync()
                const newEnv = {
                    id: uid(),
                    name,
                    url,
                    type,
                    health: 'ok',
                    deployerCredentialId: null,
                    mappedServers: []
                }
                if (!db.environments) db.environments = []
                db.environments.push(newEnv)
                store.write(db)
                logAudit('create', 'environment', name, { url, type })
                renderEnvs()
                
                return `✅ Environment **${name}** created successfully!\n\n• URL: ${url}\n• Type: ${type}\n\nYou can find it in the Environments section.`
            } catch (error) {
                return `❌ Failed to create environment: ${error.message}`
            }
        }
        
        // CREATE SERVER
        if ((lowerMessage.includes('create') || lowerMessage.includes('add')) && lowerMessage.includes('server')) {
            const nameMatch = message.match(/(?:named?|called)\s+["']?([^"'\n]+?)["']?(?:\s+with|\s+ip|$)/i)
            const ipMatch = message.match(/(?:ip|address)\s+["']?([\d\.]+)["']?/i)
            const hostnameMatch = message.match(/(?:hostname)\s+["']?([^\s"'\n]+)["']?/i)
            const typeMatch = message.match(/(?:type)\s+(front end|back end|win server|web server)/i)
            const groupMatch = message.match(/(?:group|in)\s+(production|staging|development|testing)/i)
            
            if (!nameMatch || !ipMatch) {
                return "To create a server, I need a name and IP address. For example:\n`Create server named Web01 with IP 192.168.1.10`"
            }
            
            const displayName = nameMatch[1].trim()
            const ip = ipMatch[1].trim()
            const hostname = hostnameMatch ? hostnameMatch[1].trim() : displayName.toLowerCase().replace(/\s/g, '-')
            const type = typeMatch ? typeMatch[1].split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 'Web Server'
            const group = groupMatch ? groupMatch[1].charAt(0).toUpperCase() + groupMatch[1].slice(1) : 'Ungrouped'
            
            try {
                const db = store.readSync()
                const newServer = {
                    id: uid(),
                    displayName,
                    hostname,
                    ipAddress: ip,
                    type,
                    status: 'active',
                    serverGroup: group
                }
                db.servers.push(newServer)
                store.write(db)
                logAudit('create', 'server', displayName, { hostname, ip, type, group })
                renderServers()
                
                return `✅ Server **${displayName}** created successfully!\n\n• IP: ${ip}\n• Hostname: ${hostname}\n• Type: ${type}\n• Group: ${group}\n\nYou can find it in the Servers section.`
            } catch (error) {
                return `❌ Failed to create server: ${error.message}`
            }
        }
        
        // CREATE USER
        if ((lowerMessage.includes('create') || lowerMessage.includes('add')) && lowerMessage.includes('user')) {
            const nameMatch = message.match(/(?:named?|called)\s+["']?([^"'\n]+?)["']?(?:\s+with|\s+email|$)/i)
            const usernameMatch = message.match(/(?:username)\s+["']?([^\s"'\n]+)["']?/i)
            const emailMatch = message.match(/(?:email)\s+["']?([^\s"'\n]+)["']?/i)
            const passwordMatch = message.match(/(?:password)\s+["']?([^\s"'\n]+)["']?/i)
            const roleMatch = message.match(/(?:role|as)\s+(super admin|admin|developer|viewer)/i)
            
            if (!nameMatch || !emailMatch) {
                return "To create a user, I need a name and email. For example:\n`Create user named John with email john@example.com`"
            }
            
            const name = nameMatch[1].trim()
            const email = emailMatch[1].trim()
            const username = usernameMatch ? usernameMatch[1].trim() : email.split('@')[0]
            const password = passwordMatch ? passwordMatch[1].trim() : 'changeme123'
            const role = roleMatch ? roleMatch[1].split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 'Admin'
            
            try {
                const db = store.readSync()
                const newUser = {
                    id: uid(),
                    name,
                    username,
                    password,
                    changePasswordOnLogin: !passwordMatch, // If no password specified, require change
                    email,
                    position: '—',
                    squad: '—',
                    role,
                    lastLogin: '—',
                    ip: '—',
                    isActive: true
                }
                db.users.push(newUser)
                store.write(db)
                logAudit('create', 'user', name, { username, email, role })
                renderUsers()
                
                return `✅ User **${name}** created successfully!\n\n• Username: ${username}\n• Email: ${email}\n• Role: ${role}\n• Password: ${password}${!passwordMatch ? ' (will need to change on first login)' : ''}\n\nYou can find them in the Admin section.`
            } catch (error) {
                return `❌ Failed to create user: ${error.message}`
            }
        }
        
        // CREATE DATABASE
        if ((lowerMessage.includes('create') || lowerMessage.includes('add')) && (lowerMessage.includes('database') || lowerMessage.includes('db'))) {
            const nameMatch = message.match(/(?:named?|called)\s+["']?([^"'\n]+?)["']?(?:\s+type|\s+server|$)/i)
            const typeMatch = message.match(/(?:type)\s+(sql server|postgresql|mysql|mongodb|oracle)/i)
            const serverMatch = message.match(/(?:server|host)\s+["']?([^\s"'\n]+)["']?/i)
            
            if (!nameMatch) {
                return "To create a database, I need a name. For example:\n`Create database named MainDB type SQL Server`"
            }
            
            const name = nameMatch[1].trim()
            const type = typeMatch ? typeMatch[1].split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 'SQL Server'
            const server = serverMatch ? serverMatch[1].trim() : 'localhost'
            
            try {
                const db = store.readSync()
                const newDatabase = {
                    id: uid(),
                    name,
                    type,
                    connectionString: `Server=${server};Database=${name};`,
                    description: ''
                }
                db.databases.push(newDatabase)
                store.write(db)
                logAudit('create', 'database', name, { type, server })
                renderDatabases()
                
                return `✅ Database **${name}** created successfully!\n\n• Type: ${type}\n• Server: ${server}\n\nYou can find it in the Databases section.`
            } catch (error) {
                return `❌ Failed to create database: ${error.message}`
            }
        }
        
        // ========== DELETE COMMANDS ==========
        
        // DELETE ENVIRONMENT
        if (lowerMessage.includes('delete') && (lowerMessage.includes('environment') || lowerMessage.includes('env'))) {
            const nameMatch = message.match(/(?:environment|env)\s+["']?([^"'\n]+)["']?/i)
            
            if (!nameMatch) {
                return "Which environment would you like to delete? For example:\n`Delete environment Prod`"
            }
            
            const name = nameMatch[1].trim()
            
            try {
                const db = store.readSync()
                if (!db.environments) db.environments = []
                const index = db.environments.findIndex(e => e.name.toLowerCase() === name.toLowerCase())
                
                if (index === -1) {
                    return `❌ Environment **${name}** not found. Use \`list environments\` to see all environments.`
                }
                
                db.environments.splice(index, 1)
                store.write(db)
                logAudit('delete', 'environment', name, {})
                renderEnvs()
                
                return `✅ Environment **${name}** deleted successfully!`
            } catch (error) {
                return `❌ Failed to delete environment: ${error.message}`
            }
        }
        
        // DELETE SERVER
        if (lowerMessage.includes('delete') && lowerMessage.includes('server')) {
            const nameMatch = message.match(/(?:server)\s+["']?([^"'\n]+)["']?/i)
            
            if (!nameMatch) {
                return "Which server would you like to delete? For example:\n`Delete server Web01`"
            }
            
            const name = nameMatch[1].trim()
            
            try {
                const db = store.readSync()
                const index = db.servers.findIndex(s => s.displayName.toLowerCase() === name.toLowerCase())
                
                if (index === -1) {
                    return `❌ Server **${name}** not found. Use \`list servers\` to see all servers.`
                }
                
                db.servers.splice(index, 1)
                store.write(db)
                logAudit('delete', 'server', name, {})
                renderServers()
                
                return `✅ Server **${name}** deleted successfully!`
            } catch (error) {
                return `❌ Failed to delete server: ${error.message}`
            }
        }
        
        // DELETE USER
        if (lowerMessage.includes('delete') && lowerMessage.includes('user')) {
            const nameMatch = message.match(/(?:user)\s+["']?([^"'\n]+)["']?/i)
            
            if (!nameMatch) {
                return "Which user would you like to delete? For example:\n`Delete user John`"
            }
            
            const name = nameMatch[1].trim()
            
            try {
                const db = store.readSync()
                const index = db.users.findIndex(u => u.name.toLowerCase() === name.toLowerCase() || u.username.toLowerCase() === name.toLowerCase())
                
                if (index === -1) {
                    return `❌ User **${name}** not found. Use \`list users\` to see all users.`
                }
                
                const userName = db.users[index].name
                db.users.splice(index, 1)
                store.write(db)
                logAudit('delete', 'user', userName, {})
                renderUsers()
                
                return `✅ User **${userName}** deleted successfully!`
            } catch (error) {
                return `❌ Failed to delete user: ${error.message}`
            }
        }
        
        // ========== LIST COMMANDS ==========
        
        // LIST ENVIRONMENTS
        if (lowerMessage.includes('list') && (lowerMessage.includes('environment') || lowerMessage.includes('env'))) {
            const db = store.readSync()
            const envs = db.environments || []
            
            if (envs.length === 0) {
                return "You don't have any environments yet. Would you like me to create one?"
            }
            
            let response = `📋 You have **${envs.length}** environment(s):\n\n`
            envs.forEach((env, i) => {
                response += `${i + 1}. **${env.name}** (${env.type})\n   URL: ${env.url}\n   Health: ${env.health}\n\n`
            })
            
            return response
        }
        
        // LIST SERVERS
        if (lowerMessage.includes('list') && lowerMessage.includes('server')) {
            const db = store.readSync()
            const servers = db.servers || []
            
            if (servers.length === 0) {
                return "You don't have any servers yet. Would you like me to create one?"
            }
            
            let response = `📋 You have **${servers.length}** server(s):\n\n`
            servers.forEach((server, i) => {
                response += `${i + 1}. **${server.displayName}** (${server.type})\n   IP: ${server.ipAddress} | Group: ${server.serverGroup}\n\n`
            })
            
            return response
        }
        
        // LIST USERS
        if (lowerMessage.includes('list') && lowerMessage.includes('user')) {
            const db = store.readSync()
            const users = db.users || []
            
            if (users.length === 0) {
                return "You don't have any users yet."
            }
            
            let response = `👥 You have **${users.length}** user(s):\n\n`
            users.forEach((user, i) => {
                response += `${i + 1}. **${user.name}** (@${user.username})\n   Email: ${user.email} | Role: ${user.role}\n\n`
            })
            
            return response
        }
        
        // LIST DATABASES
        if (lowerMessage.includes('list') && (lowerMessage.includes('database') || lowerMessage.includes('db'))) {
            const db = store.readSync()
            const databases = db.databases || []
            
            if (databases.length === 0) {
                return "You don't have any databases configured yet."
            }
            
            let response = `🗄️ You have **${databases.length}** database(s):\n\n`
            databases.forEach((database, i) => {
                response += `${i + 1}. **${database.name}** (${database.type})\n\n`
            })
            
            return response
        }
        
        // LIST AUDIT LOGS (recent)
        if (lowerMessage.includes('list') && (lowerMessage.includes('audit') || lowerMessage.includes('log'))) {
            const db = store.readSync()
            const logs = db.auditLogs || []
            
            if (logs.length === 0) {
                return "No audit logs yet."
            }
            
            // Show last 10
            const recent = logs.slice(-10).reverse()
            let response = `📝 Recent audit logs (last ${recent.length}):\n\n`
            recent.forEach((log, i) => {
                const date = new Date(log.timestamp).toLocaleString()
                response += `${i + 1}. **${log.action}** ${log.entityType} "${log.entityName}" by ${log.user}\n   ${date}\n\n`
            })
            
            return response
        }
        
        // ========== SEARCH/FIND COMMANDS ==========
        
        // FIND ENVIRONMENT
        if ((lowerMessage.includes('find') || lowerMessage.includes('show') || lowerMessage.includes('get')) && (lowerMessage.includes('environment') || lowerMessage.includes('env'))) {
            const nameMatch = message.match(/(?:environment|env)\s+["']?([^"'\n]+)["']?/i)
            
            if (!nameMatch) {
                return "Which environment would you like to find? For example:\n`Find environment Prod`"
            }
            
            const name = nameMatch[1].trim()
            const db = store.readSync()
            const env = db.environments?.find(e => e.name.toLowerCase().includes(name.toLowerCase()))
            
            if (!env) {
                return `❌ Environment containing **${name}** not found. Use \`list environments\` to see all environments.`
            }
            
            let response = `🌍 Environment: **${env.name}**\n\n`
            response += `• URL: ${env.url}\n`
            response += `• Type: ${env.type}\n`
            response += `• Health: ${env.health}\n`
            response += `• Mapped Servers: ${env.mappedServers?.length || 0}\n`
            
            return response
        }
        
        // FIND SERVER
        if ((lowerMessage.includes('find') || lowerMessage.includes('show') || lowerMessage.includes('get')) && lowerMessage.includes('server')) {
            const nameMatch = message.match(/(?:server)\s+["']?([^"'\n]+)["']?/i)
            
            if (!nameMatch) {
                return "Which server would you like to find? For example:\n`Find server Web01`"
            }
            
            const name = nameMatch[1].trim()
            const db = store.readSync()
            const server = db.servers.find(s => s.displayName.toLowerCase().includes(name.toLowerCase()))
            
            if (!server) {
                return `❌ Server containing **${name}** not found. Use \`list servers\` to see all servers.`
            }
            
            let response = `🖥️ Server: **${server.displayName}**\n\n`
            response += `• IP Address: ${server.ipAddress}\n`
            response += `• Hostname: ${server.hostname}\n`
            response += `• Type: ${server.type}\n`
            response += `• Group: ${server.serverGroup}\n`
            response += `• Status: ${server.status}\n`
            
            return response
        }
        
        // ========== COUNT/STATS COMMANDS ==========
        
        // HOW MANY / COUNT
        if ((lowerMessage.includes('how many') || lowerMessage.includes('count'))) {
            const db = store.readSync()
            
            if (lowerMessage.includes('environment') || lowerMessage.includes('env')) {
                const count = (db.environments || []).length
                return `You have **${count}** environment(s).`
            }
            
            if (lowerMessage.includes('server')) {
                const count = (db.servers || []).length
                return `You have **${count}** server(s).`
            }
            
            if (lowerMessage.includes('user')) {
                const count = (db.users || []).length
                return `You have **${count}** user(s).`
            }
            
            if (lowerMessage.includes('database')) {
                const count = (db.databases || []).length
                return `You have **${count}** database(s).`
            }
            
            // General count
            return `📊 **OrbisHub Stats:**\n\n` +
                   `• Environments: ${(db.environments || []).length}\n` +
                   `• Servers: ${(db.servers || []).length}\n` +
                   `• Users: ${(db.users || []).length}\n` +
                   `• Databases: ${(db.databases || []).length}\n` +
                   `• Scripts: ${(db.scripts || []).length}\n` +
                   `• Integrations: ${(db.integrations || []).length}\n` +
                   `• Credentials: ${(db.credentials || []).length}\n` +
                   `• Audit Logs: ${(db.auditLogs || []).length}\n`
        }
        
        // ========== HELP COMMANDS ==========
        
        // WHAT CAN YOU DO / HELP
        if (lowerMessage.includes('what can you') || lowerMessage.includes('help') || lowerMessage === 'help') {
            return `🤖 **Քեռի AI - Command Reference**\n\n` +
                   `**📊 FEATURES:**\n` +
                   `• **Summary Dashboard** - Real-time statistics and recent activity\n` +
                   `• **Remote Desktop Manager** - One-click RDP connections to servers\n` +
                   `• **Integrations** - Connect Exchange, SMTP, Slack, Teams\n` +
                   `• **Notifications** - Configure build, system, and health alerts\n` +
                   `• **Credentials** - Secure credential storage and management\n\n` +
                   `**CREATE:**\n` +
                   `• \`Create environment named X at https://...\`\n` +
                   `• \`Create server named X with IP 192.168.1.10\`\n` +
                   `• \`Create user named X with email x@example.com\`\n` +
                   `• \`Create database named X type SQL Server\`\n\n` +
                   `**DELETE:**\n` +
                   `• \`Delete environment X\`\n` +
                   `• \`Delete server X\`\n` +
                   `• \`Delete user X\`\n\n` +
                   `**LIST:**\n` +
                   `• \`List environments\` / \`List servers\` / \`List users\`\n` +
                   `• \`List databases\` / \`List integrations\` / \`List credentials\`\n\n` +
                   `**FIND:**\n` +
                   `• \`Find environment X\` / \`Find server X\`\n\n` +
                   `**STATS:**\n` +
                   `• \`How many servers?\` / \`Count environments\`\n` +
                   `• \`Show stats\` - Full system statistics\n\n` +
                   `Just ask me naturally and I'll understand! 😊`
        }
        
        return null // Not a command
    }

    // Simple fallback responses when AI is unavailable
    function getFallbackResponse(message) {
        const lowerMessage = message.toLowerCase()
        
        if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
            return "Hello! I'm Քեռի AI. How can I help you today?"
        }
        
        if (lowerMessage.includes('summary') || lowerMessage.includes('dashboard')) {
            return "The **Summary Dashboard** shows real-time statistics for all your resources:\n\n• Environment, server, script, and build counts\n• Recent activity feed\n• Quick action buttons\n\nCheck it out in the General section!"
        }
        
        if (lowerMessage.includes('rdp') || lowerMessage.includes('remote desktop')) {
            return "The **Remote Desktop Manager** allows one-click RDP connections to your servers!\n\n• Assign credentials to servers\n• Click Connect to launch mstsc directly\n• No downloads needed\n\nFind it under System Administrators → Remote Desktop Manager."
        }
        
        if (lowerMessage.includes('integration')) {
            return "**Integrations** connect OrbisHub with external services:\n\n• **Exchange** - Email notifications\n• **SMTP** - Custom email server\n• **Slack** - Team notifications\n• **Microsoft Teams** - Channel alerts\n\nConfigure them in System Administrators → Integrations."
        }
        
        if (lowerMessage.includes('notification') || lowerMessage.includes('alert')) {
            return "**Notifications** keep you informed:\n\n• **Build Notifications** - Deployment status\n• **System Alerts** - Critical warnings\n• **Daily Summaries** - Activity reports\n• **Health Monitoring** - Service status\n\nConfigure in System Administrators → Notifications."
        }
        
        if (lowerMessage.includes('credential')) {
            return "**Credentials** store secure login information:\n\n• Windows accounts\n• Database connections\n• Service accounts\n• API keys\n\nManage them in System Administrators → Credentials.\nAssign them to servers for RDP connections!"
        }
        
        if (lowerMessage.includes('environment') || lowerMessage.includes('env')) {
            return "I can help with environment management! You can:\n\n• **Create**: `Create environment named Prod at https://example.com`\n• **List**: `List environments`\n\nEnvironments are now in System Administrators section.\nWhat would you like to do?"
        }
        
        if (lowerMessage.includes('server')) {
            return "I can help with server management! You can:\n\n• **Create**: `Create server named Web01 with IP 192.168.1.10`\n• **List**: `List servers`\n• **Connect**: Use Remote Desktop Manager for RDP connections\n\nWhat would you like to do?"
        }
        
        if (lowerMessage.includes('script') || lowerMessage.includes('powershell')) {
            return "PowerShell scripts can be uploaded in the Scripts section. You can then run them across your servers. Would you like some script examples?"
        }
        
        if (lowerMessage.includes('user') || lowerMessage.includes('admin')) {
            return "User management is available in System Administrators → Users / Permissions. You can:\n\n• Create users and assign roles\n• View online/offline status (green/gray indicator)\n• Manage permissions\n\nWhat would you like to know?"
        }
        
        if (lowerMessage.includes('audit') || lowerMessage.includes('log')) {
            return "Audit logs track all changes in the system. You can view them in System Administrators → Audit Logs. They're paginated and searchable!"
        }
        
        if (lowerMessage.includes('help')) {
            return "I can help you with:\n\n• **Summary Dashboard** - Statistics and recent activity\n• **Remote Desktop Manager** - RDP connections\n• **Integrations** - External service connections\n• **Notifications** - Alert configuration\n• **Credentials** - Secure credential storage\n• **Environments & Servers** - Infrastructure management\n• **Users & Permissions** - User administration\n• **Scripts** - PowerShell automation\n\nWhat would you like to know more about?"
        }
        
        if (lowerMessage.includes('thank')) {
            return "You're welcome! Let me know if you need anything else. 😊"
        }
        
        return "I'm here to help with OrbisHub! You can ask me about:\n\n• Summary Dashboard\n• Remote Desktop Manager\n• Integrations & Notifications\n• Environments, Servers, Scripts\n• User management\n• General DevOps topics\n\nWhat would you like to know?"
    }
}

// Initialize AI chat after a short delay to ensure DOM is ready
setTimeout(initAIChat, 100)

// ============================================
// MODERN UI/UX ENHANCEMENTS
// ============================================

// 1. TOAST NOTIFICATION SYSTEM
const ToastManager = {
    container: null,
    
    init() {
        if (!this.container) {
            this.container = document.createElement('div')
            this.container.className = 'toast-container'
            document.body.appendChild(this.container)
        }
    },
    
    show(title, message, type = 'info', duration = 5000) {
        this.init()
        
        const toast = document.createElement('div')
        toast.className = `toast toast-${type}`
        
        const icons = {
            success: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>',
            error: '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>',
            warning: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>',
            info: '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>'
        }
        
        toast.innerHTML = `
            <div class="toast-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    ${icons[type]}
                </svg>
            </div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `
        
        this.container.appendChild(toast)
        
        // Close button handler
        const closeBtn = toast.querySelector('.toast-close')
        closeBtn.addEventListener('click', () => this.remove(toast))
        
        // Auto remove after duration
        if (duration > 0) {
            setTimeout(() => this.remove(toast), duration)
        }
        
        return toast
    },
    
    remove(toast) {
        toast.style.animation = 'toast-slide-out 0.3s cubic-bezier(0.4, 0, 1, 1) forwards'
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove()
            }
        }, 300)
    },
    
    success(title, message, duration) {
        return this.show(title, message, 'success', duration)
    },
    
    error(title, message, duration) {
        return this.show(title, message, 'error', duration)
    },
    
    warning(title, message, duration) {
        return this.show(title, message, 'warning', duration)
    },
    
    info(title, message, duration) {
        return this.show(title, message, 'info', duration)
    }
}

// 2. COMMAND PALETTE (Cmd+` / Ctrl+`)
const CommandPalette = {
    overlay: null,
    input: null,
    results: null,
    selectedIndex: 0,
    commands: [],
    
    init() {
        if (this.overlay) return
        
        // Create overlay
        this.overlay = document.createElement('div')
        this.overlay.className = 'command-palette-overlay'
        this.overlay.innerHTML = `
            <div class="command-palette">
                <div class="command-palette-input-wrapper">
                    <svg class="command-palette-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="m21 21-4.35-4.35"></path>
                    </svg>
                    <input type="text" class="command-palette-input" placeholder="Search commands or type to navigate..." autofocus />
                </div>
                <div class="command-palette-results"></div>
            </div>
        `
        
        document.body.appendChild(this.overlay)
        
        this.input = this.overlay.querySelector('.command-palette-input')
        this.results = this.overlay.querySelector('.command-palette-results')
        
        // Build commands
        this.buildCommands()
        
        // Event listeners
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.close()
        })
        
        this.input.addEventListener('input', (e) => {
            this.filter(e.target.value)
        })
        
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.close()
            } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                this.selectNext()
            } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                this.selectPrevious()
            } else if (e.key === 'Enter') {
                e.preventDefault()
                this.executeSelected()
            }
        })
        
        // Global keyboard shortcut
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === '`') {
                e.preventDefault()
                this.toggle()
            }
        })
    },
    
    buildCommands() {
        this.commands = [
            // Navigation
            { id: 'nav-environments', title: 'Environments', description: 'View and manage environments', icon: '🌍', action: () => showView('environments'), section: 'Navigation' },
            { id: 'nav-servers', title: 'Servers', description: 'Manage server infrastructure', icon: '🖥️', action: () => showView('servers'), section: 'Navigation' },
            { id: 'nav-scripts', title: 'Scripts', description: 'PowerShell script repository', icon: '📝', action: () => showView('scripts'), section: 'Navigation' },
            { id: 'nav-builds', title: 'Builds', description: 'Build execution and history', icon: '🔨', action: () => showView('builds'), section: 'Navigation' },
            { id: 'nav-admin', title: 'Admin Panel', description: 'System administration', icon: '⚙️', action: () => showView('admin'), section: 'Navigation' },
            
            // Actions
            { id: 'add-environment', title: 'Add Environment', description: 'Create new environment', icon: '➕', action: () => openAddEnvModal(), section: 'Actions', shortcut: 'Ctrl+E' },
            { id: 'add-server', title: 'Add Server', description: 'Register new server', icon: '➕', action: () => openAddServerModal(), section: 'Actions', shortcut: 'Ctrl+S' },
            { id: 'add-user', title: 'Add User', description: 'Create user account', icon: '👤', action: () => openAddUserModal(), section: 'Actions' },
            { id: 'sign-out', title: 'Sign Out', description: 'End your session', icon: '🚪', action: () => showSignOutModal(), section: 'Actions' },
        ]
    },
    
    open() {
        this.init()
        this.overlay.classList.add('is-open')
        this.input.value = ''
        this.input.focus()
        this.filter('')
    },
    
    close() {
        if (this.overlay) {
            this.overlay.classList.remove('is-open')
        }
    },
    
    toggle() {
        if (this.overlay && this.overlay.classList.contains('is-open')) {
            this.close()
        } else {
            this.open()
        }
    },
    
    filter(query) {
        const lowerQuery = query.toLowerCase()
        const filtered = this.commands.filter(cmd => 
            cmd.title.toLowerCase().includes(lowerQuery) ||
            cmd.description.toLowerCase().includes(lowerQuery)
        )
        
        this.renderResults(filtered, query)
        this.selectedIndex = 0
    },
    
    renderResults(commands, query) {
        if (commands.length === 0) {
            this.results.innerHTML = '<div class="command-palette-empty">No commands found</div>'
            return
        }
        
        // Group by section
        const sections = {}
        commands.forEach(cmd => {
            if (!sections[cmd.section]) sections[cmd.section] = []
            sections[cmd.section].push(cmd)
        })
        
        let html = ''
        Object.keys(sections).forEach(section => {
            html += `<div class="command-palette-section">`
            html += `<div class="command-palette-section-title">${section}</div>`
            
            sections[section].forEach((cmd, index) => {
                const isSelected = index === this.selectedIndex && section === Object.keys(sections)[0]
                html += `
                    <div class="command-palette-item ${isSelected ? 'is-selected' : ''}" data-id="${cmd.id}">
                        <div class="command-palette-item-icon">${cmd.icon}</div>
                        <div class="command-palette-item-content">
                            <div class="command-palette-item-title">${this.highlightQuery(cmd.title, query)}</div>
                            <div class="command-palette-item-description">${this.highlightQuery(cmd.description, query)}</div>
                        </div>
                        ${cmd.shortcut ? `<div class="command-palette-item-shortcut"><span class="command-palette-key">${cmd.shortcut}</span></div>` : ''}
                    </div>
                `
            })
            
            html += '</div>'
        })
        
        this.results.innerHTML = html
        
        // Add click handlers
        this.results.querySelectorAll('.command-palette-item').forEach(item => {
            item.addEventListener('click', () => {
                const cmd = this.commands.find(c => c.id === item.dataset.id)
                if (cmd) {
                    cmd.action()
                    this.close()
                }
            })
        })
    },
    
    highlightQuery(text, query) {
        if (!query) return text
        const regex = new RegExp(`(${query})`, 'gi')
        return text.replace(regex, '<span class="search-highlight">$1</span>')
    },
    
    selectNext() {
        const items = this.results.querySelectorAll('.command-palette-item')
        if (items.length === 0) return
        
        items[this.selectedIndex]?.classList.remove('is-selected')
        this.selectedIndex = (this.selectedIndex + 1) % items.length
        items[this.selectedIndex]?.classList.add('is-selected')
        items[this.selectedIndex]?.scrollIntoView({ block: 'nearest' })
    },
    
    selectPrevious() {
        const items = this.results.querySelectorAll('.command-palette-item')
        if (items.length === 0) return
        
        items[this.selectedIndex]?.classList.remove('is-selected')
        this.selectedIndex = (this.selectedIndex - 1 + items.length) % items.length
        items[this.selectedIndex]?.classList.add('is-selected')
        items[this.selectedIndex]?.scrollIntoView({ block: 'nearest' })
    },
    
    executeSelected() {
        const items = this.results.querySelectorAll('.command-palette-item')
        const selected = items[this.selectedIndex]
        if (selected) {
            const cmd = this.commands.find(c => c.id === selected.dataset.id)
            if (cmd) {
                cmd.action()
                this.close()
            }
        }
    }
}

// Helper functions for command palette actions
function openAddEnvModal() {
    const modal = document.getElementById('envModal')
    if (modal) {
        populateDeployerDropdowns()
        try { modal.showModal() } catch (e) { modal.setAttribute('open', '') }
        ToastManager.info('Add Environment', 'Fill in the form to create a new environment')
    }
}

function openAddServerModal() {
    const modal = document.getElementById('serverModal')
    if (modal) {
        try { modal.showModal() } catch (e) { modal.setAttribute('open', '') }
        ToastManager.info('Add Server', 'Register a new server in your infrastructure')
    }
}

function openAddUserModal() {
    const modal = document.getElementById('createUserModal')
    if (modal) {
        try { modal.showModal() } catch (e) { modal.setAttribute('open', '') }
        ToastManager.info('Create User', 'Add a new user to the system')
    }
}

function showSignOutModal() {
    const modal = document.getElementById('signOutModal')
    if (modal) {
        try { modal.showModal() } catch (e) { modal.setAttribute('open', '') }
    }
}

// 3. ENHANCED SEARCH WITH HIGHLIGHTS
function enhanceSearchInputs() {
    const searchInputs = document.querySelectorAll('input[type="search"], .input[placeholder*="Search"], .input[placeholder*="search"]')
    
    searchInputs.forEach(input => {
        const wrapper = document.createElement('div')
        wrapper.className = 'input-with-icon'
        
        input.parentNode.insertBefore(wrapper, input)
        wrapper.appendChild(input)
        
        // Add search icon
        const icon = document.createElement('div')
        icon.className = 'input-icon'
        icon.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
            </svg>
        `
        wrapper.appendChild(icon)
        
        // Add clear button
        const clearBtn = document.createElement('button')
        clearBtn.className = 'input-clear'
        clearBtn.type = 'button'
        clearBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        `
        wrapper.appendChild(clearBtn)
        
        // Update wrapper state
        input.addEventListener('input', () => {
            if (input.value) {
                wrapper.classList.add('has-value')
            } else {
                wrapper.classList.remove('has-value')
            }
        })
        
        // Clear button action
        clearBtn.addEventListener('click', () => {
            input.value = ''
            input.dispatchEvent(new Event('input'))
            input.focus()
        })
    })
}

// 4. ADD SMOOTH SCROLLING AND CUSTOM SCROLLBARS
function enhanceScrolling() {
    const scrollContainers = document.querySelectorAll('.views, .nav, .audit-table, .command-palette-results, .ai-chat-messages')
    scrollContainers.forEach(container => {
        container.classList.add('custom-scrollbar')
    })
}

// 5. SKELETON LOADERS
function showSkeletonLoader(container) {
    const skeleton = document.createElement('div')
    skeleton.className = 'skeleton-card'
    skeleton.innerHTML = `
        <div class="skeleton skeleton-text"></div>
        <div class="skeleton skeleton-text"></div>
        <div class="skeleton skeleton-text"></div>
    `
    container.innerHTML = ''
    container.appendChild(skeleton)
}

// 6. INITIALIZE ALL ENHANCEMENTS
function initModernUI() {
    console.log('🎨 Initializing modern UI enhancements...')
    
    // Initialize command palette
    CommandPalette.init()
    
    // Enhance search inputs
    setTimeout(() => {
        enhanceSearchInputs()
    }, 500)
    
    // Apply custom scrollbars
    enhanceScrolling()
    
    // Add keyboard shortcuts hint
    const hint = document.createElement('div')
    hint.style.cssText = 'position:fixed;bottom:20px;left:20px;padding:8px 12px;background:var(--panel);border:1px solid var(--border);border-radius:8px;font-size:11px;color:var(--muted);z-index:1000;opacity:0;transition:opacity 0.3s;pointer-events:none;'
    hint.innerHTML = 'Press <kbd style="padding:2px 6px;background:var(--border);border-radius:4px;font-family:monospace;">Ctrl+`</kbd> for commands'
    document.body.appendChild(hint)
    
    // Show hint briefly
    setTimeout(() => {
        hint.style.opacity = '1'
        setTimeout(() => {
            hint.style.opacity = '0'
            setTimeout(() => hint.remove(), 300)
        }, 3000)
    }, 1000)
    
    console.log('✅ Modern UI enhancements loaded!')
}

// Override existing notification functions to use toast system
const originalAlert = window.alert
window.alert = function(message) {
    if (typeof message === 'string' && message.includes('successfully')) {
        ToastManager.success('Success', message)
    } else if (typeof message === 'string' && (message.includes('error') || message.includes('failed'))) {
        ToastManager.error('Error', message)
    } else {
        ToastManager.info('Notice', message)
    }
}

// Settings Page Functionality
function initSettings() {
    // Theme toggle
    const settingsThemeToggle = document.getElementById('settingsThemeToggle')
    if (settingsThemeToggle) {
        settingsThemeToggle.addEventListener('click', () => {
            toggleTheme()
            ToastManager.success('Theme Changed', 'Your theme preference has been updated')
        })
    }

    // Storage usage
    updateStorageUsage()

    // Export data
    const exportDataBtn = document.getElementById('exportDataBtn')
    if (exportDataBtn) {
        exportDataBtn.addEventListener('click', () => {
            const db = store.readSync()
            const dataStr = JSON.stringify(db, null, 2)
            const blob = new Blob([dataStr], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `orbishub-backup-${new Date().toISOString().split('T')[0]}.json`
            a.click()
            URL.revokeObjectURL(url)
            ToastManager.success('Export Complete', 'Your data has been downloaded')
        })
    }

    // Import data
    const importDataBtn = document.getElementById('importDataBtn')
    const importDataFile = document.getElementById('importDataFile')
    if (importDataBtn && importDataFile) {
        importDataBtn.addEventListener('click', () => {
            importDataFile.click()
        })
        
        importDataFile.addEventListener('change', (e) => {
            const file = e.target.files[0]
            if (!file) return
            
            const reader = new FileReader()
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result)
                    if (confirm('This will replace all your current data. Are you sure?')) {
                        store.write(data)
                        ToastManager.success('Import Complete', 'Your data has been restored')
                        setTimeout(() => location.reload(), 1500)
                    }
                } catch (err) {
                    ToastManager.error('Import Failed', 'Invalid JSON file')
                }
            }
            reader.readAsText(file)
        })
    }

    // Clear all data
    const clearAllDataBtn = document.getElementById('clearAllDataBtn')
    if (clearAllDataBtn) {
        clearAllDataBtn.addEventListener('click', () => {
            if (confirm('⚠️ This will delete ALL data permanently. Are you absolutely sure?')) {
                if (confirm('Last chance! This action cannot be undone. Continue?')) {
                    // [Database-only: No local data to clear]
                    ToastManager.warning('Data Cleared', 'All data has been deleted. Redirecting to login...')
                    setTimeout(() => location.reload(), 2000)
                }
            }
        })
    }

    // Browser info
    const browserInfo = document.getElementById('browserInfo')
    if (browserInfo) {
        const ua = navigator.userAgent
        let browser = 'Unknown'
        if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome'
        else if (ua.includes('Edg')) browser = 'Edge'
        else if (ua.includes('Firefox')) browser = 'Firefox'
        else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari'
        browserInfo.textContent = browser
    }
}

function updateStorageUsage() {
    const usage = getStorageUsage()
    const storageBarFill = document.getElementById('storageBarFill')
    const storageUsageText = document.getElementById('storageUsageText')
    
    if (storageBarFill && storageUsageText) {
        storageBarFill.style.width = usage.percentUsed + '%'
        storageUsageText.textContent = `${usage.sizeMB} MB / ${usage.limitMB} MB (${usage.percentUsed}%)`
        
        // Update color based on usage
        storageBarFill.classList.remove('warning', 'danger')
        if (usage.percentUsed > 80) {
            storageBarFill.classList.add('danger')
        } else if (usage.percentUsed > 60) {
            storageBarFill.classList.add('warning')
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initModernUI()
        initSettings()
        initUserPermissionsTabs()
    })
} else {
    initModernUI()
    initSettings()
    initUserPermissionsTabs()
}

// Initialize tabs for Users/Permissions section
function initUserPermissionsTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn')
    
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab')
            
            // Remove active class from all buttons
            tabButtons.forEach(b => {
                b.classList.remove('active')
                b.style.color = 'var(--muted)'
                b.style.borderBottomColor = 'transparent'
            })
            
            // Add active class to clicked button
            btn.classList.add('active')
            btn.style.color = 'var(--primary)'
            btn.style.borderBottomColor = 'var(--primary)'
            
            // Hide all tab contents
            document.querySelectorAll('.tab-content').forEach(content => {
                content.style.display = 'none'
            })
            
            // Show target tab content
            const targetContent = document.getElementById(targetTab)
            if (targetContent) {
                targetContent.style.display = 'block'
            }
        })
    })
    
    // Set initial active state for the first tab
    const firstTab = document.querySelector('.tab-btn.active')
    if (firstTab) {
        firstTab.style.color = 'var(--primary)'
        firstTab.style.borderBottomColor = 'var(--primary)'
    }
}

// ==================== SOCKET.IO REAL-TIME MESSAGING ====================

let socket = null
let currentChatUserId = null
let onlineUsers = new Set()
let typingTimeout = null
let messagingInitialized = false

// Helper function to get current user ID
function getCurrentUserId() {
    const session = getSession()
    return session?.id || session?.Id || null
}

// Initialize Socket.IO connection
function initMessaging() {
    // Prevent duplicate initialization
    if (messagingInitialized) {
        console.log('⚠️ Messaging already initialized, skipping duplicate')
        return
    }
    
    const userId = getCurrentUserId()
    
    if (!userId) {
        console.error('❌ Cannot initialize messaging: No user ID found')
        return
    }
    
    console.log('🔌 Initializing messaging for user:', userId)
    
    // Connect to Socket.IO server
    socket = io(`${API_BASE_URL}`)
    
    // Mark as initialized
    messagingInitialized = true
    
    // Join with current user ID
    socket.on('connect', () => {
        console.log('✅ Connected to messaging server')
        socket.emit('join', userId)
        loadUnreadCount()
    })
    
    // Handle new messages
    socket.on('new-message', (message) => {
        console.log('📨 New message received:', message)
        
        const session = getSession()
        const currentUserId = session?.id || session?.Id || null
        
        // Skip if this is our own message (we already displayed it when sending)
        if (message.SenderId === currentUserId) {
            console.log('⏭️ Skipping own message display (already shown)')
            return
        }
        
        // Update unread count
        loadUnreadCount()
        
        // Check if we're in the new messages view
        const newViewContainer = document.getElementById('messagesChatBody')
        const isNewViewActive = newViewContainer && window.currentChatUserId
        
        if (isNewViewActive && window.currentChatUserId === message.SenderId) {
            // Display in new view
            const lastGroup = newViewContainer.querySelector('.message-group:last-child')
            const shouldGroup = lastGroup && !lastGroup.classList.contains('own')
            
            if (shouldGroup) {
                const lastContent = lastGroup.querySelector('.message-group-content')
                const newBubble = document.createElement('div')
                newBubble.className = 'message-bubble'
                newBubble.textContent = message.Content
                lastContent.appendChild(newBubble)
            } else {
                const initials = getUserInitials(message.SenderName || message.SenderUsername || 'User')
                const messageGroup = document.createElement('div')
                messageGroup.className = 'message-group'
                messageGroup.innerHTML = `
                    <div class="message-group-avatar">${initials}</div>
                    <div class="message-group-content">
                        <div class="message-group-header">
                            <span class="message-group-header-name">${message.SenderName || message.SenderUsername || 'User'}</span>
                            <span class="message-group-header-time">Just now</span>
                        </div>
                        <div class="message-bubble">${escapeHtml(message.Content)}</div>
                    </div>
                `
                newViewContainer.appendChild(messageGroup)
            }
            newViewContainer.scrollTop = newViewContainer.scrollHeight
            markMessagesAsRead(message.SenderId)
        } else if (currentChatUserId === message.SenderId) {
            // Display in old modal view (if still being used)
            displayMessage(message)
            markMessagesAsRead(message.SenderId)
        } else {
            // Show notification
            showToast(`New message from ${message.SenderFullName || message.SenderUsername}`)
        }
    })
    
    // Handle user typing
    socket.on('user-typing', (data) => {
        if (currentChatUserId === data.userId) {
            const typingIndicator = document.getElementById('typingIndicator')
            const typingUsername = document.getElementById('typingUsername')
            if (data.isTyping) {
                typingUsername.textContent = getChatUserName()
                typingIndicator.style.display = 'block'
            } else {
                typingIndicator.style.display = 'none'
            }
        }
    })

    // Handle channel messages
    socket.on('channel-message', (message) => {
        console.log('📢 Channel message received:', message)
        // Only display if we're viewing this channel
        if (currentChannelId === message.channelId) {
            displayChannelMessage(message)
        }
    })
    
    // Handle user online status
    socket.on('user-online', (data) => {
        onlineUsers.add(data.userId)
        if (currentChatUserId === data.userId) {
            updateChatUserStatus('online')
        }
    })
    
    socket.on('user-offline', (data) => {
        onlineUsers.delete(data.userId)
        if (currentChatUserId === data.userId) {
            updateChatUserStatus('offline')
        }
    })
    
    // Handle messages marked as read
    socket.on('messages-read', (data) => {
        console.log('✅ Messages marked as read by', data.userId)
    })
    
    // Setup message button
    // Messages button removed - now accessible via navigation
    
    // Setup message modal interactions (for backward compatibility)
    setupMessageModal()
}

// Open messages modal
function openMessagesModal() {
    const modal = document.getElementById('messagesModal')
    if (modal) {
        modal.showModal()
        loadConversations()
    }
}

// Setup message modal event listeners
let messageModalSetup = false
function setupMessageModal() {
    // Prevent duplicate event listeners
    if (messageModalSetup) {
        console.log('⚠️ Message modal already setup, skipping duplicate')
        return
    }
    
    const sendBtn = document.getElementById('sendMessageBtn')
    const messageTextarea = document.getElementById('messageTextarea')
    const searchUsers = document.getElementById('searchUsers')
    
    // Send message on button click
    if (sendBtn) {
        sendBtn.addEventListener('click', (e) => {
            e.preventDefault()
            sendMessage()
        })
    }
    
    // Send message on Enter (Shift+Enter for new line)
    if (messageTextarea) {
        messageTextarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
            }
        })
        
        // Typing indicator
        messageTextarea.addEventListener('input', () => {
            if (!currentChatUserId) return
            
            const userId = getCurrentUserId()
            if (!userId) return
            
            socket.emit('typing', {
                userId: userId,
                recipientId: currentChatUserId,
                isTyping: true
            })
            
            clearTimeout(typingTimeout)
            typingTimeout = setTimeout(() => {
                socket.emit('typing', {
                    userId: userId,
                    recipientId: currentChatUserId,
                    isTyping: false
                })
            }, 1000)
        })
    }
    
    messageModalSetup = true
    console.log('✅ Message modal setup complete')
    
    // Search users
    if (searchUsers) {
        searchUsers.addEventListener('input', (e) => {
            filterConversations(e.target.value)
        })
    }
}

// Load conversations list
async function loadConversations() {
    try {
        const userId = getCurrentUserId()
        if (!userId) return
        
        // Get all users
        const usersResponse = await fetch(`${API_BASE_URL}/api/users`)
        const users = await usersResponse.json()
        
        // Get conversations with message counts
        const convoResponse = await fetch(`${API_BASE_URL}/api/conversations/${userId}`)
        const conversations = await convoResponse.json()
        
        const container = document.getElementById('conversationsContainer')
        if (!container) return
        
        container.innerHTML = ''
        
        // Create conversation items for users
        users.forEach(user => {
            if (user.Id === userId) return // Skip self
            
            const convo = conversations.find(c => c.Id === user.Id)
            const unreadCount = convo ? convo.UnreadCount : 0
            
            const item = document.createElement('div')
            item.className = 'conversation-item'
            item.dataset.userId = user.Id
            item.style.cssText = `
                padding: 12px;
                border-radius: 8px;
                cursor: pointer;
                transition: background 0.2s;
                margin-bottom: 4px;
                display: flex;
                align-items: center;
                gap: 12px;
            `
            
            item.innerHTML = `
                <div style="width:40px; height:40px; border-radius:50%; background:linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); display:flex; align-items:center; justify-content:center; color:white; font-weight:600; flex-shrink:0;">
                    ${user.FullName ? user.FullName.charAt(0).toUpperCase() : user.Username.charAt(0).toUpperCase()}
                </div>
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:600; font-size:14px; margin-bottom:2px;">${user.FullName || user.Username}</div>
                    <div style="font-size:12px; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${user.Email}
                    </div>
                </div>
                ${unreadCount > 0 ? `<div style="min-width:24px; height:24px; border-radius:12px; background:#ef4444; color:white; font-size:12px; font-weight:600; display:flex; align-items:center; justify-content:center;">${unreadCount}</div>` : ''}
            `
            
            item.addEventListener('mouseenter', () => {
                if (!item.classList.contains('active')) {
                    item.style.background = 'rgba(138, 162, 255, 0.1)'
                }
            })
            item.addEventListener('mouseleave', () => {
                if (!item.classList.contains('active')) {
                    item.style.background = 'transparent'
                }
            })
            item.addEventListener('click', () => {
                openChat(user)
            })
            
            container.appendChild(item)
        })
    } catch (error) {
        console.error('Error loading conversations:', error)
    }
}

// Filter conversations by search
function filterConversations(searchTerm) {
    const items = document.querySelectorAll('.conversation-item')
    items.forEach(item => {
        const text = item.textContent.toLowerCase()
        if (text.includes(searchTerm.toLowerCase())) {
            item.style.display = 'flex'
        } else {
            item.style.display = 'none'
        }
    })
}

// Open chat with specific user
async function openChat(user) {
    currentChatUserId = user.Id
    
    // Highlight selected conversation
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.style.background = 'transparent'
        item.classList.remove('active')
    })
    
    const selectedItem = Array.from(document.querySelectorAll('.conversation-item'))
        .find(item => item.dataset.userId === user.Id)
    
    if (selectedItem) {
        selectedItem.style.background = 'rgba(138, 162, 255, 0.15)'
        selectedItem.classList.add('active')
    }
    
    // Show chat area
    document.getElementById('noChatSelected').style.display = 'none'
    document.getElementById('chatHeader').style.display = 'block'
    document.getElementById('messagesContainer').style.display = 'block'
    document.getElementById('messageInput').style.display = 'block'
    
    // Update header
    const avatar = document.getElementById('chatUserAvatar')
    const name = document.getElementById('chatUserName')
    const status = document.getElementById('chatUserStatus')
    
    avatar.textContent = user.FullName ? user.FullName.charAt(0).toUpperCase() : user.Username.charAt(0).toUpperCase()
    name.textContent = user.FullName || user.Username
    updateChatUserStatus(onlineUsers.has(user.Id) ? 'online' : 'offline')
    
    // Load messages
    await loadMessages(user.Id)
    
    // Mark messages as read
    await markMessagesAsRead(user.Id)
    
    // Update unread count
    loadUnreadCount()
}

// Get current chat user name
function getChatUserName() {
    const name = document.getElementById('chatUserName')
    return name ? name.textContent : 'User'
}

// ========== MODERN MESSAGING VIEW ==========

// Initialize the new messaging view
async function initializeMessagingView() {
    try {
        // Get current user first
        const session = getSession()
        const currentUserId = session?.id || session?.Id || null
        
        if (!currentUserId) {
            console.error('❌ Cannot initialize messaging: No user ID found in session')
            const container = document.getElementById('directMessagesList')
            if (container) {
                container.innerHTML = `
                    <div class="messages-list-empty">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                        <p>Session error</p>
                        <small>Please log out and log back in</small>
                    </div>
                `
            }
            return
        }
        
        // Load all users for direct messages
        const response = await fetch(`${API_BASE_URL}/api/load-data`)
        const result = await response.json()
        
        if (result.success && result.data) {
            const users = result.data.users || []
            
            // Filter out current user (check both id and Id fields)
            const otherUsers = users.filter(u => {
                const userId = u.id || u.Id
                return userId !== currentUserId
            })
            
            console.log(`📨 Current user ID: ${currentUserId}`)
            console.log(`📨 Total users: ${users.length}, Other users: ${otherUsers.length}`)
            
            // Render users in Direct Messages list
            renderDirectMessagesList(otherUsers)
            
            console.log(`✅ Loaded ${otherUsers.length} users for messaging`)
        }
        
        // Setup event listeners
        setupMessagingEventListeners()
        
    } catch (error) {
        console.error('❌ Failed to initialize messaging view:', error)
    }
}

// Render Direct Messages list
function renderDirectMessagesList(users) {
    const container = document.getElementById('directMessagesList')
    if (!container) return
    
    const currentUserId = getCurrentUserId()
    
    if (users.length === 0) {
        container.innerHTML = `
            <div class="messages-list-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <p>No users available</p>
                <small>Add users to start messaging</small>
            </div>
        `
        return
    }
    
    container.innerHTML = ''
    
    users.forEach(user => {
        const conversationItem = document.createElement('div')
        conversationItem.className = 'conversation-item'
        conversationItem.dataset.userId = user.id
        
        // Get user initials
        const initials = getUserInitials(user.name || user.username)
        
        // Check if user is online (you can expand this with real presence data)
        const isOnline = user.isActive !== false
        
        conversationItem.innerHTML = `
            <div class="messages-avatar">
                <span>${initials}</span>
                <div class="messages-avatar-status ${isOnline ? 'online' : ''}"></div>
            </div>
            <div class="conversation-info">
                <div class="conversation-header">
                    <span class="conversation-name">${user.name || user.username}</span>
                    <span class="conversation-time"></span>
                </div>
                <div class="conversation-preview">${user.role || 'User'}</div>
            </div>
        `
        
        // Click handler to open conversation
        conversationItem.addEventListener('click', () => {
            openConversation(user)
        })
        
        container.appendChild(conversationItem)
    })
}

// Get user initials
function getUserInitials(name) {
    if (!name) return '?'
    const parts = name.trim().split(' ')
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
}

// Open a conversation with a user
async function openConversation(user) {
    // Update active state
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.remove('active')
    })
    event.currentTarget?.classList.add('active')
    
    // Hide empty state, show chat
    document.getElementById('messagesEmptyState').style.display = 'none'
    document.getElementById('messagesActiveChat').style.display = 'flex'
    
    // Update chat header
    const initials = getUserInitials(user.name || user.username)
    document.getElementById('activeChatAvatarText').textContent = initials
    document.getElementById('activeChatName').textContent = user.name || user.username
    document.getElementById('activeChatMeta').textContent = user.isActive ? 'Active' : 'Last seen recently'
    
    const statusDot = document.getElementById('activeChatStatus')
    if (statusDot) {
        statusDot.className = 'messages-avatar-status'
        if (user.isActive) statusDot.classList.add('online')
    }
    
    // Load messages with this user
    await loadMessagesForNewView(user.id)
}

// Load messages for the new view
async function loadMessagesForNewView(userId) {
    try {
        const session = getSession()
        const currentUserId = session?.id || session?.Id || null
        
        if (!currentUserId) {
            console.error('No user session found')
            return
        }
        
        const response = await fetch(`${API_BASE_URL}/api/messages/${currentUserId}?otherUserId=${userId}`)
        const messages = await response.json()
        
        const container = document.getElementById('messagesChatBody')
        if (!container) return
        
        container.innerHTML = ''
        
        // Group messages by date and render
        renderMessagesGrouped(messages, container, currentUserId)
        
        // Scroll to bottom
        container.scrollTop = container.scrollHeight
        
        // Store current chat user
        window.currentChatUserId = userId
        
    } catch (error) {
        console.error('Error loading messages:', error)
    }
}

// Render messages with grouping
function renderMessagesGrouped(messages, container, currentUserId) {
    if (messages.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:40px; color:var(--muted);">
                <p>No messages yet</p>
                <small>Start the conversation by sending a message below</small>
            </div>
        `
        return
    }
    
    let currentDate = null
    let lastSenderId = null
    let lastMessageTime = null
    
    messages.forEach((message, index) => {
        const messageDate = new Date(message.SentAt)
        const messageDateStr = messageDate.toLocaleDateString()
        
        // Add date divider if date changed
        if (messageDateStr !== currentDate) {
            currentDate = messageDateStr
            const dateDivider = document.createElement('div')
            dateDivider.className = 'messages-date-divider'
            dateDivider.innerHTML = `<span>${formatMessageDate(messageDate)}</span>`
            container.appendChild(dateDivider)
        }
        
        const isOwnMessage = message.SenderId === currentUserId
        const isConsecutive = lastSenderId === message.SenderId && 
                             (new Date(message.SentAt) - lastMessageTime) < 300000 // 5 minutes
        
        // Create message group
        const messageGroup = document.createElement('div')
        messageGroup.className = `message-group ${isOwnMessage ? 'own' : ''} ${isConsecutive ? 'consecutive' : ''}`
        
        const initials = isOwnMessage ? 'ME' : getUserInitials(message.SenderName || 'User')
        
        messageGroup.innerHTML = `
            <div class="message-group-avatar">${initials}</div>
            <div class="message-group-content">
                <div class="message-group-header">
                    <span class="message-group-header-name">${isOwnMessage ? 'You' : (message.SenderName || 'User')}</span>
                    <span class="message-group-header-time">${formatMessageTime(message.SentAt)}</span>
                </div>
                <div class="message-bubble">
                    ${escapeHtml(message.Content)}
                </div>
            </div>
        `
        
        container.appendChild(messageGroup)
        
        lastSenderId = message.SenderId
        lastMessageTime = new Date(message.SentAt)
    })
}

// Format date for divider
function formatMessageDate(date) {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const messageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    
    if (messageDay.getTime() === today.getTime()) {
        return 'Today'
    } else if (messageDay.getTime() === yesterday.getTime()) {
        return 'Yesterday'
    } else {
        return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
}

// Setup event listeners for messaging
let messagingListenersSetup = false;

function setupMessagingEventListeners() {
    // Prevent duplicate event listeners
    if (messagingListenersSetup) {
        console.log('⚠️ Messaging event listeners already setup')
        return
    }
    messagingListenersSetup = true
    
    // Tab switching
    const directTab = document.querySelector('[data-tab="direct"]')
    const channelsTab = document.querySelector('[data-tab="channels"]')
    const directList = document.getElementById('directMessagesList')
    const channelsList = document.getElementById('channelsList')
    
    if (directTab && channelsTab) {
        directTab.addEventListener('click', () => {
            directTab.classList.add('active')
            channelsTab.classList.remove('active')
            directList.style.display = 'block'
            channelsList.style.display = 'none'
        })
        
        channelsTab.addEventListener('click', () => {
            channelsTab.classList.add('active')
            directTab.classList.remove('active')
            channelsList.style.display = 'block'
            directList.style.display = 'none'
        })
    }
    
    // Send message button
    const sendBtn = document.getElementById('messagesSendBtn')
    const textarea = document.getElementById('messagesTextarea')
    
    if (sendBtn && textarea) {
        sendBtn.addEventListener('click', () => sendMessageFromNewView())
        
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessageFromNewView()
            }
        })
        
        // Auto-resize textarea
        textarea.addEventListener('input', () => {
            textarea.style.height = 'auto'
            const newHeight = Math.min(textarea.scrollHeight, 120)
            textarea.style.height = newHeight + 'px'
        })
    }
    
    // New message button
    const newMessageBtn = document.getElementById('newMessageBtn')
    if (newMessageBtn) {
        newMessageBtn.addEventListener('click', () => {
            // Could open a modal to select user
            alert('Select a user from the list to start a conversation')
        })
    }
}

// Send message from new view
async function sendMessageFromNewView() {
    const textarea = document.getElementById('messagesTextarea')
    const content = textarea?.value.trim()
    
    if (!content || !window.currentChatUserId) return
    
    const session = getSession()
    const currentUserId = session?.id || session?.Id || null
    
    if (!currentUserId) {
        console.error('❌ No current user ID found in session')
        showToast('Session error. Please log in again.')
        return
    }
    
    // Disable send button to prevent duplicate sends
    const sendBtn = document.getElementById('messagesSendBtn')
    if (sendBtn) sendBtn.disabled = true
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                senderId: currentUserId,
                recipientId: window.currentChatUserId,
                content: content
            })
        })
        
        const result = await response.json()
        
        if (result.success && result.message) {
            console.log('✅ Message sent successfully')
            
            // Clear input
            textarea.value = ''
            textarea.style.height = 'auto'
            
            // Add message to UI immediately (for sender)
            const container = document.getElementById('messagesChatBody')
            if (container) {
                // Check if we should group with previous message
                const lastGroup = container.querySelector('.message-group:last-child')
                const shouldGroup = lastGroup && lastGroup.classList.contains('own')
                
                if (shouldGroup) {
                    // Add to existing group
                    const lastContent = lastGroup.querySelector('.message-group-content')
                    const newBubble = document.createElement('div')
                    newBubble.className = 'message-bubble'
                    newBubble.textContent = content
                    lastContent.appendChild(newBubble)
                } else {
                    // Create new group
                    const messageGroup = document.createElement('div')
                    messageGroup.className = 'message-group own'
                    messageGroup.innerHTML = `
                        <div class="message-group-avatar">ME</div>
                        <div class="message-group-content">
                            <div class="message-group-header">
                                <span class="message-group-header-name">You</span>
                                <span class="message-group-header-time">Just now</span>
                            </div>
                            <div class="message-bubble">${escapeHtml(content)}</div>
                        </div>
                    `
                    container.appendChild(messageGroup)
                }
                
                // Scroll to bottom
                container.scrollTop = container.scrollHeight
            }
        } else {
            console.error('❌ Server returned error:', result)
            showToast('Failed to send message')
        }
    } catch (error) {
        console.error('❌ Failed to send message:', error)
        showToast('Failed to send message')
    } finally {
        // Re-enable send button
        if (sendBtn) sendBtn.disabled = false
    }
}

// Update chat user status
function updateChatUserStatus(status) {
    const statusEl = document.getElementById('chatUserStatus')
    if (!statusEl) return
    
    if (status === 'online') {
        statusEl.innerHTML = '<span style="color:#10b981;">● Online</span>'
    } else {
        statusEl.innerHTML = '<span style="color:var(--muted);">● Offline</span>'
    }
}

// Load messages with a user
async function loadMessages(userId) {
    try {
        const currentUserId = getCurrentUserId()
        if (!currentUserId) return
        
        const response = await fetch(`${API_BASE_URL}/api/messages/${currentUserId}?otherUserId=${userId}`)
        const messages = await response.json()
        
        const container = document.getElementById('messagesContainer')
        if (!container) return
        
        container.innerHTML = ''
        
        messages.forEach(message => {
            displayMessage(message)
        })
        
        // Scroll to bottom
        container.scrollTop = container.scrollHeight
    } catch (error) {
        console.error('Error loading messages:', error)
    }
}

// Display a single message
function displayMessage(message) {
    const container = document.getElementById('messagesContainer')
    if (!container) return
    
    const currentUserId = getCurrentUserId()
    const isOwnMessage = message.SenderId === currentUserId
    
    const messageEl = document.createElement('div')
    messageEl.style.cssText = `
        display: flex;
        justify-content: ${isOwnMessage ? 'flex-end' : 'flex-start'};
        margin-bottom: 12px;
    `
    
    const bubble = document.createElement('div')
    bubble.style.cssText = `
        max-width: 60%;
        padding: 10px 14px;
        border-radius: 12px;
        background: ${isOwnMessage ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' : 'var(--bg)'};
        color: ${isOwnMessage ? 'white' : 'var(--text)'};
        border: ${isOwnMessage ? 'none' : '1px solid var(--border)'};
        word-wrap: break-word;
    `
    
    const content = document.createElement('div')
    content.textContent = message.Content
    content.style.fontSize = '14px'
    content.style.lineHeight = '1.5'
    
    const time = document.createElement('div')
    time.textContent = formatMessageTime(message.SentAt)
    time.style.fontSize = '11px'
    time.style.marginTop = '4px'
    time.style.opacity = isOwnMessage ? '0.8' : '0.6'
    
    bubble.appendChild(content)
    bubble.appendChild(time)
    messageEl.appendChild(bubble)
    container.appendChild(messageEl)
    
    // Scroll to bottom
    container.scrollTop = container.scrollHeight
}

// Format message time
function formatMessageTime(timestamp) {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now - date
    
    // Less than 1 minute
    if (diff < 60000) return 'Just now'
    
    // Less than 1 hour
    if (diff < 3600000) {
        const mins = Math.floor(diff / 60000)
        return `${mins} min${mins > 1 ? 's' : ''} ago`
    }
    
    // Today
    if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    }
    
    // This week
    if (diff < 604800000) {
        return date.toLocaleDateString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    }
    
    // Older
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// Send message
// sendMessage function is now defined in the CHANNELS FUNCTIONALITY section
// to handle both direct messages and channel messages

// Mark messages as read
async function markMessagesAsRead(otherUserId) {
    try {
        const userId = getCurrentUserId()
        if (!userId) return
        
        await fetch(`${API_BASE_URL}/api/messages/read`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userId,
                otherUserId: otherUserId
            })
        })
    } catch (error) {
        console.error('Error marking messages as read:', error)
    }
}

// Load unread count and update badge
async function loadUnreadCount() {
    try {
        const userId = getCurrentUserId()
        if (!userId) return
        
        const response = await fetch(`${API_BASE_URL}/api/messages/unread/${userId}`)
        const data = await response.json()
        
        const badge = document.getElementById('unreadMessagesBadge')
        if (!badge) return
        
        if (data.unreadCount > 0) {
            badge.textContent = data.unreadCount
            badge.style.display = 'flex'
        } else {
            badge.style.display = 'none'
        }
    } catch (error) {
        console.error('Error loading unread count:', error)
    }
}

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.createElement('div')
    toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: ${type === 'error' ? '#ef4444' : '#6366f1'};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        animation: slideIn 0.3s ease;
        font-size: 14px;
    `
    toast.textContent = message
    
    document.body.appendChild(toast)
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease'
        setTimeout(() => toast.remove(), 300)
    }, 3000)
}

// ==================== CHANNELS FUNCTIONALITY ====================

let currentChannelId = null

// Setup channel tabs
function setupChannelTabs() {
    const directTab = document.getElementById('directMessagesTab')
    const channelsTab = document.getElementById('channelsTab')
    const conversationsContainer = document.getElementById('conversationsContainer')
    const channelsContainer = document.getElementById('channelsContainer')
    const searchUsers = document.getElementById('searchUsers')
    const createChannelBtn = document.getElementById('createChannelBtn')

    if (directTab) {
        directTab.addEventListener('click', () => {
            // Switch to direct messages
            directTab.classList.add('active')
            directTab.style.color = 'var(--primary)'
            directTab.style.borderBottomColor = 'var(--primary)'
            
            channelsTab.classList.remove('active')
            channelsTab.style.color = 'var(--muted)'
            channelsTab.style.borderBottomColor = 'transparent'
            
            conversationsContainer.style.display = 'block'
            channelsContainer.style.display = 'none'
            createChannelBtn.style.display = 'none'
            searchUsers.placeholder = 'Search...'
            
            currentChannelId = null
            currentChatUserId = null
        })
    }

    if (channelsTab) {
        channelsTab.addEventListener('click', () => {
            // Switch to channels
            channelsTab.classList.add('active')
            channelsTab.style.color = 'var(--primary)'
            channelsTab.style.borderBottomColor = 'var(--primary)'
            
            directTab.classList.remove('active')
            directTab.style.color = 'var(--muted)'
            directTab.style.borderBottomColor = 'transparent'
            
            conversationsContainer.style.display = 'none'
            channelsContainer.style.display = 'block'
            createChannelBtn.style.display = 'block'
            searchUsers.placeholder = 'Search channels...'
            
            currentChatUserId = null
            loadChannels()
        })
    }

    if (createChannelBtn) {
        createChannelBtn.addEventListener('click', () => {
            openCreateChannelModal()
        })
    }
}

// Load user's channels
async function loadChannels() {
    try {
        const userId = getCurrentUserId()
        if (!userId) return

        const response = await fetch(`${API_BASE_URL}/api/channels/user/${userId}`)
        
        // Check if response is ok
        if (!response.ok) {
            console.warn('⚠️ Failed to load channels:', response.status)
            const container = document.getElementById('channelsContainer')
            if (container) {
                container.innerHTML = '<div style="padding:20px; text-align:center; color:var(--muted);">Unable to load channels. Please try again later.</div>'
            }
            return
        }
        
        const channels = await response.json()
        
        // Ensure channels is an array
        if (!Array.isArray(channels)) {
            console.warn('⚠️ Channels response is not an array:', channels)
            const container = document.getElementById('channelsContainer')
            if (container) {
                container.innerHTML = '<div style="padding:20px; text-align:center; color:var(--muted);">No channels yet. Create one to get started!</div>'
            }
            return
        }

        const container = document.getElementById('channelsContainer')
        if (!container) return

        container.innerHTML = ''

        if (channels.length === 0) {
            container.innerHTML = '<div style="padding:20px; text-align:center; color:var(--muted);">No channels yet. Create one to get started!</div>'
            return
        }

        channels.forEach(channel => {
            const item = document.createElement('div')
            item.className = 'channel-item'
            item.dataset.channelId = channel.Id
            item.style.cssText = `
                padding: 12px;
                border-radius: 8px;
                cursor: pointer;
                transition: background 0.2s;
                margin-bottom: 4px;
                display: flex;
                align-items: center;
                gap: 12px;
            `

            item.innerHTML = `
                <div style="width:40px; height:40px; border-radius:50%; background:linear-gradient(135deg, #10b981 0%, #34d399 100%); display:flex; align-items:center; justify-content:center; color:white; font-weight:600; flex-shrink:0;">
                    #
                </div>
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:600; font-size:14px; margin-bottom:2px;">${channel.Name}</div>
                    <div style="font-size:12px; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${channel.MemberCount} members
                    </div>
                </div>
            `

            item.addEventListener('mouseenter', () => {
                if (!item.classList.contains('active')) {
                    item.style.background = 'rgba(138, 162, 255, 0.1)'
                }
            })
            item.addEventListener('mouseleave', () => {
                if (!item.classList.contains('active')) {
                    item.style.background = 'transparent'
                }
            })
            item.addEventListener('click', () => {
                openChannel(channel)
            })

            container.appendChild(item)
        })
    } catch (error) {
        console.error('Error loading channels:', error)
    }
}

// Open channel chat
async function openChannel(channel) {
    currentChannelId = channel.Id
    currentChatUserId = null

    // Highlight selected channel
    document.querySelectorAll('.channel-item').forEach(item => {
        item.style.background = 'transparent'
        item.classList.remove('active')
    })

    const selectedItem = Array.from(document.querySelectorAll('.channel-item'))
        .find(item => item.dataset.channelId === channel.Id)

    if (selectedItem) {
        selectedItem.style.background = 'rgba(138, 162, 255, 0.15)'
        selectedItem.classList.add('active')
    }

    // Show chat area
    document.getElementById('noChatSelected').style.display = 'none'
    document.getElementById('chatHeader').style.display = 'block'
    document.getElementById('messagesContainer').style.display = 'block'
    document.getElementById('messageInput').style.display = 'block'

    // Update header
    document.getElementById('chatUserAvatar').textContent = '#'
    document.getElementById('chatUserName').textContent = channel.Name
    document.getElementById('chatUserStatus').textContent = `${channel.MemberCount} members`

    // Load channel messages
    await loadChannelMessages(channel.Id)

    // Join channel room via Socket.IO
    socket.emit('join-channel', { channelId: channel.Id, userId: getCurrentUserId() })
}

// Load channel messages
async function loadChannelMessages(channelId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/channels/${channelId}/messages`)
        const messages = await response.json()

        const container = document.getElementById('messagesContainer')
        if (!container) return

        container.innerHTML = ''

        messages.forEach(message => {
            displayChannelMessage(message)
        })

        container.scrollTop = container.scrollHeight
    } catch (error) {
        console.error('Error loading channel messages:', error)
    }
}

// Display channel message
function displayChannelMessage(message) {
    const container = document.getElementById('messagesContainer')
    if (!container) return

    const userId = getCurrentUserId()
    const isOwnMessage = message.SenderId === userId

    const messageEl = document.createElement('div')
    messageEl.style.cssText = `
        display: flex;
        justify-content: ${isOwnMessage ? 'flex-end' : 'flex-start'};
        margin-bottom: 12px;
    `

    const bubble = document.createElement('div')
    bubble.style.cssText = `
        max-width: 60%;
        padding: 10px 14px;
        border-radius: 12px;
        background: ${isOwnMessage ? 'linear-gradient(135deg, #10b981 0%, #34d399 100%)' : 'var(--bg)'};
        color: ${isOwnMessage ? 'white' : 'var(--text)'};
        border: ${isOwnMessage ? 'none' : '1px solid var(--border)'};
        word-wrap: break-word;
    `

    if (!isOwnMessage) {
        const sender = document.createElement('div')
        sender.textContent = message.SenderName || message.SenderUsername
        sender.style.fontSize = '12px'
        sender.style.fontWeight = '600'
        sender.style.marginBottom = '4px'
        sender.style.color = 'var(--primary)'
        bubble.appendChild(sender)
    }

    const content = document.createElement('div')
    content.textContent = message.Content
    content.style.fontSize = '14px'
    content.style.lineHeight = '1.5'

    const time = document.createElement('div')
    time.textContent = formatMessageTime(message.SentAt)
    time.style.fontSize = '11px'
    time.style.marginTop = '4px'
    time.style.opacity = isOwnMessage ? '0.8' : '0.6'

    bubble.appendChild(content)
    bubble.appendChild(time)
    messageEl.appendChild(bubble)
    container.appendChild(messageEl)

    container.scrollTop = container.scrollHeight
}

// Send message (handles both DM and channel)
async function sendMessage() {
    const textarea = document.getElementById('messageTextarea')
    const content = textarea.value.trim()

    if (!content) return

    const userId = getCurrentUserId()
    if (!userId) {
        showToast('You must be logged in to send messages', 'error')
        return
    }

    try {
        if (currentChannelId) {
            // Send channel message
            const response = await fetch(`${API_BASE_URL}/api/channels/${currentChannelId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ senderId: userId, content })
            })

            const data = await response.json()

            if (data.success) {
                // Emit to Socket.IO for real-time delivery
                socket.emit('channel-message', {
                    channelId: currentChannelId,
                    senderId: userId,
                    senderName: data.message.SenderName,
                    content: content,
                    sentAt: new Date().toISOString()
                })

                textarea.value = ''
            }
        } else if (currentChatUserId) {
            // Send direct message (existing code)
            const response = await fetch(`${API_BASE_URL}/api/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    senderId: userId,
                    recipientId: currentChatUserId,
                    content: content
                })
            })

            const data = await response.json()

            if (data.success) {
                displayMessage(data.message)
                textarea.value = ''
            }
        }
    } catch (error) {
        console.error('Error sending message:', error)
        showToast('Failed to send message', 'error')
    }
}

// Open create channel modal
async function openCreateChannelModal() {
    const modal = document.getElementById('createChannelDialog')
    if (!modal) return

    // Load all users for member selection
    try {
        const response = await fetch(`${API_BASE_URL}/api/users`)
        const users = await response.json()
        const userId = getCurrentUserId()

        const membersList = document.getElementById('channelMembersList')
        if (!membersList) return

        membersList.innerHTML = ''

        users.forEach(user => {
            if (user.Id === userId) return // Skip self

            const label = document.createElement('label')
            label.style.cssText = 'display:flex; align-items:center; gap:8px; padding:8px; cursor:pointer; border-radius:4px; transition:background 0.2s;'
            label.onmouseenter = () => label.style.background = 'var(--bg)'
            label.onmouseleave = () => label.style.background = 'transparent'

            const checkbox = document.createElement('input')
            checkbox.type = 'checkbox'
            checkbox.value = user.Id
            checkbox.className = 'channel-member-checkbox'

            const name = document.createElement('span')
            name.textContent = user.FullName || user.Username

            label.appendChild(checkbox)
            label.appendChild(name)
            membersList.appendChild(label)
        })

        modal.showModal()
    } catch (error) {
        console.error('Error loading users:', error)
        showToast('Failed to load users', 'error')
    }
}

// Setup create channel modal
function setupCreateChannelModal() {
    const submitBtn = document.getElementById('createChannelSubmit')

    if (submitBtn) {
        submitBtn.addEventListener('click', async () => {
            const name = document.getElementById('channelName').value.trim()
            const description = document.getElementById('channelDescription').value.trim()
            const checkboxes = document.querySelectorAll('.channel-member-checkbox:checked')
            const memberIds = Array.from(checkboxes).map(cb => cb.value)

            if (!name) {
                showToast('Please enter a channel name', 'error')
                return
            }

            try {
                const response = await fetch(`${API_BASE_URL}/api/channels`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name,
                        description,
                        createdBy: getCurrentUserId(),
                        memberIds
                    })
                })

                const data = await response.json()

                if (data.success) {
                    showToast(`Channel "${data.name}" created!`, 'info')
                    document.getElementById('createChannelDialog').close()
                    document.getElementById('channelName').value = ''
                    document.getElementById('channelDescription').value = ''
                    loadChannels()
                } else {
                    showToast('Failed to create channel', 'error')
                }
            } catch (error) {
                console.error('Error creating channel:', error)
                showToast('Failed to create channel', 'error')
            }
        })
    }
}

// Initialize everything
document.addEventListener('DOMContentLoaded', () => {
    setupMessageModal()
    setupChannelTabs()
    setupCreateChannelModal()
    initMessaging()
    
    // Initialize setup wizard and check database
    initializeSetupWizard()
})

// Note: initMessaging() is now called in showApp() after login to ensure DOM is ready

// ========== SETUP WIZARD ==========
let wizardConfig = {
    server: '',
    database: '',
    authType: 'windows',
    user: '',
    password: '',
    encrypt: false,
    trustCert: true
}

async function initializeSetupWizard() {
    console.log('🔍 Checking database configuration...')
    
    // Check if database is configured
    const dbConfig = await window.electronAPI.getDbConfig()
    console.log('📊 DB Config:', dbConfig)
    
    if (!dbConfig || !dbConfig.connected) {
        console.log('⚠️ Database not configured, showing setup wizard')
        showSetupWizard()
        return
    }
    
    // Test if connection works
    const testResult = await window.electronAPI.testDbConnection(dbConfig)
    console.log('🧪 Connection test:', testResult)
    
    if (!testResult || !testResult.success) {
        console.log('❌ Database connection failed, showing setup wizard')
        showSetupWizard()
        return
    }
    
    console.log('✅ Database is configured and working')
    
    // Database is ready - show login screen
    showLoginScreen()
}

function showSetupWizard() {
    const setupWizard = document.getElementById('setupWizard')
    const loginScreen = document.getElementById('loginScreen')
    
    if (setupWizard) {
        setupWizard.style.display = 'flex'
    }
    
    if (loginScreen) {
        loginScreen.style.display = 'none'
    }
    
    // Setup wizard event listeners
    setupWizardListeners()
}

function hideSetupWizard() {
    const setupWizard = document.getElementById('setupWizard')
    if (setupWizard) {
        setupWizard.style.display = 'none'
    }
}

function setupWizardListeners() {
    // Auth type change handler
    const authTypeSelect = document.getElementById('setupAuthType')
    const sqlAuthFields = document.getElementById('setupSqlAuthFields')
    
    if (authTypeSelect) {
        authTypeSelect.addEventListener('change', (e) => {
            if (e.target.value === 'sql') {
                sqlAuthFields.style.display = 'block'
            } else {
                sqlAuthFields.style.display = 'none'
            }
        })
    }
    
    // Test connection button
    const testBtn = document.getElementById('setupTestConnectionBtn')
    if (testBtn) {
        testBtn.addEventListener('click', testSetupConnection)
    }
    
    // Next button (Step 1 -> Step 2)
    const nextBtn = document.getElementById('setupNextBtn')
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            goToSetupStep(2)
        })
    }
    
    // Back button
    const backBtn = document.getElementById('setupBackBtn')
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            goToSetupStep(1)
        })
    }
    
    // Create DB button
    const createDbBtn = document.getElementById('setupCreateDbBtn')
    if (createDbBtn) {
        createDbBtn.addEventListener('click', createDatabaseAndMigrate)
    }
    
    // Finish button
    const finishBtn = document.getElementById('setupFinishBtn')
    if (finishBtn) {
        finishBtn.addEventListener('click', () => {
            hideSetupWizard()
            showLoginScreen()
        })
    }
}

async function testSetupConnection() {
    const statusEl = document.getElementById('setupConnectionStatus')
    const nextBtn = document.getElementById('setupNextBtn')
    const testBtn = document.getElementById('setupTestConnectionBtn')
    
    // Collect form data
    wizardConfig = {
        server: document.getElementById('setupServerName').value.trim(),
        database: document.getElementById('setupDatabaseName').value.trim(),
        authType: document.getElementById('setupAuthType').value,
        user: document.getElementById('setupUsername').value.trim(),
        password: document.getElementById('setupPassword').value,
        encrypt: document.getElementById('setupEncrypt').checked,
        trustCert: document.getElementById('setupTrustCert').checked
    }
    
    if (!wizardConfig.server || !wizardConfig.database) {
        showSetupStatus('Please enter server name and database name', 'error')
        return
    }
    
    // Disable button and show loading
    testBtn.disabled = true
    testBtn.innerHTML = '<div class="spinner-ring" style="width:16px; height:16px; border-width:2px; margin-right:8px;"></div> Testing...'
    
    try {
        console.log('🧪 Testing connection with config:', wizardConfig)
        const result = await window.electronAPI.testDbConnection(wizardConfig)
        console.log('📊 Test result:', result)
        
        if (result && result.success) {
            showSetupStatus('✅ Connection successful! Click Next to continue.', 'success')
            nextBtn.disabled = false
        } else {
            // Check if error is due to database not existing (which is expected)
            const errorMsg = result?.error || 'Unknown error'
            const isDatabaseError = errorMsg.includes('Cannot open database') || 
                                   errorMsg.includes('Login failed') ||
                                   errorMsg.includes('database') ||
                                   errorMsg.includes('Database')
            
            if (isDatabaseError) {
                showSetupStatus('⚠️ Server connection OK, but database doesn\'t exist yet. Click Next to create it.', 'success')
                nextBtn.disabled = false
            } else {
                showSetupStatus(`❌ Connection failed: ${errorMsg}`, 'error')
                nextBtn.disabled = true
            }
        }
    } catch (error) {
        console.error('Connection test error:', error)
        showSetupStatus(`❌ Connection failed: ${error.message}`, 'error')
        nextBtn.disabled = true
    } finally {
        testBtn.disabled = false
        testBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px;">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Test Connection
        `
    }
}

function showSetupStatus(message, type) {
    const statusEl = document.getElementById('setupConnectionStatus')
    if (statusEl) {
        statusEl.textContent = message
        statusEl.style.display = 'flex'
        statusEl.className = 'setup-status is-' + type
    }
}

function goToSetupStep(stepNumber) {
    // Hide all steps
    for (let i = 1; i <= 4; i++) {
        const step = document.getElementById(`setupStep${i}`)
        if (step) step.style.display = 'none'
    }
    
    // Show target step
    const targetStep = document.getElementById(`setupStep${stepNumber}`)
    if (targetStep) {
        targetStep.style.display = 'block'
    }
    
    // Special handling for step 2 - check if database exists
    if (stepNumber === 2) {
        checkDatabaseExists()
    }
}

async function checkDatabaseExists() {
    try {
        // Try connecting to the specific database
        const testResult = await window.electronAPI.testDbConnection(wizardConfig)
        
        if (testResult && testResult.success) {
            // Database exists
            document.getElementById('setupDbExistsMessage').style.display = 'flex'
            document.getElementById('setupDbNotExistsMessage').style.display = 'none'
            document.getElementById('setupCreateDbBtn').innerHTML = 'Setup Database Schema'
        } else {
            // Database doesn't exist
            document.getElementById('setupDbExistsMessage').style.display = 'none'
            document.getElementById('setupDbNotExistsMessage').style.display = 'flex'
            document.getElementById('setupCreateDbBtn').innerHTML = 'Create Database & Setup Schema'
        }
    } catch (error) {
        document.getElementById('setupDbExistsMessage').style.display = 'none'
        document.getElementById('setupDbNotExistsMessage').style.display = 'flex'
        document.getElementById('setupCreateDbBtn').innerHTML = 'Create Database & Setup Schema'
    }
}

async function createDatabaseAndMigrate() {
    const createBtn = document.getElementById('setupCreateDbBtn')
    const statusEl = document.getElementById('setupDbStatus')
    
    createBtn.disabled = true
    createBtn.innerHTML = '<div class="spinner-ring" style="width:16px; height:16px; border-width:2px; margin-right:8px;"></div> Creating...'
    
    try {
        // Try to create database (will fail gracefully if it exists)
        console.log('📦 Attempting to create database...')
        const createResult = await window.electronAPI.createDatabase(wizardConfig)
        console.log('📊 Create DB result:', createResult)
        
        if (createResult && createResult.error && !createResult.error.includes('already exists')) {
            throw new Error(createResult.error)
        }
        
        // Move to step 3 (migrations)
        goToSetupStep(3)
        
        // Run migrations
        await runMigrations()
        
    } catch (error) {
        console.error('Database creation error:', error)
        if (statusEl) {
            statusEl.textContent = `❌ Failed: ${error.message}`
            statusEl.style.display = 'flex'
            statusEl.className = 'setup-status is-error'
        }
        createBtn.disabled = false
        createBtn.innerHTML = 'Create Database & Setup Schema'
    }
}

async function runMigrations() {
    const progressFill = document.getElementById('setupMigrationProgress')
    const statusText = document.getElementById('setupMigrationStatus')
    const migrationsList = document.getElementById('setupMigrationsList')
    
    try {
        statusText.textContent = 'Creating database schema...'
        progressFill.style.width = '20%'
        
        console.log('🔧 Running migrations...')
        const migrationResult = await window.electronAPI.runMigrations(wizardConfig)
        console.log('📊 Migration result:', migrationResult)
        
        if (!migrationResult || !migrationResult.success) {
            throw new Error(migrationResult?.error || 'Migration failed')
        }
        
        progressFill.style.width = '70%'
        statusText.textContent = 'Schema created successfully!'
        
        // Show migrations list
        if (migrationResult.migrations && migrationsList) {
            migrationsList.innerHTML = migrationResult.migrations.map(m => 
                `<div class="setup-migration-item is-complete">✓ ${m}</div>`
            ).join('')
        }
        
        // Create default admin user
        statusText.textContent = 'Creating default admin user...'
        await createDefaultAdmin()
        
        progressFill.style.width = '90%'
        
        // Save config
        statusText.textContent = 'Saving configuration...'
        const saveResult = await window.electronAPI.saveDbConfig({
            ...wizardConfig,
            connected: true
        })
        
        console.log('💾 Config saved:', saveResult)
        
        progressFill.style.width = '100%'
        statusText.textContent = 'Setup complete!'
        
        // Wait a moment then show completion step
        setTimeout(() => {
            goToSetupStep(4)
        }, 1000)
        
    } catch (error) {
        console.error('Migration error:', error)
        statusText.textContent = `❌ Migration failed: ${error.message}`
        progressFill.style.width = '0%'
    }
}

async function createDefaultAdmin() {
    try {
        // Create default admin user in database
        const adminId = uid()
        await window.electronAPI.dbExecute(
            `INSERT INTO Users (id, username, password, name, email, role, position, squad, lastLogin, lastActivity, ip, isActive, changePasswordOnLogin, created_at) 
             VALUES (@param0, @param1, @param2, @param3, @param4, @param5, @param6, @param7, @param8, @param9, @param10, @param11, @param12, GETDATE())`,
            [
                { value: adminId },
                { value: 'admin' },
                { value: 'admin' },
                { value: 'Administrator' },
                { value: 'admin@orbishub.com' },
                { value: 'Super Admin' },
                { value: 'System Administrator' },
                { value: 'IT Operations' },
                { value: Date.now() },
                { value: Date.now() },
                { value: getLocalIP() },
                { value: 1 },
                { value: 1 } // Force password change on first login
            ]
        )
        
        console.log('✅ Default admin user created')
    } catch (error) {
        console.error('Failed to create default admin:', error)
        throw error
    }
}

