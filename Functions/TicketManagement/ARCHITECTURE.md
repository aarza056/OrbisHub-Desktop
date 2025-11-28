# Ticket Management System - Architecture Overview

## 📊 System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     OrbisHub Desktop Application                │
└─────────────────────────────────────────────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
          ┌─────────▼─────────┐    ┌─────────▼──────────┐
          │   User Interface   │    │   Database Layer   │
          │   (Electron App)   │    │   (SQL Server)     │
          └─────────┬──────────┘    └─────────┬──────────┘
                    │                         │
        ┌───────────┴────────────┐           │
        │                        │           │
┌───────▼────────┐    ┌─────────▼────────┐  │
│  ticket-ui.css │    │  ticket-ui.js    │  │
│  (Styling)     │    │  (UI Controller) │  │
└────────────────┘    └─────────┬────────┘  │
                                │           │
                      ┌─────────▼────────┐  │
                      │ ticket-service.js│  │
                      │ (Service Layer)  │  │
                      └─────────┬────────┘  │
                                │           │
                      ┌─────────▼───────────▼──────────┐
                      │      Database Tables           │
                      │  ┌──────────────────────────┐  │
                      │  │ Tickets (Main)           │  │
                      │  │ TicketComments           │  │
                      │  │ TicketActivityLog        │  │
                      │  │ TicketProjects           │  │
                      │  │ TicketPriorities         │  │
                      │  │ TicketStatuses           │  │
                      │  │ TicketTypes              │  │
                      │  │ TicketLabels             │  │
                      │  │ TicketLabelMap           │  │
                      │  │ TicketWatchers           │  │
                      │  │ TicketAttachments        │  │
                      │  └──────────────────────────┘  │
                      └─────────────────────────────────┘
```

---

## 🔄 Data Flow

### Creating a Ticket

```
User clicks "Create Ticket"
        │
        ▼
┌───────────────────┐
│  ticket-ui.js     │ → Opens modal with form
│  openCreateModal()│
└───────┬───────────┘
        │ User fills form and clicks "Create Ticket"
        ▼
┌───────────────────────┐
│  ticket-ui.js         │ → Validates form data
│  handleSaveTicket()   │ → Builds ticketData object
└───────┬───────────────┘
        │
        ▼
┌────────────────────────┐
│  ticket-service.js     │ → Validates assignee exists
│  createTicket()        │ → Checks required fields
└───────┬────────────────┘
        │
        ▼
┌────────────────────────┐
│  SQL Server            │ → INSERT INTO Tickets
│  Database              │ → Trigger generates ticket number
└───────┬────────────────┘
        │
        ▼
┌────────────────────────┐
│  ticket-service.js     │ → Returns new ticket ID
│  logActivity()         │ → Logs "created" activity
└───────┬────────────────┘
        │
        ▼
┌───────────────────────┐
│  ticket-ui.js         │ → Closes modal
│  loadTickets()        │ → Refreshes ticket list
│  loadStatistics()     │ → Updates stats dashboard
└───────────────────────┘
```

---

## 🎨 UI Component Hierarchy

```
view-tickets (Main Container)
│
├── ticket-container
│   │
│   ├── ticket-header
│   │   ├── ticket-search-box
│   │   └── ticket-filter-group
│   │       ├── refreshTicketsBtn
│   │       └── createTicketBtn
│   │
│   ├── ticket-stats (Statistics Dashboard)
│   │   ├── ticket-stat-card (Open)
│   │   ├── ticket-stat-card (In Progress)
│   │   ├── ticket-stat-card (Resolved)
│   │   ├── ticket-stat-card (High Priority)
│   │   ├── ticket-stat-card (Overdue)
│   │   └── ticket-stat-card (Total)
│   │
│   └── ticket-list-container
│       └── ticket-list
│           ├── ticket-card (repeating)
│           │   ├── ticket-card-header
│           │   │   ├── ticket-type-icon
│           │   │   └── ticket-card-content
│           │   │       ├── ticket-number
│           │   │       ├── ticket-title
│           │   │       └── ticket-description
│           │   ├── ticket-card-footer
│           │   │   ├── ticket-priority-badge
│           │   │   ├── ticket-status-badge
│           │   │   └── ticket-assignee
│           │   └── ticket-meta
│           │       ├── comments-count
│           │       ├── attachments-count
│           │       └── due-date
│           └── [More ticket cards...]
```

---

## 📋 Database Relationships

```
Users ──────┐
            │
            ├──► Tickets ◄──── TicketProjects
            │      │
            │      ├──────────► TicketComments
            │      ├──────────► TicketActivityLog
            │      ├──────────► TicketWatchers
            │      ├──────────► TicketAttachments
            │      └──────────► TicketLabelMap ──► TicketLabels
            │
            └──► TicketPriorities
                 TicketStatuses
                 TicketTypes

Environments ──┐
               ├──► Tickets (optional links)
Servers ───────┘
```

---

## 🔐 Security & Validation Flow

```
┌─────────────────────┐
│ User Action         │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ UI Validation       │ → Required fields
│ (ticket-ui.js)      │ → Format checks
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Service Validation  │ → User exists check
│ (ticket-service.js) │ → Business logic
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Database Validation │ → Foreign keys
│ (SQL Server)        │ → Constraints
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Success/Error       │
│ Response            │
└─────────────────────┘
```

---

## 📊 Statistics Calculation

```
┌────────────────────────────────────────────────┐
│  SQL Aggregate Query (getStatistics)           │
├────────────────────────────────────────────────┤
│                                                │
│  SELECT                                        │
│    COUNT(*) as total_tickets,                  │
│    COUNT(CASE WHEN status='open' ... )         │
│    COUNT(CASE WHEN status='in_progress' ... )  │
│    COUNT(CASE WHEN priority='high' ... )       │
│    COUNT(CASE WHEN due_date < NOW ... )        │
│  FROM Tickets                                  │
│                                                │
└────────────────┬───────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────┐
│  ticket-ui.js renders stat cards               │
│  - Color coding based on type                  │
│  - Click handlers for filtering                │
└────────────────────────────────────────────────┘
```

---

## 🎯 Ticket Lifecycle

```
┌─────────┐
│ Created │ → Ticket number generated (ORB-00001)
└────┬────┘   Reporter assigned (current user)
     │        Status: Open
     ▼
┌─────────┐
│  Open   │ → Awaiting assignment or action
└────┬────┘
     │
     ▼
┌──────────────┐
│ In Progress  │ → Assigned to user, work started
└────┬─────────┘
     │
     ├─────────┐
     ▼         ▼
┌─────────┐ ┌──────────┐
│Blocked  │ │In Review │
└────┬────┘ └────┬─────┘
     │           │
     └─────┬─────┘
           ▼
     ┌──────────┐
     │ Resolved │ → Work complete, awaiting verification
     └────┬─────┘   resolved_at timestamp set
          │
          ▼
     ┌────────┐
     │ Closed │ → Verified complete
     └────┬───┘   closed_at timestamp set
          │
          │ (if needed)
          ▼
     ┌──────────┐
     │ Reopened │ → Issue returned
     └──────────┘
```

---

## 🔍 Search & Filter Architecture

```
User types in search box
        │
        ▼
┌─────────────────┐
│ Debounce (300ms)│ → Prevents excessive queries
└────────┬────────┘
         │
         ▼
┌──────────────────────┐
│ Build filter object  │ → { search: "text" }
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│ SQL LIKE query       │ → WHERE title LIKE '%text%'
│                      │   OR description LIKE '%text%'
│                      │   OR ticket_number LIKE '%text%'
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│ Return filtered data │
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│ Re-render ticket list│
└──────────────────────┘
```

---

## 💾 Data Storage

### Tables Size Estimates (for planning)

| Table | Typical Size per Row | Growth Rate |
|-------|---------------------|-------------|
| Tickets | ~500 bytes | 10-100 per day |
| TicketComments | ~300 bytes | 20-200 per day |
| TicketActivityLog | ~200 bytes | 50-500 per day |
| TicketWatchers | ~20 bytes | Slow |
| TicketAttachments | Variable | As needed |

### Indexes Created

```
Tickets:
  ├── IX_Tickets_Project (project_id)
  ├── IX_Tickets_Status (status_id)
  ├── IX_Tickets_Assignee (assignee_id)
  ├── IX_Tickets_Reporter (reporter_id)
  ├── IX_Tickets_DueDate (due_date)
  └── IX_Tickets_CreatedAt (created_at)

TicketComments:
  ├── IX_TicketComments_Ticket (ticket_id)
  └── IX_TicketComments_CreatedAt (created_at)

TicketActivityLog:
  ├── IX_TicketActivityLog_Ticket (ticket_id)
  └── IX_TicketActivityLog_CreatedAt (created_at)
```

---

## 🚀 Performance Optimizations

1. **Database Level**
   - Indexes on frequently queried columns
   - Foreign keys for referential integrity
   - Efficient aggregate queries for statistics

2. **Service Level**
   - Single query for ticket list with JOINs
   - Parameterized queries prevent SQL injection
   - Batch operations where possible

3. **UI Level**
   - Debounced search (300ms)
   - Virtual scrolling ready (for large datasets)
   - Lazy loading of comments/activity
   - CSS animations with GPU acceleration

---

## 🔄 Integration Points

### Existing OrbisHub Tables Used

```
Users
  ├── assignee_id (FK)
  ├── reporter_id (FK)
  └── User validation on assignment

Environments
  └── environment_id (FK, optional)

Servers
  └── server_id (FK, optional)
```

### New Additions

```
Navigation Sidebar
  └── "Ticket Management" button added

app-main.js
  └── showView('tickets') → TicketUI.init()

index.html
  ├── CSS link to ticket-ui.css
  ├── Script tags for ticket-service.js and ticket-ui.js
  └── view-tickets section added
```

---

This architecture provides:
✅ Scalability for thousands of tickets
✅ Professional user experience
✅ Data integrity and validation
✅ Easy integration with existing OrbisHub features
✅ Room for future enhancements
