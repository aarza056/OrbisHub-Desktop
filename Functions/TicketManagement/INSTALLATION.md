# Quick Installation Guide - Ticket Management System

## 🚀 Quick Start (3 Steps)

### Step 1: Install Database Schema
Open SQL Server Management Studio and connect to your OrbisHub database, then execute:

```powershell
# Or run from PowerShell in the project directory:
cd "C:\Users\Ashot\Documents\GitHub\OrbisHub-Desktop\Functions\TicketManagement"

# Execute the schema file against your database
sqlcmd -S "localhost\SQLEXPRESS" -d "OrbisHub" -i "ticket-schema.sql" -E
```

Or manually:
1. Open `Functions/TicketManagement/ticket-schema.sql`
2. Execute it in your SQL Server Management Studio against the OrbisHub database

### Step 2: Verify Installation
The following files are already integrated into your application:
- ✅ `ticket-ui.css` - Linked in `app/index.html`
- ✅ `ticket-service.js` - Linked in `app/index.html`
- ✅ `ticket-ui.js` - Linked in `app/index.html`
- ✅ Navigation button added to sidebar
- ✅ View section added to HTML
- ✅ Initialization code added to `app-main.js`

### Step 3: Test the System
1. **Restart your application** (if it's running)
2. **Login** to OrbisHub Desktop
3. **Navigate** to the sidebar menu
4. **Click** "Ticket Management" (under Administration, right after Notifications)
5. **Create** your first ticket!

## ✅ Verification Checklist

After installation, verify:

- [ ] Database tables created (10 tables starting with "Ticket")
- [ ] Default data inserted (priorities, statuses, types, labels)
- [ ] "Ticket Management" button appears in sidebar
- [ ] Statistics dashboard loads with data
- [ ] "Create Ticket" button works
- [ ] Users dropdown is populated with existing users
- [ ] Ticket can be created and saved successfully
- [ ] Ticket appears in the ticket list
- [ ] Click on ticket opens detail view
- [ ] Comments can be added
- [ ] Activity log shows changes

## 🗄️ Database Tables Created

The schema creates these tables:
1. `TicketPriorities` - 5 default priorities
2. `TicketStatuses` - 7 default statuses
3. `TicketTypes` - 6 default types
4. `TicketProjects` - 1 default project (OrbisHub)
5. `Tickets` - Main tickets table
6. `TicketComments` - Comments system
7. `TicketAttachments` - Attachments (ready for future use)
8. `TicketWatchers` - Watch functionality
9. `TicketActivityLog` - Audit trail
10. `TicketLabels` - 7 default labels
11. `TicketLabelMap` - Label associations

## 🔧 Troubleshooting

### Schema Installation Issues

**Error: "Table already exists"**
- The schema uses `IF NOT EXISTS` checks, so it's safe to run multiple times
- If you need to start fresh, manually drop the tables in reverse order

**Error: "Cannot find Users table"**
- Ensure your main OrbisHub database schema is installed
- The ticket system requires the `Users`, `Environments`, and `Servers` tables

**Error: "Foreign key constraint failed"**
- Check that you have at least one admin user in the Users table
- The default project creation requires an admin user

### UI Not Loading

**Ticket Management button not appearing**
- Clear browser cache and hard reload (Ctrl+Shift+R)
- Check browser console for JavaScript errors
- Verify files are in correct location

**"Loading tickets..." stuck**
- Open browser console (F12)
- Check for database connection errors
- Verify ticket-service.js is loaded correctly
- Check SQL Server is running

**User dropdown empty**
- Verify you have users in the Users table
- Check browser console for errors in `getUsers()` call

### Performance Issues

**Slow ticket loading**
- The schema includes indexes on key fields
- For large datasets (1000+ tickets), consider:
  - Adding pagination
  - Implementing server-side filtering
  - Creating additional indexes

## 📝 Default Data

### Default Project
- **Name**: OrbisHub
- **Key**: ORB
- **Description**: Default OrbisHub project for system administration tasks
- **Color**: #8aa2ff

### Priorities (Highest to Lowest)
1. Critical (Red #dc2626)
2. High (Orange #ea580c)
3. Medium (Amber #f59e0b)
4. Low (Blue #3b82f6)
5. Trivial (Gray #6b7280)

### Statuses
1. Open (Blue)
2. In Progress (Amber)
3. Blocked (Red)
4. In Review (Purple)
5. Resolved (Green)
6. Closed (Gray)
7. Reopened (Orange)

### Types
1. Bug (Red, bug icon)
2. Feature (Purple, star icon)
3. Task (Blue, checklist icon)
4. Improvement (Green, trending-up icon)
5. Question (Amber, help-circle icon)
6. Epic (Pink, layers icon)

### Labels
1. urgent (Red)
2. security (Orange)
3. performance (Amber)
4. ui-ux (Purple)
5. backend (Blue)
6. database (Green)
7. documentation (Gray)

## 🎯 First Ticket Example

After installation, try creating this ticket:

- **Title**: Test Ticket - System Working
- **Project**: OrbisHub
- **Type**: Task
- **Priority**: Medium
- **Assignee**: [Your User]
- **Description**: This is a test ticket to verify the ticketing system is working correctly.

Click "Create Ticket" and you should see it appear in the list as `ORB-00001`.

## 🆘 Getting Help

If you encounter issues:

1. **Check the README.md** for detailed documentation
2. **Browser Console**: Press F12 and check for JavaScript errors
3. **Database Logs**: Check SQL Server logs for errors
4. **File Paths**: Verify all files are in `Functions/TicketManagement/`

## 🎉 Success!

Once you see the ticket management dashboard with statistics and can create/view tickets, you're all set! The system is ready to use.

### Next Steps
- Create your first real ticket
- Assign tickets to team members
- Set up projects for different areas
- Customize labels for your workflow
- Start tracking work!

---

**Installation Time**: ~5 minutes  
**Difficulty**: Easy  
**Requirements**: SQL Server, OrbisHub Desktop installed
