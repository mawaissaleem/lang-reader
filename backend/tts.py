import asyncio
import hashlib
import os
import shutil
import sys
import tempfile
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
PIPER = Path(sys.executable).parent / "piper"  # the venv's CLI
# shortcut: one global lock serialises synthesis, fine for one user; use per-key locks if it ever queues
_lock = asyncio.Lock()
TIMEOUT = 60


class TTSError(Exception):
    pass


def voice_path() -> Path:
    return BASE_DIR / os.getenv("PIPER_VOICE", "voices/de_DE-thorsten-medium.onnx")  # absolute env value wins


def cache_dir() -> Path:
    return BASE_DIR / os.getenv("TTS_CACHE_DIR", "audio_cache")


def normalize(text: str) -> str:
    return " ".join(text.split())


def cache_path(text: str) -> Path:
    key = hashlib.sha256(f"{voice_path().stem}\0{normalize(text)}".encode()).hexdigest()
    return cache_dir() / f"{key}.mp3"


async def _run(args: list, stdin: bytes = b""):
    try:
        p = await asyncio.create_subprocess_exec(
            *map(str, args), stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE)
    except FileNotFoundError as e:
        raise TTSError(f"{args[0]} not found") from e
    try:
        _, err = await asyncio.wait_for(p.communicate(stdin), TIMEOUT)
    except asyncio.TimeoutError:  # a hung process would block every later request behind the lock
        p.kill()
        await p.wait()
        raise TTSError("timed out")
    if p.returncode:
        raise TTSError(f"{Path(args[0]).name} failed: {err.decode(errors='replace')[-300:]}")


async def synth(text: str, out: Path):
    """Piper -> wav -> ffmpeg -> mp3 at `out`."""
    if not voice_path().exists():
        raise TTSError(f"voice not found: {voice_path()}")
    if not shutil.which("ffmpeg"):
        raise TTSError("ffmpeg not found")
    with tempfile.TemporaryDirectory() as d:
        wav = Path(d) / "a.wav"
        await _run([PIPER, "-m", voice_path(), "-f", wav], normalize(text).encode())
        await _run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, out])


async def get_audio(text: str) -> Path:
    path = cache_path(text)
    async with _lock:
        if path.exists():
            return path
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp.mp3")  # .mp3 so ffmpeg infers the format
        try:
            await synth(text, tmp)
            os.replace(tmp, path)  # atomic: readers never see a half-written file
        finally:
            tmp.unlink(missing_ok=True)
    return path
