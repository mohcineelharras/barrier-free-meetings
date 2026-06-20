import { requireApiUrl, type RuntimeConfig } from '../config/runtime';

export async function translateChineseToFrench(text: string, runtimeConfig?: RuntimeConfig) {
  try {
    const response = await fetch(requireApiUrl('/api/translate', runtimeConfig), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      throw new Error(`Translation request failed with status ${response.status}`);
    }

    const data = (await response.json()) as { translation?: string };
    return data.translation?.trim() || "";
  } catch (error) {
    console.error("[translate] failed:", error);
    return "[Translation Error]";
  }
}
