"""
SmartFlow Authentication Service
Handles password hashing, token generation, login, registration,
brute-force protection, and session management.
"""
import hashlib
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple

import bcrypt
import structlog
from flask import current_app
from flask_jwt_extended import create_access_token, create_refresh_token

from app.extensions import db
from app.models import User, Role, UserSession, AuditLog
from app.cache import get_cache

logger = structlog.get_logger(__name__)


class AuthError(Exception):
    """Authentication/Authorization error."""
    def __init__(self, message: str, code: str = "AUTH_ERROR", status: int = 401):
        self.message = message
        self.code = code
        self.status = status
        super().__init__(message)


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    rounds = current_app.config.get("BCRYPT_LOG_ROUNDS", 12)
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds)).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against its bcrypt hash."""
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def hash_token(token: str) -> str:
    """One-way hash of a JWT refresh token for storage."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def register_user(
    email: str,
    username: str,
    password: str,
    full_name: Optional[str] = None,
    role_name: str = "viewer",
    ip_address: Optional[str] = None,
) -> User:
    """Register a new user. Raises AuthError on validation failure."""
    email = email.lower().strip()
    username = username.lower().strip()

    # Check for duplicates
    if User.query.filter_by(email=email, deleted_at=None).first():
        raise AuthError("Email address is already registered.", "EMAIL_EXISTS", 409)
    if User.query.filter_by(username=username, deleted_at=None).first():
        raise AuthError("Username is already taken.", "USERNAME_EXISTS", 409)

    # Get role
    role = Role.query.filter_by(name=role_name).first()
    if not role:
        role = Role.query.filter_by(name="viewer").first()
        if not role:
            role = Role(name="viewer", description="Read-only access")
            db.session.add(role)
            db.session.flush()

    user = User(
        email=email,
        username=username,
        password_hash=hash_password(password),
        full_name=full_name,
        role_id=role.id,
        is_active=True,
        is_verified=False,
    )
    db.session.add(user)

    # Audit log
    audit = AuditLog(
        action="user_registered",
        resource_type="user",
        ip_address=ip_address,
        details={"email": email, "username": username},
        success=True,
    )
    db.session.add(audit)
    db.session.commit()

    logger.info("user_registered", user_id=user.id, username=username)
    return user


def login_user(
    email_or_username: str,
    password: str,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Tuple[str, str, User]:
    """
    Authenticate a user and return (access_token, refresh_token, user).
    Raises AuthError on failure.
    """
    # Check rate limiting via cache
    lockout_key = f"lockout:{email_or_username.lower()}"
    cache = get_cache()
    lockout = cache.get("auth", lockout_key)
    if lockout:
        remaining = lockout.get("remaining_seconds", 60)
        raise AuthError(
            f"Account locked due to too many failed attempts. Try again in {remaining} seconds.",
            "ACCOUNT_LOCKED",
            429,
        )

    # Find user
    user = (
        User.query
        .filter(
            (User.email == email_or_username.lower()) |
            (User.username == email_or_username.lower())
        )
        .filter_by(deleted_at=None)
        .first()
    )

    if not user or not verify_password(password, user.password_hash):
        # Track failed attempts
        _record_failed_attempt(email_or_username.lower(), cache)
        logger.warning("login_failed", identifier=email_or_username[:50])
        raise AuthError("Invalid email/username or password.", "INVALID_CREDENTIALS", 401)

    if not user.is_active:
        raise AuthError("Your account has been deactivated.", "ACCOUNT_INACTIVE", 403)

    # Reset failed attempts
    cache.delete("auth", f"attempts:{email_or_username.lower()}")

    # Create tokens
    additional_claims = {
        "role": user.role.name if user.role else "viewer",
        "username": user.username,
    }
    access_token = create_access_token(identity=user.id, additional_claims=additional_claims)
    refresh_token = create_refresh_token(identity=user.id)

    # Store session
    expires_at = datetime.now(timezone.utc) + current_app.config["JWT_REFRESH_TOKEN_EXPIRES"]
    session = UserSession(
        user_id=user.id,
        refresh_token_hash=hash_token(refresh_token),
        ip_address=ip_address,
        user_agent=user_agent,
        is_active=True,
        expires_at=expires_at,
        last_used_at=datetime.now(timezone.utc),
    )
    db.session.add(session)

    # Update last login
    user.last_login_at = datetime.now(timezone.utc)
    user.failed_login_attempts = 0
    user.locked_until = None

    # Audit
    db.session.add(AuditLog(
        user_id=user.id,
        action="user_login",
        resource_type="session",
        ip_address=ip_address,
        user_agent=user_agent,
        details={},
        success=True,
    ))
    db.session.commit()

    logger.info("user_logged_in", user_id=user.id, username=user.username)
    return access_token, refresh_token, user


def _record_failed_attempt(identifier: str, cache):
    """Track failed login attempts and lock accounts after threshold."""
    max_attempts = current_app.config.get("MAX_LOGIN_ATTEMPTS", 5)
    lockout_minutes = current_app.config.get("LOGIN_LOCKOUT_MINUTES", 15)
    attempts_key = f"attempts:{identifier}"

    attempts_data = cache.get("auth", attempts_key) or {"count": 0}
    attempts_data["count"] += 1

    if attempts_data["count"] >= max_attempts:
        # Lock the account
        cache.set("auth", f"lockout:{identifier}", {"remaining_seconds": lockout_minutes * 60}, lockout_minutes * 60)
        cache.delete("auth", attempts_key)
        logger.warning("account_locked", identifier=identifier[:50])
    else:
        cache.set("auth", attempts_key, attempts_data, 3600)


def refresh_access_token(user_id: str, refresh_token: str) -> str:
    """Create a new access token from a valid refresh token."""
    token_hash = hash_token(refresh_token)
    session = UserSession.query.filter_by(
        user_id=user_id,
        refresh_token_hash=token_hash,
        is_active=True,
    ).first()

    if not session or session.expires_at < datetime.now(timezone.utc):
        raise AuthError("Refresh token is invalid or expired.", "INVALID_REFRESH_TOKEN", 401)

    user = User.query.get(user_id)
    if not user or not user.is_active:
        raise AuthError("User not found or inactive.", "USER_INACTIVE", 401)

    session.last_used_at = datetime.now(timezone.utc)
    db.session.commit()

    additional_claims = {
        "role": user.role.name if user.role else "viewer",
        "username": user.username,
    }
    return create_access_token(identity=user_id, additional_claims=additional_claims)


def logout_user(user_id: str, refresh_token: Optional[str] = None):
    """Invalidate user sessions."""
    if refresh_token:
        token_hash = hash_token(refresh_token)
        UserSession.query.filter_by(
            user_id=user_id,
            refresh_token_hash=token_hash,
        ).update({"is_active": False})
    else:
        # Logout all sessions
        UserSession.query.filter_by(user_id=user_id).update({"is_active": False})

    db.session.add(AuditLog(
        user_id=user_id,
        action="user_logout",
        details={},
        success=True,
    ))
    db.session.commit()
    logger.info("user_logged_out", user_id=user_id)


def get_current_user_or_none(user_id: str) -> Optional[User]:
    """Fetch current user by ID, returns None if not found."""
    return User.query.filter_by(id=user_id, is_active=True, deleted_at=None).first()


def require_role(*roles: str):
    """Decorator to enforce role-based access control."""
    from functools import wraps
    from flask_jwt_extended import get_jwt, verify_jwt_in_request

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            claims = get_jwt()
            user_role = claims.get("role", "viewer")
            if user_role not in roles:
                from app.utils import error_response
                return error_response(
                    "You do not have permission to perform this action.",
                    "FORBIDDEN",
                    403,
                )
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def seed_roles():
    """Seed default roles if they don't exist."""
    default_roles = [
        {"id": 1, "name": "admin", "description": "Full system access", "permissions": {"all": True}},
        {"id": 2, "name": "manager", "description": "Manage content and sources", "permissions": {"content": True, "sources": True, "users": True}},
        {"id": 3, "name": "user", "description": "Upload and view content", "permissions": {"content": True}},
        {"id": 4, "name": "viewer", "description": "View content only", "permissions": {"view": True}},
    ]
    for r in default_roles:
        if not Role.query.filter_by(name=r["name"]).first():
            db.session.add(Role(**r))
    db.session.commit()
    logger.info("roles_seeded")
