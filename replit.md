# PwC Lease Extractor

An AI-powered document management application that automates data extraction from lease documents (PDFs, DOCX, emails, and text files). Target platform: Windows 10/11.

## Architecture

**Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui + Framer Motion  
**Backend:** Python FastAPI (port 5001)  
**Database:** PostgreSQL (via psycopg2)  
**Dev Proxy:** Vite proxies `/api` to FastAPI at port 5001

## Project Structure

- `client/` — React frontend
  - `src/pages/` — Dashboard, Site Explorer, Extractions, Tag Management, Settings
  - `src/components/` — Reusable UI components
  - `src/components/motion-primitives.tsx` — Shared animation library (PageWrapper, PageHeader, AnimatedCard, Tilt3DCard, GlowOrb, MeshGradientBg, fadeSlideUp, staggerContainer)
- `server_py/` — Python FastAPI backend
  - `main.py` — API routes and SSE streaming
  - `db.py` — PostgreSQL connection pool
  - `storage.py` — Database queries
  - `seed.py` — Default tag seeding
  - `extractor.py` — AI-powered tag extraction (OpenAI/Anthropic)
  - `vision_extractor.py` — Vision extraction pipeline
  - `document_parser.py` — File parsing (PDF, DOCX, MSG, EML, TXT)
  - `config.py` — Configuration loaded from DB (Settings tab) with env var fallbacks
  - `progress.py` — SSE progress streaming
  - `cost_tracker.py` — Token usage and cost logging
- `shared/` — Drizzle ORM schema (`schema.ts`) for TypeScript migrations
- `server/` — Legacy Express/TypeScript backend (reference only)
- `start_dev.py` — Dev startup script (runs both Vite + uvicorn)
- `uploads/` — Uploaded lease document files

## Running

**Development:** `python start_dev.py`
- Vite dev server on port 5000 (frontend, proxies /api to 5001)
- uvicorn FastAPI server on port 5001 (backend)

**Production:** Build with `npm run build`, then run `set NODE_ENV=production && uvicorn server_py.main:app --host 0.0.0.0 --port 5000`
- FastAPI serves the built frontend from `dist/public`

## Database Setup

PostgreSQL required. Schema managed via Drizzle Kit:
```
npm run db:push
```
The FastAPI backend auto-creates additional tables (cost_logs, app_settings) and indexes on startup.

## Credential & Configuration Flow

All credentials and settings are managed from the **Settings tab** in the UI. The priority chain is:

1. **Settings tab** (stored in `app_settings` table) — highest priority
2. **`.env` file** — fallback if Settings tab value is empty
3. **Hardcoded defaults** — last resort

All extraction modules (`extractor.py`, `vision_extractor.py`, `document_parser.py`) read credentials exclusively through `config.py → get_config()`. No module reads environment variables directly for API keys.

## Environment Variables

Only these are needed in `.env`:
- `DATABASE_URL` — PostgreSQL connection string (required)
- `SESSION_SECRET` — Session encryption secret (required)
- `POPPLER_PATH` — Path to Poppler bin directory on Windows (if not in system PATH)

Optional env var fallbacks (overridden by Settings tab):
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_BASE_URL`, `EXTRACTION_MODEL`

## Key Features

- Upload folder structure (Site ID > Lease Number > Files)
- AI-powered tag extraction using OpenAI Vision or Anthropic Claude
- Real-time progress streaming via Server-Sent Events (SSE)
- Cost tracking (USD and INR) per extraction
- Tag management (create, import/export via Excel)
- Extraction export to styled Excel (.xlsx) with Site ID + Lease Number + tag columns
- File preview (PDF, DOCX, MSG, EML, TXT)
- Duplicate file detection
- Batch extraction support
- Animated UI with Framer Motion (3D tilt cards, page transitions, staggered animations)
- Fully responsive layout — adapts to all screen resolutions and zoom levels (mobile sidebar via sheet/drawer, responsive grids with sm/md/lg breakpoints, fluid padding and typography scaling)

## Python Dependencies

Managed via `python_requirements.txt`. Install with:
```
pip install -r python_requirements.txt
```

Key packages: fastapi, uvicorn, psycopg2-binary, openai, anthropic, pdfplumber, python-docx, openpyxl, pdf2image, python-multipart, aiofiles, extract-msg, Pillow, python-dotenv

## OCR Engine

All scanned PDF OCR is handled by the **Vision API** (OpenAI). When a PDF is detected as scanned (no selectable text), pages are converted to images at 300 DPI, preprocessed (grayscale, contrast, binarization), and sent to the Vision API for text extraction.

## Extraction Accuracy Features

- **System message**: Separate system prompt (`DEFAULT_SYSTEM_PROMPT` in config.py) sets the AI's role as a senior lease analyst
- **Structured vision prompt**: `DEFAULT_VISION_PROMPT` includes numbered extraction rules, synonym variants, format instructions, and strict JSON-only output
- **JSON mode**: OpenAI calls use `response_format: {"type": "json_object"}` with graceful fallback for unsupported models
- **Smaller tag batches**: Tags per batch reduced from 15 to 10 for better AI focus
- **Smart chunk merging**: When documents are split into image chunks, longer/more-specific values win over "Not Found" or shorter values (not first-found-wins)
- **Verification pass**: After initial extraction, tags still "Not Found" are re-sent to the AI in a dedicated second pass (Step 3/4)
- **JSON recovery**: If the AI returns malformed JSON, a regex-based extractor attempts to salvage the response before giving up
- **Tag categories**: Tag descriptions and categories are included in the prompt for better context

## Concurrency & Safety

- **Extraction semaphore**: Max 5 concurrent extractions (`EXTRACTION_SEMAPHORE` in main.py), threads wait up to 60 minutes for a slot
- **Stale extraction recovery**: Extractions stuck in "processing" for >60 minutes are automatically treated as stale and can be restarted
- **Temp dir cleanup**: Stale `vision-*`, `ocr-*`, `email-att-*` temp directories older than 1 hour are cleaned on startup
- **Delete cascade**: `delete_site()` properly removes leases, files, extractions, and cost_logs before deleting the site
- **"Not Found" normalization**: AI responses like "N/A", "Not mentioned", "None", "-", etc. are normalized to "Not Found" via `_normalize_not_found()` in vision_extractor.py
- **EXTRACTION_MODELS**: Defined once in `client/src/components/model-selector.tsx`, imported by `settings.tsx`
- **Config loading**: `load_dotenv()` is called once in `main.py`; other modules import config via `get_config()`
- **DB pool**: ThreadedConnectionPool(2, 10000, DATABASE_URL) — no cap on max connections
