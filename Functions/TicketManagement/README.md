# Ticket Management System

A professional ticketing system for OrbisHub Desktop, similar to Jira, designed to manage tasks, bugs, features, and other work items.

## 🎯 Features

### Core Functionality
- **Ticket Creation & Management**: Create, edit, and delete tickets with full CRUD operations
- **User Assignment**: Assign tickets to existing users with validation
- **Project Organization**: Organize tickets by projects with unique keys (e.g., ORB-00001)
- **Status Tracking**: Track ticket progress through customizable statuses (Open, In Progress, Resolved, Closed, etc.)
- **Priority Levels**: Set priority from Critical to Trivial
- **Ticket Types**: Bug, Feature, Task, Improvement, Question, Epic

### Advanced Features
- **Comments System**: Add internal and external comments to tickets
- **Activity Logging**: Automatic tracking of all ticket changes
- **Watchers**: Add users to watch specific tickets
- **Labels**: Tag tickets with custom labels for organization
- **Attachments**: Support for file attachments (database schema ready)
- **Time Tracking**: Story points, estimated hours, and actual hours
- **Due Dates**: Set and track deadlines with overdue indicators
- **Parent/Child Relationships**: Create ticket hierarchies (e.g., Epics with subtasks)
- **Environment & Server Linking**: Associate tickets with specific environments or servers

### Statistics & Reporting
- **Dashboard**: Visual statistics showing open, in-progress, resolved, and overdue tickets
- **Filtering**: Search and filter tickets by project, status, assignee, priority, and type
- **Real-time Updates**: Automatic refresh of ticket data

## 📁 File Structure

```
Functions/TicketManagement/
├── ticket-schema.sql      # Database schema with all tables
├── ticket-service.js      # Backend service layer for data operations
├── ticket-ui.js          # Frontend UI controller
└── ticket-ui.css         # Professional styling
```

## 🗄️ Database Schema

### Tables Created
1. **TicketPriorities**: Priority levels (Critical, High, Medium, Low, Trivial)
2. **TicketStatuses**: Status workflow (Open, In Progress, Blocked, In Review, Resolved, Closed, Reopened)
3. **TicketTypes**: Ticket types (Bug, Feature, Task, Improvement, Question, Epic)
4. **TicketProjects**: Project organization with unique keys
5. **Tickets**: Main ticket table with all fields
6. **TicketComments**: Comments on tickets
7. **TicketAttachments**: File attachments (ready for implementation)
8. **TicketWatchers**: Users watching tickets
9. **TicketActivityLog**: Audit trail of all changes
10. **TicketLabels**: Custom labels
11. **TicketLabelMap**: Ticket-to-label relationships

### Automatic Features
- **Auto-generated Ticket Numbers**: Trigger creates unique numbers (e.g., ORB-00001)
- **Timestamps**: Automatic created_at, updated_at, resolved_at, closed_at
- **Referential Integrity**: Foreign keys ensure data consistency
- **Cascading Deletes**: Related data is cleaned up automatically

## 🎨 UI/UX Design

### Navigation
Located under the "Administration" section, right after "Notifications" in the sidebar menu.

### Main View Components
1. **Header Bar**: Search box, filter buttons, and "Create Ticket" button
2. **Statistics Dashboard**: 6 stat cards showing ticket counts by status and priority
3. **Ticket List**: Card-based layout with:
   - Ticket number and title
   - Type icon with color coding
   - Status and priority badges
   - Assignee avatar
   - Comment count, attachment count, due date
   - Overdue indicators

### Ticket Detail Modal
Split view with:
- **Left Panel**: 
  - Ticket description
  - Comments section with add comment form
  - Activity log showing all changes
- **Right Sidebar**:
  - Status, priority, assignee, reporter
  - Due date, story points, estimated hours
  - Action buttons (Edit, Delete)

### Create/Edit Modal
Professional form with:
- Title (required)
- Project selection (required)
- Type selection (required)
- Priority selection (required)
- Assignee dropdown (validates against existing users)
- Description textarea
- Story points, estimated hours, due date
- Form validation

### Color Scheme
- **Critical Priority**: Red (#dc2626)
- **High Priority**: Orange (#ea580c)
- **Medium Priority**: Amber (#f59e0b)
- **Low Priority**: Blue (#3b82f6)
- **Trivial Priority**: Gray (#6b7280)
- **Status Colors**: Matching the workflow (Open=Blue, In Progress=Amber, Resolved=Green, etc.)

### Responsive Design
- Desktop: Full multi-column layout
- Tablet: Adjusted grid layouts
- Mobile: Stacked single-column layout

## 🚀 Installation

### ✅ Automatic Installation

The Ticket Management System is **automatically installed** when you set up OrbisHub Desktop. No manual installation required!

**What happens automatically:**
- Database schema created on first database setup
- All 11 tables created with indexes and constraints
- Default data inserted (priorities, statuses, types, labels, default project)
- Trigger created for auto-generating ticket numbers
- UI files already linked and integrated

### First-Time Setup

When you first install OrbisHub Desktop and run through the database setup wizard, the ticket management tables are created automatically along with all other system tables.

### Verification

After database setup is complete:
1. Open OrbisHub Desktop
2. Login
3. Look for "Ticket Management" in the sidebar under Administration
4. Click it to access the ticketing system

That's it! Everything is ready to use immediately.

### Manual Installation (Optional)

If you need to install the schema separately (for development or testing):

```powershell
# Option 1: Use the installer script
cd Functions/TicketManagement
.\Install-TicketManagement.ps1

# Option 2: Execute SQL directly
# Open ticket-schema.sql in SQL Server Management Studio and execute
```

**Note:** The schema uses `IF NOT EXISTS` checks, so it's safe to run multiple times and won't overwrite existing data.

## 📝 Usage

### Creating a Ticket
1. Click "Create Ticket" button in the top-right
2. Fill in required fields:
   - Title
   - Project
   - Type
   - Priority
3. Optionally assign to a user (dropdown validates existing users)
4. Add description, story points, estimated hours, due date
5. Click "Create Ticket"

### Assigning Users
The assignee dropdown is automatically populated with all users from the database. The system validates that the selected user exists before saving.

### Viewing Tickets
- Click any ticket card to open the detail view
- View comments, activity, and all ticket information
- Edit or delete from the detail view

### Filtering & Search
- Use the search box to find tickets by number, title, or description
- Click stat cards to filter by status category
- Use filter buttons (coming soon) for advanced filtering

### Adding Comments
1. Open a ticket detail view
2. Type in the comment box at the bottom
3. Click "Add Comment"
4. Comments appear in chronological order

## 🔧 API Methods

### TicketService
```javascript
// Tickets
await TicketService.getTickets(filters)
await TicketService.getTicketById(ticketId)
await TicketService.createTicket(ticketData)
await TicketService.updateTicket(ticketId, updates, userId)
await TicketService.deleteTicket(ticketId)

// Comments
await TicketService.getComments(ticketId)
await TicketService.addComment(ticketId, userId, comment, isInternal)

// Activity
await TicketService.getActivity(ticketId)

// Metadata
await TicketService.getProjects()
await TicketService.getStatuses()
await TicketService.getPriorities()
await TicketService.getTypes()
await TicketService.getLabels()
await TicketService.getUsers()

// Statistics
await TicketService.getStatistics(filters)
```

### TicketUI
```javascript
// Initialize
await TicketUI.init()

// Actions
TicketUI.openCreateModal()
TicketUI.openTicketDetail(ticketId)
TicketUI.addComment(ticketId)
TicketUI.deleteTicket(ticketId)
TicketUI.filterByStatus(category)
TicketUI.refresh()
```

## 🎯 Best Practices

### Ticket Numbering
- Format: `{PROJECT_KEY}-{SEQUENTIAL_NUMBER}`
- Example: `ORB-00001`, `ORB-00002`
- Automatically generated on creation
- Unique across all projects

### Status Workflow
1. **Open**: New ticket, not yet started
2. **In Progress**: Work has begun
3. **Blocked**: Cannot proceed due to dependency
4. **In Review**: Work complete, under review
5. **Resolved**: Issue fixed, awaiting verification
6. **Closed**: Verified and complete
7. **Reopened**: Resolved ticket that needs more work

### Priority Guidelines
- **Critical**: System down, data loss, security breach
- **High**: Major feature broken, significant impact
- **Medium**: Normal bugs, standard features
- **Low**: Minor issues, nice-to-haves
- **Trivial**: Cosmetic issues, documentation typos

## 🔐 Security

- User validation on assignment (checks Users table)
- Session-based user identification for reporters
- Activity logging for audit trail
- Input sanitization in UI layer
- SQL injection prevention via parameterized queries

## 🎨 Customization

### Adding Custom Ticket Types
```sql
INSERT INTO TicketTypes (name, icon, color) 
VALUES ('Custom Type', 'icon-name', '#hexcolor');
```

### Adding Custom Statuses
```sql
INSERT INTO TicketStatuses (name, color, category, display_order) 
VALUES ('Custom Status', '#hexcolor', 'in_progress', 10);
```

### Adding Custom Labels
```sql
INSERT INTO TicketLabels (name, color) 
VALUES ('custom-label', '#hexcolor');
```

## 🐛 Troubleshooting

### Tickets Not Loading
1. Check database connection
2. Verify schema is installed
3. Check browser console for errors
4. Ensure TicketService is initialized

### Assignee Dropdown Empty
1. Verify Users table has data
2. Check `TicketService.getUsers()` returns successfully
3. Look for SQL errors in console

### Comments Not Saving
1. Verify session user is valid
2. Check `ticket_id` is correct
3. Ensure TicketComments table exists

## 📈 Future Enhancements

- [ ] Advanced filtering UI (by assignee, date range, custom fields)
- [ ] File attachment upload/download functionality
- [ ] Email notifications on ticket updates
- [ ] Kanban board view
- [ ] Sprint planning and management
- [ ] Time tracking with work logs
- [ ] Custom fields per project
- [ ] Ticket templates
- [ ] Bulk operations
- [ ] Export to CSV/Excel
- [ ] REST API endpoints for external integration
- [ ] Webhook support
- [ ] SLA tracking and alerts

## 📄 License

Part of OrbisHub Desktop - By Admins, For Admins

---

**Version**: 1.0.0  
**Created**: November 2025  
**Author**: OrbisHub Team
