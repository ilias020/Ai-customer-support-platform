from fastapi import APIRouter

from app.modules.auth.router import router as auth_router

router = APIRouter()
router.include_router(auth_router, prefix="/auth", tags=["auth"])


@router.get("/health")
def health_check():
    return {"status": "ok"}
