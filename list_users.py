#!/usr/bin/env python3
import sqlite3
conn = sqlite3.connect('/opt/botgrid/saas_database.sqlite')
rows = conn.execute('SELECT id, email, plan, is_active FROM users').fetchall()
print(f"Total users: {len(rows)}")
for r in rows:
    print(r)
conn.close()
