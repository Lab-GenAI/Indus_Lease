# PwC Lease Extractor

An AI-powered document management application that automates data extraction from lease documents (PDFs, DOCX, emails, and text files).

## Architecture

**Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui  
**Backend:** Python FastAPI (port 5001)  
**Database:** PostgreSQL (Replit built-in, via psycopg2)  
**Dev Proxy:** Vite proxies `/api` to FastAPI at port 5001

## Project Structure

- `client/` — React frontend
  - `src/pages/` — Dashboard, Site Explorer, Extractions, Tag Management, Settings
  - `src/components/` — Reusable UI components
- `server_py/` — Python FastAPI backend
  - `main.py` — API routes and SSE streaming
  - `db.py` — PostgreSQL connection pool
  - `storage.py` — Database queries
  - `seed.py` — Default tag seeding
  - `extractor.py` — AI-powered tag extraction (OpenAI/Anthropic)
  - `document_parser.py` — File parsing (PDF, DOCX, MSG, EML, TXT)
  - `config.py` — Configuration with model overrides
  - `progress.py` — SSE progress streaming
- `shared/` — Drizzle ORM schema (`schema.ts`) for TypeScript migrations
- `server/` — Legacy Express/TypeScript backend (reference only)
- `start_dev.py` — Dev startup script (runs both Vite + uvicorn)
- `uploads/` — Uploaded lease document files

## Running

**Development:** Managed via "Start application" workflow which runs `python start_dev.py`
- Vite dev server on port 5000 (frontend, proxies /api to 5001)
- uvicorn FastAPI server on port 5001 (backend)

**Production:** Build with `npm run build`, then run `NODE_ENV=production uvicorn server_py.main:app --host 0.0.0.0 --port 5000`
- FastAPI serves the built frontend from `dist/public`

## Database Setup

Uses Replit's built-in PostgreSQL. Schema managed via Drizzle Kit:
```
npm run db:push
```
The FastAPI backend auto-creates additional tables and indexes on startup.

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string (set by Replit)
- `OPENAI_API_KEY` — Required for OpenAI GPT-4 Vision extraction
- `ANTHROPIC_API_KEY` — Optional, for Claude-based extraction

## Key Features

- Upload folder structure (Site ID > Lease Number > Files)
- AI-powered tag extraction using OpenAI Vision or Anthropic Claude
- Real-time progress streaming via Server-Sent Events (SSE)
- Cost tracking (USD and INR) per extraction
- Tag management (create, import/export via Excel)
- Extraction export to styled Excel (.xlsx) with summary sheet, character sanitization, and professional formatting
- File preview (PDF, DOCX, MSG, EML, TXT)
- Duplicate file detection
- Batch extraction support

## Python Dependencies

Managed via `python_requirements.txt`. Install with:
```
pip install -r python_requirements.txt
```

Key packages: fastapi, uvicorn, psycopg2-binary, openai, anthropic, pdfplumber, python-docx, openpyxl, pytesseract, pdf2image, python-multipart, aiofiles, extract-msg, Pillow, python-dotenv
