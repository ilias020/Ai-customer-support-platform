from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import settings
from app.core.exceptions import (
    AppError,
    app_error_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from app.core.logging import configure_logging
from app.core.request_id import REQUEST_ID_HEADER, RequestIDMiddleware


def create_app() -> FastAPI:
    configure_logging(settings.log_level)

    application = FastAPI(title=settings.app_name)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=[REQUEST_ID_HEADER],
    )
    application.add_middleware(RequestIDMiddleware)
    application.add_exception_handler(AppError, app_error_handler)
    application.add_exception_handler(RequestValidationError, validation_exception_handler)
    application.add_exception_handler(Exception, unhandled_exception_handler)
    application.include_router(router, prefix="/api")

    @application.get("/")
    def root():
        return {"message": f"{settings.app_name} is running"}

    return application


app = create_app()
