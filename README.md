# Poly Game

Monorepo: serwer Express (TypeScript) + frontend Vue 3 (Vite, Pinia, Vue Router).  
Upload zdjęcia postaci → OpenAI (opis + wygenerowany obraz w stylu low-poly) → Meshy (model 3D + tekstura) → podgląd w Three.js.

## Wymagania

- Node 20+
- pnpm
- Docker i Docker Compose (dla Mongo i Redis)

## Uruchomienie

### 1. Baza i kolejka

```bash
docker-compose up -d
```

### 2. Zmienne środowiskowe (serwer)

Skopiuj `packages/server/.env.example` do `packages/server/.env` i uzupełnij:

- `OPENAI_API_KEY` – klucz OpenAI (GPT-4o + DALL-E 3)
- `MESHY_API_KEY` – klucz z [Meshy API](https://www.meshy.ai/settings/api)

### 3. Zależności i dev

W katalogu głównym:

```bash
pnpm install
pnpm dev
```

- Frontend: http://localhost:5173  
- API: http://localhost:3000  

Albo osobno:

```bash
pnpm dev:server   # tylko serwer
pnpm dev:client   # tylko frontend
```

## Przepływ

1. **TestPage** – użytkownik wgrywa obrazek, POST `/api/upload/image` → tworzony jest rekord w kolekcji `characters`, obraz zapisywany w `packages/server/uploads`, dodawany jest job BullMQ. Odpowiedź: `{ id }`. Przekierowanie na `/character/:id`.
2. **CharacterPage** – podgląd postaci po `id`. Socket.io nasłuchuje na `character:progress` (postęp joba). Po zakończeniu wyświetlany jest model 3D w Three.js z OrbitControls i listą animacji z riga (jeśli Meshy je zwróci).
3. **Job (BullMQ)** – jeden job na cały pipeline:
   - OpenAI Vision: opis wrzuconego zdjęcia
   - OpenAI Image (DALL-E 3): obraz w stylu low-poly na podstawie opisu + stałego promptu stylu
   - Zapis wygenerowanego obrazu w `uploads`
   - Meshy Image-to-3D: model + tekstura (jedno wywołanie z `should_texture: true`)
   - Polling statusu zadania Meshy, po sukcesie zapis `modelUrl` w dokumencie i emisja przez Socket.io

## Skrypty

| Skrypt        | Opis                          |
|---------------|-------------------------------|
| `pnpm dev`    | Równolegle client + server    |
| `pnpm dev:server` | Tylko serwer (port 3000)  |
| `pnpm dev:client` | Tylko frontend (port 5173) |
| `pnpm build`  | Build wszystkich pakietów     |
| `pnpm docker:up`   | Uruchom Mongo i Redis     |
| `pnpm docker:down` | Zatrzymaj kontenery       |
