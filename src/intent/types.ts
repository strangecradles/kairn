export interface IntentPattern {
  pattern: string;           // regex source (no delimiters)
  command: string;           // /project:command-name
  description: string;       // human-readable description
  source: 'generated' | 'evolved' | 'learned';
}

export interface IntentConfig {
  tier1Patterns: IntentPattern[];
  tier2PromptTemplate: string;  // compiled with workflow manifest
  enableTier2: boolean;         // true by default
}
