"""Route for text-to-speech audio served from the Piper cache."""

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

import tts

router = APIRouter()


@router.get("/tts")
async def text_to_speech(text: str = Query(..., max_length=500)):
    if not tts.normalize(text):
        raise HTTPException(status_code=422, detail="text must not be empty")
    try:
        path = await tts.get_audio(text)
    except tts.TTSError as e:
        raise HTTPException(status_code=503, detail=f"Text-to-speech unavailable: {e}")
    # short max-age: the URL has no voice, so a voice change must reach the browser
    return FileResponse(
        path,
        media_type="audio/mpeg",
        headers={"Cache-Control": "public, max-age=86400"},
    )
