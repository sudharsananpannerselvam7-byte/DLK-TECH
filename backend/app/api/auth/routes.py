"""
SmartFlow Authentication API
Endpoints: register, login, refresh, logout, me
"""
from flask import Blueprint, request
from flask_jwt_extended import (
    jwt_required, get_jwt_identity, get_jwt
)
from app.extensions import limiter
from app.services import (
    register_user, login_user, logout_user, refresh_access_token,
    get_current_user_or_none, AuthError
)
from app.utils import success_response, error_response

auth_bp = Blueprint("auth", __name__, url_prefix="/api/v1/auth")


def _ip():
    return request.environ.get("HTTP_X_REAL_IP", request.remote_addr)


def _ua():
    return request.headers.get("User-Agent", "")[:500]


@auth_bp.route("/register", methods=["POST"])
@limiter.limit("10 per hour")
def register():
    """POST /api/v1/auth/register"""
    data = request.get_json(silent=True) or {}
    email = data.get("email", "").strip()
    username = data.get("username", "").strip()
    password = data.get("password", "")
    full_name = data.get("full_name", "").strip() or None

    # Basic validation
    if not email or not username or not password:
        return error_response("Email, username, and password are required.", "VALIDATION_ERROR", 400)
    if len(password) < 8:
        return error_response("Password must be at least 8 characters.", "WEAK_PASSWORD", 400)
    if len(username) < 3:
        return error_response("Username must be at least 3 characters.", "VALIDATION_ERROR", 400)

    try:
        user = register_user(
            email=email,
            username=username,
            password=password,
            full_name=full_name,
            ip_address=_ip(),
        )
        return success_response(
            data=_user_to_dict(user),
            message="Account created successfully.",
            status_code=201,
        )
    except AuthError as e:
        return error_response(e.message, e.code, e.status)
    except Exception as e:
        return error_response("Registration failed. Please try again.", "REGISTER_FAILED", 500)


@auth_bp.route("/login", methods=["POST"])
@limiter.limit("20 per hour")
def login():
    """POST /api/v1/auth/login"""
    data = request.get_json(silent=True) or {}
    identifier = data.get("email") or data.get("username") or ""
    password = data.get("password", "")

    if not identifier or not password:
        return error_response("Email/username and password are required.", "VALIDATION_ERROR", 400)

    try:
        access_token, refresh_token, user = login_user(
            email_or_username=identifier.strip(),
            password=password,
            ip_address=_ip(),
            user_agent=_ua(),
        )
        return success_response(
            data={
                "access_token": access_token,
                "refresh_token": refresh_token,
                "user": _user_to_dict(user),
            },
            message="Login successful.",
        )
    except AuthError as e:
        return error_response(e.message, e.code, e.status)


@auth_bp.route("/refresh", methods=["POST"])
@jwt_required(refresh=True)
def refresh():
    """POST /api/v1/auth/refresh — returns new access token"""
    data = request.get_json(silent=True) or {}
    user_id = get_jwt_identity()
    refresh_token = data.get("refresh_token", "")

    try:
        access_token = refresh_access_token(user_id=user_id, refresh_token=refresh_token)
        return success_response(data={"access_token": access_token})
    except AuthError as e:
        return error_response(e.message, e.code, e.status)


@auth_bp.route("/logout", methods=["POST"])
@jwt_required()
def logout():
    """POST /api/v1/auth/logout"""
    user_id = get_jwt_identity()
    data = request.get_json(silent=True) or {}
    refresh_token = data.get("refresh_token")

    logout_user(user_id=user_id, refresh_token=refresh_token)
    return success_response(message="Logged out successfully.")


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    """GET /api/v1/auth/me — current user profile"""
    user_id = get_jwt_identity()
    user = get_current_user_or_none(user_id)
    if not user:
        return error_response("User not found.", "USER_NOT_FOUND", 404)
    return success_response(data=_user_to_dict(user, include_email=True))


def _user_to_dict(user, include_email: bool = False) -> dict:
    data = {
        "id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "avatar_url": user.avatar_url,
        "role": user.role.name if user.role else "viewer",
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
    }
    if include_email:
        data["email"] = user.email
    return data
