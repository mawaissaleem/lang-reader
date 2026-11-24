"""Route reporting whether the helper services are up (Anki already has /anki/status)."""

from fastapi import APIRouter

from service_status import all_statuses

router = APIRouter()


@router.get("/services/status")
async def services_status():
    return await all_statuses()
