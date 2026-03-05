import { getLogger } from '../logger.js';

const log = getLogger('ai');

const MESHY_API_KEY = process.env.MESHY_API_KEY;
const MESHY_BASE = 'https://api.meshy.ai/openapi/v1';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image';

/** Prompt do generowania kwadratowego portretu low-poly z Nano Banana (Gemini). */
const LOW_POLY_PORTRAIT_PROMPT = `Convert the person in this photo into a rigid low-poly 3D character, isolated on a pure white background.
Primary objective: exact facial likeness. Stylization is strictly secondary.
Reconstruct the face using a low-polygon mesh that preserves the original facial topology and proportions. Do not average, idealize, beautify, cartoonify, or generalize the face. The result must look unmistakably like the same individual when compared side-by-side with the reference photo.
Facial geometry constraints (must be respected):

– exact eye spacing, eye size, eye angle, and eye asymmetry

– accurate nose width, length, bridge shape, and nostril placement

– precise mouth width, lip thickness, and corner position

– correct jaw width, chin shape, cheekbone placement

– preserve facial asymmetries, irregularities, and non-ideal features
Eyes are critical identity markers:

– fully modeled sclera, iris, and pupil

– iris color and size must match the reference

– no solid black eyes, no empty sockets, no simplified dots

– no stylized exaggeration of eye size beyond what exists in the photo
Use flat-shaded polygons only with clearly visible facets; no smoothing, no gradients, no painterly effects.
Low-poly style must follow the face — the face must not follow the style.
Hair must follow the actual hairline, volume, direction, and silhouette of the person, simplified only by polygon reduction, not by redesign.
Framing and body constraints (mandatory):

– show the entire head plus a clearly visible portion of the torso (neck, shoulders, chest, and upper abdomen)

– do not crop directly under the chin or shoulders

– the torso must be present to anchor body scale and proportion
Proportions (hard constraint):

– head is intentionally dominant and visually larger

– torso and body are clearly smaller than the head

– body must not scale up to realistic adult proportions

– chibi-style hierarchy: large head, compact torso, reduced body mass

– facial proportions remain accurate and unstylized
Lighting: neutral studio lighting, front-biased, even exposure.

– no dramatic shadows

– no rim lighting

– no contrast that hides facial planes
Background: perfectly clean, uniform white.
The final output must resemble a recognizable low-poly 3D scan interpretation of the original person with head-dominant proportions, not a portrait crop and not a realistically proportioned body.`;

/**
 * Generuje kwadratowy portret postaci w stylu low-poly przez Nano Banana (Gemini 2.5 Flash Image).
 * Zwraca base64 obrazu PNG (bez prefiksu data URI).
 */
export async function runNanoBananaPortrait(imageDataUri: string): Promise<string | null> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');

  const match = imageDataUri.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!match) {
    log.error('Nano Banana: invalid data URI');
    return null;
  }
  const [, mimeExt, base64Data] = match;
  const mimeType = mimeExt === 'png' ? 'image/png' : 'image/jpeg';

  log.info({ promptLength: LOW_POLY_PORTRAIT_PROMPT.length }, 'Nano Banana portrait: start');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`;
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: LOW_POLY_PORTRAIT_PROMPT },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: {
        aspectRatio: '1:1',
      },
    },
  };

  const res = await fetch(`${url}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    log.error({ status: res.status, body: text }, 'Nano Banana: API error');
    throw new Error(`Gemini API error: ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string }; text?: string }> };
    }>;
  };

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      log.info('Nano Banana portrait: done');
      return part.inlineData.data;
    }
  }
  log.warn({ partsCount: parts.length }, 'Nano Banana: no image in response');
  return null;
}

/** Opis obrazka (postaci) w 1–2 zdaniach, do zapisania w character.description. */
const DESCRIBE_IMAGE_PROMPT = `Describe this image in one or two short sentences. Focus on the person: appearance, pose, and style. Use Polish language. Be concise.`;

export async function describeImageWithGemini(imageDataUri: string): Promise<string | null> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');

  const match = imageDataUri.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!match) {
    log.error('describeImage: invalid data URI');
    return null;
  }
  const [, mimeExt, base64Data] = match;
  const mimeType = mimeExt === 'png' ? 'image/png' : 'image/jpeg';

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`;
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: DESCRIBE_IMAGE_PROMPT },
          { inline_data: { mime_type: mimeType, data: base64Data } },
        ],
      },
    ],
  };

  const res = await fetch(`${url}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    log.error({ status: res.status, body: text }, 'describeImage: API error');
    return null;
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (text) log.info({ len: text.length }, 'describeImage: ok');
  return text ?? null;
}

export async function runMeshyImageTo3D(
  imageDataUri: string,
  texturePrompt?: string
): Promise<string> {
  if (!MESHY_API_KEY) throw new Error('MESHY_API_KEY is not set');

  log.info(
    { imageLength: imageDataUri.length, hasTexturePrompt: !!texturePrompt },
    'Meshy image-to-3d: start'
  );
  const body: Record<string, unknown> = {
    image_url: imageDataUri,
    model_type: 'lowpoly',
    ai_model: 'meshy-6',
    remove_lighting: false,
    should_texture: true,
    enable_pbr: false,
    pose_mode: 'a-pose',
  };
  if (texturePrompt && texturePrompt.length <= 600) {
    body.texture_prompt = texturePrompt;
  }

  const res = await fetch(`${MESHY_BASE}/image-to-3d`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MESHY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    log.error({ status: res.status, body: text }, 'Meshy image-to-3d: API error');
    throw new Error(`Meshy API error: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { result: string };
  log.info({ taskId: data.result }, 'Meshy image-to-3d: task created');
  return data.result;
}

interface MeshyTaskResult {
  id: string;
  status: string;
  progress?: number;
  model_urls?: { glb?: string };
  thumbnail_url?: string;
  task_error?: { message?: string };
}

export async function pollMeshyTask(
  taskId: string,
  onProgress?: (progress: number) => void
): Promise<MeshyTaskResult> {
  if (!MESHY_API_KEY) throw new Error('MESHY_API_KEY is not set');

  log.info({ taskId }, 'Meshy poll: start');
  const maxAttempts = 120;
  const intervalMs = 5000;

  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`${MESHY_BASE}/image-to-3d/${taskId}`, {
      headers: { Authorization: `Bearer ${MESHY_API_KEY}` },
    });
    if (!res.ok) {
      log.error({ taskId, status: res.status }, 'Meshy poll: request error');
      throw new Error(`Meshy poll error: ${res.status}`);
    }
    const data = (await res.json()) as MeshyTaskResult;
    onProgress?.(data.progress ?? 0);
    if (i % 6 === 0 || data.progress)
      log.debug({ taskId, attempt: i + 1, status: data.status, progress: data.progress }, 'Meshy poll');
    if (data.status === 'SUCCEEDED') {
      log.info({ taskId, modelUrl: data.model_urls?.glb }, 'Meshy poll: succeeded');
      return data;
    }
    if (data.status === 'FAILED' || data.status === 'CANCELED') {
      log.warn({ taskId, status: data.status, error: data.task_error?.message }, 'Meshy poll: ended');
      return data;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  log.error({ taskId }, 'Meshy poll: timeout');
  throw new Error('Meshy task timeout');
}

// --- Rigging & Animation (Meshy) ---

/** Use input_task_id (image-to-3d task) so rigging uses the same textured output in one pipeline. */
export async function createRiggingTask(inputTaskId: string): Promise<string> {
  if (!MESHY_API_KEY) throw new Error('MESHY_API_KEY is not set');
  log.info({ inputTaskId }, 'Meshy rigging: create (input_task_id)');
  const res = await fetch(`${MESHY_BASE}/rigging`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MESHY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input_task_id: inputTaskId, height_meters: 1.7 }),
  });
  if (!res.ok) {
    const text = await res.text();
    log.error({ status: res.status, body: text }, 'Meshy rigging: API error');
    throw new Error(`Meshy rigging error: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { result: string };
  log.info({ taskId: data.result }, 'Meshy rigging: task created');
  return data.result;
}

export interface RiggingTaskResult {
  id: string;
  status: string;
  result?: {
    rigged_character_glb_url?: string;
    basic_animations?: {
      walking_glb_url?: string;
      running_glb_url?: string;
    };
  };
  task_error?: { message?: string };
}

export async function pollRiggingTask(
  taskId: string,
  onProgress?: (progress: number) => void
): Promise<RiggingTaskResult> {
  if (!MESHY_API_KEY) throw new Error('MESHY_API_KEY is not set');
  log.info({ taskId }, 'Meshy rigging poll: start');
  const maxAttempts = 60;
  const intervalMs = 5000;
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`${MESHY_BASE}/rigging/${taskId}`, {
      headers: { Authorization: `Bearer ${MESHY_API_KEY}` },
    });
    if (!res.ok) throw new Error(`Meshy rigging poll: ${res.status}`);
    const data = (await res.json()) as RiggingTaskResult;
    onProgress?.(data.result ? 100 : 0);
    if (data.status === 'SUCCEEDED') {
      log.info({ taskId }, 'Meshy rigging poll: succeeded');
      return data;
    }
    if (data.status === 'FAILED' || data.status === 'CANCELED') {
      log.warn({ taskId, error: data.task_error?.message }, 'Meshy rigging poll: ended');
      return data;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Meshy rigging timeout');
}

/** action_id 290 = Wave_One_Hand (Animation Library). 4 = Mage Soul Cast 4 (rzut śnieżką). */
export const MESHY_ANIMATION_ACTION_IDS = {
  walking: 'walking', // from basic_animations
  walking2: 'running', // from basic_animations (running as "Walking 2")
  wave: 290,
  throwCast: 4, // Mage Soul Cast 4 – animacja rzutu
} as const;

export async function createAnimationTask(rigTaskId: string, actionId: number): Promise<string> {
  if (!MESHY_API_KEY) throw new Error('MESHY_API_KEY is not set');
  log.info({ rigTaskId, actionId }, 'Meshy animation: create');
  const res = await fetch(`${MESHY_BASE}/animations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MESHY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ rig_task_id: rigTaskId, action_id: actionId }),
  });
  if (!res.ok) {
    const text = await res.text();
    log.error({ status: res.status, body: text }, 'Meshy animation: API error');
    throw new Error(`Meshy animation error: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { result: string };
  log.info({ taskId: data.result }, 'Meshy animation: task created');
  return data.result;
}

export interface AnimationTaskResult {
  id: string;
  status: string;
  result?: { animation_glb_url?: string };
  task_error?: { message?: string };
}

export async function pollAnimationTask(
  taskId: string,
  onProgress?: (progress: number) => void
): Promise<AnimationTaskResult> {
  if (!MESHY_API_KEY) throw new Error('MESHY_API_KEY is not set');
  log.info({ taskId }, 'Meshy animation poll: start');
  const maxAttempts = 60;
  const intervalMs = 5000;
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`${MESHY_BASE}/animations/${taskId}`, {
      headers: { Authorization: `Bearer ${MESHY_API_KEY}` },
    });
    if (!res.ok) throw new Error(`Meshy animation poll: ${res.status}`);
    const data = (await res.json()) as AnimationTaskResult;
    onProgress?.(data.result ? 100 : 0);
    if (data.status === 'SUCCEEDED') {
      log.info({ taskId }, 'Meshy animation poll: succeeded');
      return data;
    }
    if (data.status === 'FAILED' || data.status === 'CANCELED') {
      log.warn({ taskId, error: data.task_error?.message }, 'Meshy animation poll: ended');
      return data;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Meshy animation timeout');
}
