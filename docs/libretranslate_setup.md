# Local LibreTranslate Setup Guide (German & English)

This guide walks through setting up and running [LibreTranslate](https://github.com/LibreTranslate/LibreTranslate) locally using Docker.

LibreTranslate is an open-source, self-hosted machine translation engine. By default, it supports 80+ languages, which requires downloading over 15GB of models. In this project, we configure it to download and load **only German (`de`) and English (`en`)**, reducing startup time, memory consumption, and disk footprint.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Method 1: Docker CLI (`docker run`)](#method-1-docker-cli-docker-run)
3. [Method 2: Docker Compose (Recommended)](#method-2-docker-compose-recommended)
4. [Testing & Verification](#testing--verification)
5. [Docker Management Commands](#docker-management-commands)
6. [Python Backend Integration](#python-backend-integration)
7. [Advanced Configuration & Options](#advanced-configuration--options)
8. [Troubleshooting & Common Issues](#troubleshooting--common-issues)

---

## Prerequisites

Ensure Docker is installed and running on your machine:
- [Install Docker Desktop / Engine](https://docs.docker.com/get-docker/)
- Verify installation:
  ```bash
  docker --version
  docker compose version
  ```

---

## Method 1: Docker CLI (`docker run`)

### Run in Background (Detached Mode)

Run the following command to start LibreTranslate with persistent storage and only German/English models:

```bash
docker run -d \
  --name libretranslate \
  -p 5000:5000 \
  -v libretranslate_data:/home/libretranslate/.local \
  libretranslate/libretranslate:latest \
  --load-only en,de \
  --req-limit 0
```

### Run in Foreground (Useful for first-time debugging)

To observe model downloads in real time:

```bash
docker run -it --rm \
  --name libretranslate \
  -p 5000:5000 \
  -v libretranslate_data:/home/libretranslate/.local \
  libretranslate/libretranslate:latest \
  --load-only en,de \
  --req-limit 0
```

### Explanation of Flags

| Flag | Description |
|---|---|
| `-d` | Runs the container in the background (detached). |
| `--name libretranslate` | Assigns a predictable name to manage the container easily. |
| `-p 5000:5000` | Maps host port `5000` to container port `5000`. |
| `-v libretranslate_data:/home/libretranslate/.local` | Creates a named volume to persist downloaded Argos Translate models. Without this, models would be downloaded on every container restart. |
| `libretranslate/libretranslate:latest` | Official LibreTranslate Docker image. |
| `--load-only en,de` | **Crucial:** Only downloads language models for English and German (~150MB instead of ~15GB). |
| `--req-limit 0` | Disables request rate limiting for local development. |

---

## Method 2: Docker Compose (Recommended)

A pre-configured Compose file is available at the repository root: `docker-compose.libretranslate.yml`.

### 1. Start the service

```bash
docker compose -f docker-compose.libretranslate.yml up -d
```

### 2. Check logs

```bash
docker compose -f docker-compose.libretranslate.yml logs -f
```

### 3. Stop the service

```bash
docker compose -f docker-compose.libretranslate.yml down
```

### Configuration breakdown (`docker-compose.libretranslate.yml`):

```yaml
services:
  libretranslate:
    image: libretranslate/libretranslate:latest
    container_name: libretranslate
    restart: unless-stopped
    ports:
      - "5000:5000"
    environment:
      - LT_LOAD_ONLY=en,de
      - LT_REQ_LIMIT=0
      - LT_DISABLE_WEB_UI=False
    volumes:
      - libretranslate_data:/home/libretranslate/.local

volumes:
  libretranslate_data:
```

---

## Testing & Verification

Once the container is running and finished downloading the models (check logs), verify it:

### 1. Web UI
Open your browser and navigate to:
```
http://localhost:5000
```
You will see the LibreTranslate translation web interface.

### 2. Check Loaded Languages
Verify that only German and English are loaded:

```bash
curl -s http://localhost:5000/languages | jq .
```

Expected output:
```json
[
  {
    "code": "de",
    "name": "German",
    "targets": ["en"]
  },
  {
    "code": "en",
    "name": "English",
    "targets": ["de"]
  }
]
```

### 3. Test Translation API (German to English)

```bash
curl -X POST "http://localhost:5000/translate" \
  -H "Content-Type: application/json" \
  -d '{
    "q": "Das Leben ist zu kurz, um schlechten Kaffee zu trinken.",
    "source": "de",
    "target": "en",
    "format": "text"
  }'
```

Expected response:
```json
{
  "translatedText": "Life is too short to drink bad coffee."
}
```

### 4. Test Single Word Lookup

```bash
curl -X POST "http://localhost:5000/translate" \
  -H "Content-Type: application/json" \
  -d '{
    "q": "Wortschatz",
    "source": "de",
    "target": "en",
    "format": "text"
  }'
```

Expected response:
```json
{
  "translatedText": "Vocabulary"
}
```

---

## Docker Management Commands

Here is a handy reference for managing the LibreTranslate container:

| Action | Command |
|---|---|
| **View live logs** | `docker logs -f libretranslate` |
| **Check container status** | `docker ps -f name=libretranslate` |
| **Stop container** | `docker stop libretranslate` |
| **Start stopped container** | `docker start libretranslate` |
| **Restart container** | `docker restart libretranslate` |
| **Inspect resource usage** | `docker stats libretranslate` |
| **Stop & remove container** | `docker rm -f libretranslate` |
| **Clear downloaded models** | `docker volume rm libretranslate_data` |
| **Shell access into container** | `docker exec -it libretranslate sh` |

---

## Python Backend Integration

To query the local LibreTranslate service from the FastAPI backend:

### Async using `httpx` (recommended for FastAPI)

```python
import httpx
from typing import Optional

LIBRETRANSLATE_URL = "http://localhost:5000"

async def translate_de_to_en(text: str) -> Optional[str]:
    """Translate German text or word to English using local LibreTranslate."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.post(
                f"{LIBRETRANSLATE_URL}/translate",
                json={
                    "q": text,
                    "source": "de",
                    "target": "en",
                    "format": "text",
                },
            )
            if response.status_code == 200:
                data = response.json()
                return data.get("translatedText")
            return None
        except httpx.RequestError as e:
            print(f"[LibreTranslate] Service unavailable: {e}")
            return None
```

### Synchronous using `requests`

```python
import requests

def translate_de_to_en_sync(text: str) -> str:
    url = "http://localhost:5000/translate"
    payload = {
        "q": text,
        "source": "de",
        "target": "en",
        "format": "text"
    }
    response = requests.post(url, json=payload, timeout=10)
    response.raise_for_status()
    return response.json()["translatedText"]
```

---

## Advanced Configuration & Options

LibreTranslate accepts configuration via CLI arguments or environment variables (`LT_*`):

### 1. Change Host Port (e.g. if port 5000 is occupied)
Map host port `5001` to container port `5000`:
```bash
docker run -d -p 5001:5000 ...
```
API is now at `http://localhost:5001`.

### 2. Disable Web UI (Headless API Only)
If you only need the REST API and want to reduce memory usage:
- CLI flag: `--disable-web-ui`
- Environment variable: `LT_DISABLE_WEB_UI=True`

### 3. API Key Protection (Optional)
If you want to protect your endpoint with an API key:
- Add `--api-keys` and create keys using `docker exec -it libretranslate libretranslate-manage apikey add 1000`.

### 4. Adjust Worker Processes / Threads
For increased concurrency:
- CLI flags: `--threads 4 --processes 2`
- Environment variables: `LT_THREADS=4`, `LT_PROCESSES=2`

---

## Troubleshooting & Common Issues

### 1. First Startup Takes 1-2 Minutes
On initial launch, the container downloads the `de -> en` and `en -> de` model packages (~150MB). Until that finishes, `curl` or browser requests will fail.
- Check progress: `docker logs -f libretranslate`
- When you see `Running on http://0.0.0.0:5000`, it is ready.

### 2. Port 5000 Already in Use
On macOS Monterey and newer, the AirPlay Receiver service occupies port `5000`.
- **Solution 1:** Map to another port: `-p 5050:5000` (update backend `LIBRETRANSLATE_URL=http://localhost:5050`).
- **Solution 2 (macOS):** Disable AirPlay Receiver in *System Settings > General > AirDrop & AirPlay > AirPlay Receiver*.

### 3. Re-downloading Models Every Restart
If models download on every restart, make sure the named volume is specified:
`-v libretranslate_data:/home/libretranslate/.local`
Check volume status:
```bash
docker volume ls | grep libretranslate
```

### 4. Memory Usage
The German-English model uses ~400MB - 600MB of RAM. If running in a memory-constrained VM or container runner, ensure at least 1GB of free RAM is available.

