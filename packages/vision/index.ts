export interface VisionResult {
  query: string;
  attributes: {
    category: string;
    color: string[];
    style: string[];
    details: string[];
    priceRange?: 'budget' | 'mid' | 'premium';
  };
  confidence: number;
  rawDescription: string;
}

const MOCK_RESULT: VisionResult = {
  query: 'black bodycon midi dress square neck',
  attributes: {
    category: 'dress',
    color: ['black'],
    style: ['bodycon'],
    details: ['square neck', 'midi length', 'sleeveless'],
    priceRange: 'mid',
  },
  confidence: 0,
  rawDescription: 'Mock result — configure GEMINI_API_KEY to enable real vision',
};

export function isMockMode(): boolean {
  return !process.env.GEMINI_API_KEY;
}

const requestTimes: number[] = [];

function checkRateLimit(): number {
  const now = Date.now();
  const windowStart = now - 60000;
  while (requestTimes.length > 0 && requestTimes[0] < windowStart) {
    requestTimes.shift();
  }
  if (requestTimes.length >= 14) {
    const oldest = requestTimes[0];
    const waitTime = oldest + 60000 - now + 100;
    if (waitTime > 0) {
      console.log(`[VISION] Rate limit approached, waiting ${waitTime}ms`);
      return waitTime;
    }
  }
  return 0;
}

async function callGeminiVision(
  imageBase64: string,
  mimeType: string
): Promise<string> {
  const waitMs = checkRateLimit();
  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: mimeType, data: imageBase64 } },
              {
                text: `You are a fashion/beauty product search assistant for an Indian shopping comparison engine.

Analyze this product image and return ONLY a JSON object with no markdown, no backticks, no explanation:
{
  "category": "dress|top|bottom|shoes|bag|accessory|beauty|skincare|makeup|unknown",
  "color": ["primary color", "secondary color if present"],
  "style": ["style descriptor 1", "style descriptor 2"],
  "details": ["specific detail 1", "specific detail 2", "specific detail 3"],
  "priceRange": "budget|mid|premium",
  "searchQuery": "optimal 4-6 word search query for Indian shopping sites"
}

For searchQuery: be specific enough to find this exact product type.
Examples:
- "black bodycon midi dress square neck"
- "brown leather tote bag gold hardware"
- "red floral wrap maxi dress"
- "nude matte lipstick long lasting"
- "vitamin c serum brightening face"

Return ONLY the JSON. No other text.`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 300,
        },
      }),
    }
  );

  requestTimes.push(Date.now());

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} — ${error}`);
  }

  const data = await response.json();

  if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
    throw new Error('Gemini returned empty response');
  }

  return data.candidates[0].content.parts[0].text;
}

function parseGeminiResponse(raw: string): VisionResult | null {
  try {
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }
    const parsed = JSON.parse(cleaned);

    return {
      query: parsed.searchQuery || '',
      attributes: {
        category: parsed.category || 'unknown',
        color: Array.isArray(parsed.color) ? parsed.color : [],
        style: Array.isArray(parsed.style) ? parsed.style : [],
        details: Array.isArray(parsed.details) ? parsed.details : [],
        priceRange: parsed.priceRange || undefined,
      },
      confidence: 0.9,
      rawDescription: raw,
    };
  } catch {
    return null;
  }
}

export async function analyzeProductImage(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
): Promise<VisionResult> {
  if (isMockMode()) {
    console.log('[VISION] Mock mode — Gemini API key not configured');
    return { ...MOCK_RESULT };
  }

  try {
    const raw = await callGeminiVision(imageBase64, mimeType);
    const parsed = parseGeminiResponse(raw);
    if (parsed) {
      console.log('[VISION] Gemini success');
      return parsed;
    }
    console.log('[VISION] Gemini returned unparseable response, raw:', raw.slice(0, 200));
  } catch (error) {
    console.log(`[VISION] Gemini failed, using mock — ${error}`);
  }

  return { ...MOCK_RESULT, rawDescription: 'Gemini call failed, fell back to mock' };
}
