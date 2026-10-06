import logging
from typing import Any

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.request_id import REQUEST_ID_HEADER, get_request_id_from_request

logger = logging.getLogger(__name__)


class AppError(Exception):
    """Base class for controlled API errors that map to the Nimbus error structure."""

    status_code: int = status.HTTP_400_BAD_REQUEST
    code: str = "BAD_REQUEST"
    message: str = "The request could not be processed."

    def __init__(self, headers: dict[str, str] | None = None) -> None:
        super().__init__(self.code)
        self.headers = headers


class RateLimitExceededError(AppError):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    code = "RATE_LIMIT_EXCEEDED"
    message = "Too many requests. Please try again later."

    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__(headers={"Retry-After": str(retry_after_seconds)})


def error_response(
    request: Request,
    *,
    status_code: int,
    code: str,
    message: str,
    details: list[dict[str, str]] | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    request_id = get_request_id_from_request(request)
    error: dict[str, Any] = {"code": code, "message": message}
    if details:
        error["details"] = details

    return JSONResponse(
        status_code=status_code,
        content={"error": error, "request_id": request_id},
        headers={**(headers or {}), REQUEST_ID_HEADER: request_id},
    )


async def app_error_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, AppError)
    return error_response(
        request,
        status_code=exc.status_code,
        code=exc.code,
        message=exc.message,
        headers=exc.headers,
    )


async def validation_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    # Only field locations and generic messages are returned; submitted input values
    # (such as passwords) are never echoed back to the client.
    details = [
        {
            "field": ".".join(str(part) for part in error.get("loc", ()) if part != "body"),
            "message": str(error.get("msg", "Invalid value.")),
        }
        for error in exc.errors()
    ]
    return error_response(
        request,
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        code="VALIDATION_ERROR",
        message="The request contains invalid data.",
        details=details,
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    request_id = get_request_id_from_request(request)
    logger.exception(
        "Unhandled application error",
        exc_info=exc,
        extra={"request_id": request_id, "method": request.method, "path": request.url.path},
    )
    return error_response(
        request,
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        code="INTERNAL_SERVER_ERROR",
        message="An unexpected error occurred.",
    )
