# OrbisHub - Complete Platform Guide

**A Comprehensive DevOps & IT Management Platform**  
*By Admins, For Admins*

---

## 📋 Table of Contents

1. [What is OrbisHub?](#what-is-orbishub)
2. [Core Platform Components](#core-platform-components)
3. [Key Features](#key-features)
4. [Feature Modules](#feature-modules)
5. [Security & Compliance](#security--compliance)
6. [Technical Specifications](#technical-specifications)
7. [Deployment Architecture](#deployment-architecture)
8. [Support & Getting Started](#support--getting-started)

---

## What is OrbisHub?

OrbisHub is an enterprise-grade, all-in-one IT management platform designed specifically for DevOps teams, system administrators, and IT professionals. It centralizes remote access management, server monitoring, team collaboration, and IT operations into a single, secure desktop application.

### Why OrbisHub?

- **Centralized Management**: All your servers, credentials, environments, and tools in one place
- **Enhanced Security**: Bank-level encryption, role-based access, and comprehensive audit trails
- **Team Collaboration**: Built-in messaging, ticket management, and shared resources
- **Automation Ready**: Remote script execution, monitoring agents, and integration capabilities
- **Compliance Focused**: Complete audit logging and activity tracking for regulatory requirements

---

## Core Platform Components

### 1. **OrbisHub Desktop Application**
The main desktop client built on Electron framework, providing a modern, intuitive interface for all platform features.

- **Cross-platform Support**: Windows, with native integration
- **Offline Capability**: Works even when disconnected from network
- **Auto-Update System**: Seamless updates via GitHub releases
- **Secure Local Storage**: Encrypted credential vault

### 2. **OrbisHub Core Service**
A Windows Service that acts as the central API controller for the entire ecosystem.

- **REST API**: Modern ASP.NET Core web service
- **Agent Management**: Controls all OrbisAgent communications
- **Job Orchestration**: Manages remote execution queue
- **Always Running**: Auto-starts on boot with high availability
- **Event Logging**: Integrated with Windows Event Log

### 3. **OrbisAgent**
Lightweight PowerShell-based agents deployed on Windows machines for remote monitoring and management.

- **Self-Registering**: Automatic setup and identity management
- **Remote Execution**: Run PowerShell and CMD scripts remotely
- **System Metrics**: CPU, memory, disk usage collection
- **Heartbeat Monitoring**: Real-time online/offline status
- **Minimal Footprint**: Lightweight with low resource usage

### 4. **SQL Server Database**
Microsoft SQL Server backend providing robust, scalable data storage.

- **Enterprise-Grade**: Supports LocalDB, Express, and Full editions
- **Encrypted Storage**: AES-256 encryption for sensitive data
- **Automated Migrations**: Schema management and versioning
- **Connection Pooling**: Optimized performance
- **Backup Ready**: Standard SQL backup/restore capabilities

---

## Key Features

### 🖥️ **Remote Desktop Management**

**Secure, Organized Access to Your Infrastructure**

- **Native RDP Connections**: One-click access to Windows servers via mstsc.exe
- **SSH/PuTTY Integration**: Seamless SSH connections to Linux servers
- **Credential Vault**: AES-256 encrypted storage for all credentials
- **Server Inventory**: Complete catalog with grouping and tagging
- **Connection History**: Full audit trail of all remote sessions
- **Quick Connect**: Save favorite connections for instant access

**Use Cases:**
- Daily server administration and maintenance
- Emergency access to production systems
- Organized team access to shared infrastructure
- Contractor access management with full audit trails

---

### 🌐 **Environment Management**

**Organize Your Infrastructure by Environment**

- **Multi-Environment Support**: Dev, QA, UAT, Production, and custom environments
- **Server Mapping**: Associate servers with specific environments
- **Health Monitoring**: Real-time status and uptime tracking
- **URL Management**: Quick access to web interfaces and dashboards
- **Visual Dashboard**: At-a-glance view of all environments
- **Environment Notes**: Document configuration and deployment details

**Use Cases:**
- Separate development, testing, and production environments
- Track server health across your entire infrastructure
- Manage deployment pipelines
- Provide clients with environment status visibility

---

### 🔐 **Enterprise Security**

**Bank-Level Security for Your Operations**

#### User Management
- **Multi-User Support**: Unlimited users with individual accounts
- **Role-Based Access**: Admin and Viewer roles with granular permissions
- **Password Policies**: Enforced complexity requirements
- **PBKDF2 Hashing**: Military-grade password protection with salt
- **Account Lockout**: Protection against brute force (5 attempts)
- **Force Password Change**: Require password updates on first login

#### Session Security
- **Auto-Logout**: 10-minute inactivity timeout
- **Session Tracking**: Monitor active and historical sessions
- **IP Address Logging**: Record access location for all actions
- **Activity Timestamps**: Last activity tracking per user

**Use Cases:**
- Secure multi-team access with different permission levels
- Compliance with security policies and regulations
- Prevent unauthorized access attempts
- Meet audit requirements for access control

---

### 📊 **Audit & Compliance**

**Complete Visibility into All System Activities**

- **Comprehensive Audit Logs**: Every action tracked (create, update, delete, connect)
- **User Activity Tracking**: Who did what, when, and where
- **IP Address Recording**: Source location for all actions
- **Advanced Filtering**: Search by action type, entity, user, or keyword
- **Pagination Support**: Handle millions of audit records efficiently
- **Export Capabilities**: Extract data for compliance reporting
- **Permanent Records**: Audit logs cannot be deleted or modified

**Tracked Actions:**
- User logins and logouts
- Credential access and usage
- Server connections (RDP/SSH)
- Configuration changes
- Data modifications
- Administrative actions

**Use Cases:**
- SOX, HIPAA, PCI-DSS compliance reporting
- Security incident investigation
- Performance reviews and access audits
- Regulatory compliance demonstrations

---

### 💬 **Team Messaging**

**Secure Internal Communication**

- **Direct Messaging**: Peer-to-peer communication between users
- **End-to-End Encryption**: AES-256-CBC encryption for all messages
- **File Attachments**: Share files securely via encrypted storage
- **Desktop Notifications**: Real-time alerts for new messages
- **Read Receipts**: Track message delivery and read status
- **Message History**: Persistent conversation storage
- **Search Functionality**: Find past conversations and shared files

**Use Cases:**
- Coordinate during incidents and outages
- Share credentials and sensitive information securely
- Document decisions and change approvals
- Replace insecure email for internal IT communications

---

### 📈 **Server Health Monitoring**

**Real-Time Infrastructure Status**

- **Multi-Protocol Checks**: ICMP ping and TCP port probing
- **Connectivity Testing**: Automatic fallback for reliable detection
- **Uptime Reporting**: WMI/CIM for Windows, /proc/uptime for Linux
- **Port Monitoring**: Verify specific services are running
- **Visual Indicators**: Green/Yellow/Red status at a glance
- **Historical Data**: Track uptime trends over time

**Monitored Metrics:**
- Server online/offline status
- Response time and latency
- System uptime duration
- Critical service availability
- Network connectivity

**Use Cases:**
- Proactive monitoring of production systems
- Quick identification of outages
- SLA reporting and uptime tracking
- Capacity planning and trending

---

## Feature Modules

OrbisHub includes several powerful add-on modules that extend the platform's capabilities:

### 🎫 **Ticket Management System**

**Professional Task & Issue Tracking (Jira-like)**

Manage your IT operations with a comprehensive ticketing system.

#### Core Capabilities
- **Ticket Types**: Bug, Feature, Task, Improvement, Question, Epic
- **Priority Levels**: Critical, High, Medium, Low, Trivial
- **Status Workflow**: Open → In Progress → In Review → Resolved → Closed
- **User Assignment**: Assign tickets to team members
- **Project Organization**: Organize by projects with unique keys (ORB-00001)

#### Advanced Features
- **Comments System**: Internal and external comments
- **Activity Logging**: Automatic change tracking
- **Watchers**: Subscribe to ticket updates
- **Labels & Tags**: Custom categorization
- **File Attachments**: Attach documents and screenshots
- **Time Tracking**: Story points, estimated and actual hours
- **Due Dates**: Deadlines with overdue indicators
- **Parent/Child Tickets**: Create hierarchies and subtasks
- **Environment Linking**: Associate tickets with specific servers

#### Dashboard & Reporting
- **Visual Statistics**: Open, in-progress, resolved, overdue counts
- **Filtering**: Search by project, status, assignee, priority, type
- **Real-time Updates**: Automatic data refresh

**Use Cases:**
- Track bugs and feature requests
- Manage sprint planning and development tasks
- Coordinate maintenance activities
- Document incidents and resolutions
- Manage change requests

---

### 🔒 **Password Manager**

**Secure Password Vault (KeePass-like)**

A built-in password management system for team credentials.

#### Features
- **Encrypted Storage**: AES-256 encryption for all passwords
- **Categories**: Organize by Personal, Work, Financial, etc.
- **Password Generator**: Create strong, random passwords
- **Strength Indicator**: Visual feedback on password security
- **Quick Copy**: Double-click to copy credentials to clipboard
- **URL Storage**: Save website links with credentials
- **Notes Field**: Store additional information
- **Favorites**: Mark frequently used passwords
- **Search & Filter**: Quickly find credentials
- **Audit Trail**: Track who accessed passwords and when

**Use Cases:**
- Store shared admin passwords securely
- Manage application credentials
- Document service account passwords
- Rotate and track password changes
- Replace shared Excel files and text documents

---

### 🐛 **Bug Reporting System**

**Streamlined Bug Submission to Development Team**

Allow users to submit detailed bug reports directly from the application.

#### Features
- **Severity Levels**: Critical, High, Medium, Low, Minor
- **Categories**: UI/UX, Functionality, Performance, Security, Data, Integration
- **Detailed Forms**: Steps to reproduce, expected vs. actual behavior
- **Automatic Submission**: Email sent to development@orbis-hub.com
- **System Information**: Auto-includes OS, version, timestamp
- **User Contact**: Optional email for follow-up
- **Character Counters**: Ensure adequate detail
- **Success Confirmation**: Immediate feedback on submission

**Use Cases:**
- Quality assurance testing
- User-reported issues
- Production bug tracking
- Feature request submission

---

### 📧 **Email Server Profiles**

**Comprehensive Email Functionality (CRM Dynamics-like)**

Automated email capabilities for notifications and communications.

#### Email Server Management
- **Multiple SMTP Servers**: Configure multiple profiles
- **Provider Support**: Gmail, Outlook, SendGrid, custom SMTP
- **Secure Storage**: AES-256 encrypted passwords
- **SSL/TLS Support**: Secure email transmission
- **Connection Testing**: Validate before going live
- **Default Selection**: Choose primary email profile
- **Rate Limiting**: Control hourly and daily send volumes

#### Email Queue System
- **Automatic Retry**: Configurable retry attempts
- **Priority Queue**: 1-10 priority scale
- **Status Tracking**: Pending, sending, sent, failed
- **Error Logging**: Capture failure reasons
- **Exponential Backoff**: Smart retry scheduling

#### Email Templates
- **Pre-built Templates**: Password recovery, notifications, alerts
- **Variable Substitution**: Dynamic content insertion
- **HTML Support**: Rich email formatting
- **Custom Templates**: Create your own
- **System Protection**: Core templates cannot be deleted

#### Sent Email History
- **Complete Archive**: All sent emails tracked
- **Search Capability**: Find by recipient, type, date
- **Audit Compliance**: Permanent records
- **Body Preview**: Quick content review

**Use Cases:**
- Password reset emails
- Bug report notifications
- Account lockout alerts
- System maintenance announcements
- Automated reporting

---

### 🛠️ **Database Maintenance Tools**

**Built-in Database Management**

Maintain and optimize your OrbisHub database directly from the application.

#### Features
- **Integrity Checks**: Verify database consistency
- **Index Management**: Rebuild and reorganize indexes
- **Statistics Updates**: Optimize query performance
- **Shrink Database**: Reclaim unused space
- **Backup Management**: Create and restore backups
- **Query Execution**: Run custom SQL queries
- **Schema Browser**: Explore tables and relationships
- **Performance Metrics**: View database statistics

**Use Cases:**
- Regular database maintenance
- Performance optimization
- Backup before major changes
- Troubleshooting database issues
- Custom reporting queries

---

### 👥 **User Permissions Management**

**Granular Access Control**

Fine-tune what each user can access and modify.

#### Capabilities
- **Role Assignment**: Admin, Viewer, Custom roles
- **Feature-Level Permissions**: Enable/disable specific features
- **Resource Access**: Control environment and server visibility
- **Action Permissions**: Read, Write, Delete, Execute
- **Permission Templates**: Apply common permission sets
- **Audit Integration**: Track permission changes

**Use Cases:**
- Restrict junior staff to read-only access
- Limit contractor access to specific environments
- Create specialized roles for different teams
- Implement least-privilege security model

---

### 🔄 **User Account Recovery**

**Self-Service Password Reset**

Reduce admin overhead with automated account recovery.

#### Features
- **Forgot Password Workflow**: Link directly from login screen
- **Email Verification**: Secure token-based reset process
- **Security Questions**: Optional additional verification
- **Time-Limited Tokens**: 1-hour expiration for security
- **Password Policy Enforcement**: Ensure strong passwords
- **Admin Override**: Manual password reset capability
- **Account Unlock**: Self-service for locked accounts

**Use Cases:**
- Reduce help desk tickets
- Enable 24/7 self-service access recovery
- Improve user experience
- Maintain security during password resets

---

### 🤖 **OrbisAgent Management**

**Remote Monitoring & Execution**

Deploy and manage agents across your Windows infrastructure.

#### Agent Features
- **Automatic Registration**: Self-configuring with persistent identity
- **Heartbeat Monitoring**: 30-second health checks
- **Job Queue**: FIFO execution with timeout handling
- **Script Execution**: Run PowerShell and CMD remotely
- **System Metrics Collection**: CPU, memory, disk usage
- **One-Click Deployment**: Easy rollout to new servers
- **Update Management**: Centralized agent updates

#### Job Types Supported
- **RunScript**: Execute custom PowerShell/CMD scripts
- **GetSystemInfo**: Collect system details
- **GetProcessList**: View running processes
- **GetServiceList**: Check Windows services
- **RestartService**: Remote service management
- **GetEventLogs**: Retrieve Windows Event Logs
- **GetDiskSpace**: Monitor disk usage
- **Custom Jobs**: Extensible framework

#### Management UI
- **Agent Dashboard**: View all registered agents
- **Status Monitoring**: Online/offline indicators
- **Job History**: Track executed jobs and results
- **Real-Time Logs**: View agent output
- **Bulk Operations**: Execute jobs across multiple agents
- **Agent Grouping**: Organize by function or location

**Use Cases:**
- Automated monitoring and alerting
- Scheduled maintenance scripts
- Log collection and analysis
- Remote troubleshooting
- Compliance scanning
- Software inventory management

---

## Security & Compliance

### 🔒 Data Encryption

**Multi-Layer Security Architecture**

1. **At Rest**:
   - AES-256 encryption for passwords and sensitive data
   - PBKDF2 with salt for user passwords
   - Database-level encryption support

2. **In Transit**:
   - SSL/TLS for all network communications
   - Encrypted messaging with AES-256-CBC
   - Secure API endpoints

3. **Access Control**:
   - Role-based permissions
   - Session management with timeouts
   - Account lockout protection
   - IP address tracking

### 📋 Compliance Features

**Regulatory Requirement Support**

- **SOX Compliance**: Complete audit trails for financial system access
- **HIPAA Ready**: Encrypted communications and access logging
- **PCI-DSS**: Secure credential storage and transmission
- **GDPR**: User data controls and audit capabilities
- **ISO 27001**: Comprehensive security controls

### 🔍 Audit Capabilities

**Complete Accountability**

- Every action logged with timestamp, user, and IP address
- Immutable audit records (cannot be deleted or modified)
- Export capabilities for external audit tools
- Real-time activity monitoring
- Historical reporting and trending

---

## Technical Specifications

### System Requirements

#### Desktop Application
- **OS**: Windows 10/11, Windows Server 2016+
- **RAM**: 4 GB minimum, 8 GB recommended
- **Disk**: 500 MB for application + database storage
- **Network**: Internet connection for updates (optional)
- **.NET**: Framework 4.7.2 or higher

#### Core Service
- **OS**: Windows Server 2016+ or Windows 10/11
- **RAM**: 2 GB minimum, 4 GB recommended
- **Disk**: 100 MB + log storage
- **.NET**: .NET 8.0 Runtime
- **Network**: Port 5000 (configurable)

#### Database
- **SQL Server**: 2016 or higher
- **Editions**: LocalDB, Express, Standard, Enterprise
- **Space**: 100 MB minimum, grows with data
- **Authentication**: Windows Authentication or SQL Authentication

#### OrbisAgent
- **OS**: Windows Server 2012 R2+ or Windows 8.1+
- **PowerShell**: 5.1 or higher
- **RAM**: Minimal (< 50 MB)
- **Disk**: < 10 MB
- **Network**: HTTP/HTTPS access to Core Service

### Technology Stack

#### Desktop Application
- **Framework**: Electron (Node.js + Chromium)
- **Language**: JavaScript (ES6+)
- **Database Driver**: node-mssql
- **Encryption**: Node.js crypto module
- **Updates**: electron-updater

#### Core Service
- **Framework**: ASP.NET Core 8.0
- **Language**: C# 12
- **API**: RESTful with Swagger/OpenAPI
- **ORM**: Entity Framework Core
- **Authentication**: JWT tokens
- **Logging**: Serilog + Windows Event Log

#### OrbisAgent
- **Language**: PowerShell 5.1+
- **Deployment**: Scheduled Task
- **Communication**: REST API (Invoke-RestMethod)
- **Logging**: File-based with rotation

### Network & Ports

- **Desktop → Database**: SQL Server (default 1433)
- **Desktop → Core Service**: HTTP/HTTPS (default 5000)
- **Agent → Core Service**: HTTP/HTTPS (default 5000)
- **Desktop → External**: RDP (3389), SSH (22), HTTPS (443)

---

## Deployment Architecture

### Typical Deployment Scenarios

#### **Scenario 1: Small Team (5-20 users)**

```
┌──────────────────┐
│ Each User's PC   │
│  - Desktop App   │
│  - LocalDB       │
└──────────────────┘
```

- Each user runs OrbisHub Desktop with local database
- Standalone operation, no shared data
- Ideal for individual admins or small isolated teams

---

#### **Scenario 2: Centralized Team (20-100 users)**

```
┌──────────────┐      ┌──────────────────┐      ┌──────────────┐
│ User PC #1   │      │  Central Server  │      │ User PC #2   │
│ Desktop App  │─────▶│  - SQL Server    │◀─────│ Desktop App  │
└──────────────┘      │  - Core Service  │      └──────────────┘
                      └──────────────────┘
                             │
                      ┌──────▼──────┐
                      │ OrbisAgents │
                      │  (Servers)  │
                      └─────────────┘
```

- Shared SQL Server for all users
- Core Service manages agents
- Shared credentials and resources
- Ideal for IT departments and MSPs

---

#### **Scenario 3: Enterprise Multi-Site (100+ users)**

```
┌─────────────────────────────────────────────┐
│            Central Data Center              │
│  ┌────────────────────────────────────┐    │
│  │ SQL Server Cluster (High Avail.)   │    │
│  └────────────────────────────────────┘    │
│  ┌────────────────────────────────────┐    │
│  │ Core Service (Load Balanced)       │    │
│  └────────────────────────────────────┘    │
└──────────────┬──────────────────────────────┘
               │
      ┌────────┴────────┐
      ▼                 ▼
┌──────────┐      ┌──────────┐      ┌──────────┐
│ Site A   │      │ Site B   │      │ Site C   │
│ Users    │      │ Users    │      │ Users    │
│ Agents   │      │ Agents   │      │ Agents   │
└──────────┘      └──────────┘      └──────────┘
```

- Centralized SQL Server with clustering/mirroring
- Load-balanced Core Service
- Distributed agents across sites
- Ideal for enterprises and global operations

---

## Support & Getting Started

### 📚 Documentation

Complete documentation is available in the installation package:

- **README.md**: Quick start guide
- **INSTALLATION.md**: Detailed installation instructions
- **TROUBLESHOOTING.md**: Common issues and solutions
- **Function READMEs**: Specific feature documentation

### 🚀 Quick Start

1. **Install OrbisHub Desktop**
   ```powershell
   .\Install-OrbisHubDesktop.ps1
   ```

2. **Configure Database Connection**
   - Launch application
   - Follow setup wizard
   - Enter SQL Server details
   - Test connection
   - Create admin account

3. **Start Using Core Features**
   - Add servers and credentials
   - Create environments
   - Invite team members
   - Begin monitoring

4. **Deploy OrbisAgent (Optional)**
   ```powershell
   .\Install-OrbisAgent.ps1 -CoreServiceUrl "http://your-server:5000"
   ```

### 📧 Support Channels

- **Bug Reports**: Use built-in bug reporting feature
- **Email**: development@orbis-hub.com
- **Documentation**: Included README files
- **Updates**: Automatic via GitHub releases

### 🔄 Update Process

OrbisHub includes automatic update detection:

1. Application checks for updates on startup
2. Notifies when new version available
3. Downloads in background
4. Installs on next restart
5. No data loss or configuration changes

### 📊 Training & Onboarding

**For Administrators:**
- Review INSTALLATION.md for deployment
- Understand security model and user roles
- Configure audit settings for compliance
- Set up backup procedures for database

**For End Users:**
- Familiarize with connection manager
- Learn credential vault usage
- Understand environment organization
- Practice using messaging and tickets

---

## Summary

OrbisHub is a complete IT operations platform that combines:

✅ **Remote Access Management** - RDP, SSH, credential vault  
✅ **Server Monitoring** - Health checks, uptime tracking, agents  
✅ **Team Collaboration** - Messaging, tickets, shared resources  
✅ **Security & Compliance** - Encryption, audit logs, access control  
✅ **Automation** - Remote execution, scheduled jobs, monitoring  
✅ **Extensibility** - Modular features, API integration, customization  

Built by system administrators for system administrators, OrbisHub provides everything needed to manage modern infrastructure efficiently, securely, and collaboratively.

---

**OrbisHub Desktop v1.0.0**  
*Empowering IT Teams to Work Smarter*

---

## License & Copyright

© 2025 OrbisHub. All rights reserved.

This document is confidential and proprietary. Unauthorized distribution prohibited.
