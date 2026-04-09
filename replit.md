# PwC Lease Extractor - Document Management & Tag Extraction

## Overview
A lease document management application that allows users to upload folders containing Site IDs, Lease Numbers, and document files (.pdf, .docx, .msg, .eml, .txt). The app provides a dashboard view, site/lease exploration, tag-based AI extraction using vision mode (azure.gpt-4.1 or Claude), and an admin panel for managing extraction tags.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui components
- **Backend**: Python FastAPI (uvicorn) with raw SQL via psycopg2
- **Database**: PostgreSQL
- **AI**: OpenAI azure.gpt-4.1 Vision or Anthropic Claude for tag extraction (vision mode — sends page images to LLM)
- **File Parsing**: pdfplumber, python-docx, email (stdlib) for document content extraction
- **Dev Server**: `start_dev.py` runs both Vite (port 5000) and FastAPI (port 5001) with Vite proxying `/api` to FastAPI

## Configuration System
- **`server_py/config.py`**: Centralized config module that loads settings from `app_settings` DB table with env var fallbacks
- **Settings stored in DB**: API keys, model selection, vision extraction prompt, parallelism settings, additional base URLs
- **Dynamic reloading**: Config is read fresh on each extraction run — no server restart needed after config changes
- **API endpoints**: `GET/PUT /api/config` for full config management, `POST /api/config/reset-prompts` to restore default prompts
- **Sensitive key masking**: API keys are masked in API responses (showing only last 4 chars)
- **Per-extraction model override**: Model and base URL can be chosen at extraction time via UI toggle; passed as `{ model, baseUrl }` in POST body
- **Thread-local overrides**: `set_extraction_overrides()` / `clear_extraction_overrides()` in `config.py` apply per-thread model/baseUrl
- **Server-side validation**: Model must be in `ALLOWED_MODELS` set; base URL must be HTTPS and present in configured URLs (default + additional)
- **Additional base URLs**: Stored as JSON array of `{label, url}` in `additional_base_urls` config key; managed in Settings → API Keys tab
- **Model selector component**: `client/src/components/model-selector.tsx` — reusable dropdown shown on site-detail and site-explorer pages
- **Prompt placeholders**: `{tags_list}`, `{tag_names_json}` for vision prompt
- **Extraction mode**: Vision only (no vector/chunking/embedding)
- **UI**: Tabbed settings page with 4 tabs: API Keys, Models (extraction model dropdown), Prompts (vision prompt), Advanced (parallelism)

## Extraction Pipeline (Vision Mode)
1. **Conversion**: PDF files are converted to page images at 200 DPI using Poppler (all pages processed, no limit)
2. **Text files**: Non-PDF files (DOCX, EML, MSG, TXT) are parsed as text and included alongside images
3. **Email attachments**: EML and MSG files have their attachments extracted and processed recursively — PDF attachments become page images, DOCX/TXT attachments become text content. Nested emails (EML inside MSG) are also handled.
4. **Extraction**: All page images + text content are sent to the LLM with all tags in a single request
5. **Batching**: Tags batched (max 15 per call); ALL images included in every call for consistency
6. **No truncation**: All text content from non-PDF files is sent in full — no character limits
7. **Benefits**: Better for scanned documents, preserves table/form layouts
8. **Quality Logging**: After extraction, logs found/not-found summary and lists which tags were not found
9. **Cost Tracking**: Every LLM call logs token usage and cost (USD + INR) to `cost_logs` table

## Upload Performance (Optimized for 250+ sites / 10K+ files)
- **In-memory caching**: Sites, leases, and existing-file sets cached per upload batch — no repeated DB lookups
- **Bulk INSERT**: Files inserted via `execute_values` in a single query per batch (not one INSERT per file)
- **Frontend batching**: 500 files per HTTP request (was 200), reducing round trips
- **DB indexes**: `idx_leases_site_lease`, `idx_files_dedup`, `idx_files_lease_id`, `idx_extractions_lease_id`, `idx_cost_logs_site_id/lease_id`
- **Optimized site listing**: `get_sites()` uses JOINs instead of correlated subqueries for O(1) vs O(N) query plans
- **Deduplication**: Files checked by (lease_id + file_name + file_size); duplicates skipped without saving to disk or DB
- **Skipped duplicates**: Count reported in API response and UI toast

## Cost Tracking
- **`cost_logs` table**: Records every API call with type (extraction), model, token counts, and cost in both USD and INR
- **Pricing**: azure.gpt-4.1 ($2.00/1M input, $8.00/1M output), claude-sonnet-4 ($3.00/1M input, $15.00/1M output)
- **Extraction model selection**: Set `EXTRACTION_MODEL` env var (e.g. `claude-sonnet-4-5` or `azure.gpt-4.1`). For Claude models, also set `ANTHROPIC_API_KEY`
- **USD to INR conversion**: Configurable via Settings page (default 83.5), stored in `app_settings` table
- **Live rate**: Fetches live USD/INR rate from open.er-api.com
- **Recalculation**: "Recalculate All Costs" button updates all historical cost_logs with current rate
- **Dashboard**: Shows total cost with extraction breakdown
- **Site-level**: Each site card shows total INR spent
- **Lease-level**: Each lease shows its individual cost
- **API endpoints**: `/api/costs/summary`, `/api/costs/by-site`, `/api/costs/by-lease/{siteId}`
- **Implementation**: `server_py/cost_tracker.py` handles cost calculation and logging
- **Cleanup**: Deleting sites or extractions also removes associated cost_logs

## Progress Tracking
- **Server-Sent Events (SSE)**: Real-time progress updates via `/api/progress/{taskId}`
- **Extraction**: Per-tag extraction progress with current/total counts streamed live
- **Backend logging**: ASCII progress bars printed to server console for monitoring
- **In-memory progress store**: `server_py/progress.py` manages task progress with auto-cleanup after 30s

## Project Structure
```
├── client/src/
│   ├── App.tsx          # Main app with sidebar navigation
│   ├── components/
│   │   └── app-sidebar.tsx  # Navigation sidebar (PwC branded)
│   ├── hooks/
│   │   └── use-progress.ts  # SSE progress tracking hook
│   └── pages/
│       ├── dashboard.tsx      # Overview stats + AI cost tracker dashboard
│       ├── site-explorer.tsx  # Browse sites, upload folders, delete all + progress + cost
│       ├── site-detail.tsx    # Site detail with leases & extraction + progress + cost per lease
│       ├── tag-management.tsx # Admin panel for tags (CRUD + Excel import + delete all)
│       ├── settings.tsx       # Settings page (model, prompt, advanced settings)
│       └── extractions.tsx    # Site-grouped extraction results with drill-down + cost per site/lease
├── server_py/
│   ├── main.py          # FastAPI app with all API routes + SSE + static file serving
│   ├── config.py        # Centralized config module (DB settings + env var fallbacks)
│   ├── db.py            # PostgreSQL connection pool (psycopg2)
│   ├── storage.py       # Database CRUD operations
│   ├── progress.py      # In-memory progress tracking with SSE support
│   ├── cost_tracker.py  # AI cost tracking (token usage, USD/INR conversion, DB logging)
│   ├── document_parser.py # Parse PDF, DOCX, EML, MSG, TXT + OCR
│   ├── extractor.py     # Entry point for extraction (routes to vision_extractor)
│   ├── vision_extractor.py # Vision extraction (sends page images to LLM)
│   └── seed.py          # Seeds 30 default lease tags
├── server/              # Legacy TypeScript backend (kept for reference)
├── shared/
│   └── schema.ts        # Drizzle schema (still used for db:push migrations)
├── start_dev.py         # Dev startup script (runs both Vite + FastAPI)
└── vite.config.ts       # Vite config with /api proxy to FastAPI (port 5001)
```

## Key API Endpoints
- `GET /api/dashboard/stats` - Dashboard statistics
- `GET/POST/DELETE /api/sites` - List sites / upload folder / delete all
- `GET /api/sites/{id}` - Site detail with leases and files
- `DELETE /api/sites/{id}` - Delete single site
- `POST /api/upload-folder` - Upload folder with multipart form (returns taskId for progress tracking)
- `GET/POST/PATCH/DELETE /api/tags` - Tag CRUD (DELETE without id deletes all)
- `POST /api/tags/upload` - Import tags from Excel
- `GET /api/extractions` - List all extractions
- `POST /api/extractions/start/{leaseId}` - Start extraction (returns taskId)
- `POST /api/extractions/start-site/{siteId}` - Start site-wide extraction
- `POST /api/extractions/start-sites` - Start batch extraction across multiple sites
- `GET /api/costs/summary` - Total cost summary (extraction breakdown)
- `GET /api/costs/by-site` - Cost breakdown per site
- `GET /api/costs/by-lease/{siteId}` - Cost breakdown per lease within a site
- `GET/PUT /api/settings` - Get/update app settings (USD/INR rate)
- `POST /api/settings/recalculate-costs` - Recalculate all historical costs with current rate
- `GET /api/progress/{taskId}` - SSE endpoint for real-time progress updates

## Database Tables
- `sites` - Site ID records
- `leases` - Lease records linked to sites (cascade delete)
- `files` - File records linked to leases (cascade delete)
- `tags` - Extraction tag definitions
- `extractions` - Extraction results linked to leases (cascade delete)
- `cost_logs` - AI cost tracking per operation (type, model, tokens, USD/INR cost, linked to site/lease)
- `app_settings` - Key-value settings store (USD/INR rate, etc.)

## OCR Pipeline (Scanned PDFs)
- **Poppler** (`pdftoppm`): Converts PDF pages to PNG images at 300 DPI
- **Tesseract**: Runs OCR on each page image to extract text
- Auto-detects native Tesseract CLI; falls back to `pytesseract` if not available
- Cross-platform: works on both Linux (Replit) and Windows (local)

## Running
- `python start_dev.py` starts both Vite dev server (port 5000) and FastAPI API server (port 5001)
- Vite proxies all `/api/*` requests to the FastAPI backend
- `npm run db:push` syncs database schema (still uses Drizzle for migrations)

## Python Dependencies
- fastapi, uvicorn - Web framework and ASGI server
- psycopg2-binary - PostgreSQL driver
- openai - OpenAI API client
- anthropic - Anthropic Claude API client
- pdfplumber - PDF text extraction
- python-docx - DOCX parsing
- openpyxl - Excel file reading/writing
- pytesseract, pdf2image - OCR pipeline
- python-multipart - File upload handling
- aiofiles - Async file operations
