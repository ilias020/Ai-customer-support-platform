from fastapi import status

from app.core.exceptions import AppError


class InvalidCredentialsError(AppError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "INVALID_CREDENTIALS"
    message = "Invalid email or password."


class InvalidRefreshTokenError(AppError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "INVALID_REFRESH_TOKEN"
    message = "The session is invalid or has expired."


# RFC 6750: 401 responses for bearer-protected resources announce the expected scheme.
BEARER_CHALLENGE_HEADERS = {"WWW-Authenticate": "Bearer"}


class AuthenticationRequiredError(AppError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "AUTHENTICATION_REQUIRED"
    message = "Authentication is required."

    def __init__(self) -> None:
        super().__init__(headers=BEARER_CHALLENGE_HEADERS)


class AccessTokenExpiredError(AppError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "ACCESS_TOKEN_EXPIRED"
    message = "The access token has expired."

    def __init__(self) -> None:
        super().__init__(headers=BEARER_CHALLENGE_HEADERS)
