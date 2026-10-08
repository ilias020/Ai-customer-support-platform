"""Authentication dependency for protected API routes.

Usage in a router:

    from app.modules.auth.dependencies import CurrentUser

    @router.get("/me")
    def read_me(current_user: CurrentUser) -> ...:
        ...

Public endpoints (login, refresh, health) simply do not declare this dependency.
"""

from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import (
    ExpiredAccessTokenError,
    InvalidAccessTokenError,
    decode_access_token,
)
from app.database.session import get_db
from app.modules.auth.exceptions import AccessTokenExpiredError, AuthenticationRequiredError
from app.modules.users.models import User, UserStatus
from app.modules.users.repository import get_user_by_id

# auto_error=False: missing or non-Bearer credentials are turned into the Nimbus error
# structure below instead of FastAPI's default error response. The scheme is also
# registered in the OpenAPI documentation.
bearer_scheme = HTTPBearer(auto_error=False, bearerFormat="JWT")


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    """Returns the ACTIVE user identified by a valid `Authorization: Bearer` access token.

    The identity is derived exclusively from the validated token; the current user status is
    always read from the database, so deactivated or deleted users lose access immediately.
    """
    if credentials is None:
        raise AuthenticationRequiredError()

    try:
        user_id = decode_access_token(credentials.credentials)
    except ExpiredAccessTokenError as exc:
        raise AccessTokenExpiredError() from exc
    except InvalidAccessTokenError as exc:
        raise AuthenticationRequiredError() from exc

    user = get_user_by_id(db, user_id)
    if user is None or user.status != UserStatus.ACTIVE:
        raise AuthenticationRequiredError()

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
