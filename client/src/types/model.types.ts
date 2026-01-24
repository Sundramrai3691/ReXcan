export type AIModel = 'gemini' | 'openai' | 'groq' | 'claude' | 'rexcan' | 'best';

export interface ModelOption {
  value: AIModel;
  label: string;
  description?: string;
  recommended?: boolean;
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    value: 'best',
    label: 'Best Model (Recommended)',
    description: 'Automatically selects the best performing model',
    recommended: true,
  },
  {
    value: 'gemini',
    label: 'Google Gemini',
    description: 'Fast and accurate vision model',
  },
  {
    value: 'openai',
    label: 'OpenAI GPT-4',
    description: 'High-quality extraction with GPT-4 Vision',
  },
  {
    value: 'groq',
    label: 'Groq',
    description: 'Ultra-fast inference with Llama models',
  },
  {
    value: 'claude',
    label: 'Anthropic Claude',
    description: 'Advanced reasoning capabilities',
  },
  {
    value: 'rexcan',
    label: 'ReXcan',
    description: 'Custom optimized model',
  },
];

