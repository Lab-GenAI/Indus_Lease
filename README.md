# PwC Lease Extractor

A lease document management application that allows users to upload folders containing Site IDs, Lease Numbers, and document files (.pdf, .docx, .msg, .eml, .txt). The app uses AI-powered vision extraction to automatically pull structured data (tags) from lease documents using OpenAI GPT-4.1 Vision or Anthropic Claude.

**Supported file formats:** `.pdf`, `.docx`, `.msg`, `.eml`, `.txt`

**Target platform:** Windows 10/11

---

## Features

- **Folder Upload**: Upload organized folders following a Site ID > Lease Number > Files hierarchy
- **AI Tag Extraction**: Extract ~30 configurable lease data points (rent, dates, parties, addresses, etc.) using vision-based AI
- **Vision-Based Processing**: PDFs are converted to page images and sent directly to the LLM, preserving table layouts, stamps, and handwritten notes
- **OCR Support**: Scanned PDFs are handled via Poppler + Tesseract for text extraction
- **Multi-Model Support**: Switch between OpenAI (GPT-4.1, GPT-4.1 Mini, GPT-4.1 Nano) and Anthropic (Claude Sonnet 4.5, Claude Opus 4, Claude Sonnet 4)
- **Per-Extraction Model Override**: Choose model and base URL at extraction time without changing global settings
- **Additional Base URLs**: Configure multiple OpenAI-compatible API endpoints (e.g., Azure OpenAI)
- **Real-Time Progress**: Server-Sent Events (SSE) stream extraction progress live to the UI
- **Cost Tracking**: Every API call is logged with token counts and cost in both USD and INR
- **Tag Management**: Admin panel to add, edit, delete, and bulk-import tags from Excel
- **Configurable Prompts**: Customize the vision extraction prompt from the Settings page
- **Dashboard**: Overview of sites, leases, files, and total AI costs with animated 3D cards
- **Collapsible Sidebar**: PwC-branded sidebar with collapse/expand functionality
- **Auto-Refresh**: Site Explorer auto-polls every 10 seconds to reflect extraction status changes
- **Settings-Driven Configuration**: All API keys, models, prompts, and extraction options are managed from the Settings tab in the UI — no need to edit code or config files

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, Framer Motion, TanStack Query |
| **Backend** | Python, FastAPI, Uvicorn |
| **Database** | PostgreSQL |
| **AI / LLM** | OpenAI GPT-4.1 Vision or Anthropic Claude (vision extraction) |
| **File Parsing** | pdfplumber (PDF), python-docx (DOCX), email stdlib (EML/MSG) |
| **OCR** | Poppler (pdftoppm) + Tesseract |
| **Real-time Updates** | Server-Sent Events (SSE) for progress tracking |
| **Cost Tracking** | Per-operation token usage and cost logging in USD and INR |

---

## How the Extraction Pipeline Works

The application uses a **vision-based extraction pipeline** to pull structured tag values from lease documents. No vectorization or embedding is needed — documents are sent directly as images to the LLM.

### Pipeline Diagram

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌──────────────┐
│  1. Upload   │────>│  2. Prepare      │────>│  3. Send to LLM  │────>│  4. Store    │
│  Folder      │     │  Documents       │     │  (Vision API)    │     │  Results     │
└──────────────┘     └──────────────────┘     └──────────────────┘     └──────────────┘
```

### Step 1: Document Upload

The user uploads a folder structured as Site ID > Lease Number > Files. Each file is stored in the database and on disk. No pre-processing (chunking, embedding, or vectorization) is done at upload time.

### Step 2: Document Preparation

When extraction is triggered for a lease, all files for that lease are prepared:

- **PDF files**: Converted to page images (PNG) at 200 DPI using Poppler's `pdftoppm`. The number of pages is configurable (default: 20 max per PDF). If conversion fails, falls back to text extraction via `pdfplumber`.
- **DOCX files**: Parsed to plain text using `python-docx`.
- **MSG/EML files**: Parsed using Python's `email` module. Extracts body text; if the plain text body is too short, falls back to stripping HTML.
- **TXT files**: Read directly as plain text.

### Step 3: Vision Extraction

For each batch of tags (max 15 per batch), a single LLM call is made containing:

- **All page images** from all PDF files (base64-encoded PNGs)
- **All text content** from non-PDF files (DOCX, emails, TXT)
- **The extraction prompt** listing all tags to extract with their descriptions

**Key design decision**: Every LLM call receives the **complete document** — all pages, all text. There is no image batching. This ensures consistent results and prevents missed extractions that can occur when the LLM only sees a subset of pages.

The LLM responds with a JSON object mapping each tag name to its extracted value, or `"Not Found"` if the data point doesn't exist.

**Multi-model support**:
- **OpenAI (GPT-4.1)**: Uses Chat Completions API with `image_url` content parts (base64 data URIs, `detail: high`)
- **Anthropic (Claude)**: Uses Messages API with native `image` content parts (base64 source blocks)

Each call has automatic retry logic — up to 3 attempts with exponential backoff on API errors.

### Step 4: Result Storage and Cost Tracking

- Extracted values are saved to the `extractions` table using upsert logic (re-running extraction updates existing values rather than creating duplicates)
- Every LLM call logs: model used, input/output token counts, cost in USD and INR
- Deleting extractions also cleans up associated cost logs

### Real-Time Progress

Throughout extraction, the backend emits Server-Sent Events (SSE):
1. **Converting**: Which file is being processed, conversion progress
2. **Extracting**: Which tag batch is running, how many tags found so far
3. **Completed**: Summary showing X out of Y tags found

---

## Project Structure

```
pwc-lease-extractor/
├── client/src/                  # React frontend
│   ├── App.tsx                  # Main app with sidebar navigation + page transitions
│   ├── components/
│   │   ├── app-sidebar.tsx      # PwC-branded collapsible navigation sidebar
│   │   ├── model-selector.tsx   # Reusable model/base-URL selector for extractions
│   │   └── motion-primitives.tsx# Shared animation components (PageWrapper, PageHeader, etc.)
│   ├── hooks/
│   │   └── use-progress.ts     # SSE progress tracking hook
│   └── pages/
│       ├── dashboard.tsx        # Overview stats + cost tracker (animated 3D cards)
│       ├── site-explorer.tsx    # Browse sites, upload folders
│       ├── site-detail.tsx      # Lease details + trigger extraction
│       ├── tag-management.tsx   # Tag CRUD + Excel import
│       ├── settings.tsx         # API keys, model, prompt, and advanced settings
│       └── extractions.tsx      # View extraction results by site
│
├── server_py/                   # Python FastAPI backend
│   ├── main.py                  # API routes, SSE, static file serving
│   ├── config.py                # Config from DB (Settings tab) + env var fallbacks
│   ├── db.py                    # PostgreSQL connection pool (psycopg2)
│   ├── storage.py               # Database CRUD operations (raw SQL)
│   ├── progress.py              # In-memory SSE progress tracking
│   ├── cost_tracker.py          # Token usage and cost logging
│   ├── document_parser.py       # Parse PDF, DOCX, EML, MSG, TXT + OCR
│   ├── extractor.py             # Extraction entry point
│   ├── vision_extractor.py      # Vision extraction pipeline
│   └── seed.py                  # Seeds 30 default lease tags
│
├── shared/
│   └── schema.ts                # Drizzle ORM schema (for DB migrations)
├── start_dev.py                 # Dev startup (Vite + FastAPI concurrently)
├── vite.config.ts               # Vite config with /api proxy
├── python_requirements.txt      # Python dependencies with versions
└── package.json                 # Node.js dependencies
```

---

## Prerequisites (Windows)

1. **Node.js** v18+ — [Download](https://nodejs.org/)
2. **Python** v3.10+ — [Download](https://www.python.org/downloads/)
3. **PostgreSQL** v14+ — [Download](https://www.postgresql.org/download/windows/)
4. **Poppler** — Required for converting PDFs to images
5. **Tesseract OCR** — Optional, for scanned PDF text extraction

> **API keys are NOT required during setup.** You will enter them in the Settings tab after the app is running.

---

## Setup Instructions (Windows)

### 1. Install Prerequisites

**PostgreSQL:**
1. Download from https://www.postgresql.org/download/windows/
2. Run the installer, note the password you set for the `postgres` user
3. Keep the default port (5432)

**Poppler (required for PDF extraction):**
1. Download the latest release from https://github.com/oschwartz10612/poppler-windows/releases
2. Extract to `C:\poppler`
3. Add `C:\poppler\Library\bin` to your system PATH, or set the `POPPLER_PATH` environment variable

**Tesseract (optional, for scanned PDFs):**
1. Download from https://github.com/UB-Mannheim/tesseract/wiki
2. Install to default location (`C:\Program Files\Tesseract-OCR`)
3. Add installation folder to system PATH, or set the `TESSERACT_PATH` environment variable

### 2. Clone the Repository

```bash
git clone <repository-url>
cd pwc-lease-extractor
```

> **Important**: Do NOT run the project from a OneDrive-synced folder. Copy it to a local folder like `C:\Projects\pwc-lease-extractor`.

### 3. Clean Up package.json (One-Time)

Before installing, open `package.json` and remove these Replit-specific packages that are not needed on Windows:

From `"dependencies"`, remove:
```
"@replit/connectors-sdk": "^0.2.0",
```

From `"devDependencies"`, remove:
```
"@replit/vite-plugin-cartographer": "^0.4.4",
"@replit/vite-plugin-dev-banner": "^0.1.1",
"@replit/vite-plugin-runtime-error-modal": "^0.0.3",
```

Also in `vite.config.ts`, remove or comment out any `import` lines referencing `@replit/` plugins, and remove those plugins from the `plugins: [...]` array.

### 4. Install Dependencies

```bash
npm install
pip install -r python_requirements.txt
```

### 5. Create the Database

Open pgAdmin or run in command prompt:

```bash
createdb -U postgres lease_extractor
```

### 6. Set Environment Variables

Create a `.env` file in the project root with only the database connection:

```env
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/lease_extractor

SESSION_SECRET=your_random_secret_here

# Windows paths (if not added to system PATH)
POPPLER_PATH=C:\poppler\Library\bin
TESSERACT_PATH=C:\Program Files\Tesseract-OCR
```

> **Note**: API keys (OpenAI, Anthropic), extraction model, base URLs, and all other settings are configured from the **Settings** tab in the application UI. You do NOT need to put them in the `.env` file.

### 7. Initialize the Database

```bash
npm run db:push
```

This creates the required tables: sites, leases, files, tags, extractions. Additional tables (cost_logs, app_settings) are auto-created on server startup.

### 8. Start the Application

```bash
python start_dev.py
```

This starts:
- **Vite dev server** on port 5000 (frontend)
- **FastAPI server** on port 5001 (backend API)

Open your browser and go to **http://localhost:5000**

### 9. Configure Settings (First Run)

1. Go to **Settings** from the sidebar
2. In the **API Keys** tab, enter your OpenAI and/or Anthropic API key
3. In the **Models** tab, select your preferred extraction model
4. Click **Save All Changes**

All settings are stored in the database and persist across restarts.

---

## Configuration via Settings Tab

All credentials and settings are managed from the **Settings** page in the application UI. You do not need to edit any source files or environment variables (except `DATABASE_URL` for the database connection).

| Setting | Tab | Description |
|---------|-----|-------------|
| OpenAI API Key | API Keys | Required if using GPT models |
| Anthropic API Key | API Keys | Required if using Claude models |
| OpenAI Base URL | API Keys | Custom OpenAI-compatible endpoint (default: api.openai.com) |
| Additional Base URLs | API Keys | Extra endpoints (e.g., Azure OpenAI) |
| Extraction Model | Models | Default model for extractions |
| USD to INR Rate | Models | Exchange rate for cost display |
| Vision Prompt | Prompts | Customizable extraction prompt template |
| Max PDF Pages | Advanced | Maximum pages per PDF to process |
| Parallel Threads | Advanced | Concurrent extraction threads |

---

## Usage Guide

### Uploading Documents

1. Go to **Site Explorer** from the sidebar
2. Click **Upload Folder** and select a folder with this structure:
   ```
   RootFolder/
   ├── SiteID_1/
   │   ├── LeaseNumber_1/
   │   │   ├── lease_agreement.pdf
   │   │   ├── amendment.docx
   │   │   └── correspondence.msg
   │   └── LeaseNumber_2/
   │       └── contract.pdf
   └── SiteID_2/
       └── LeaseNumber_3/
           └── document.eml
   ```
3. Files are stored and ready for extraction

### Managing Tags

1. Go to **Tag Management** from the sidebar
2. The app comes pre-seeded with 30 common lease tags
3. Add tags manually with a name, description, and category
4. Or bulk-import from Excel using the **Import Excel** button
5. Download the Excel template to see the expected format

### Running Extraction

1. Go to a **Site Detail** page (click any site in Site Explorer)
2. Click **Extract** on a single lease, or **Extract All** for the entire site
3. For multiple sites, select them with checkboxes and click **Extract Selected Sites**
4. Watch real-time progress as the system processes files and extracts tags
5. View results on the **Extractions** page

### Configuring Settings

1. Go to **Settings** from the sidebar
2. **API Keys**: Set your OpenAI and/or Anthropic API keys
3. **Models**: Choose the extraction model and configure the USD/INR exchange rate
4. **Prompts**: Customize the vision extraction prompt template
5. **Advanced**: Set max PDF pages per file, parallel threads, and max context characters

### Tracking Costs

- **Dashboard** shows total extraction cost in INR with token breakdown
- **Site Explorer** shows cost per site
- **Site Detail** shows cost per lease
- **Settings** lets you update the USD/INR rate and recalculate historical costs

---

## API Endpoints

### Sites
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sites` | List all sites with counts |
| POST | `/api/upload-folder` | Upload folder (multipart form, returns taskId) |
| GET | `/api/sites/{id}` | Site detail with leases and files |
| DELETE | `/api/sites/{id}` | Delete a single site |
| DELETE | `/api/sites` | Delete all sites |

### Tags
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tags` | List all tags |
| POST | `/api/tags` | Create a new tag |
| PATCH | `/api/tags/{id}` | Update a tag |
| DELETE | `/api/tags/{id}` | Delete a tag |
| DELETE | `/api/tags` | Delete all tags |
| POST | `/api/tags/upload` | Import tags from Excel file |

### Extractions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/extractions` | List all extractions |
| POST | `/api/extractions/start/{leaseId}` | Start extraction for a lease |
| POST | `/api/extractions/start-site/{siteId}` | Extract all leases in a site |
| POST | `/api/extractions/start-sites` | Batch extraction across multiple sites |

### Costs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/costs/summary` | Total extraction cost summary |
| GET | `/api/costs/by-site` | Cost breakdown per site |
| GET | `/api/costs/by-lease/{siteId}` | Cost breakdown per lease |

### Configuration
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config` | Get current configuration |
| PUT | `/api/config` | Update configuration |
| POST | `/api/config/reset-prompts` | Reset prompt to default |
| GET | `/api/settings` | Get app settings |
| PUT | `/api/settings` | Update settings |
| POST | `/api/settings/recalculate-costs` | Recalculate all costs with current rate |

### Other
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/stats` | Dashboard statistics |
| GET | `/api/progress/{taskId}` | SSE endpoint for real-time progress |

---

## Database Tables

| Table | Description |
|-------|-------------|
| `sites` | Site ID records |
| `leases` | Lease records linked to sites (cascade delete) |
| `files` | File records linked to leases (cascade delete) |
| `tags` | Extraction tag definitions (name, description, category) |
| `extractions` | Extraction results linked to leases (cascade delete) |
| `cost_logs` | API cost tracking per operation (model, tokens, USD/INR, linked to site/lease) |
| `app_settings` | Key-value settings store (API keys, model, prompts, etc.) |

---

## Environment Variables

Only `DATABASE_URL` is required in the `.env` file. All other settings are managed from the Settings tab.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Session encryption secret |
| `POPPLER_PATH` | No | Path to Poppler bin directory (if not in system PATH) |
| `TESSERACT_PATH` | No | Path to Tesseract directory (if not in system PATH) |

The following are optional `.env` fallbacks. If set, they act as defaults when the Settings tab values are empty:

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | Fallback OpenAI API key |
| `ANTHROPIC_API_KEY` | Fallback Anthropic API key |
| `OPENAI_BASE_URL` | Fallback OpenAI base URL |
| `EXTRACTION_MODEL` | Fallback default model |

> **Recommended**: Enter API keys and model settings in the Settings tab instead of the `.env` file. The Settings tab values always take priority.

---

## Troubleshooting

### "relation 'tags' does not exist"
Run `npm run db:push` to create the database tables before starting the app.

### "relation 'cost_logs' does not exist"
This table is auto-created on server startup. Restart the server.

### "ENOTSUP: operation not supported on socket" (Windows)
Do NOT run the project from a OneDrive-synced folder. Copy it to a local folder like `C:\Projects`.

### Extraction results show "Not Found" for everything
- Verify your API key is valid and has credits (check Settings > API Keys)
- Ensure your documents contain readable text
- For scanned PDFs, make sure Poppler is installed (check `pdftoppm` is accessible)
- Check the server console for error messages

### PDF conversion fails
- Ensure Poppler is installed and `pdftoppm` is in your PATH or `POPPLER_PATH` is set
- On Windows, verify the path points to the `bin` directory containing `pdftoppm.exe`

### Settings not saving
- Ensure the database is running and `DATABASE_URL` is correct
- Check that `npm run db:push` was run successfully
- The `app_settings` table is auto-created on first server start

---

## Scripts

| Command | Description |
|---------|-------------|
| `python start_dev.py` | Start both Vite and FastAPI dev servers |
| `npm run dev` | Start Vite dev server only |
| `npm run db:push` | Sync database schema via Drizzle |
| `npm run build` | Build frontend for production |

---

## Production Build

To build and run in production mode:

```bash
npm run build
set NODE_ENV=production
uvicorn server_py.main:app --host 0.0.0.0 --port 5000
```

FastAPI will serve the built frontend from `dist/public`.

---

## Cost Tracking Details

Every AI API call logs token usage and cost:

| Model | Input Cost | Output Cost |
|-------|-----------|-------------|
| GPT-4.1 | $2.00 / 1M tokens | $8.00 / 1M tokens |
| GPT-4.1 Mini | $0.40 / 1M tokens | $1.60 / 1M tokens |
| GPT-4.1 Nano | $0.10 / 1M tokens | $0.40 / 1M tokens |
| Claude Sonnet 4.5 | $3.00 / 1M tokens | $15.00 / 1M tokens |
| Claude Opus 4 | $15.00 / 1M tokens | $75.00 / 1M tokens |
| Claude Sonnet 4 | $3.00 / 1M tokens | $15.00 / 1M tokens |

- USD-to-INR rate is configurable from Settings (default: 83.5) and can fetch live rates
- The "Recalculate All Costs" button in Settings updates all historical records with the current rate
- Deleting extractions or sites automatically removes associated cost logs
