## Poly Game

**Poly Game** is a monorepo that contains:

- **Backend**: Express server written in TypeScript
- **Frontend**: Vue 3 (Vite, Pinia, Vue Router)

User uploads a character image → **OpenAI** generates a textual description and a low‑poly style image → **Meshy** generates a 3D model + texture → the result is previewed in **Three.js**.

### Tech stack

- Node 20+ (managed via `mise` if you use it)
- Yarn (monorepo workspaces)
- Docker & Docker Compose (for MongoDB and Redis)
- MongoDB, Redis, BullMQ, Socket.io, OpenAI, Meshy, Three.js

## Project structure

- `packages/server` – Express API, job queue, OpenAI + Meshy integration  
  See `packages/server/README.md` for server-specific setup and architecture.
- `packages/client` – Vue 3 frontend, character upload and viewer  
  See `packages/client/README.md` for client-specific setup and UI flow.

## Environment variables

### Server (`packages/server/.env`)

Create your server env file from the example:

```bash
cp packages/server/.env.example packages/server/.env
```

Then fill in the sensitive values:

- `PORT` – API port (default `3000`)
- `MONGODB_URI` – MongoDB connection string (e.g. `mongodb://localhost:27017/poly-game`)
- `REDIS_HOST` – Redis host (e.g. `localhost`)
- `REDIS_PORT` – Redis port (e.g. `6379`)
- `OPENAI_API_KEY` – OpenAI API key (GPT‑4o + DALL‑E 3)
- `GEMINI_API_KEY` – Gemini API key (if used in the pipeline)
- `MESHY_API_KEY` – API key from [Meshy API](https://www.meshy.ai/settings/api)

> Do **not** commit your real `.env` files to git – only `.env.example`.

### Client (`packages/client/.env`)

Create the client env file from the example:

```bash
cp packages/client/.env.example packages/client/.env
```

Available variables:

- `VITE_API_BASE_URL` – base URL of the backend API, e.g. `http://localhost:3000`

## Running the project

### 1. Start MongoDB and Redis

If you use the provided Docker setup:

```bash
docker-compose up -d
```

Or, if you prefer, use the npm scripts:

```bash
yarn docker:up     # start MongoDB and Redis
yarn docker:down   # stop containers
```

### 2. Install dependencies

From the repository root:

```bash
yarn
```

### 3. Development servers

Run both client and server in parallel:

```bash
yarn dev
```

Or start them separately:

```bash
yarn dev:server   # backend on http://localhost:3000
yarn dev:client   # frontend on http://localhost:5173
```

Default URLs:

- **Frontend**: `http://localhost:5173`
- **API**: `http://localhost:3000`

## How it works – flow

1. **TestPage (upload)**  
   The user uploads an image. The frontend sends `POST /api/upload/image`.  
   The server:
   - creates a document in the `characters` collection,
   - saves the uploaded image into `packages/server/uploads`,
   - enqueues a BullMQ job for the full AI pipeline.  
   The response contains `{ id }`, and the client redirects to `/character/:id`.

2. **CharacterPage (viewer)**  
   The page fetches character details by `id` and listens to Socket.io events:
   - channel: `character:progress`  
   When the job finishes, the backend emits the final payload with `modelUrl`.  
   The frontend then shows the 3D model in Three.js with OrbitControls and available rig animations (if Meshy returns them).

3. **BullMQ job (AI pipeline)** – a single job covers the entire flow:
   - **OpenAI Vision** – generates a description of the uploaded image,
   - **OpenAI Image (DALL‑E 3)** – generates a low‑poly style image from the description + fixed style prompt,
   - saves the generated image into `uploads`,
   - **Meshy Image‑to‑3D** – creates a 3D model + texture (`should_texture: true`),
   - polls Meshy job status, and on success:
     - saves `modelUrl` into the character document,
     - emits the final update via Socket.io so the frontend can refresh.

## Scripts

| Script              | Description                        |
|---------------------|------------------------------------|
| `yarn dev`          | Run client + server in parallel    |
| `yarn dev:server`   | Run server only (port 3000)        |
| `yarn dev:client`   | Run client only (port 5173)        |
| `yarn build`        | Build all packages                 |
| `yarn docker:up`    | Start MongoDB and Redis via Docker |
| `yarn docker:down`  | Stop Docker containers             |
