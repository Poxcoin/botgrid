import sqlite3

conn = sqlite3.connect('saas_database.sqlite')
cur = conn.cursor()
cols = [row[1] for row in cur.execute('PRAGMA table_info(users)')]
print('Existing columns:', cols)

migrations = [
    ('email_verified',      'BOOLEAN',  'DEFAULT 0'),
    ('email_verify_token',  'TEXT',     ''),
    ('totp_secret',         'TEXT',     ''),
    ('totp_enabled',        'BOOLEAN',  'DEFAULT 0'),
    ('email',               'TEXT',     ''),
    ('subscription_plan',   'TEXT',     "DEFAULT 'free'"),
    ('subscription_expires','DATETIME', ''),
    ('referral_source',     'TEXT',     "DEFAULT ''"),
    ('created_at',          'DATETIME', ''),
    ('last_login',          'DATETIME', ''),
]

for col, typ, dflt in migrations:
    if col not in cols:
        sql = f'ALTER TABLE users ADD COLUMN {col} {typ} {dflt}'.strip()
        cur.execute(sql)
        print(f'Added: {col}')
    else:
        print(f'OK:    {col}')

conn.commit()
conn.close()
print('Migration done.')
