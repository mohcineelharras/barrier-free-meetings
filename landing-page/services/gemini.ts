import { requireApiUrl } from '../../src/config/runtime';

export async function translateChineseToFrench(text: string) {
  try {
    const response = await fetch(requireApiUrl('/api/translate'), {
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
