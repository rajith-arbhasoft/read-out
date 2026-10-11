-- Run this on each application database, as a role that can create indexes.
-- The SQL tool connects with the existing DATABASE_<ENV> URL and only reads.
--
-- log.logs (timestamp)
-- log.logs (timestamp, level)
-- log.logs (timestamp, status_code)
-- log.logs (timestamp, url)

CREATE INDEX IF NOT EXISTS logs_timestamp_idx
  ON log.logs (timestamp);

CREATE INDEX IF NOT EXISTS logs_timestamp_level_idx
  ON log.logs (timestamp, level);

CREATE INDEX IF NOT EXISTS logs_timestamp_status_code_idx
  ON log.logs (timestamp, status_code);

CREATE INDEX IF NOT EXISTS logs_timestamp_url_idx
  ON log.logs (timestamp, url);
