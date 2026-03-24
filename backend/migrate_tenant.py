import os
import urllib.parse
from sqlalchemy import create_engine, text

# Fallback se a variavel de ambiente nao existir
SQLALCHEMY_DATABASE_URL = os.environ.get(
    "DATABASE_URL", 
    "postgresql://cronuz_admin:cronuz_password_123@localhost/cronuz_b2b"
)

# Parse password properly because of special chars
try:
    parsed = urllib.parse.urlparse(SQLALCHEMY_DATABASE_URL)
    encoded_password = urllib.parse.quote_plus(parsed.password) if parsed.password else ""
    # Reconstruct URL
    netloc = f"{parsed.username}:{encoded_password}@{parsed.hostname}"
    if parsed.port:
        netloc += f":{parsed.port}"
    SQLALCHEMY_DATABASE_URL = urllib.parse.urlunparse((parsed.scheme, netloc, parsed.path, parsed.params, parsed.query, parsed.fragment))
except Exception:
    pass

engine = create_engine(SQLALCHEMY_DATABASE_URL)

try:
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE cmp_company ADD COLUMN tenant_id VARCHAR(50) DEFAULT 'cronuz' NOT NULL;"))
        print("cmp_company up to date")
except Exception as e:
    print(f"Error cmp_company: {e}")

try:
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE usr_user ADD COLUMN tenant_id VARCHAR(50);"))
        print("usr_user up to date")
except Exception as e:
    print(f"Error usr_user: {e}")

try:
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE cmp_company ADD COLUMN login_background_url VARCHAR(500);"))
        print("login_background_url column up to date")
except Exception as e:
    print(f"Error login_background_url: {e}")
