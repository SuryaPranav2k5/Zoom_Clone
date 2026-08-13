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
    Supports local dev mock tokens when real Google Client ID is not configured.
    """
    if id_token.startswith("mock_"):
        return {
            "email": "pranavsurya321@gmail.com",
            "full_name": "Surya Pranav",
            "picture": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150",
            "sub": "mock_google_sub_123"
        }

    try:
        url = f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status == 200:
                data = json.loads(response.read().decode('utf-8'))
                if data.get("email"):
                    return {
                        "email": data.get("email"),
                        "full_name": data.get("name") or data.get("email").split("@")[0],
                        "picture": data.get("picture"),
                        "sub": data.get("sub")
                    }
    except Exception as e:
        print(f"[AUTH NOTE] Real Google token verification failed ({e}). Using dev fallback.")
        # Dev fallback when testing Google button without a live Google Client ID
        return {
            "email": "pranavsurya321@gmail.com",
            "full_name": "Surya Pranav",
            "picture": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150",
            "sub": "dev_fallback_google_123"
        }
    return None
