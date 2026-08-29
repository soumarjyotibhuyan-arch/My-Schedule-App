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
export const OPENROUTER_MODEL = "openai/gpt-4o-mini";
export const OPENROUTER_FALLBACK_MODEL = "meta-llama/llama-3.3-70b-instruct";
