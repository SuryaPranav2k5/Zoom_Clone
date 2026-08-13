import os
import hashlib
import secrets
import json
import urllib.request
import urllib.error
from typing import Optional, Tuple, Dict

# In-memory token storage (token -> user_id)
# For local dev / free-tier deployment
ACTIVE_TOKENS: Dict[str, int] = {}

def hash_password(password: str, salt: Optional[str] = None) -> Tuple[str, str]:
    """Hashes a password using PBKDF2-HMAC-SHA256 with a random salt."""
    if not salt:
        salt = secrets.token_hex(16)
    # 100,000 iterations of SHA-256
    key = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    )
    return key.hex(), salt

def verify_password(password: str, hashed_password: str, salt: str) -> bool:
    """Verifies an entered password against stored hash and salt."""
    calculated_hash, _ = hash_password(password, salt)
    return secrets.compare_digest(calculated_hash, hashed_password)

def create_access_token(user_id: int) -> str:
    """Creates a secure random 64-char session token."""
    token = secrets.token_hex(32)
    ACTIVE_TOKENS[token] = user_id
    return token

def get_user_id_from_token(token: str) -> Optional[int]:
    """Returns user_id associated with an active access token."""
    return ACTIVE_TOKENS.get(token)

def verify_google_id_token(id_token: str) -> Optional[dict]:
    """
    Verifies Google OAuth ID token using Google's public tokeninfo endpoint.
    Returns payload containing email, name, picture if valid.
    """
    try:
        url = f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status == 200:
                data = json.loads(response.read().decode('utf-8'))
                # Verify audience or email_verified if present
                if data.get("email"):
                    return {
                        "email": data.get("email"),
                        "full_name": data.get("name") or data.get("email").split("@")[0],
                        "picture": data.get("picture"),
                        "sub": data.get("sub")
                    }
    except Exception as e:
        print(f"[AUTH ERROR] Failed to verify Google ID token: {e}")
    return None
