## Server (Poly Game backend)

Express + TypeScript backend for Poly Game.  
Responsible for:

- REST API for uploads and character data,
- AI pipeline orchestration (OpenAI + Meshy) via BullMQ,
- persistence in MongoDB,
- progress updates and final 3D model broadcast via Socket.io.

### Tech stack

- Node 20+
- Express (API)
- BullMQ (job queue, Redis)
- MongoDB + Mongoose
- Socket.io
- OpenAI (Vision + DALL‑E 3)
- Meshy Image‑to‑3D
- Pino (logging)

## Environment variables

Base file: `packages/server/.env.example`

Copy it to create your local config:

```bash
cp .env.example .env
```

Variables:

- `PORT` – server HTTP port (default: `3000`)
- `MONGODB_URI` – MongoDB connection string, e.g. `mongodb://localhost:27017/poly-game`
- `REDIS_HOST` – Redis host, e.g. `localhost`
- `REDIS_PORT` – Redis port, e.g. `6379`
- `OPENAI_API_KEY` – OpenAI API key (used for Vision + DALL‑E 3)
- `GEMINI_API_KEY` – Gemini API key (if used by the AI pipeline)
- `MESHY_API_KEY` – Meshy API key from the [Meshy dashboard](https://www.meshy.ai/settings/api)

> Never commit a real `.env` file. Commit only `.env.example`.

## Scripts

From `packages/server`:

```bash
pnpm dev     # ts-node/tsx watcher on src/index.ts
pnpm build   # compile TypeScript -> dist
pnpm start   # run compiled server from dist/index.js
```

When using the workspace root scripts:

- `pnpm dev:server` – run this server in dev mode

## Architecture & flow

### Main responsibilities

- Accept image uploads for characters.
- Create and manage a BullMQ job that runs the full AI pipeline.
- Store character metadata, generated images, and 3D model URLs in MongoDB.
- Emit real‑time progress through Socket.io channels so the client can update the UI.

### Character creation flow

1. **Upload**  
   `POST /api/upload/image`

   - Accepts an image file (multer).
   - Stores the file in `packages/server/uploads`.
   - Creates a `characters` document in MongoDB.
   - Enqueues a BullMQ job with the character id and file path.
   - Responds with `{ id }` for the client to redirect to `/character/:id`.

2. **AI pipeline (BullMQ job)**

   The worker processes a single comprehensive job:

   - Use **OpenAI Vision** to generate a structured description of the uploaded character.
   - Use **OpenAI Image (DALL‑E 3)** with that description + fixed style prompt to generate a low‑poly style image.
   - Save the generated low‑poly image in `uploads` and update the character document.
   - Call **Meshy Image‑to‑3D** with `should_texture: true` to generate a 3D model + texture.
   - Poll Meshy for job completion and, once ready:
     - update the character document with `modelUrl` (and any additional metadata),
     - notify the client via Socket.io.

3. **Realtime updates**

   - During processing, the worker emits Socket.io events (e.g. percentage, stage name) on a channel like `character:progress`.
   - When the job completes, it emits the final payload including `modelUrl`.

### Data model (high level)

- **Collection**: `characters`
- Example fields (may evolve):
  - `_id` – character id,
  - `originalImagePath` – disk path or URL of the uploaded image,
  - `lowpolyImagePath` – disk path or URL of the low‑poly render,
  - `modelUrl` – URL to the generated 3D asset from Meshy,
  - `status` – current pipeline status (`pending`, `processing`, `ready`, `failed`),
  - `progress` – numeric progress / step indicator,
  - timestamps and optional error details.

## Development notes

- Make sure MongoDB and Redis are running (e.g. via `docker-compose up -d` from the repo root or `pnpm docker:up`).
- The worker and HTTP API typically run in the same process in dev, but can be split if needed.
- All uploads and generated assets live under `packages/server/uploads` and are served by the API.

