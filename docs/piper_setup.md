# Piper setup (audio)

This guide sets up [Piper](https://github.com/OHF-Voice/piper1-gpl), a local text-to-speech engine, with a German voice, plus `ffmpeg` to turn its output into mp3. After it, the side panel can speak words and sentences, and Anki cards get audio.

Audio is optional. Without it, the play buttons stay silent and Anki cards are added without sound.

## Contents

1. [What you get](#what-you-get)
2. [Install ffmpeg](#1-install-ffmpeg)
3. [Install Piper](#2-install-piper)
4. [Download the German voice](#3-download-the-german-voice)
5. [Check Piper on its own](#4-check-piper-on-its-own)
6. [Check it in the app](#5-check-it-in-the-app)
7. [Use another voice](#use-another-voice)
8. [The audio cache](#the-audio-cache)
9. [Troubleshooting](#troubleshooting)

## What you get

| Feature | Where in the app |
|---|---|
| Play the word (with its article) and its sentence | Side panel → play buttons |
| Audio on word and sentence cards | Anki cards sent with **Save + Anki** ([Anki setup](anki_setup.md)) |
| Test the voice | Settings → Services → **Audio (Piper)** → **Play sample** |

How it works: the backend runs `piper` to make a `.wav`, `ffmpeg` converts it to `.mp3`, and the mp3 is saved in `backend/audio_cache/`. The same text is never generated twice.

The app needs three things. Settings → Services checks all three:

| Piece | Where the app looks |
|---|---|
| `piper` command | Next to the Python that runs the backend: `.venv/bin/piper` |
| Voice file | `backend/voices/de_DE-thorsten-medium.onnx` (and its `.onnx.json`) |
| `ffmpeg` | On your `PATH` |

## 1. Install ffmpeg

```bash
sudo apt install ffmpeg        # Debian / Ubuntu
sudo dnf install ffmpeg        # Fedora (needs RPM Fusion)
brew install ffmpeg            # macOS
```

Check it:

```bash
ffmpeg -version
```

## 2. Install Piper

Piper must be installed **into the same virtual environment that runs the backend**. The backend looks for `piper` next to its own Python, not on your `PATH`.

From the repository root:

```bash
source .venv/bin/activate
pip install piper-tts
```

Check it:

```bash
ls .venv/bin/piper
.venv/bin/piper --help
```

This project was built with `piper-tts` 1.8.0.

## 3. Download the German voice

The default voice is `de_DE-thorsten-medium`, a clear male German voice. A voice is two files: the model (`.onnx`, about 63 MB) and its config (`.onnx.json`). Both must sit in the same folder.

From the repository root:

```bash
mkdir -p backend/voices
cd backend/voices
curl -L -O https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx
curl -L -O https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx.json
cd ../..
```

Check the size:

```bash
ls -l backend/voices
```

`de_DE-thorsten-medium.onnx` must be about 63 MB (63,221,984 bytes). A smaller file is a broken download: delete it and download it again. Piper fails on a truncated model with an unclear error.

`backend/voices/` is in `.gitignore`, so the voice is downloaded once per machine.

## 4. Check Piper on its own

From the repository root:

```bash
echo "Guten Tag, wie geht es dir?" | .venv/bin/piper \
  -m backend/voices/de_DE-thorsten-medium.onnx \
  -f /tmp/piper-test.wav
ffmpeg -y -loglevel error -i /tmp/piper-test.wav /tmp/piper-test.mp3
```

Play `/tmp/piper-test.mp3` with any audio player, for example `xdg-open /tmp/piper-test.mp3` on Linux or `open /tmp/piper-test.mp3` on macOS. You should hear the sentence in German.

## 5. Check it in the app

1. Restart the backend.
2. Open **Settings → Services**. The **Audio (Piper)** row should say "Voice de_DE-thorsten-medium is ready".
3. Press **Play sample**. You should hear "Guten Tag".

Or from a terminal, with the backend running:

```bash
curl -s -o /tmp/app-test.mp3 "http://localhost:8000/tts?text=Guten%20Tag"
ls -l /tmp/app-test.mp3
```

The first request takes a second or two. A second request for the same text is served from the cache.

## Use another voice

Other German voices are listed at [huggingface.co/rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices/tree/main/de/de_DE). Listen to samples at [rhasspy.github.io/piper-samples](https://rhasspy.github.io/piper-samples/).

1. Download both files of the voice (`.onnx` and `.onnx.json`) into `backend/voices/`, the same way as in [step 3](#3-download-the-german-voice).
2. Set it in `backend/.env`. The path is relative to `backend/`, or absolute:

   ```env
   PIPER_VOICE=voices/de_DE-kerstin-low.onnx
   ```

3. Restart the backend.

The voice name is part of the cache key, so the new voice never plays old audio from the previous one. Anki cards made earlier keep their old audio.

## The audio cache

Generated mp3 files are kept in `backend/audio_cache/` (change it with `TTS_CACHE_DIR` in `backend/.env`). The folder is safe to delete at any time. Files are made again when needed.

```bash
du -sh backend/audio_cache     # how much space it uses
rm -rf backend/audio_cache     # clear it
```

## Troubleshooting

| Symptom (Settings → Services or backend log) | Cause | Fix |
|---|---|---|
| "Piper is not installed" | `piper` is not in the backend's virtual environment | `source .venv/bin/activate && pip install piper-tts`. Make sure you start `uvicorn` from that same environment |
| "German voice not found (…)" | The `.onnx` file is missing or `PIPER_VOICE` points to the wrong place | Do [step 3](#3-download-the-german-voice), or fix `PIPER_VOICE` |
| "ffmpeg is not installed" | `ffmpeg` is not on the `PATH` of the backend process | Do [step 1](#1-install-ffmpeg) and restart the backend |
| "piper failed: …" in the log | Broken voice file, or the `.onnx.json` is missing | Check the size in [step 3](#3-download-the-german-voice). Download both files again |
| "timed out" | Generation took more than 60 s (very slow machine or very long text) | Try a `low` quality voice |
| Settings says ready, but nothing plays | Browser autoplay or system volume | Click the play button again. Check the browser is not muted |
