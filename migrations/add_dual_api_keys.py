import sqlite3, os

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'saas_database.sqlite')

conn = sqlite3.connect(DB_PATH)
c = conn.cursor()

# Check if migration already applied
c.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='user_api_keys'")
row = c.fetchone()
if row and 'uq_user_exchange_testnet' in row[0]:
    print("Already migrated"); conn.close(); exit(0)

c.executescript("""
BEGIN;
CREATE TABLE user_api_keys_new (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    exchange VARCHAR DEFAULT 'bybit',
    api_key_enc VARCHAR NOT NULL,
    secret_enc VARCHAR NOT NULL,
    is_testnet BOOLEAN DEFAULT 0,
    last_verified DATETIME,
    created_at DATETIME,
    UNIQUE(user_id, exchange, is_testnet)
);
INSERT INTO user_api_keys_new SELECT id,user_id,exchange,api_key_enc,secret_enc,is_testnet,last_verified,created_at FROM user_api_keys;
DROP TABLE user_api_keys;
ALTER TABLE user_api_keys_new RENAME TO user_api_keys;
COMMIT;
""")

conn.close()
print("Migration complete")
