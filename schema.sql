CREATE TABLE IF NOT EXISTS answers (
  date      TEXT    NOT NULL,
  prompt_id TEXT    NOT NULL,
  item      TEXT    NOT NULL,
  count     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, prompt_id, item)
);
