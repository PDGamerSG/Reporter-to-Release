CREATE TABLE IF NOT EXISTS r2r_ledgers (
  workspace text PRIMARY KEY,
  version bigint NOT NULL DEFAULT 1,
  document jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
CREATE INDEX IF NOT EXISTS r2r_ledgers_expiry ON r2r_ledgers (expires_at) WHERE expires_at IS NOT NULL;
