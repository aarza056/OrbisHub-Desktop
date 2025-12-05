/**
 * Password Manager UI Controller
 * Handles all UI interactions for the password manager
 */

(function () {
  if (!window || !window.PasswordService) {
    console.error('Password UI: PasswordService not available');
    return;
  }

  const service = window.PasswordService;
  let currentFilter = { category: null, search: '', favorites: false };
  let currentPassword = null;
  let allPasswords = [];
  let categories = [];

  // Category icon mapping (fallback for database emoji issues)
  const CATEGORY_ICONS = {
    'Personal': '👤',
    'Work': '💼',
    'Financial': '💳',
    'Social Media': '📱',
    'Email': '📧',
    'Development': '💻',
    'Database': '🗄️',
    'Server': '🖥️',
    'Other': '📝'
  };

  // ==================== INITIALIZATION ====================

  let eventListenersSetup = false;

  async function initPasswordManager() {
    try {
      // Reset filters to default state when view is shown
      currentFilter = { category: null, search: '', favorites: false };
      currentPassword = null;

      // Load categories
      const categoriesResult = await service.getCategories();
      if (categoriesResult.success) {
        categories = categoriesResult.data;
        renderCategories();
      }

      // Load passwords
      await loadPasswords();

      // Set up event listeners only once
      if (!eventListenersSetup) {
        setupEventListeners();
        eventListenersSetup = true;
      }
    } catch (error) {
      showError('Failed to initialize Password Manager');
    }
  }

  function setupEventListeners() {
    // Search
    const searchInput = document.getElementById('passwordSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        currentFilter.search = e.target.value;
        filterPasswords();
      });
    }

    // Add password button
    const addBtn = document.getElementById('addPasswordBtn');
    if (addBtn) {
      addBtn.addEventListener('click', () => openPasswordModal());
    }

    // Favorites filter
    const favoritesBtn = document.getElementById('passwordFavoritesFilter');
    if (favoritesBtn) {
      favoritesBtn.addEventListener('click', () => {
        currentFilter.favorites = !currentFilter.favorites;
        favoritesBtn.classList.toggle('active', currentFilter.favorites);
        filterPasswords();
      });
    }

    // Manage categories button
    const manageCategoriesBtn = document.getElementById('manageCategoriesBtn');
    if (manageCategoriesBtn) {
      manageCategoriesBtn.addEventListener('click', () => openCategoryModal());
    }
  }

  async function loadPasswords() {
    const result = await service.getPasswords(currentFilter);
    if (result.success) {
      allPasswords = result.data;
      renderPasswordList();
      renderCategories();
    } else {
      showError('Failed to load passwords');
    }
  }

  function filterPasswords() {
    const filtered = allPasswords.filter(p => {
      const matchesSearch = !currentFilter.search || 
        p.name.toLowerCase().includes(currentFilter.search.toLowerCase()) ||
        p.username.toLowerCase().includes(currentFilter.search.toLowerCase()) ||
        (p.url && p.url.toLowerCase().includes(currentFilter.search.toLowerCase()));
      
      const matchesCategory = !currentFilter.category || p.category === currentFilter.category;
      const matchesFavorites = !currentFilter.favorites || p.is_favorite;

      return matchesSearch && matchesCategory && matchesFavorites;
    });

    renderPasswordList(filtered);
    renderCategories();
  }

  // ==================== RENDERING ====================

  function renderCategories() {
    const container = document.getElementById('passwordCategoryList');
    if (!container) return;

    const categoryCounts = {};
    allPasswords.forEach(p => {
      const cat = p.category || 'Other';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    let html = `
      <div class="password-category-item ${!currentFilter.category ? 'active' : ''}" data-category="">
        <span class="password-category-icon">📂</span>
        <span class="password-category-name">All Passwords</span>
        <span class="password-category-count">${allPasswords.length}</span>
      </div>
    `;

    categories.forEach(cat => {
      const count = categoryCounts[cat.name] || 0;
      const icon = CATEGORY_ICONS[cat.name] || cat.icon || '📝';
      html += `
        <div class="password-category-item ${currentFilter.category === cat.name ? 'active' : ''}" data-category="${cat.name}">
          <span class="password-category-icon">${icon}</span>
          <span class="password-category-name">${cat.name}</span>
          <span class="password-category-count">${count}</span>
        </div>
      `;
    });

    container.innerHTML = html;

    // Add click handlers
    container.querySelectorAll('.password-category-item').forEach(item => {
      item.addEventListener('click', () => {
        const category = item.dataset.category;
        currentFilter.category = category || null;
        filterPasswords();
        renderCategories();
      });
    });
  }

  function renderPasswordList(passwords = allPasswords) {
    const container = document.getElementById('passwordListContainer');
    if (!container) return;

    if (passwords.length === 0) {
      container.innerHTML = `
        <div style="padding: 48px; text-align: center; color: var(--muted);">
          <div style="font-size: 64px; margin-bottom: 16px;">🔐</div>
          <div style="font-weight: 600; font-size: 18px; margin-bottom: 8px;">No passwords found</div>
          <div style="font-size: 14px;">Add your first password to get started</div>
        </div>
      `;
      return;
    }

    let html = `
      <table class="password-table">
        <thead>
          <tr>
            <th style="width: 50px;"></th>
            <th>Name</th>
            <th>Username</th>
            <th>Password</th>
            <th>Category</th>
            <th>URL</th>
            <th style="width: 140px;">Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    passwords.forEach(p => {
      const category = categories.find(c => c.name === p.category);
      const icon = CATEGORY_ICONS[p.category] || (category && category.icon) || '📝';
      const color = category ? category.color : '#6b7280';
      const passwordMask = '•'.repeat(12);
      const isActive = currentPassword && currentPassword.id === p.id ? 'active' : '';
      
      html += `
        <tr class="password-table-row ${isActive}" data-id="${p.id}">
          <td>
            <div class="password-table-icon" style="background: ${color}20; color: ${color};">
              ${icon}
            </div>
          </td>
          <td>
            <div class="password-table-name">
              ${p.is_favorite ? '<span style="margin-right: 6px;">⭐</span>' : ''}
              ${escapeHtml(p.name)}
            </div>
          </td>
          <td class="password-table-username">
            <div class="password-table-password">
              <span>${escapeHtml(p.username)}</span>
              <button class="btn-icon btn-icon-sm" onclick="event.stopPropagation(); window.PasswordUI.copyUsername(${p.id}, '${escapeHtml(p.username)}')" title="Copy Username">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </div>
          </td>
          <td>
            <div class="password-table-password">
              <span class="password-masked">${passwordMask}</span>
              <button class="btn-icon btn-icon-sm" onclick="event.stopPropagation(); window.PasswordUI.copyPassword(${p.id})" title="Copy Password">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </div>
          </td>
          <td>
            <span class="password-category-badge" style="background: ${color}20; color: ${color};">
              ${p.category || 'Other'}
            </span>
          </td>
          <td class="password-table-url">${p.url ? escapeHtml(p.url) : '-'}</td>
          <td>
            <div class="password-table-actions">
              <button class="btn-icon" onclick="event.stopPropagation(); window.PasswordUI.editPassword(${p.id})" title="Edit">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button class="btn-icon btn-icon-danger" onclick="event.stopPropagation(); window.PasswordUI.deletePassword(${p.id})" title="Delete">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
    `;

    container.innerHTML = html;

    // Add click handlers to rows
    container.querySelectorAll('.password-table-row').forEach(row => {
      row.addEventListener('click', () => {
        const id = parseInt(row.dataset.id);
        loadPasswordDetail(id);
      });
    });
  }

  async function loadPasswordDetail(id) {
    const result = await service.getPassword(id);
    if (result.success) {
      currentPassword = result.data;
      renderPasswordDetail();
      renderPasswordList(); // Update list to show active item
      
      // Show detail panel
      const detailPanel = document.getElementById('passwordDetailPanel');
      if (detailPanel) {
        detailPanel.style.display = 'flex';
      }
    } else {
      showError('Failed to load password details');
    }
  }

  function renderPasswordDetail() {
    const container = document.getElementById('passwordDetailContainer');
    if (!container || !currentPassword) return;

    const category = categories.find(c => c.name === currentPassword.category) || { icon: '📝', color: '#6b7280' };
    const createdDate = new Date(currentPassword.created_at).toLocaleDateString();
    const updatedDate = new Date(currentPassword.updated_at).toLocaleDateString();

    container.innerHTML = `
      <div class="password-detail">
        <div class="password-detail-header">
          <div class="password-detail-icon" style="background: ${category.color}20; color: ${category.color};">
            ${category.icon}
          </div>
          <div class="password-detail-info">
            <div class="password-detail-name">${escapeHtml(currentPassword.name)}</div>
            <div class="password-detail-meta">
              <span>Created: ${createdDate}</span>
              <span>Updated: ${updatedDate}</span>
              ${currentPassword.is_favorite ? '<span style="color: var(--warning);">⭐ Favorite</span>' : ''}
            </div>
          </div>
          <div class="password-header-actions">
            <button class="btn btn-secondary" onclick="window.PasswordUI.editPassword(${currentPassword.id})">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
              Edit
            </button>
            <button class="btn btn-danger" onclick="window.PasswordUI.deletePassword(${currentPassword.id})">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              Delete
            </button>
          </div>
        </div>

        <div class="password-detail-section">
          <div class="password-detail-label">Username</div>
          <div class="password-detail-value">
            <span style="flex: 1;">${escapeHtml(currentPassword.username)}</span>
            <div class="password-detail-actions">
              <button class="password-action-btn" onclick="window.PasswordUI.copyToClipboard('${escapeHtml(currentPassword.username)}', this)" title="Copy username">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div class="password-detail-section">
          <div class="password-detail-label">Password</div>
          <div class="password-detail-value password-field">
            <input type="password" value="${escapeHtml(currentPassword.password_decrypted)}" readonly id="passwordField_${currentPassword.id}" style="flex: 1;">
            <div class="password-detail-actions">
              <button class="password-action-btn" onclick="window.PasswordUI.togglePasswordVisibility(${currentPassword.id})" title="Show/Hide password" id="toggleBtn_${currentPassword.id}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
              <button class="password-action-btn" onclick="window.PasswordUI.copyToClipboard('${escapeHtml(currentPassword.password_decrypted)}', this)" title="Copy password">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>

        ${currentPassword.url ? `
        <div class="password-detail-section">
          <div class="password-detail-label">URL</div>
          <div class="password-detail-value">
            <span style="flex: 1;">${escapeHtml(currentPassword.url)}</span>
            <div class="password-detail-actions">
              <button class="password-action-btn" onclick="window.PasswordUI.copyToClipboard('${escapeHtml(currentPassword.url)}', this)" title="Copy URL">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
        ` : ''}

        ${currentPassword.notes ? `
        <div class="password-detail-section">
          <div class="password-detail-label">Notes</div>
          <div class="password-detail-value notes-field">${escapeHtml(currentPassword.notes)}</div>
        </div>
        ` : ''}

        <div class="password-detail-section">
          <div class="password-detail-label">Category</div>
          <div class="password-detail-value">
            <span style="display: flex; align-items: center; gap: 8px;">
              <span>${category.icon}</span>
              <span>${escapeHtml(currentPassword.category || 'Other')}</span>
            </span>
          </div>
        </div>
      </div>
    `;
  }

  // ==================== PASSWORD MODAL ====================

  function openPasswordModal(password = null) {
    // Close any existing modal first
    closePasswordModal();
    
    const isEdit = !!password;
    const modalHtml = `
      <div class="password-modal" id="passwordModal">
        <div class="password-modal-content">
          <div class="password-modal-header">
            <div class="password-modal-title">${isEdit ? 'Edit Password' : 'Add New Password'}</div>
            <button class="password-modal-close" onclick="window.PasswordUI.closePasswordModal()">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div class="password-modal-body">
            <form id="passwordForm">
              <div class="password-form-group">
                <label class="password-form-label required">Name</label>
                <input type="text" class="password-form-input" id="passwordName" placeholder="e.g., Gmail Account" value="${password ? escapeHtml(password.name) : ''}" required>
              </div>

              <div class="password-form-group">
                <label class="password-form-label required">Username / Email</label>
                <input type="text" class="password-form-input" id="passwordUsername" placeholder="username@example.com" value="${password ? escapeHtml(password.username) : ''}" required>
              </div>

              <div class="password-form-group">
                <label class="password-form-label required">Password</label>
                <div style="position: relative;">
                  <input type="password" class="password-form-input" id="passwordPassword" placeholder="Enter password" value="${password ? escapeHtml(password.password_decrypted) : ''}" required>
                  <button type="button" class="password-action-btn" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%);" onclick="window.PasswordUI.toggleModalPasswordVisibility()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  </button>
                </div>
                <div class="password-strength" id="passwordStrength"></div>
              </div>

              <div class="password-form-group">
                <label class="password-form-label required">Confirm Password</label>
                <div style="position: relative;">
                  <input type="password" class="password-form-input" id="passwordConfirm" placeholder="Confirm password" value="${password ? escapeHtml(password.password_decrypted) : ''}" required>
                  <button type="button" class="password-action-btn" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%);" onclick="window.PasswordUI.toggleConfirmPasswordVisibility()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  </button>
                </div>
              </div>

              <div class="password-form-group">
                <label class="password-form-label">URL</label>
                <input type="url" class="password-form-input" id="passwordUrl" placeholder="https://example.com" value="${password ? escapeHtml(password.url || '') : ''}">
              </div>

              <div class="password-form-group">
                <label class="password-form-label">Category</label>
                <select class="password-form-select" id="passwordCategory">
                  ${categories.map(cat => `
                    <option value="${cat.name}" ${password && password.category === cat.name ? 'selected' : ''}>
                      ${cat.icon} ${cat.name}
                    </option>
                  `).join('')}
                </select>
              </div>

              <div class="password-form-group">
                <label class="password-form-label">Notes</label>
                <textarea class="password-form-input password-form-textarea" id="passwordNotes" placeholder="Additional notes...">${password ? escapeHtml(password.notes || '') : ''}</textarea>
              </div>

              <div class="password-form-group">
                <label class="password-generator-option">
                  <input type="checkbox" id="passwordFavorite" ${password && password.is_favorite ? 'checked' : ''}> Mark as favorite
                </label>
              </div>
            </form>
          </div>
          <div class="password-modal-footer">
            <button class="btn btn-secondary" onclick="window.PasswordUI.closePasswordModal()">Cancel</button>
            <button class="btn btn-primary" onclick="window.PasswordUI.savePassword(${password ? password.id : 'null'})">${isEdit ? 'Update' : 'Create'} Password</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Set up password strength checker
    const passwordInput = document.getElementById('passwordPassword');
    passwordInput.addEventListener('input', updatePasswordStrength);

    updatePasswordStrength();
  }

  function closePasswordModal() {
    const modal = document.getElementById('passwordModal');
    if (modal) modal.remove();
  }

  async function savePassword(id) {
    const name = document.getElementById('passwordName').value.trim();
    const username = document.getElementById('passwordUsername').value.trim();
    const password = document.getElementById('passwordPassword').value;
    const confirmPassword = document.getElementById('passwordConfirm').value;
    const url = document.getElementById('passwordUrl').value.trim();
    const category = document.getElementById('passwordCategory').value;
    const notes = document.getElementById('passwordNotes').value.trim();
    const isFavorite = document.getElementById('passwordFavorite').checked;

    if (!name || !username || !password) {
      showError('Please fill in all required fields');
      return;
    }

    if (password !== confirmPassword) {
      showError('Passwords do not match');
      return;
    }

    const data = { name, username, password, url, category, notes, isFavorite };
    
    let result;
    if (id) {
      result = await service.updatePassword(id, data);
    } else {
      result = await service.createPassword(data);
    }

    if (result.success) {
      showToast(id ? 'Password updated successfully' : 'Password created successfully', 'success');
      closePasswordModal();
      
      // Reset filter to show all passwords so the new/updated password is visible
      currentFilter = { category: null, search: '', favorites: false };
      
      await loadPasswords();
      if (id) {
        loadPasswordDetail(id);
      }
    } else {
      showError(result.error || 'Failed to save password');
    }
  }

  async function editPassword(id) {
    const result = await service.getPassword(id);
    if (result.success) {
      openPasswordModal(result.data);
    }
  }

  let pendingDeletePasswordId = null;

  function deletePassword(id) {
    // Store the ID and show confirmation modal
    pendingDeletePasswordId = id;
    const modal = document.getElementById('deletePasswordConfirmModal');
    if (modal) {
      modal.style.display = 'flex';
    }
  }

  function closeDeletePasswordModal() {
    pendingDeletePasswordId = null;
    const modal = document.getElementById('deletePasswordConfirmModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  async function confirmDeletePassword() {
    if (!pendingDeletePasswordId) return;

    const id = pendingDeletePasswordId;
    const modal = document.getElementById('deletePasswordConfirmModal');
    const confirmBtn = document.getElementById('deletePasswordConfirmBtn');

    // Update button state
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<div class="spinner-ring" style="width:12px; height:12px; border-width:2px; display:inline-block; margin-right:4px;"></div> Deleting...';
    }

    const result = await service.deletePassword(id);
    
    // Reset button state
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Delete';
    }

    if (result.success) {
      // Close modal
      closeDeletePasswordModal();
      
      showToast('Password deleted successfully', 'success');
      currentPassword = null;
      const container = document.getElementById('passwordDetailContainer');
      if (container) {
        container.innerHTML = `
          <div class="password-empty">
            <div class="password-empty-icon">🔐</div>
            <div class="password-empty-title">Select a password</div>
            <div class="password-empty-description">Choose a password from the list to view its details</div>
          </div>
        `;
      }
      await loadPasswords();
    } else {
      showError('Failed to delete password');
    }
  }

  // ==================== UTILITIES ====================

  function togglePasswordVisibility(id) {
    const field = document.getElementById(`passwordField_${id}`);
    const btn = document.getElementById(`toggleBtn_${id}`);
    if (field.type === 'password') {
      field.type = 'text';
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>
      `;
    } else {
      field.type = 'password';
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      `;
    }
  }

  function toggleModalPasswordVisibility() {
    const field = document.getElementById('passwordPassword');
    field.type = field.type === 'password' ? 'text' : 'password';
  }

  function toggleConfirmPasswordVisibility() {
    const field = document.getElementById('passwordConfirm');
    field.type = field.type === 'password' ? 'text' : 'password';
  }

  async function copyToClipboard(text, button) {
    try {
      await navigator.clipboard.writeText(text);
      button.classList.add('copied');
      button.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;
      setTimeout(() => {
        button.classList.remove('copied');
        button.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        `;
      }, 2000);
      showToast('Copied to clipboard', 'success');
    } catch (err) {
      showError('Failed to copy to clipboard');
    }
  }

  function generatePassword() {
    const length = parseInt(document.getElementById('genLength').value);
    const useUppercase = document.getElementById('genUppercase').checked;
    const useLowercase = document.getElementById('genLowercase').checked;
    const useNumbers = document.getElementById('genNumbers').checked;
    const useSymbols = document.getElementById('genSymbols').checked;

    let chars = '';
    if (useUppercase) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (useLowercase) chars += 'abcdefghijklmnopqrstuvwxyz';
    if (useNumbers) chars += '0123456789';
    if (useSymbols) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';

    if (!chars) {
      showError('Please select at least one character type');
      return;
    }

    let password = '';
    for (let i = 0; i < length; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    document.getElementById('passwordPassword').value = password;
    updatePasswordStrength();
  }

  function updatePasswordStrength() {
    const password = document.getElementById('passwordPassword').value;
    const strengthContainer = document.getElementById('passwordStrength');
    
    if (!password) {
      strengthContainer.innerHTML = '';
      return;
    }

    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;

    const colors = ['#dc2626', '#f59e0b', '#f59e0b', '#10b981', '#10b981'];
    const labels = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];
    const percent = (strength / 5) * 100;

    strengthContainer.innerHTML = `
      <div class="password-strength-bar">
        <div class="password-strength-fill" style="width: ${percent}%; background: ${colors[strength - 1]};"></div>
      </div>
      <div class="password-strength-text">Strength: ${labels[strength - 1]}</div>
    `;
  }

  async function copyPassword(id) {
    try {
      const result = await service.getPassword(id);
      if (result.success && result.data) {
        await navigator.clipboard.writeText(result.data.password_decrypted);
        await service.logPasswordAccess(id, 'copy');
        showToast('Password copied to clipboard', 'success');
      } else {
        showError('Failed to load password');
      }
    } catch (error) {
      showError('Failed to copy password');
    }
  }

  async function copyUsername(id, username) {
    try {
      await navigator.clipboard.writeText(username);
      showToast('Username copied to clipboard', 'success');
    } catch (error) {
      showError('Failed to copy username');
    }
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function showToast(message, type = 'info') {
    if (window.showToast) {
      window.showToast(message, type);
    } else {
      alert(message);
    }
  }

  function showError(message) {
    showToast(message, 'error');
  }

  // ==================== CATEGORY MANAGEMENT ====================

  function openCategoryModal() {
    renderCategoryList();
    document.getElementById('manageCategoriesModal').style.display = 'flex';
  }

  function closeCategoryModal() {
    document.getElementById('manageCategoriesModal').style.display = 'none';
  }

  function renderCategoryList() {
    const container = document.getElementById('categoryListEdit');
    if (!container) return;

    const categoryCounts = {};
    allPasswords.forEach(p => {
      const cat = p.category || 'Other';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    let html = '';
    categories.forEach(cat => {
      const count = categoryCounts[cat.name] || 0;
      const icon = CATEGORY_ICONS[cat.name] || cat.icon || '📝';
      html += `
        <div class="category-edit-item">
          <div class="category-edit-icon" style="background: ${cat.color}20; color: ${cat.color};">
            ${icon}
          </div>
          <div class="category-edit-info">
            <div class="category-edit-name">${escapeHtml(cat.name)}</div>
            <div class="category-edit-count">${count} password${count !== 1 ? 's' : ''}</div>
          </div>
          <div class="category-edit-actions">
            <button class="btn-icon category-edit-btn" data-id="${cat.id}" data-name="${escapeHtml(cat.name)}" data-color="${cat.color}" data-icon="${icon}" title="Edit">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button class="btn-icon btn-icon-danger category-delete-btn" data-id="${cat.id}" data-name="${escapeHtml(cat.name)}" data-count="${count}" title="Delete">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html || '<div style="text-align: center; padding: 20px; color: var(--muted);">No categories</div>';

    // Add event listeners
    container.querySelectorAll('.category-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const name = btn.dataset.name;
        const color = btn.dataset.color;
        const icon = btn.dataset.icon;
        editCategory(id, name, color, icon);
      });
    });

    container.querySelectorAll('.category-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const name = btn.dataset.name;
        const count = parseInt(btn.dataset.count);
        deleteCategory(id, name, count);
      });
    });
  }

  function addNewCategory() {
    document.getElementById('categoryModalTitle').textContent = 'Add Category';
    document.getElementById('categoryEditId').value = '';
    document.getElementById('categoryEditName').value = '';
    document.getElementById('categoryEditIcon').value = '📝';
    document.getElementById('categoryEditModal').style.display = 'flex';
  }

  function editCategory(id, name, color, icon) {
    document.getElementById('categoryModalTitle').textContent = 'Edit Category';
    document.getElementById('categoryEditId').value = id;
    document.getElementById('categoryEditName').value = name;
    document.getElementById('categoryEditIcon').value = icon;
    document.getElementById('categoryEditModal').style.display = 'flex';
  }

  function closeCategoryEditModal() {
    document.getElementById('categoryEditModal').style.display = 'none';
  }

  async function saveCategoryEdit() {
    const id = document.getElementById('categoryEditId').value;
    const name = document.getElementById('categoryEditName').value.trim();
    const icon = document.getElementById('categoryEditIcon').value;
    const color = '#3b82f6'; // Default color

    if (!name) {
      showError('Please enter a category name');
      return;
    }

    try {
      let result;
      if (id) {
        result = await service.updateCategory(parseInt(id), name, color, icon);
      } else {
        result = await service.createCategory(name, color, icon);
      }

      if (result.success) {
        showToast(`Category ${id ? 'updated' : 'created'} successfully`, 'success');
        closeCategoryEditModal();
        
        // Reload categories and passwords to update counts
        const categoriesResult = await service.getCategories();
        if (categoriesResult.success) {
          categories = categoriesResult.data;
          await loadPasswords();
          renderCategoryList();
          renderCategories(); // Update main UI category sidebar
        }
      } else {
        showError(result.error || 'Failed to save category');
      }
    } catch (error) {
      showError('Failed to save category');
    }
  }

  let pendingDeleteCategory = null;

  function deleteCategory(id, name, count) {
    // Store the category info and show confirmation modal
    pendingDeleteCategory = { id, name, count };
    
    const modal = document.getElementById('deleteCategoryConfirmModal');
    const messageEl = document.getElementById('deleteCategoryMessage');
    const optionsEl = document.getElementById('deleteCategoryOptions');
    const countEl = document.getElementById('deleteCategoryCount');
    const warningEl = document.getElementById('deleteCategoryWarning');
    
    if (count > 0) {
      messageEl.textContent = `Category "${name}" contains ${count} password${count !== 1 ? 's' : ''}.`;
      optionsEl.style.display = 'block';
      if (countEl) countEl.textContent = count;
      warningEl.style.display = 'none';
      
      // Reset to default option
      const keepRadio = document.querySelector('input[name="deleteCategoryAction"][value="keep"]');
      if (keepRadio) keepRadio.checked = true;
    } else {
      messageEl.textContent = `Are you sure you want to delete the category "${name}"?`;
      optionsEl.style.display = 'none';
      warningEl.style.display = 'none';
    }
    
    if (modal) {
      modal.style.display = 'flex';
    }
  }

  function closeDeleteCategoryModal() {
    pendingDeleteCategory = null;
    const modal = document.getElementById('deleteCategoryConfirmModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  async function confirmDeleteCategory() {
    if (!pendingDeleteCategory) return;

    const { id, count } = pendingDeleteCategory;
    const modal = document.getElementById('deleteCategoryConfirmModal');
    const confirmBtn = document.getElementById('deleteCategoryConfirmBtn');

    // Get user's choice for passwords (only relevant if category has passwords)
    let deletePasswords = false;
    if (count > 0) {
      const actionRadio = document.querySelector('input[name="deleteCategoryAction"]:checked');
      deletePasswords = actionRadio ? actionRadio.value === 'delete' : false;
    }

    // Update button state
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<div class="spinner-ring" style="width:12px; height:12px; border-width:2px; display:inline-block; margin-right:4px;"></div> Deleting...';
    }

    try {
      const result = await service.deleteCategory(id, deletePasswords);
      
      // Reset button state
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Delete';
      }

      if (result.success) {
        // Close modal
        closeDeleteCategoryModal();
        
        showToast('Category deleted successfully', 'success');
        
        // Reset filter to show all passwords (in case deleted category was selected)
        currentFilter = { category: null, search: '', favorites: false };
        
        // Reload categories and passwords
        const categoriesResult = await service.getCategories();
        if (categoriesResult.success) {
          categories = categoriesResult.data;
          await loadPasswords();
          renderCategoryList();
          renderCategories(); // Update main UI category sidebar
        }
      } else {
        showError(result.error || 'Failed to delete category');
      }
    } catch (error) {
      // Reset button state
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Delete';
      }
      showError('Failed to delete category');
    }
  }

  function closePasswordDetail() {
    currentPassword = null;
    const detailPanel = document.getElementById('passwordDetailPanel');
    if (detailPanel) {
      detailPanel.style.display = 'none';
    }
    renderPasswordList(); // Update list to remove active state
  }

  // Export functions
  window.PasswordUI = {
    init: initPasswordManager,
    openPasswordModal,
    closePasswordModal,
    savePassword,
    editPassword,
    deletePassword,
    closeDeletePasswordModal,
    confirmDeletePassword,
    copyPassword,
    copyUsername,
    closePasswordDetail,
    openCategoryModal,
    closeCategoryModal,
    addNewCategory,
    editCategory,
    closeCategoryEditModal,
    saveCategoryEdit,
    deleteCategory,
    closeDeleteCategoryModal,
    confirmDeleteCategory,
    togglePasswordVisibility,
    toggleModalPasswordVisibility,
    toggleConfirmPasswordVisibility,
    copyToClipboard,
    generatePassword
  };
})();
