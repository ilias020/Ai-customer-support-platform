from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Request, Response
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

# Security Design §4.9: the refresh endpoint is rate limited as well. The limit is higher than
# for login because legitimate clients refresh periodically and per browser tab.
REFRESH_RATE_LIMIT_ATTEMPTS = 30
REFRESH_RATE_LIMIT_WINDOW_SECONDS = 60

login_rate_limiter = InMemoryRateLimiter(
    max_attempts=LOGIN_RATE_LIMIT_ATTEMPTS,
    window_seconds=LOGIN_RATE_LIMIT_WINDOW_SECONDS,
)
refresh_rate_limiter = InMemoryRateLimiter(
    max_attempts=REFRESH_RATE_LIMIT_ATTEMPTS,
    window_seconds=REFRESH_RATE_LIMIT_WINDOW_SECONDS,
)

router = APIRouter()


def client_ip_for(request: Request) -> str:
    # Uses the client address resolved by the ASGI server. Proxy headers are only
    # honoured when the server is explicitly configured to trust the proxy.
    return request.client.host if request.client else "unknown"


def enforce_login_rate_limit(request: Request) -> None:
    retry_after = login_rate_limiter.hit(client_ip_for(request))
    if retry_after is not None:
        service.log_login_failed("RATE_LIMITED")
        raise RateLimitExceededError(retry_after_seconds=retry_after)


def enforce_refresh_rate_limit(request: Request) -> None:
    retry_after = refresh_rate_limiter.hit(client_ip_for(request))
    if retry_after is not None:
        service.log_refresh_failed("RATE_LIMITED")
        raise RateLimitExceededError(retry_after_seconds=retry_after)


def set_refresh_token_cookie(
    response: Response,
    refresh_token: str,
    expires_at: datetime,
    max_age: int,
) -> None:
    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE_NAME,
        value=refresh_token,
        max_age=max_age,
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
    set_refresh_token_cookie(
        response,
        result.refresh_token,
        result.refresh_token_expires_at,
        result.refresh_token_max_age,
    )
    return TokenResponse(access_token=result.access_token, expires_in=result.expires_in)


@router.post(
    "/refresh",
    response_model=TokenResponse,
    dependencies=[Depends(enforce_refresh_rate_limit)],
)
def refresh(
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    refresh_token: Annotated[str | None, Cookie(alias=REFRESH_TOKEN_COOKIE_NAME)] = None,
) -> TokenResponse:
    result = service.refresh_session(db, refresh_token=refresh_token)
    set_refresh_token_cookie(
        response,
        result.refresh_token,
        result.refresh_token_expires_at,
        result.refresh_token_max_age,
    )
    return TokenResponse(access_token=result.access_token, expires_in=result.expires_in)
