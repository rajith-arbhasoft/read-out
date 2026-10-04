# Internal SQL Read-Only Tool
## Agent Build Specification

## 1. Objective

Build a private internal SQL query tool for executing **read-only SQL queries** against configured PostgreSQL databases.

The application will be deployed on an on-premises server and accessed only through the company's internal network/VPN.

The tool must remain intentionally minimal.

Primary features:

- SQL editor
- Dynamically configured environments
- SELECT-only query execution
- Saved queries with titles
- Query execution history
- Query results table
- Query timeout and resource limits
- Multiple database environments
- Server-side database configuration
- No application authentication
- Single Next.js application
- No separate backend service

---

# 2. Critical Architecture Decision

Use **Next.js as both the frontend and server-side API layer**.

Do NOT create a separate:

- NestJS backend
- Express backend
- Node API project
- Microservice

Architecture:

```text
                  Internal Network / VPN
                           |
                           v
                    +-------------+
                    |    Nginx    |
                    |   HTTPS     |
                    +------+------+
                           |
                           v
                    +-------------+
                    |   Next.js   |
                    |             |
                    | React UI    |
                    | API Routes  |
                    | SQL Access  |
                    +------+------+
                           |
             +-------------+-------------+
             |             |             |
             v             v             v
           DEV           QAS           PROD
             |             |             |
             v             v             v
        PostgreSQL    PostgreSQL    PostgreSQL
```

The browser must NEVER connect directly to PostgreSQL.

---

# 3. Authentication

## DO NOT implement application authentication.

There must be:

- No JWT
- No login page
- No username/password login
- No session authentication
- No OAuth
- No refresh tokens
- No application-level authentication middleware

The application assumes that network-level access is controlled externally through the company's VPN/internal network.

The access model is:

```text
VPN/Internal Network
        |
        v
    Nginx
        |
        v
    Next.js
        |
        v
 PostgreSQL
```

Therefore:

> Anyone who can access the internal SQL tool URL is considered authorized to use the tool.

Do not add authentication unless explicitly requested in a future requirement.

---

# 4. Technology Stack

Use:

- Next.js
- React
- TypeScript
- PostgreSQL
- `pg` PostgreSQL driver
- Tailwind CSS

Do NOT use Prisma for arbitrary SQL execution.

Do NOT introduce additional infrastructure unless required.

---

# 5. Environment Configuration

The application must support **custom environments**.

Do NOT hardcode:

```text
DEV
QAS
PROD
```

into the frontend.

The server administrator must be able to configure any number of environments.

Examples:

```text
DEV
QAS
PROD
UAT
STAGING
TEST
CUSTOMER_A
CUSTOMER_B
```

The frontend should automatically display the environments configured on the server.

Example UI:

```text
Environment

[ QAS ▼ ]
```

If the administrator later adds:

```text
UAT
```

the UI should automatically show:

```text
[ DEV ▼ ]
[ QAS ▼ ]
[ PROD ▼ ]
[ UAT ▼ ]
```

No frontend code modification should be required.

---

# 6. Database Configuration

## CRITICAL: Agent must NOT configure database credentials.

Database configuration is an **operator/server administrator responsibility**.

The coding agent must not:

- Ask the user to provide database passwords
- Create database credentials
- Modify production database configuration
- Guess database hosts
- Guess database names
- Guess database users
- Guess connection strings
- Hardcode connection strings
- Commit connection strings
- Modify database permissions

The agent must only implement the mechanism for reading server-side configuration.

---

# 7. Server-Side Database Configuration

Use server-side environment variables or another server-side configuration mechanism.

A connection string based configuration is preferred for simplicity.

Example:

```env
DATABASE_DEV=postgresql://sql_tool_reader:password@10.10.10.10:5432/application_dev

DATABASE_QAS=postgresql://sql_tool_reader:password@10.10.20.10:5432/application_qas

DATABASE_PROD=postgresql://sql_tool_reader:password@10.10.30.10:5432/application_prod
```

Additional environments can be added:

```env
DATABASE_UAT=postgresql://sql_tool_reader:password@10.10.40.10:5432/application_uat

DATABASE_STAGING=postgresql://sql_tool_reader:password@10.10.50.10:5432/application_staging
```

The agent must NOT assume that these exact environment names exist.

The configuration mechanism should discover configured environments dynamically.

---

# 8. Environment Naming Convention

Use:

```text
DATABASE_<ENVIRONMENT_NAME>
```

For example:

```text
DATABASE_DEV
DATABASE_QAS
DATABASE_PROD
DATABASE_UAT
```

The server-side code should extract configured environment names from the configuration.

For example:

```text
DATABASE_DEV
DATABASE_QAS
DATABASE_PROD
```

becomes:

```json
[
  "DEV",
  "QAS",
  "PROD"
]
```

The browser receives only the environment names.

It must NOT receive:

```text
connection string
host
port
username
password
```

---

# 9. Environment API

Provide an API such as:

```text
GET /api/environments
```

Response:

```json
{
  "environments": [
    "DEV",
    "QAS",
    "PROD"
  ]
}
```

This endpoint must return only safe metadata.

Never return:

```json
{
  "environment": "PROD",
  "connectionString": "postgresql://..."
}
```

The connection strings must remain entirely server-side.

---

# 10. Query API

Provide:

```text
POST /api/query
```

Request:

```json
{
  "environment": "QAS",
  "query": "SELECT * FROM inspection.inspections LIMIT 100"
}
```

The server must:

1. Validate the environment.
2. Resolve the corresponding server-side database configuration.
3. Validate the SQL.
4. Ensure only one SELECT statement exists.
5. Execute using the configured PostgreSQL connection.
6. Apply timeout/resource restrictions.
7. Return the results.

---

# 11. Environment Validation

Never directly construct a database connection from user-provided data.

Bad:

```typescript
const host = request.body.host;
const database = request.body.database;
```

Do NOT allow this.

The client sends:

```json
{
  "environment": "QAS"
}
```

The server maps:

```text
QAS
 ↓
DATABASE_QAS
 ↓
server-side connection string
```

Only configured environments are valid.

Example:

```text
DEV  → DATABASE_DEV
QAS  → DATABASE_QAS
PROD → DATABASE_PROD
```

If the client sends:

```text
HACKER_DB
```

the server must reject it.

---

# 12. PostgreSQL Driver

Use the `pg` package.

Do not use Prisma.

The SQL tool is specifically designed for arbitrary SELECT statements, so direct PostgreSQL driver execution is more appropriate.

Use connection pools.

Example conceptual architecture:

```text
Environment
     |
     v
Connection Pool
     |
     v
PostgreSQL
```

Do not create a new connection for every query.

---

# 13. Connection Pool Limits

The SQL tool is a low-priority development/diagnostic tool.

It must not consume excessive PostgreSQL resources.

Use small configurable pools.

Example defaults:

```text
DEV   → 3
QAS   → 2
PROD  → 1
```

These are examples only.

Do not hardcode these values if avoidable.

The important requirement is:

> The SQL tool must have a deliberately small database connection footprint.

If the pool is busy, new queries should wait or receive a clear busy response.

Do not create unlimited connections.

---

# 14. Production Priority

The SQL tool must be considered **lower priority than the main application**.

The tool must not aggressively compete with the production application.

Implement:

- Small connection pool
- Maximum concurrent queries
- Query timeout
- Result limits
- No automatic retry loops

For PROD, initially allow only one active query.

The application should never automatically retry an expensive SQL query multiple times.

---

# 15. SELECT-Only Queries

Only read queries are allowed.

Reject:

```text
INSERT
UPDATE
DELETE
DROP
ALTER
TRUNCATE
CREATE
GRANT
REVOKE
COMMENT
VACUUM
CALL
DO
```

Do not rely only on:

```typescript
query.trim().toLowerCase().startsWith("select")
```

because SQL syntax is more complicated than that.

The SQL must be parsed/validated properly.

---

# 16. Multiple Statements

Only one SQL statement is permitted per execution request.

Reject:

```sql
SELECT * FROM users;

DELETE FROM users;
```

Reject:

```sql
SELECT * FROM users;
DROP TABLE users;
```

Requirement:

```text
1 request
    =
1 SQL statement
```

CTEs that ultimately represent a SELECT should be supported.

Example:

```sql
WITH data AS (
    SELECT *
    FROM users
)
SELECT *
FROM data;
```

---

# 17. Database-Level Read-Only User

The server administrator will create a dedicated PostgreSQL user.

Example:

```text
sql_tool_reader
```

This user must have only the required SELECT permissions.

The coding agent must NOT create or modify this user.

The coding agent must NOT execute database permission commands.

The administrator is responsible for configuring:

```text
READ ONLY
SELECT permissions
```

The database permission model must remain the final security boundary.

---

# 18. Query Timeout

Every query must have a timeout.

Suggested starting values:

```text
DEV   → 30 seconds
QAS   → 20 seconds
PROD  → 15 seconds
```

These values should be configurable.

A timed-out query should return:

```text
Query execution timed out.
```

The application must not leave abandoned queries running.

---

# 19. Result Limits

Protect both PostgreSQL and the browser.

Implement configurable:

```text
Maximum rows
Maximum response size
Maximum execution time
```

Example:

```text
Maximum rows = 10,000
```

If the result exceeds the configured limit:

```text
Result exceeds the maximum allowed size.
Please narrow your query or add a LIMIT clause.
```

Do not silently return incomplete results.

---

# 20. SQL Editor

The main page should provide an SQL editor.

Example:

```text
+------------------------------------------------+
| Environment: [ QAS ▼ ]                         |
+------------------------------------------------+
|                                                |
| SELECT                                         |
|     *                                          |
| FROM                                           |
|     inspection.inspections                     |
| WHERE                                          |
|     status = 'PENDING';                        |
|                                                |
+------------------------------------------------+
|                        [ Execute ]             |
+------------------------------------------------+
```

Requirements:

- SQL syntax highlighting
- Monospace editor
- Execute button
- Keyboard shortcut
- Clear button
- Loading state
- Error display
- Execution duration
- Row count
- Environment indicator

---

# 21. Production Warning

When the selected environment is PROD, clearly display:

```text
⚠ You are querying PRODUCTION
```

Before executing a PROD query, require confirmation.

Example:

```text
You are about to execute a query against PRODUCTION.

[Cancel] [Execute]
```

Do not prevent legitimate SELECT queries.

---

# 22. Query Results

Display results in a table.

Show:

```text
Rows: 152
Duration: 243 ms
Environment: QAS
```

Support:

- Horizontal scrolling
- Vertical scrolling
- Column headers
- Null values
- Long cell inspection
- Loading state
- Error state

---

# 23. Saved Queries

Users must be able to save queries.

A saved query contains:

```text
Title
Description (optional)
Environment
SQL query
Created date
Updated date
```

Example:

```text
Title:
Pending Inspections

Environment:
QAS

Query:
SELECT *
FROM inspection.inspections
WHERE status = 'PENDING';
```

---

# 24. Saved Query Storage

Store saved queries server-side.

Do not make localStorage the primary storage.

Suggested table:

```text
saved_queries
-------------
id
title
description
environment
query_text
created_at
updated_at
```

The environment must reference a configured environment.

The query must be validated again when executed.

Never assume a saved query is safe simply because it was previously saved.

---

# 25. Query History

Provide query history.

Example:

```text
Query History

10:31 AM
QAS
Pending inspections
152 rows
243 ms

10:24 AM
DEV
Equipment history
82 rows
120 ms
```

Store:

```text
environment
query
execution duration
row count
success/failure
timestamp
```

Do not store:

```text
database password
connection string
authentication token
```

Because there is intentionally no application authentication, do not create a fake `user_id` field.

If future authentication is added, the schema can be extended later.

---

# 26. No Local Database Credentials

The frontend must never request database credentials from the user.

There should be no UI fields for:

```text
Database host
Database port
Database username
Database password
Connection string
```

The database configuration is entirely server-side.

The user only sees:

```text
Environment
```

and the configured environment names.

---

# 27. No Connection String in Browser

The browser may receive:

```json
{
  "environments": [
    "DEV",
    "QAS",
    "PROD"
  ]
}
```

It must never receive:

```json
{
  "DEV": "postgresql://..."
}
```

Connection strings must never appear in:

- API responses
- HTML
- React props
- client JavaScript bundles
- localStorage
- sessionStorage
- cookies
- query history
- saved query records

---

# 28. No Authentication Requirement

Do not create:

```text
/login
```

The application should open directly into the SQL tool.

Example:

```text
https://sql-tool.internal.company/
```

The first page should be the SQL console.

Network-level access is handled outside the application.

---

# 29. Nginx

Nginx configuration is an **operator responsibility**.

The coding agent must NOT:

- Modify the existing Nginx configuration
- Replace existing server blocks
- Change existing production routing
- Change SSL certificates
- Change firewall rules
- Change DNS
- Assume a port
- Break existing applications

The agent may provide a sample configuration/documentation, but must not modify infrastructure configuration automatically.

The intended deployment is:

```text
VPN
 |
 v
Nginx :443
 |
 v
Next.js
```

The exact domain, port, certificate and server block will be configured manually by the server administrator.

---

# 30. On-Premises Deployment

The application will be deployed on an on-premises server.

Expected runtime:

```text
Next.js
    |
    v
Node.js process
```

The agent should provide normal Next.js production build support:

```bash
npm run build
npm start
```

The actual process manager may be:

```text
PM2
NSSM
Windows Service
systemd
```

depending on the server operating system.

The agent must not assume which process manager is being used.

---

# 31. Server Configuration Documentation

Provide a clear example configuration file such as:

```env
# Example only.
# Replace values manually on the server.
# Do not commit this file with real credentials.

DATABASE_DEV=postgresql://...
DATABASE_QAS=postgresql://...
DATABASE_PROD=postgresql://...
```

Also document:

```text
Add another environment:

DATABASE_UAT=postgresql://...
```

After restarting the Next.js application:

```text
UAT
```

should automatically appear in the environment selector.

The actual connection strings must be entered by the server administrator.

---

# 32. Security Logging

Log operational information such as:

```text
environment
execution duration
row count
success/failure
timestamp
```

Do not log:

```text
database passwords
connection strings
```

Be careful with logging complete query text because SQL queries can potentially contain sensitive information.

---

# 33. Error Handling

Do not expose stack traces.

Bad:

```text
Error: password authentication failed...
at node_modules/pg/...
```

Better:

```text
Unable to connect to QAS database.
```

For SQL errors, provide useful database errors when safe:

```text
column "equipment_status" does not exist
```

Never expose:

```text
password
connection string
internal filesystem paths
```

---

# 34. API Endpoints

Minimum required endpoints:

```text
GET  /api/environments
POST /api/query

GET  /api/saved-queries
POST /api/saved-queries
PUT  /api/saved-queries/:id
DELETE /api/saved-queries/:id

GET  /api/history
```

No authentication middleware is required.

All authorization is based on network-level access.

---

# 35. Suggested Project Structure

```text
sql-tool/
│
├── app/
│   ├── page.tsx
│   │
│   └── api/
│       ├── environments/
│       │   └── route.ts
│       │
│       ├── query/
│       │   └── route.ts
│       │
│       ├── saved-queries/
│       │   ├── route.ts
│       │   └── [id]/
│       │       └── route.ts
│       │
│       └── history/
│           └── route.ts
│
├── lib/
│   ├── database/
│   │   └── pools.ts
│   │
│   ├── sql/
│   │   ├── validator.ts
│   │   └── executor.ts
│   │
│   └── config/
│       └── environments.ts
│
├── components/
│   ├── SqlEditor.tsx
│   ├── QueryResults.tsx
│   ├── EnvironmentSelector.tsx
│   ├── SavedQueries.tsx
│   └── QueryHistory.tsx
│
└── package.json
```

The agent may modify the exact structure if a better Next.js convention is appropriate.

---

# 36. Important Agent Restrictions

The coding agent MUST NOT:

```text
❌ Implement JWT
❌ Implement login
❌ Implement OAuth
❌ Implement application authentication
❌ Create database users
❌ Modify database permissions
❌ Modify database schemas
❌ Create database connection strings
❌ Hardcode real database credentials
❌ Ask the user for database passwords
❌ Modify Nginx
❌ Modify firewall rules
❌ Modify DNS
❌ Expose PostgreSQL directly
❌ Create a separate backend project
❌ Add Prisma
```

The agent's responsibility is only to build the application.

Infrastructure configuration is performed manually by the administrator.

---

# 37. Agent Responsibilities vs Administrator Responsibilities

## Coding Agent

Responsible for:

```text
Next.js application
SQL editor
Environment discovery
Query validation
Query execution
Connection pooling
Timeouts
Result limits
Saved queries
Query history
UI
Error handling
```

## Server Administrator

Responsible for:

```text
Database connection strings
Database credentials
Read-only PostgreSQL users
Database permissions
VPN
Firewall
Nginx
HTTPS certificates
DNS
Server environment variables
Process manager
Production deployment
```

This separation is mandatory.

---

# 38. MVP Acceptance Criteria

The application is complete when:

### Environment

- [ ] Environment names come from server-side configuration.
- [ ] No environments are hardcoded in the frontend.
- [ ] Administrator can add a new environment without modifying application code.
- [ ] Invalid environment names are rejected.
- [ ] Database connection strings never reach the browser.

### Query

- [ ] User can enter SQL.
- [ ] User can execute SELECT.
- [ ] Results appear in a table.
- [ ] Execution duration is displayed.
- [ ] Row count is displayed.
- [ ] INSERT is rejected.
- [ ] UPDATE is rejected.
- [ ] DELETE is rejected.
- [ ] DROP is rejected.
- [ ] ALTER is rejected.
- [ ] TRUNCATE is rejected.
- [ ] Multiple statements are rejected.
- [ ] Query timeout is enforced.
- [ ] Result limits are enforced.

### Saved Queries

- [ ] User can save a query.
- [ ] User can assign a title.
- [ ] User can select an environment.
- [ ] User can run a saved query.
- [ ] User can edit a saved query.
- [ ] User can delete a saved query.

### Production

- [ ] PROD is clearly identified.
- [ ] PROD execution requires confirmation.
- [ ] PROD has a smaller connection pool.
- [ ] PROD has a stricter query timeout.

### Security

- [ ] No JWT.
- [ ] No login page.
- [ ] No database credentials in frontend.
- [ ] No connection strings in localStorage.
- [ ] No connection strings in API responses.
- [ ] PostgreSQL is accessed only server-side.
- [ ] Database user is expected to be read-only.
- [ ] SQL validation occurs server-side.
- [ ] Network access is assumed to be controlled by VPN/internal infrastructure.

### Deployment

- [ ] Application runs as a single Next.js application.
- [ ] Application can run on an on-premises server.
- [ ] `npm run build` succeeds.
- [ ] `npm start` runs the production application.
- [ ] Nginx configuration is documented but NOT modified by the agent.
- [ ] Database configuration is documented but NOT performed by the agent.

---

# 39. Final Architecture

```text
                    COMPANY VPN
                         |
                         v
                 +---------------+
                 |     Nginx     |
                 | HTTPS / 443   |
                 +-------+-------+
                         |
                         v
                 +---------------+
                 |    Next.js    |
                 |               |
                 | SQL Editor    |
                 | Saved Queries |
                 | History       |
                 |               |
                 | API Routes    |
                 +-------+-------+
                         |
             +-----------+-----------+
             |           |           |
             v           v           v
        DATABASE_DEV DATABASE_QAS DATABASE_PROD
             |           |           |
             v           v           v
        PostgreSQL  PostgreSQL  PostgreSQL
             |           |           |
             +-----------+-----------+
                         |
                  READ-ONLY USERS
```

The browser knows only:

```text
DEV
QAS
PROD
```

The server knows:

```text
DEV → DATABASE_DEV
QAS → DATABASE_QAS
PROD → DATABASE_PROD
```

The database credentials remain exclusively on the server.

The coding agent builds the application but does not configure the databases, credentials, VPN, firewall, or Nginx.

## Core principle

```text
                    Browser
                       |
                       | environment + SQL
                       v
                    Next.js
                       |
                       | server-side connection
                       v
                  PostgreSQL
                       |
                       v
                READ-ONLY USER
```

Keep the implementation simple and avoid introducing infrastructure that is not explicitly required.