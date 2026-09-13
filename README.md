# lang-reader

A full-stack application for learning German using YouTube subtitles, interactive word lookups, and reading practice.

## Project Structure

```
├── backend/                         # FastAPI backend service
│   ├── main.py                      # API entry point & routes
│   ├── database.py                  # SQLite engine & session management
│   ├── models.py                    # SQLAlchemy ORM models
│   ├── extractors/                  # YouTube transcript & yt-dlp extractors
│   ├── vtt_parser.py                # WebVTT parser & cleaner
│   ├── pyproject.toml               # Modern Python packaging & dependencies
│   └── requirements.txt             # Pinned/versioned Python dependencies
├── frontend/                        # Next.js (App Router) frontend
│   ├── app/                         # App routes (reader, library, etc.)
│   ├── components/                  # UI components
│   ├── lib/                         # API client
│   └── store/                       # Zustand state store
├── docs/                            # Documentation guides
│   └── libretranslate_setup.md      # Detailed LibreTranslate Docker guide
├── docker-compose.libretranslate.yml # Docker Compose for local LibreTranslate
└── requirements.txt                 # Root requirements pointer
```

## Backend Setup

### 1. Create and activate a virtual environment

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Install dependencies

From repository root:
```bash
pip install -r requirements.txt
```

Or from `backend/`:
```bash
cd backend
pip install -r requirements.txt
```

### 3. Environment variables

Create `backend/.env`:
```env
PONS_API_KEY=your_pons_api_key_here
LIBRETRANSLATE_URL=http://localhost:5000
```

### 4. Run the Backend API

```bash
cd backend
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000` (interactive Swagger docs at `http://localhost:8000/docs`).

## Local Translator Setup (LibreTranslate with Docker)

To query a self-hosted translator locally without API quotas or external rate limits, you can run LibreTranslate in Docker configured exclusively for German (`de`) and English (`en`):

### Option A: Using Docker Compose (Quickest)

```bash
docker compose -f docker-compose.libretranslate.yml up -d
```

### Option B: Using Docker CLI

```bash
docker run -d \
  --name libretranslate \
  -p 5000:5000 \
  -v libretranslate_data:/home/libretranslate/.local \
  libretranslate/libretranslate:latest \
  --load-only en,de \
  --req-limit 0
```

### Verify It Works

Once running (allow ~1 minute on first launch for model download):
```bash
curl -X POST "http://localhost:5000/translate" \
  -H "Content-Type: application/json" \
  -d '{"q": "Hallo Welt", "source": "de", "target": "en", "format": "text"}'
```

Expected response:
```json
{"translatedText": "Hello World"}
```

> 📖 **Full Guide & Command Reference**: See [docs/libretranslate_setup.md](docs/libretranslate_setup.md) for detailed instructions, live log monitoring, volume management, container controls, and Python integration snippets.

## Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at `http://localhost:3000`.
