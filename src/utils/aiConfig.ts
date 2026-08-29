let key = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY || "";
try {
  const secret = require('./aiConfigKey');
  if (secret && secret.DYNAMIC_OPENROUTER_KEY) {
    key = secret.DYNAMIC_OPENROUTER_KEY;
  }
} catch (e) {
  // Ignored file absent in CI
}

export const OPENROUTER_API_KEY = key;

/**
 * 100% Free Tier AI Models on OpenRouter
 * - nvidia/nemotron-3.5-lightning:free ($0.00 cost)
 * - google/gemma-4-31b-it:free ($0.00 cost)
 */
export const OPENROUTER_MODEL = "nvidia/nemotron-3.5-lightning:free";
export const OPENROUTER_FALLBACK_MODEL = "google/gemma-4-31b-it:free";
