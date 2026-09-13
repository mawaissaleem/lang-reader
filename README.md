# lang-reader

A full-stack application for learning German using YouTube subtitles, interactive word lookups, and reading practice.

## Project Structure

```
├── backend/            # FastAPI backend service
│   ├── main.py         # API entry point & routes
│   ├── database.py     # SQLite engine & session management
│   ├── models.py       # SQLAlchemy ORM models
│   ├── extractors/     # YouTube transcript & yt-dlp extractors
│   ├── vtt_parser.py   # WebVTT parser & cleaner
│   ├── pyproject.toml  # Modern Python packaging & dependencies
│   └── requirements.txt# Pinned/versioned Python dependencies
├── frontend/           # Next.js (App Router) frontend
│   ├── app/            # App routes (reader, library, etc.)
│   ├── components/     # UI components
│   ├── lib/            # API client
│   └── store/          # Zustand state store
└── requirements.txt    # Root requirements pointer
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
```

### 4. Run the Backend API

```bash
cd backend
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000` (docs at `http://localhost:8000/docs`).

## Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at `http://localhost:3000`.
