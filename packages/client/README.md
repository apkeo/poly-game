## Client (Poly Game frontend)

Vue 3 frontend for Poly Game.  
Responsible for:

- uploading character images,
- displaying processing progress in real time,
- rendering the final 3D model with animations in a Three.js viewer.

### Tech stack

- Vue 3
- Vite
- TypeScript
- Pinia (state management)
- Vue Router
- Socket.io client
- Three.js (3D viewer)

## Environment variables

Base file: `packages/client/.env.example`

Create your local env file:

```bash
cp .env.example .env
```

Key variables:

- `VITE_API_BASE_URL` – origin of the backend API, e.g. `http://localhost:3000`
  - used for REST calls and loading assets (models, textures) from the server.

> In development you can use Vite dev server with proxy to the backend or point directly to the backend origin.

## Scripts

From `packages/client`:

```bash
yarn dev       # start Vite dev server (default: http://localhost:5173)
yarn build     # typecheck (vue-tsc) + production build
yarn preview   # preview the production build
```

When using the workspace root scripts:

- `yarn dev:client` – run this client in dev mode

## UI flow

### Pages

- **TestPage** (upload view)
  - User selects and uploads a character image.
  - The page calls `POST /api/upload/image` on the backend.
  - After receiving `{ id }`, it navigates to `/character/:id`.

- **CharacterPage** (viewer)
  - Fetches character details by `id` from the API.
  - Opens a Socket.io connection and listens for progress events:
    - channel: `character:progress` for that character.
  - Shows:
    - current pipeline step and percentage (if provided),
    - loading / processing states,
    - final 3D model once `modelUrl` is available.

### Realtime updates

- The client subscribes to Socket.io events to react to job progress.
- When receiving the final event with `modelUrl`, it:
  - loads the model and textures from the backend,
  - uses Three.js + OrbitControls to display the character in a 3D scene,
  - lists and activates available rig animations (if Meshy included them).

## Three.js viewer (high level)

- Creates a Three.js scene, camera, and renderer attached to the page container.
- Loads the generated 3D asset (e.g. via GLTF loader).
- Enables:
  - orbiting around the model (OrbitControls),
  - basic lighting,
  - optional ground plane / background,
  - animation mixer with dropdown / buttons to switch between rig animations.

## Development notes

- The client assumes the backend serves:
  - REST API for character data and uploads,
  - static assets for generated models and textures,
  - Socket.io endpoint for real‑time updates.
- Make sure the backend is running and reachable at `VITE_API_BASE_URL` when working on the viewer.

