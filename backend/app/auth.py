from datetime import datetime, timedelta, timezone
from typing import Annotated

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt import InvalidTokenError
from sqlalchemy.orm import Session

from .config import JWT_ACCESS_TOKEN_MINUTES, JWT_SECRET_KEY
from .database import get_db
from .models import User

password_hasher = PasswordHasher()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return password_hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def create_token(user: User, token_type: str = "access", lifetime: timedelta | None = None) -> str:
    expires_at = datetime.now(timezone.utc) + (lifetime or timedelta(minutes=JWT_ACCESS_TOKEN_MINUTES))
    return jwt.encode({
        "sub": str(user.id),
        "tenant_id": user.tenant_id,
        "type": token_type,
        "exp": expires_at,
    }, JWT_SECRET_KEY, algorithm="HS256")


def decode_token(token: str, expected_type: str = "access") -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=["HS256"])
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    if payload.get("type") != expected_type:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token type",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Session = Depends(get_db),
) -> User:
    payload = decode_token(token)
    try:
        user_id = int(payload["sub"])
        tenant_id = int(payload["tenant_id"])
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Invalid authentication token") from exc
    user = db.query(User).filter(
        User.id == user_id,
        User.tenant_id == tenant_id,
        User.is_active.is_(True),
    ).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User is inactive or no longer exists",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Workspace administrator access is required")
    return user
