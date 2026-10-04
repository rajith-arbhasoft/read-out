# Internal SQL Tool

A single Next.js application for running read-only SQL against PostgreSQL databases configured on the server. There is no application login. Network access is expected to be limited to the company VPN, with Nginx in front of Next.js.

The browser sends an environment name and a SQL statement. Next.js resolves that name to a server-side connection string. Connection strings never leave the server.

## Run

```bash
npm install
npm run build
npm start
```

For local development:

```bash
npm run dev
```

The process manager (PM2, NSSM, a Windows service, or systemd) is chosen by the server administrator. This repository does not install one.

## Database configuration

Copy `.env.example` to the environment used by the Next.js process. Do not commit real credentials.

```env
DATABASE_DEV=postgresql://sql_tool_reader:password@10.10.10.10:5432/application_dev
DATABASE_QAS=postgresql://sql_tool_reader:password@10.10.20.10:5432/application_qas
DATABASE_PROD=postgresql://sql_tool_reader:password@10.10.30.10:5432/application_prod
```

Add another environment by adding another variable and restarting Next.js:

```env
DATABASE_UAT=postgresql://sql_tool_reader:password@10.10.40.10:5432/application_uat
```

`UAT` then appears in the environment selector. No application code change is required.

Names must match `DATABASE_<NAME>`, where `<NAME>` is uppercase letters, digits, and underscores, and starts with a letter. `DATABASE_URL` is ignored.

The PostgreSQL account in each connection string must be created by an administrator with read-only `SELECT` access. This application does not create users, grant permissions, or change schemas.

Each query also runs inside a `READ ONLY` transaction. That is a second check. The database role remains the real security boundary.

## Limits

Defaults, all overridable in the environment:

| Setting | Default |
| --- | --- |
| DEV pool / timeout | 3 connections / 30 seconds |
| QAS pool / timeout | 2 connections / 20 seconds |
| PROD pool / timeout | 1 connection / 15 seconds |
| Other environments | 2 connections / 20 seconds |
| Maximum rows | 10,000 |
| Maximum response size | 5,000,000 bytes |

See `.env.example` for the variable names. Pools are capped at 5 connections. Timeouts are capped at 120 seconds. There is no automatic retry.

An environment named `PROD` shows a production warning and asks for confirmation before execution. Override the list with `SQL_TOOL_CONFIRM_ENVIRONMENTS`.

If every connection in the pool is busy, the request returns: `The database is busy. Try again shortly.`

## Saved queries and history

Saved queries and execution history are stored in a local SQLite file, `data/sql-tool.sqlite`, on the Next.js server. That file is not one of the application databases. Change the directory with `SQL_TOOL_DATA_DIR`.

History keeps the latest 200 executions. Logs record the environment, duration, row count, and outcome. They do not record the SQL text, passwords, or connection strings.

## SQL rules

Each request may contain one statement. `SELECT` is allowed, including common table expressions that are themselves selects. `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `CREATE`, `GRANT`, `REVOKE`, `COMMENT`, `VACUUM`, `CALL`, and `DO` are rejected, including when hidden behind another statement.

A statement is rejected when it cannot be validated. In particular:

- `SELECT INTO` is not allowed.
- `FOR UPDATE` and other row locks are not allowed.
- `INTERSECT` and `EXCEPT` are rejected because this validator cannot parse them.
- A recursive CTE needs an explicit column list, for example `WITH RECURSIVE c(n) AS (...) SELECT * FROM c`.

Saved queries are validated again at execution time.

## Nginx

An example server block is in `docs/nginx.example.conf`. It is documentation only. Do not replace an existing Nginx site, certificate, firewall rule, or DNS record from this repository. The administrator chooses the hostname, certificate, and upstream port.

## Tests

```bash
npm test
```
