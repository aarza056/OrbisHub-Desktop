/**
 * Ticket Management Service
 * Professional ticketing system similar to Jira
 * Handles all ticket CRUD operations, validation, and business logic
 */

(function () {
  if (!window || !window.DB) {
    console.error('Ticket Service: DB not available');
    return;
  }

  const db = window.DB;

  // ==================== TICKET OPERATIONS ====================

  /**
   * Get all tickets with filters
   */
  async function getTickets(filters = {}) {
    try {
      let query = `
        SELECT 
          t.id,
          t.ticket_number,
          t.title,
          t.description,
          t.story_points,
          t.estimated_hours,
          t.actual_hours,
          t.due_date,
          t.created_at,
          t.updated_at,
          t.resolved_at,
          t.closed_at,
          
          -- Project info
          p.id project_id,
          p.name project_name,
          p.[key] project_key,
          p.color project_color,
          
          -- Type info
          tt.id type_id,
          tt.name type_name,
          tt.icon type_icon,
          tt.color type_color,
          
          -- Status info
          ts.id status_id,
          ts.name status_name,
          ts.color status_color,
          ts.category status_category,
          
          -- Priority info
          tp.id priority_id,
          tp.name priority_name,
          tp.color priority_color,
          tp.level priority_level,
          
          -- Assignee info
          a.id assignee_id,
          a.username assignee_username,
          a.name assignee_fullname,
          
          -- Reporter info
          r.id reporter_id,
          r.username reporter_username,
          r.name reporter_fullname,
          
          -- Environment & Server
          e.id environment_id,
          e.name environment_name,
          s.id server_id,
          s.name server_name,
          
          -- Parent ticket
          t.parent_ticket_id,
          pt.ticket_number parent_ticket_number,
          
          -- Comments count
          (SELECT COUNT(*) FROM TicketComments WHERE ticket_id = t.id) comments_count,
          
          -- Attachments count
          (SELECT COUNT(*) FROM TicketAttachments WHERE ticket_id = t.id) attachments_count,
          
          -- Watchers count
          (SELECT COUNT(*) FROM TicketWatchers WHERE ticket_id = t.id) watchers_count
          
        FROM Tickets t
        INNER JOIN TicketProjects p ON t.project_id = p.id
        INNER JOIN TicketTypes tt ON t.type_id = tt.id
        INNER JOIN TicketStatuses ts ON t.status_id = ts.id
        INNER JOIN TicketPriorities tp ON t.priority_id = tp.id
        LEFT JOIN Users a ON t.assignee_id = a.id
        INNER JOIN Users r ON t.reporter_id = r.id
        LEFT JOIN Environments e ON t.environment_id = e.id
        LEFT JOIN Servers s ON t.server_id = s.id
        LEFT JOIN Tickets pt ON t.parent_ticket_id = pt.id
        WHERE 1=1
      `;

      const params = [];
      let paramIndex = 0;

      if (filters.projectId) {
        query += ` AND t.project_id = @param${paramIndex}`;
        params.push({ value: filters.projectId });
        paramIndex++;
      }

      if (filters.statusId) {
        query += ` AND t.status_id = @param${paramIndex}`;
        params.push({ value: filters.statusId });
        paramIndex++;
      }

      if (filters.assigneeId) {
        query += ` AND t.assignee_id = @param${paramIndex}`;
        params.push({ value: filters.assigneeId });
        paramIndex++;
      }

      if (filters.priorityId) {
        query += ` AND t.priority_id = @param${paramIndex}`;
        params.push({ value: filters.priorityId });
        paramIndex++;
      }

      if (filters.typeId) {
        query += ` AND t.type_id = @param${paramIndex}`;
        params.push({ value: filters.typeId });
        paramIndex++;
      }

      if (filters.search) {
        query += ` AND (t.title LIKE @param${paramIndex} OR t.description LIKE @param${paramIndex} OR t.ticket_number LIKE @param${paramIndex})`;
        params.push({ value: `%${filters.search}%` });
        paramIndex++;
      }

      query += ` ORDER BY t.updated_at DESC`;

      const result = await db.query(query, params);
      
      if (!result.success) {
        return { success: false, error: result.error };
      }

      return { success: true, data: result.data || [] };
    } catch (error) {
      console.error('Error getting tickets:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get single ticket by ID with full details
   */
  async function getTicketById(ticketId) {
    try {
      const result = await getTickets({});
      if (!result.success) return result;

      const ticket = result.data.find(t => t.id === ticketId);
      if (!ticket) {
        return { success: false, error: 'Ticket not found' };
      }

      // Get labels
      const labelsResult = await db.query(`
        SELECT l.id, l.name, l.color
        FROM TicketLabels l
        INNER JOIN TicketLabelMap tlm ON l.id = tlm.label_id
        WHERE tlm.ticket_id = @param0
      `, [{ value: ticketId }]);

      ticket.labels = labelsResult.success ? labelsResult.data : [];

      // Get watchers
      const watchersResult = await db.query(`
        SELECT u.id, u.username, u.name fullname
        FROM Users u
        INNER JOIN TicketWatchers tw ON u.id = tw.user_id
        WHERE tw.ticket_id = @param0
      `, [{ value: ticketId }]);

      ticket.watchers = watchersResult.success ? watchersResult.data : [];

      return { success: true, data: ticket };
    } catch (error) {
      console.error('Error getting ticket:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create a new ticket
   */
  async function createTicket(ticketData) {
    try {
      // Validate required fields
      if (!ticketData.title || !ticketData.projectId || !ticketData.typeId || !ticketData.priorityId || !ticketData.reporterId) {
        return { success: false, error: 'Missing required fields' };
      }

      // Validate assignee exists if provided
      if (ticketData.assigneeId) {
        const userCheck = await db.query('SELECT id FROM Users WHERE id = @param0', [{ value: ticketData.assigneeId }]);
        if (!userCheck.success || !userCheck.data || userCheck.data.length === 0) {
          return { success: false, error: 'Assigned user does not exist' };
        }
      }

      // Get default "Open" status
      const statusResult = await db.query(`SELECT id FROM TicketStatuses WHERE name = 'Open'`, []);
      const statusId = statusResult.success && statusResult.data.length > 0 ? statusResult.data[0].id : 1;

      // Get project key for ticket number generation
      const projectResult = await db.query('SELECT [key] FROM TicketProjects WHERE id = @param0', [{ value: ticketData.projectId }]);
      if (!projectResult.success || projectResult.data.length === 0) {
        return { success: false, error: 'Project not found' };
      }
      const projectKey = projectResult.data[0].key;

      // Insert ticket with temporary ticket number, then get ID and update
      const insertQuery = `
        INSERT INTO Tickets (
          ticket_number, project_id, type_id, title, description, status_id, priority_id,
          assignee_id, reporter_id, environment_id, server_id, story_points,
          estimated_hours, due_date, parent_ticket_id
        )
        VALUES (
          @param0, @param1, @param2, @param3, @param4, @param5, @param6,
          @param7, @param8, @param9, @param10, @param11, @param12, @param13, @param14
        )
      `;

      const params = [
        { value: 'TEMP' }, // temporary ticket number
        { value: ticketData.projectId },
        { value: ticketData.typeId },
        { value: ticketData.title },
        { value: ticketData.description || null },
        { value: statusId },
        { value: ticketData.priorityId },
        { value: ticketData.assigneeId || null },
        { value: ticketData.reporterId },
        { value: ticketData.environmentId || null },
        { value: ticketData.serverId || null },
        { value: ticketData.storyPoints || null },
        { value: ticketData.estimatedHours || null },
        { value: ticketData.dueDate || null },
        { value: ticketData.parentTicketId || null }
      ];

      const result = await db.execute(insertQuery, params);

      if (!result.success) {
        return { success: false, error: result.error };
      }

      // Get the inserted ticket ID
      const idResult = await db.query(
        `SELECT id FROM Tickets WHERE ticket_number = 'TEMP' AND project_id = @param0 ORDER BY id DESC`,
        [{ value: ticketData.projectId }]
      );

      if (!idResult.success || idResult.data.length === 0) {
        return { success: false, error: 'Failed to retrieve created ticket' };
      }

      const ticketId = idResult.data[0].id;

      // Update with proper ticket number
      const ticketNumber = projectKey + '-' + String(ticketId).padStart(5, '0');
      await db.execute('UPDATE Tickets SET ticket_number = @param0 WHERE id = @param1', [
        { value: ticketNumber },
        { value: ticketId }
      ]);

      // Log activity
      await logActivity(ticketId, ticketData.reporterId, 'created', null, null, null);

      return { success: true, data: { id: ticketId } };
    } catch (error) {
      console.error('Error creating ticket:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update existing ticket
   */
  async function updateTicket(ticketId, updates, userId) {
    try {
      // Get current ticket data for comparison
      const currentResult = await getTicketById(ticketId);
      if (!currentResult.success) {
        return { success: false, error: 'Ticket not found' };
      }

      const current = currentResult.data;
      const fields = [];
      const params = [];
      let paramIndex = 0;

      // Validate assignee if being updated
      if (updates.assigneeId !== undefined) {
        if (updates.assigneeId !== null) {
          const userCheck = await db.query('SELECT id FROM Users WHERE id = @param0', [{ value: updates.assigneeId }]);
          if (!userCheck.success || !userCheck.data || userCheck.data.length === 0) {
            return { success: false, error: 'Assigned user does not exist' };
          }
        }
        
        if (current.assignee_id !== updates.assigneeId) {
          fields.push(`assignee_id = @param${paramIndex}`);
          params.push({ value: updates.assigneeId || null });
          await logActivity(ticketId, userId, 'updated', 'assignee', current.assignee_username, updates.assigneeId);
          paramIndex++;
        }
      }

      if (updates.title && current.title !== updates.title) {
        fields.push(`title = @param${paramIndex}`);
        params.push({ value: updates.title });
        await logActivity(ticketId, userId, 'updated', 'title', current.title, updates.title);
        paramIndex++;
      }

      if (updates.description !== undefined && current.description !== updates.description) {
        fields.push(`description = @param${paramIndex}`);
        params.push({ value: updates.description });
        await logActivity(ticketId, userId, 'updated', 'description', null, null);
        paramIndex++;
      }

      if (updates.statusId && current.status_id !== updates.statusId) {
        fields.push(`status_id = @param${paramIndex}`);
        params.push({ value: updates.statusId });
        
        // Check if resolving or closing
        const statusResult = await db.query('SELECT category FROM TicketStatuses WHERE id = @param0', [{ value: updates.statusId }]);
        if (statusResult.success && statusResult.data.length > 0) {
          const category = statusResult.data[0].category;
          if (category === 'resolved') {
            fields.push(`resolved_at = GETDATE()`);
          } else if (category === 'closed') {
            fields.push(`closed_at = GETDATE()`);
          }
        }
        
        await logActivity(ticketId, userId, 'updated', 'status', current.status_name, updates.statusId);
        paramIndex++;
      }

      if (updates.priorityId && current.priority_id !== updates.priorityId) {
        fields.push(`priority_id = @param${paramIndex}`);
        params.push({ value: updates.priorityId });
        await logActivity(ticketId, userId, 'updated', 'priority', current.priority_name, updates.priorityId);
        paramIndex++;
      }

      if (updates.typeId && current.type_id !== updates.typeId) {
        fields.push(`type_id = @param${paramIndex}`);
        params.push({ value: updates.typeId });
        await logActivity(ticketId, userId, 'updated', 'type', current.type_name, updates.typeId);
        paramIndex++;
      }

      if (updates.storyPoints !== undefined) {
        fields.push(`story_points = @param${paramIndex}`);
        params.push({ value: updates.storyPoints || null });
        paramIndex++;
      }

      if (updates.estimatedHours !== undefined) {
        fields.push(`estimated_hours = @param${paramIndex}`);
        params.push({ value: updates.estimatedHours || null });
        paramIndex++;
      }

      if (updates.actualHours !== undefined) {
        fields.push(`actual_hours = @param${paramIndex}`);
        params.push({ value: updates.actualHours || null });
        paramIndex++;
      }

      if (updates.dueDate !== undefined) {
        fields.push(`due_date = @param${paramIndex}`);
        params.push({ value: updates.dueDate || null });
        paramIndex++;
      }

      if (fields.length === 0) {
        return { success: true, message: 'No changes to update' };
      }

      fields.push('updated_at = GETDATE()');
      
      const query = `UPDATE Tickets SET ${fields.join(', ')} WHERE id = @param${paramIndex}`;
      params.push({ value: ticketId });

      const result = await db.execute(query, params);
      
      if (!result.success) {
        return { success: false, error: result.error };
      }

      return { success: true, data: { rowsAffected: result.rowsAffected } };
    } catch (error) {
      console.error('Error updating ticket:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a ticket
   */
  async function deleteTicket(ticketId) {
    try {
      const result = await db.execute('DELETE FROM Tickets WHERE id = @param0', [{ value: ticketId }]);
      
      if (!result.success) {
        return { success: false, error: result.error };
      }

      return { success: true, data: { rowsAffected: result.rowsAffected } };
    } catch (error) {
      console.error('Error deleting ticket:', error);
      return { success: false, error: error.message };
    }
  }

  // ==================== COMMENTS ====================

  async function getComments(ticketId) {
    try {
      const result = await db.query(`
        SELECT 
          c.id, c.comment, c.is_internal, c.created_at, c.updated_at,
          u.id user_id, u.username, u.name fullname
        FROM TicketComments c
        INNER JOIN Users u ON c.user_id = u.id
        WHERE c.ticket_id = @param0
        ORDER BY c.created_at ASC
      `, [{ value: ticketId }]);

      return result.success ? { success: true, data: result.data || [] } : result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async function addComment(ticketId, userId, comment, isInternal = false) {
    try {
      const result = await db.execute(`
        INSERT INTO TicketComments (ticket_id, user_id, comment, is_internal)
        OUTPUT INSERTED.id
        VALUES (@param0, @param1, @param2, @param3)
      `, [
        { value: ticketId },
        { value: userId },
        { value: comment },
        { value: isInternal ? 1 : 0 }
      ]);

      if (!result.success) return result;

      await logActivity(ticketId, userId, 'commented', null, null, null);
      return { success: true, data: result.data[0] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ==================== ACTIVITY LOG ====================

  async function logActivity(ticketId, userId, action, fieldName, oldValue, newValue) {
    try {
      await db.execute(`
        INSERT INTO TicketActivityLog (ticket_id, user_id, action, field_name, old_value, new_value)
        VALUES (@param0, @param1, @param2, @param3, @param4, @param5)
      `, [
        { value: ticketId },
        { value: userId },
        { value: action },
        { value: fieldName || null },
        { value: oldValue || null },
        { value: newValue || null }
      ]);
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  }

  async function getActivity(ticketId) {
    try {
      const result = await db.query(`
        SELECT 
          a.id, a.action, a.field_name, a.old_value, a.new_value, a.created_at,
          u.id user_id, u.username, u.name fullname
        FROM TicketActivityLog a
        INNER JOIN Users u ON a.user_id = u.id
        WHERE a.ticket_id = @param0
        ORDER BY a.created_at DESC
      `, [{ value: ticketId }]);

      return result.success ? { success: true, data: result.data || [] } : result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ==================== METADATA ====================

  async function getProjects() {
    const result = await db.query('SELECT * FROM TicketProjects WHERE is_active = 1 ORDER BY name', []);
    return result.success ? { success: true, data: result.data || [] } : result;
  }

  async function createProject(projectData) {
    try {
      const session = getSession();
      if (!session?.id) {
        return { success: false, error: 'User not authenticated' };
      }

      // Validate required fields
      if (!projectData.name || !projectData.key) {
        return { success: false, error: 'Project name and key are required' };
      }

      // Validate key format (uppercase letters only, 2-10 chars)
      const keyRegex = /^[A-Z]{2,10}$/;
      if (!keyRegex.test(projectData.key)) {
        return { success: false, error: 'Project key must be 2-10 uppercase letters (e.g., PROJ, DEV, OPS)' };
      }

      // Check if key already exists
      const existingProject = await db.query(
        'SELECT id FROM TicketProjects WHERE [key] = @param0',
        [{ value: projectData.key }]
      );

      if (existingProject.success && existingProject.data && existingProject.data.length > 0) {
        return { success: false, error: 'Project key already exists. Please choose a unique key.' };
      }

      const result = await db.execute(`
        INSERT INTO TicketProjects (name, [key], description, color, created_by)
        VALUES (@param0, @param1, @param2, @param3, @param4)
      `, [
        { value: projectData.name },
        { value: projectData.key },
        { value: projectData.description || '' },
        { value: projectData.color || '#3b82f6' },
        { value: session.id }
      ]);

      if (result.success) {
        return { success: true, message: 'Project created successfully' };
      }

      return { success: false, error: result.error };
    } catch (error) {
      console.error('Error creating project:', error);
      return { success: false, error: error.message };
    }
  }

  async function getStatuses() {
    const result = await db.query('SELECT * FROM TicketStatuses ORDER BY display_order', []);
    return result.success ? { success: true, data: result.data || [] } : result;
  }

  async function getPriorities() {
    const result = await db.query('SELECT * FROM TicketPriorities ORDER BY level DESC', []);
    return result.success ? { success: true, data: result.data || [] } : result;
  }

  async function getTypes() {
    const result = await db.query('SELECT * FROM TicketTypes ORDER BY name', []);
    return result.success ? { success: true, data: result.data || [] } : result;
  }

  async function getLabels() {
    const result = await db.query('SELECT * FROM TicketLabels ORDER BY name', []);
    return result.success ? { success: true, data: result.data || [] } : result;
  }

  async function getUsers() {
    const result = await db.query('SELECT id, username, name fullname, email FROM Users ORDER BY name', []);
    return result.success ? { success: true, data: result.data || [] } : result;
  }

  // ==================== STATISTICS ====================

  async function getStatistics(filters = {}) {
    try {
      let whereClause = 'WHERE 1=1';
      const params = [];
      let paramIndex = 0;

      if (filters.projectId) {
        whereClause += ` AND project_id = @param${paramIndex}`;
        params.push({ value: filters.projectId });
        paramIndex++;
      }

      const result = await db.query(`
        SELECT 
          COUNT(*) as total_tickets,
          COUNT(CASE WHEN ts.category = 'open' THEN 1 END) as open_tickets,
          COUNT(CASE WHEN ts.category = 'in_progress' THEN 1 END) as in_progress_tickets,
          COUNT(CASE WHEN ts.category = 'resolved' THEN 1 END) as resolved_tickets,
          COUNT(CASE WHEN ts.category = 'closed' THEN 1 END) as closed_tickets,
          COUNT(CASE WHEN tp.level >= 4 THEN 1 END) as high_priority_tickets,
          COUNT(CASE WHEN due_date < GETDATE() AND ts.category NOT IN ('resolved', 'closed') THEN 1 END) as overdue_tickets
        FROM Tickets t
        INNER JOIN TicketStatuses ts ON t.status_id = ts.id
        INNER JOIN TicketPriorities tp ON t.priority_id = tp.id
        ${whereClause}
      `, params);

      return result.success ? { success: true, data: result.data[0] } : result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Export to window
  window.TicketService = {
    // Tickets
    getTickets,
    getTicketById,
    createTicket,
    updateTicket,
    deleteTicket,
    
    // Comments
    getComments,
    addComment,
    
    // Activity
    getActivity,
    
    // Metadata
    getProjects,
    createProject,
    getStatuses,
    getPriorities,
    getTypes,
    getLabels,
    getUsers,
    
    // Statistics
    getStatistics
  };
})();
