/**
 * Ticket Management UI Controller
 * Handles all UI interactions for the ticketing system
 */

(function () {
  if (!window || !window.TicketService) {
    console.error('Ticket UI: TicketService not available');
    return;
  }

  const service = window.TicketService;
  let currentFilters = {};
  let currentTicket = null;
  let metadata = {
    projects: [],
    statuses: [],
    priorities: [],
    types: [],
    labels: [],
    users: []
  };

  // ==================== INITIALIZATION ====================

  async function initTicketManagement() {
    try {
      // Check if tables exist first
      const testQuery = await service.getStatuses();
      if (!testQuery.success) {
        console.error('Ticket tables not found. Please run database setup wizard.');
        const listContainer = document.getElementById('ticketListContainer');
        if (listContainer) {
          listContainer.innerHTML = `
            <div class="ticket-empty">
              <div class="ticket-empty-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
              </div>
              <div class="ticket-empty-title">Ticket System Not Initialized</div>
              <div class="ticket-empty-description">
                The ticket management tables haven't been created yet. Please run the database setup wizard or contact your administrator.
              </div>
            </div>
          `;
        }
        return;
      }
      
      // Load metadata
      await loadMetadata();
      
      // Load tickets
      await loadTickets();
      
      // Load statistics
      await loadStatistics();
      
      // Setup event listeners
      setupEventListeners();
      
    } catch (error) {
      console.error('Error initializing ticket management:', error);
      const listContainer = document.getElementById('ticketListContainer');
      if (listContainer) {
        listContainer.innerHTML = `
          <div class="ticket-empty">
            <div class="ticket-empty-icon" style="color: #dc2626;">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
            </div>
            <div class="ticket-empty-title">Error Loading Ticket System</div>
            <div class="ticket-empty-description">
              ${error.message || 'An unknown error occurred'}
            </div>
          </div>
        `;
      }
    }
  }

  async function loadMetadata() {
    const [projects, statuses, priorities, types, labels, users] = await Promise.all([
      service.getProjects(),
      service.getStatuses(),
      service.getPriorities(),
      service.getTypes(),
      service.getLabels(),
      service.getUsers()
    ]);

    metadata.projects = projects.success ? projects.data : [];
    metadata.statuses = statuses.success ? statuses.data : [];
    metadata.priorities = priorities.success ? priorities.data : [];
    metadata.types = types.success ? types.data : [];
    metadata.labels = labels.success ? labels.data : [];
    metadata.users = users.success ? users.data : [];
  }

  // ==================== TICKET LIST ====================

  async function loadTickets(filters = {}) {
    const listContainer = document.getElementById('ticketListContainer');
    if (!listContainer) return;

    // Show loading state
    listContainer.innerHTML = '<div style="padding:40px; text-align:center; color:var(--muted);">Loading tickets...</div>';

    const result = await service.getTickets(filters);
    
    if (!result.success) {
      listContainer.innerHTML = `<div style="padding:40px; text-align:center; color:#dc2626;">Error loading tickets: ${result.error}</div>`;
      return;
    }

    const tickets = result.data;

    if (tickets.length === 0) {
      listContainer.innerHTML = renderEmptyState();
      return;
    }

    listContainer.innerHTML = `
      <div class="ticket-list">
        ${tickets.map(ticket => renderTicketCard(ticket)).join('')}
      </div>
    `;

    // Add click handlers
    tickets.forEach(ticket => {
      const card = document.getElementById(`ticket-card-${ticket.id}`);
      if (card) {
        card.addEventListener('click', () => openTicketDetail(ticket.id));
      }
    });
  }

  function renderTicketCard(ticket) {
    const typeColor = ticket.type_color || '#3b82f6';
    const statusColor = ticket.status_color || '#6b7280';
    const priorityColor = ticket.priority_color || '#6b7280';
    
    const assigneeInitials = ticket.assignee_fullname 
      ? ticket.assignee_fullname.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
      : '??';

    const dueDate = ticket.due_date ? new Date(ticket.due_date).toLocaleDateString() : null;
    const isOverdue = ticket.due_date && new Date(ticket.due_date) < new Date() && ticket.status_category !== 'closed';

    return `
      <div class="ticket-card" id="ticket-card-${ticket.id}">
        <div class="ticket-card-header">
          <div class="ticket-type-icon" style="background: ${typeColor}20; color: ${typeColor};">
            ${getTypeIcon(ticket.type_icon)}
          </div>
          <div class="ticket-card-content">
            <div class="ticket-card-title-row">
              <span class="ticket-number">${ticket.ticket_number}</span>
              <span class="ticket-title">${escapeHtml(ticket.title)}</span>
            </div>
            ${ticket.description ? `<div class="ticket-description">${escapeHtml(ticket.description)}</div>` : ''}
          </div>
        </div>
        <div class="ticket-card-footer">
          <span class="ticket-priority-badge" style="background: ${priorityColor}20; color: ${priorityColor};">
            ${ticket.priority_name}
          </span>
          <span class="ticket-status-badge" style="background: ${statusColor}20; color: ${statusColor};">
            ${ticket.status_name}
          </span>
          ${ticket.assignee_id ? `
            <div class="ticket-assignee">
              <div class="ticket-assignee-avatar" style="background: ${typeColor};">
                ${assigneeInitials}
              </div>
              <span>${ticket.assignee_fullname}</span>
            </div>
          ` : '<span style="margin-left: auto; color: var(--muted); font-size: 12px;">Unassigned</span>'}
        </div>
        <div class="ticket-meta">
          ${ticket.comments_count > 0 ? `
            <div class="ticket-meta-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              ${ticket.comments_count}
            </div>
          ` : ''}
          ${ticket.attachments_count > 0 ? `
            <div class="ticket-meta-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
              </svg>
              ${ticket.attachments_count}
            </div>
          ` : ''}
          ${dueDate ? `
            <div class="ticket-meta-item" style="color: ${isOverdue ? '#dc2626' : 'inherit'};">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              ${dueDate}
              ${isOverdue ? '(Overdue)' : ''}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  function renderEmptyState() {
    return `
      <div class="ticket-empty">
        <div class="ticket-empty-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <div class="ticket-empty-title">No Tickets Found</div>
        <div class="ticket-empty-description">
          There are no tickets matching your current filters. Try adjusting your filters or create a new ticket.
        </div>
        <button class="btn" onclick="TicketUI.openCreateModal()" style="background: var(--primary); color: white; border: none;">
          Create Your First Ticket
        </button>
      </div>
    `;
  }

  // ==================== STATISTICS ====================

  async function loadStatistics(filters = {}) {
    const statsContainer = document.getElementById('ticketStatsContainer');
    if (!statsContainer) return;
    
    const result = await service.getStatistics(filters);
    
    if (!result.success) {
      console.error('Failed to load statistics:', result.error);
      statsContainer.innerHTML = `
        <div class="ticket-stat-card" style="grid-column: 1/-1;">
          <div class="ticket-stat-label" style="color: #dc2626;">Error loading statistics</div>
          <div style="font-size: 12px; color: var(--muted);">${result.error || 'Unknown error'}</div>
        </div>
      `;
      return;
    }

    const stats = result.data;

    statsContainer.innerHTML = `
      <div class="ticket-stat-card" style="cursor: pointer;" onclick="TicketUI.filterByStatus('open')">
        <div class="ticket-stat-label">Open</div>
        <div class="ticket-stat-value">
          <div class="ticket-stat-icon" style="background: #3b82f620; color: #3b82f6;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
            </svg>
          </div>
          ${stats.open_tickets || 0}
        </div>
      </div>
      <div class="ticket-stat-card" style="cursor: pointer;" onclick="TicketUI.filterByStatus('in_progress')">
        <div class="ticket-stat-label">In Progress</div>
        <div class="ticket-stat-value">
          <div class="ticket-stat-icon" style="background: #f59e0b20; color: #f59e0b;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          ${stats.in_progress_tickets || 0}
        </div>
      </div>
      <div class="ticket-stat-card" style="cursor: pointer;" onclick="TicketUI.filterByStatus('resolved')">
        <div class="ticket-stat-label">Resolved</div>
        <div class="ticket-stat-value">
          <div class="ticket-stat-icon" style="background: #10b98120; color: #10b981;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          ${stats.resolved_tickets || 0}
        </div>
      </div>
      <div class="ticket-stat-card" style="cursor: pointer;">
        <div class="ticket-stat-label">High Priority</div>
        <div class="ticket-stat-value">
          <div class="ticket-stat-icon" style="background: #dc262620; color: #dc2626;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          </div>
          ${stats.high_priority_tickets || 0}
        </div>
      </div>
      <div class="ticket-stat-card" style="cursor: pointer;">
        <div class="ticket-stat-label">Overdue</div>
        <div class="ticket-stat-value">
          <div class="ticket-stat-icon" style="background: #ea580c20; color: #ea580c;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          ${stats.overdue_tickets || 0}
        </div>
      </div>
      <div class="ticket-stat-card">
        <div class="ticket-stat-label">Total</div>
        <div class="ticket-stat-value">
          <div class="ticket-stat-icon" style="background: #8aa2ff20; color: #8aa2ff;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
          </div>
          ${stats.total_tickets || 0}
        </div>
      </div>
    `;
  }

  // ==================== CREATE/EDIT MODAL ====================

  function openCreateModal() {
    const modal = createTicketModal('create');
    document.body.appendChild(modal);
  }

  async function openTicketDetail(ticketId) {
    const result = await service.getTicketById(ticketId);
    
    if (!result.success) {
      showToast('Failed to load ticket details', 'error');
      return;
    }

    currentTicket = result.data;
    const modal = createTicketModal('view', currentTicket);
    document.body.appendChild(modal);
    
    // Load comments and activity after modal is in DOM
    setTimeout(async () => {
      await loadCommentsForTicket(ticketId);
      await loadActivityForTicket(ticketId);
    }, 100);
  }

  function createTicketModal(mode = 'create', ticket = null) {
    const isView = mode === 'view';
    const isCreate = mode === 'create';
    const isEdit = mode === 'edit';
    
    const modal = document.createElement('div');
    modal.className = 'ticket-modal';
    
    // Close modal when clicking backdrop
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
    
    modal.innerHTML = `
      <div class="ticket-modal-content" onclick="event.stopPropagation()">
        <div class="ticket-modal-header">
          <div class="ticket-modal-title">
            ${isCreate ? 'Create New Ticket' : (isEdit ? 'Edit Ticket' : (ticket?.ticket_number || 'Ticket Details'))}
          </div>
          <button class="ticket-modal-close" onclick="this.closest('.ticket-modal').remove()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="ticket-modal-body">
          ${isView ? renderTicketDetailView(ticket) : renderTicketForm(ticket)}
        </div>
        ${!isView ? `
          <div class="ticket-modal-footer">
            <button class="btn btn-ghost" onclick="this.closest('.ticket-modal').remove()">Cancel</button>
            <button class="btn" id="saveTicketBtn" style="background: var(--primary); color: white; border: none;">
              ${isCreate ? 'Create Ticket' : 'Save Changes'}
            </button>
          </div>
        ` : ''}
      </div>
    `;

    // Add event listeners
    if (!isView) {
      setTimeout(() => {
        const saveBtn = modal.querySelector('#saveTicketBtn');
        if (saveBtn) {
          saveBtn.addEventListener('click', () => handleSaveTicket(modal, isCreate, ticket?.id));
        }
        
        // Add new project button listener
        const newProjectBtn = modal.querySelector('#newProjectBtn');
        if (newProjectBtn) {
          newProjectBtn.addEventListener('click', () => openNewProjectModal(modal));
        }
        
        // Focus first input
        const titleInput = modal.querySelector('#ticketTitle');
        if (titleInput) {
          titleInput.focus();
        }
      }, 100);
    }

    return modal;
  }

  function renderTicketForm(ticket = null) {
    const session = getSession();
    const currentUserId = session?.id;

    return `
      <form class="ticket-form" id="ticketForm">
        <div class="ticket-form-group">
          <label class="ticket-form-label required">Title</label>
          <input type="text" class="ticket-form-input" id="ticketTitle" placeholder="Brief summary of the issue or task" value="${ticket?.title || ''}" required>
        </div>

        <div class="ticket-form-row">
          <div class="ticket-form-group">
            <label class="ticket-form-label required">Project</label>
            <div style="display: flex; gap: 8px;">
              <select class="ticket-form-select" id="ticketProject" required style="flex: 1;">
                <option value="">Select Project</option>
                ${metadata.projects.map(p => `
                  <option value="${p.id}" ${ticket?.project_id === p.id ? 'selected' : ''}>
                    ${p.name} (${p.key})
                  </option>
                `).join('')}
              </select>
              <button type="button" class="btn" id="newProjectBtn" style="background: var(--primary); color: white; border: none; padding: 0 16px; white-space: nowrap;">
                + New
              </button>
            </div>
          </div>

          <div class="ticket-form-group">
            <label class="ticket-form-label required">Type</label>
            <select class="ticket-form-select" id="ticketType" required>
              <option value="">Select Type</option>
              ${metadata.types.map(t => `
                <option value="${t.id}" ${ticket?.type_id === t.id ? 'selected' : ''}>
                  ${t.name}
                </option>
              `).join('')}
            </select>
          </div>
        </div>

        <div class="ticket-form-row">
          <div class="ticket-form-group">
            <label class="ticket-form-label required">Priority</label>
            <select class="ticket-form-select" id="ticketPriority" required>
              <option value="">Select Priority</option>
              ${metadata.priorities.map(p => `
                <option value="${p.id}" ${ticket?.priority_id === p.id ? 'selected' : ''}>
                  ${p.name}
                </option>
              `).join('')}
            </select>
          </div>

          <div class="ticket-form-group">
            <label class="ticket-form-label${ticket ? ' required' : ''}">Status</label>
            <select class="ticket-form-select" id="ticketStatus" ${ticket ? 'required' : ''}>
              ${!ticket ? '<option value="">Default: Open</option>' : '<option value="">Select Status</option>'}
              ${metadata.statuses.map(s => `
                <option value="${s.id}" ${ticket?.status_id === s.id ? 'selected' : ''}>
                  ${s.name}
                </option>
              `).join('')}
            </select>
            ${!ticket ? '<span class="ticket-form-hint">New tickets default to Open status</span>' : ''}
          </div>
        </div>

        <div class="ticket-form-row">
          <div class="ticket-form-group">
            <label class="ticket-form-label">Assignee</label>
            <select class="ticket-form-select" id="ticketAssignee">
              <option value="">Unassigned</option>
              ${metadata.users.map(u => `
                <option value="${u.id}" ${ticket?.assignee_id === u.id ? 'selected' : ''}>
                  ${u.fullname || u.username}
                </option>
              `).join('')}
            </select>
            <span class="ticket-form-hint">Leave blank to keep unassigned</span>
          </div>
        </div>

        <div class="ticket-form-group">
          <label class="ticket-form-label">Description</label>
          <textarea class="ticket-form-textarea" id="ticketDescription" placeholder="Detailed description of the ticket...">${ticket?.description || ''}</textarea>
        </div>

        <div class="ticket-form-row">
          <div class="ticket-form-group">
            <label class="ticket-form-label">Story Points</label>
            <input type="number" class="ticket-form-input" id="ticketStoryPoints" placeholder="1-20" min="1" max="20" value="${ticket?.story_points || ''}">
          </div>

          <div class="ticket-form-group">
            <label class="ticket-form-label">Estimated Hours</label>
            <input type="number" class="ticket-form-input" id="ticketEstimatedHours" placeholder="e.g., 8.5" step="0.5" min="0" value="${ticket?.estimated_hours || ''}">
          </div>

          <div class="ticket-form-group">
            <label class="ticket-form-label">Due Date</label>
            <input type="date" class="ticket-form-input" id="ticketDueDate" value="${ticket?.due_date && typeof ticket.due_date === 'string' && ticket.due_date.length > 0 ? ticket.due_date.split('T')[0] : ''}">
          </div>
        </div>
      </form>
    `;
  }

  function renderTicketDetailView(ticket) {
    // This will be loaded with comments and activity
    return `
      <div class="ticket-detail">
        <div class="ticket-detail-main">
          <div class="ticket-detail-header">
            <div class="ticket-type-icon" style="background: ${ticket.type_color}20; color: ${ticket.type_color}; width: 40px; height: 40px;">
              ${getTypeIcon(ticket.type_icon)}
            </div>
            <div style="flex: 1;">
              <div style="font-size: 12px; color: var(--muted); margin-bottom: 4px;">${ticket.ticket_number}</div>
              <h2 class="ticket-detail-title">${escapeHtml(ticket.title)}</h2>
            </div>
          </div>

          ${ticket.description ? `
            <div class="ticket-detail-section">
              <div class="ticket-detail-section-title">Description</div>
              <div style="white-space: pre-wrap; line-height: 1.6;">${escapeHtml(ticket.description)}</div>
            </div>
          ` : ''}

          <div class="ticket-detail-section">
            <div class="ticket-detail-section-title">Comments</div>
            <div id="ticketComments${ticket.id}">Loading comments...</div>
            <div class="ticket-comment-form" style="margin-top: 16px;">
              <textarea class="ticket-form-textarea" id="newComment${ticket.id}" placeholder="Add a comment..." style="min-height: 80px;"></textarea>
              <button class="btn" onclick="TicketUI.addComment(${ticket.id})" style="background: var(--primary); color: white; border: none; align-self: flex-start;">
                Add Comment
              </button>
            </div>
          </div>

          <div class="ticket-detail-section">
            <div class="ticket-detail-section-title">Activity</div>
            <div id="ticketActivity${ticket.id}">Loading activity...</div>
          </div>
        </div>

        <div class="ticket-detail-sidebar">
          <div class="ticket-detail-section">
            <div class="ticket-detail-section-title">Details</div>
            
            <div class="ticket-detail-field">
              <div class="ticket-detail-field-label">Status</div>
              <div class="ticket-detail-field-value">
                <select class="ticket-form-select" id="ticketStatusChange${ticket.id}" onchange="TicketUI.changeStatus(${ticket.id}, this.value)" style="width: 100%; padding: 6px 8px;">
                  ${metadata.statuses.map(s => `
                    <option value="${s.id}" ${ticket.status_id === s.id ? 'selected' : ''}>
                      ${s.name}
                    </option>
                  `).join('')}
                </select>
              </div>
            </div>

            <div class="ticket-detail-field">
              <div class="ticket-detail-field-label">Priority</div>
              <div class="ticket-detail-field-value">
                <span class="ticket-priority-badge" style="background: ${ticket.priority_color}20; color: ${ticket.priority_color};">
                  ${ticket.priority_name}
                </span>
              </div>
            </div>

            <div class="ticket-detail-field">
              <div class="ticket-detail-field-label">Assignee</div>
              <div class="ticket-detail-field-value">
                <select class="ticket-form-select" id="ticketAssigneeChange${ticket.id}" onchange="TicketUI.changeAssignee(${ticket.id}, this.value)" style="width: 100%; padding: 6px 8px;">
                  <option value="">Unassigned</option>
                  ${metadata.users.map(u => `
                    <option value="${u.id}" ${ticket.assignee_id === u.id ? 'selected' : ''}>
                      ${u.fullname || u.username}
                    </option>
                  `).join('')}
                </select>
              </div>
            </div>

            <div class="ticket-detail-field">
              <div class="ticket-detail-field-label">Reporter</div>
              <div class="ticket-detail-field-value">${ticket.reporter_fullname}</div>
            </div>

            ${ticket.due_date ? `
              <div class="ticket-detail-field">
                <div class="ticket-detail-field-label">Due Date</div>
                <div class="ticket-detail-field-value">${new Date(ticket.due_date).toLocaleDateString()}</div>
              </div>
            ` : ''}

            ${ticket.story_points ? `
              <div class="ticket-detail-field">
                <div class="ticket-detail-field-label">Story Points</div>
                <div class="ticket-detail-field-value">${ticket.story_points}</div>
              </div>
            ` : ''}

            ${ticket.estimated_hours ? `
              <div class="ticket-detail-field">
                <div class="ticket-detail-field-label">Estimated Hours</div>
                <div class="ticket-detail-field-value">${ticket.estimated_hours}h</div>
              </div>
            ` : ''}
          </div>

          <div class="ticket-detail-section">
            <div class="ticket-detail-section-title">Actions</div>
            <button class="btn btn-ghost" onclick="TicketUI.editTicket(${ticket.id})" style="width: 100%; margin-bottom: 8px;">
              Edit Ticket
            </button>
            <button class="btn btn-ghost" onclick="TicketUI.deleteTicket(${ticket.id})" style="width: 100%; color: #dc2626;">
              Delete Ticket
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // ==================== EVENT HANDLERS ====================

  async function handleSaveTicket(modal, isCreate, ticketId) {
    const session = getSession();
    if (!session) {
      showToast('Session expired', 'error');
      return;
    }

    const ticketData = {
      title: document.getElementById('ticketTitle').value.trim(),
      projectId: parseInt(document.getElementById('ticketProject').value),
      typeId: parseInt(document.getElementById('ticketType').value),
      priorityId: parseInt(document.getElementById('ticketPriority').value),
      statusId: document.getElementById('ticketStatus') ? parseInt(document.getElementById('ticketStatus').value) : null,
      assigneeId: document.getElementById('ticketAssignee').value || null,
      description: document.getElementById('ticketDescription').value.trim() || null,
      storyPoints: document.getElementById('ticketStoryPoints').value ? parseInt(document.getElementById('ticketStoryPoints').value) : null,
      estimatedHours: document.getElementById('ticketEstimatedHours').value ? parseFloat(document.getElementById('ticketEstimatedHours').value) : null,
      dueDate: document.getElementById('ticketDueDate').value || null,
      reporterId: session.id
    };

    // Validation
    if (!ticketData.title) {
      showToast('Title is required', 'error');
      return;
    }

    if (!ticketData.projectId || !ticketData.typeId || !ticketData.priorityId) {
      showToast('Please fill all required fields', 'error');
      return;
    }

    const saveBtn = modal.querySelector('#saveTicketBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    let result;
    if (isCreate) {
      result = await service.createTicket(ticketData);
    } else {
      result = await service.updateTicket(ticketId, ticketData, session.id);
    }

    if (result.success) {
      showToast(isCreate ? 'Ticket created successfully!' : 'Ticket updated successfully!', 'success');
      modal.remove();
      await loadTickets(currentFilters);
      await loadStatistics(currentFilters);
    } else {
      showToast(result.error || 'Failed to save ticket', 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = isCreate ? 'Create Ticket' : 'Save Changes';
    }
  }

  async function addComment(ticketId) {
    const session = getSession();
    if (!session) return;

    const commentText = document.getElementById(`newComment${ticketId}`).value.trim();
    if (!commentText) {
      showToast('Comment cannot be empty', 'error');
      return;
    }

    const result = await service.addComment(ticketId, session.id, commentText);
    
    if (result.success) {
      document.getElementById(`newComment${ticketId}`).value = '';
      await loadCommentsForTicket(ticketId);
      await loadActivityForTicket(ticketId);
      showToast('Comment added', 'success');
    } else {
      showToast('Failed to add comment', 'error');
    }
  }

  async function loadCommentsForTicket(ticketId) {
    const container = document.getElementById(`ticketComments${ticketId}`);
    if (!container) return;

    const result = await service.getComments(ticketId);
    
    if (!result.success || result.data.length === 0) {
      container.innerHTML = '<div style="color: var(--muted); font-style: italic;">No comments yet</div>';
      return;
    }

    container.innerHTML = `
      <div class="ticket-comments">
        ${result.data.map(comment => `
          <div class="ticket-comment">
            <div class="ticket-comment-header">
              <span class="ticket-comment-author">${comment.fullname || comment.username}</span>
              <span class="ticket-comment-time">${formatDate(comment.created_at)}</span>
            </div>
            <div class="ticket-comment-body">${escapeHtml(comment.comment)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  async function loadActivityForTicket(ticketId) {
    const container = document.getElementById(`ticketActivity${ticketId}`);
    if (!container) return;

    const result = await service.getActivity(ticketId);
    
    if (!result.success || result.data.length === 0) {
      container.innerHTML = '<div style="color: var(--muted); font-style: italic;">No activity yet</div>';
      return;
    }

    container.innerHTML = `
      <div class="ticket-activity">
        ${result.data.map(activity => `
          <div class="ticket-activity-item">
            <div class="ticket-activity-icon">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </div>
            <div class="ticket-activity-content">
              <span class="ticket-activity-user">${activity.fullname || activity.username}</span>
              ${activity.action} ${activity.field_name ? `<strong>${activity.field_name}</strong>` : ''}
              <div class="ticket-activity-time">${formatDate(activity.created_at)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  async function deleteTicket(ticketId) {
    if (!confirm('Are you sure you want to delete this ticket? This action cannot be undone.')) {
      return;
    }

    const result = await service.deleteTicket(ticketId);
    
    if (result.success) {
      showToast('Ticket deleted successfully', 'success');
      const modal = document.querySelector('.ticket-modal');
      if (modal) modal.remove();
      await loadTickets(currentFilters);
      await loadStatistics(currentFilters);
    } else {
      showToast('Failed to delete ticket', 'error');
    }
  }

  function setupEventListeners() {
    // Search
    const searchInput = document.getElementById('ticketSearch');
    if (searchInput) {
      let searchTimeout;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          currentFilters.search = e.target.value.trim();
          loadTickets(currentFilters);
        }, 300);
      });
    }

    // Create button
    const createBtn = document.getElementById('createTicketBtn');
    if (createBtn) {
      createBtn.addEventListener('click', openCreateModal);
    }

    // Refresh button
    const refreshBtn = document.getElementById('refreshTicketsBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        loadTickets(currentFilters);
        loadStatistics(currentFilters);
      });
    }
  }

  // ==================== HELPER FUNCTIONS ====================

  function getTypeIcon(icon) {
    const icons = {
      'bug': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m8 2 1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"></path><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"></path><path d="M12 20v-9M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M3 21c0-2.1 1.7-3.9 3.8-4M20.97 5c0 2.1-1.6 3.8-3.5 4M22 13h-4M17.2 17c2.1.1 3.8 1.9 3.8 4"></path></svg>',
      'star': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>',
      'checklist': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>',
      'trending-up': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>',
      'help-circle': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
      'layers': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>'
    };
    return icons[icon] || icons['checklist'];
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    return date.toLocaleDateString();
  }

  function filterByStatus(category) {
    const status = metadata.statuses.find(s => s.category === category);
    if (status) {
      currentFilters.statusId = status.id;
      loadTickets(currentFilters);
    }
  }

  function showToast(message, type = 'info') {
    if (window.showToast) {
      window.showToast(message, type);
    } else {
      alert(message);
    }
  }

  // ==================== PROJECT MANAGEMENT ====================

  function openNewProjectModal(parentModal) {
    const projectModal = document.createElement('div');
    projectModal.className = 'ticket-modal';
    projectModal.style.zIndex = '10002'; // Above the ticket modal
    projectModal.innerHTML = `
      <div class="ticket-modal-content" style="max-width: 500px;">
        <div class="ticket-modal-header">
          <div class="ticket-modal-title">Create New Project</div>
          <button class="ticket-modal-close" onclick="this.closest('.ticket-modal').remove()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="ticket-modal-body">
          <form class="ticket-form" id="projectForm">
            <div class="ticket-form-group">
              <label class="ticket-form-label required">Project Name</label>
              <input type="text" class="ticket-form-input" id="projectName" placeholder="e.g., OrbisHub Desktop" required>
              <span class="ticket-form-hint">Full descriptive name of the project</span>
            </div>

            <div class="ticket-form-group">
              <label class="ticket-form-label required">Project Key</label>
              <input 
                type="text" 
                class="ticket-form-input" 
                id="projectKey" 
                placeholder="e.g., ORB, DEV, OPS" 
                maxlength="10"
                style="text-transform: uppercase;"
                required>
              <span class="ticket-form-hint">2-10 uppercase letters. Tickets will be numbered like KEY-00001</span>
            </div>

            <div class="ticket-form-group">
              <label class="ticket-form-label">Description</label>
              <textarea class="ticket-form-textarea" id="projectDescription" placeholder="Brief description of the project..."></textarea>
            </div>

            <div class="ticket-form-group">
              <label class="ticket-form-label">Color</label>
              <div style="display: flex; gap: 8px; align-items: center;">
                <input type="color" id="projectColor" value="#3b82f6" style="width: 60px; height: 36px; border-radius: 6px; border: 1px solid var(--border); cursor: pointer;">
                <span style="color: var(--muted); font-size: 13px;">Project badge color</span>
              </div>
            </div>
          </form>
        </div>
        <div class="ticket-modal-footer">
          <button class="btn btn-ghost" onclick="this.closest('.ticket-modal').remove()">Cancel</button>
          <button class="btn" id="saveProjectBtn" style="background: var(--primary); color: white; border: none;">
            Create Project
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(projectModal);

    // Auto-generate key from name
    const nameInput = projectModal.querySelector('#projectName');
    const keyInput = projectModal.querySelector('#projectKey');
    
    nameInput.addEventListener('input', (e) => {
      if (!keyInput.value) {
        const words = e.target.value.trim().split(/\\s+/);
        let suggestedKey = '';
        if (words.length === 1) {
          suggestedKey = words[0].substring(0, 4).toUpperCase();
        } else {
          suggestedKey = words.slice(0, 3).map(w => w[0]).join('').toUpperCase();
        }
        keyInput.value = suggestedKey;
      }
    });

    // Force uppercase on key input
    keyInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
    });

    // Save button handler
    const saveBtn = projectModal.querySelector('#saveProjectBtn');
    saveBtn.addEventListener('click', async () => {
      const form = projectModal.querySelector('#projectForm');
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      const projectData = {
        name: nameInput.value.trim(),
        key: keyInput.value.trim(),
        description: projectModal.querySelector('#projectDescription').value.trim(),
        color: projectModal.querySelector('#projectColor').value
      };

      saveBtn.disabled = true;
      saveBtn.textContent = 'Creating...';

      const result = await service.createProject(projectData);

      if (result.success) {
        showToast('Project created successfully', 'success');
        projectModal.remove();
        
        // Reload metadata to get the new project
        await loadMetadata();
        
        // Update the project dropdown in the parent modal
        const projectSelect = parentModal.querySelector('#ticketProject');
        if (projectSelect) {
          projectSelect.innerHTML = `
            <option value="">Select Project</option>
            ${metadata.projects.map(p => `
              <option value="${p.id}">${p.name} (${p.key})</option>
            `).join('')}
          `;
          // Select the newly created project
          const newProject = metadata.projects.find(p => p.key === projectData.key);
          if (newProject) {
            projectSelect.value = newProject.id;
          }
        }
      } else {
        showToast(result.error || 'Failed to create project', 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Create Project';
      }
    });
  }

  async function editTicket(ticketId) {
    // Close any existing modals first
    const existingModals = document.querySelectorAll('.ticket-modal');
    existingModals.forEach(m => m.remove());

    const result = await service.getTicketById(ticketId);
    
    if (!result.success) {
      showToast('Failed to load ticket details', 'error');
      return;
    }

    currentTicket = result.data;
    const modal = createTicketModal('edit', currentTicket);
    document.body.appendChild(modal);
  }

  async function changeStatus(ticketId, statusId) {
    const session = getSession();
    if (!session) {
      showToast('Session expired', 'error');
      return;
    }

    const result = await service.updateTicket(ticketId, { statusId: parseInt(statusId) }, session.id);
    
    if (result.success) {
      showToast('Status updated', 'success');
      await loadActivityForTicket(ticketId);
      await loadTickets(currentFilters);
      await loadStatistics(currentFilters);
    } else {
      showToast(result.error || 'Failed to update status', 'error');
      // Revert the dropdown
      const dropdown = document.getElementById(`ticketStatusChange${ticketId}`);
      if (dropdown && currentTicket) {
        dropdown.value = currentTicket.status_id;
      }
    }
  }

  async function changeAssignee(ticketId, assigneeId) {
    const session = getSession();
    if (!session) {
      showToast('Session expired', 'error');
      return;
    }

    const result = await service.updateTicket(ticketId, { assigneeId: assigneeId || null }, session.id);
    
    if (result.success) {
      showToast('Assignee updated', 'success');
      await loadActivityForTicket(ticketId);
      await loadTickets(currentFilters);
      await loadStatistics(currentFilters);
      
      // Update currentTicket if it's the same one
      if (currentTicket && currentTicket.id === ticketId) {
        currentTicket.assignee_id = assigneeId || null;
      }
    } else {
      showToast(result.error || 'Failed to update assignee', 'error');
      // Revert the dropdown
      const dropdown = document.getElementById(`ticketAssigneeChange${ticketId}`);
      if (dropdown && currentTicket) {
        dropdown.value = currentTicket.assignee_id || '';
      }
    }
  }

  // Export to window
  window.TicketUI = {
    init: initTicketManagement,
    openCreateModal,
    openTicketDetail,
    addComment,
    deleteTicket,
    editTicket,
    changeStatus,
    changeAssignee,
    filterByStatus,
    refresh: () => {
      loadTickets(currentFilters);
      loadStatistics(currentFilters);
    }
  };
})();
