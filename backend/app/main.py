from fastapi import FastAPI

from app.api.routes import router
from app.core.config import settings
from app.core.exceptions import unhandled_exception_handler
from app.core.logging import configure_logging


def create_app() -> FastAPI:
    configure_logging(settings.log_level)

    application = FastAPI(title=settings.app_name)
    application.add_exception_handler(Exception, unhandled_exception_handler)
    application.include_router(router, prefix="/api")

    @application.get("/")
    def root():
        return {"message": f"{settings.app_name} is running"}

    return application


app = create_app()
