#!/usr/bin/env python3
import sys
sys.path.insert(0, '/opt/botgrid')
from utils.email import send_password_reset_email, _smtp_enabled
print("SMTP enabled:", _smtp_enabled())
result = send_password_reset_email('dhebebd8@gmail.com', 'test-token-123')
print("Sent:", result)
