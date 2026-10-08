from fastapi import APIRouter

from app.modules.auth.dependencies import CurrentUser
from app.modules.users.schemas import CurrentUserResponse

router = APIRouter()


@router.get("/me", response_model=CurrentUserResponse)
def read_current_user(current_user: CurrentUser) -> CurrentUserResponse:
    """Returns the authenticated user.

    The user is resolved exclusively from the validated access token by the `CurrentUser`
    dependency, which also rejects deleted and INACTIVE users with `401`.
    """
    return CurrentUserResponse.model_validate(current_user)
