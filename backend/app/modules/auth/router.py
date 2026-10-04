from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import RateLimitExceededError
from app.core.rate_limit import InMemoryRateLimiter
from app.database.session import get_db
from app.modules.auth import service
from app.modules.auth.schemas import LoginRequest, TokenResponse

REFRESH_TOKEN_COOKIE_NAME = "nimbus_refresh_token"
REFRESH_TOKEN_COOKIE_PATH = "/api/auth"

LOGIN_RATE_LIMIT_ATTEMPTS = 5
LOGIN_RATE_LIMIT_WINDOW_SECONDS = 60

login_rate_limiter = InMemoryRateLimiter(
    max_attempts=LOGIN_RATE_LIMIT_ATTEMPTS,
    window_seconds=LOGIN_RATE_LIMIT_WINDOW_SECONDS,
)

router = APIRouter()


def enforce_login_rate_limit(request: Request) -> None:
    # Uses the client address resolved by the ASGI server. Proxy headers are only
    # honoured when the server is explicitly configured to trust the proxy.
    client_ip = request.client.host if request.client else "unknown"
    retry_after = login_rate_limiter.hit(client_ip)
    if retry_after is not None:
        service.log_login_failed("RATE_LIMITED")
        raise RateLimitExceededError(retry_after_seconds=retry_after)


def set_refresh_token_cookie(response: Response, refresh_token: str, expires_at: datetime) -> None:
    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE_NAME,
        value=refresh_token,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        expires=expires_at,
        path=REFRESH_TOKEN_COOKIE_PATH,
        secure=settings.environment == "production",
        httponly=True,
        samesite="lax",
    )


@router.post(
    "/login",
    response_model=TokenResponse,
    dependencies=[Depends(enforce_login_rate_limit)],
)
def login(
    payload: LoginRequest,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> TokenResponse:
    result = service.login(db, email=payload.email, password=payload.password)
    set_refresh_token_cookie(response, result.refresh_token, result.refresh_token_expires_at)
    return TokenResponse(access_token=result.access_token, expires_in=result.expires_in)
