# Password Manager - Quick Reference

## 🚀 Getting Started

### Installation
1. Run `password-schema.sql` in your OrbisHub database
2. Refresh OrbisHub Desktop
3. Click "Password Manager" in the left menu

### First Password
1. Click **"Add Password"** button
2. Fill in Name, Username, Password
3. (Optional) Use **"🎲 Generate Password"**
4. Click **"Create Password"**

---

## 📖 Features Guide

### 🔍 Search & Filter
| Action | How To |
|--------|--------|
| Search | Type in search box (searches name, username, URL) |
| Filter by category | Click category in sidebar |
| Show favorites only | Click "Favorites" button |
| Clear filters | Click "All Passwords" category |

### 👁️ View Passwords
| Action | How To |
|--------|--------|
| View password | Click password in list |
| Show/hide password | Click eye icon 👁️ |
| Copy username | Click copy button next to username |
| Copy password | Click copy button next to password |
| Copy URL | Click copy button next to URL |

### ✏️ Manage Passwords
| Action | How To |
|--------|--------|
| Create new | Click "Add Password" |
| Edit existing | Click "Edit" button |
| Delete | Click "Delete" button (confirms first) |
| Mark as favorite | Check "Mark as favorite" when editing |

### 🎲 Password Generator
When creating/editing a password:
1. Click **"🎲 Generate Password"**
2. Adjust options:
   - ✅ Uppercase letters
   - ✅ Lowercase letters
   - ✅ Numbers
   - ✅ Symbols
3. Adjust length slider (8-32 chars)
4. Generated password appears in password field

---

## 📋 Categories

Default categories with icons:
- 👤 Personal
- 💼 Work
- 💳 Financial
- 📱 Social Media
- 📧 Email
- 💻 Development
- 🗄️ Database
- 🖥️ Server
- 📝 Other

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+F` | Focus search box |
| `Enter` | Open selected password |
| `Esc` | Close modal |

---

## 🛡️ Security Tips

### Strong Passwords
✅ Use password generator  
✅ At least 16 characters  
✅ Mix uppercase, lowercase, numbers, symbols  
✅ Avoid common words or patterns  

### Best Practices
✅ Unique password for each account  
✅ Update passwords regularly  
✅ Mark sensitive passwords as favorites  
✅ Add notes for security questions  
✅ Include URLs for quick access  

### What NOT to Do
❌ Don't use same password twice  
❌ Don't share passwords via insecure channels  
❌ Don't write passwords on paper  
❌ Don't use personal information in passwords  

---

## 🔐 Password Strength

| Indicator | Meaning | Recommendation |
|-----------|---------|----------------|
| 🔴 Very Weak | < 8 chars, simple | Add length & complexity |
| 🟠 Weak | 8+ chars, basic | Add special characters |
| 🟡 Fair | 12+ chars, mixed | Good for low-security |
| 🟢 Strong | 16+ chars, complex | Good for most accounts |
| 💚 Very Strong | 20+ chars, highly complex | Perfect for critical accounts |

---

## 📊 Understanding the Interface

### Sidebar (Left)
```
🔐 Password Manager
├── 🔍 Search box
├── 📁 Categories
│   ├── All Passwords (123)
│   ├── Personal (45)
│   ├── Work (32)
│   └── ...
└── 📝 Password List
```

### Main Area (Right)
```
Password Details
├── 👁️ Name & icon
├── 📋 Username (copy)
├── 🔒 Password (show/hide/copy)
├── 🔗 URL (clickable/copy)
├── 📝 Notes
└── 📁 Category
```

---

## 🔧 Troubleshooting

### Password Manager not visible
- Check database schema is installed
- Verify JavaScript console for errors
- Refresh browser (Ctrl+F5)

### Can't create passwords
- Ensure you're logged in
- Check database permissions
- Verify required fields are filled

### Copy not working
- Check browser clipboard permissions
- Try right-click copy instead
- Update browser to latest version

### Search not working
- Clear search box and try again
- Check if passwords exist
- Try different search terms

---

## 📞 Quick Actions

### Common Tasks
```
Create Password:    Add Password → Fill Form → Create
View Password:      Click in List → Click Eye Icon
Copy Password:      Click in List → Click Copy Icon
Edit Password:      Select → Edit → Update
Delete Password:    Select → Delete → Confirm
Find Password:      Type in Search → Click Result
```

---

## 💡 Pro Tips

1. **Use Categories**: Organize passwords by type for easy finding
2. **Star Favorites**: Mark frequently used passwords
3. **Add Notes**: Include security questions, recovery emails
4. **Include URLs**: Quick access to login pages
5. **Regular Updates**: Change passwords every 90 days
6. **Audit Regularly**: Review access logs periodically

---

## 🎯 Example Workflow

### Adding a New Work Email Password
1. Click **"Add Password"**
2. Name: `Work Email - john.doe@company.com`
3. Username: `john.doe@company.com`
4. Click **"Generate Password"** (16 chars, all options)
5. URL: `https://mail.company.com`
6. Category: `Email`
7. Notes: `Recovery: personal@email.com`
8. Check **"Mark as favorite"** ⭐
9. Click **"Create Password"**

### Finding & Using a Password
1. Type `gmail` in search box
2. Click on the result
3. Click copy icon next to username
4. Click copy icon next to password
5. Click URL to open login page
6. Paste credentials and login

---

## 📈 Statistics

Track your password security:
- Total passwords stored
- Passwords by category
- Recent additions
- Most accessed passwords

---

**Need Help?** Check `README.md` or `INSTALLATION.md` for detailed documentation.
