import type { IntentPattern } from './types.js';

/** Static synonym map: verb → alternative phrases users might say */
const SYNONYM_MAP: Record<string, string[]> = {
  deploy: ['ship', 'push\\s+to\\s+prod', 'release', 'publish'],
  test: ['run\\s+tests', 'check', 'verify', 'run\\s+test\\s+suite'],
  lint: ['format', 'style\\s+check', 'linting'],
  build: ['compile', 'bundle', 'make'],
  dev: ['develop', 'start\\s+dev', 'run\\s+dev'],
  start: ['run', 'launch', 'serve'],
  migrate: ['migration', 'schema\\s+change', 'db\\s+update'],
  seed: ['populate', 'seed\\s+data', 'load\\s+fixtures'],
  clean: ['purge', 'clear', 'reset\\s+cache'],
  docs: ['document', 'documentation', 'write\\s+docs'],
  review: ['code\\s+review', 'pr\\s+review', 'check\\s+code'],
  commit: ['save\\s+changes', 'check\\s+in', 'git\\s+commit'],
  fix: ['repair', 'patch', 'debug', 'resolve'],
  refactor: ['restructure', 'reorganize', 'clean\\s+up'],
  plan: ['design', 'architect', 'outline'],
  status: ['progress', 'overview', 'summary'],
};

/**
 * Extract the first description line from command markdown content.
 * Skips the heading line (starts with #) and returns the next non-empty line.
 */
function extractDescription(content: string): string {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      return trimmed;
    }
  }
  return '';
}

/**
 * Extract the primary verb from a command name.
 * Handles hyphenated names like "db-migrate" → "migrate".
 */
function extractVerb(commandName: string): string {
  const parts = commandName.split('-');
  // For multi-part names, the verb is usually the last part
  // "db-migrate" → "migrate", "test" → "test"
  if (parts.length > 1) {
    return parts[parts.length - 1];
  }
  return parts[0];
}

/**
 * Build a regex alternation from a command name and its synonyms.
 */
function buildPatternAlternation(commandName: string): string {
  const verb = extractVerb(commandName);
  const alternatives = [verb];

  // Add synonyms if available
  const synonyms = SYNONYM_MAP[verb];
  if (synonyms) {
    alternatives.push(...synonyms);
  }

  // Add the full command name if it differs from the verb
  if (commandName !== verb && !alternatives.includes(commandName)) {
    alternatives.push(commandName.replace(/-/g, '[\\s-]'));
  }

  return `\\b(${alternatives.join('|')})\\b`;
}

/**
 * Generate intent patterns from npm scripts that aren't covered by commands.
 */
function generateScriptPatterns(
  scripts: Record<string, string>,
  existingCommands: Set<string>,
): IntentPattern[] {
  const patterns: IntentPattern[] = [];

  for (const scriptName of Object.keys(scripts)) {
    // Skip if a command already covers this script
    const verb = extractVerb(scriptName);
    if (existingCommands.has(verb) || existingCommands.has(scriptName)) {
      continue;
    }

    // Handle composite script names like "test:e2e"
    const parts = scriptName.split(':');
    if (parts.length > 1) {
      const suffix = parts[parts.length - 1];
      const alternatives = [suffix];

      // Add common expansions
      if (suffix === 'e2e') {
        alternatives.push('end[\\s.-]to[\\s.-]end');
      }

      patterns.push({
        pattern: `\\b(${alternatives.join('|')})\\b`,
        command: `/project:${scriptName}`,
        description: `Run npm script: ${scriptName}`,
        source: 'generated',
      });
    }
  }

  return patterns;
}

/**
 * Generate intent patterns from generated commands and project context.
 *
 * For each command, produces regex patterns from the command name,
 * synonyms from a static map, and framework-specific verbs.
 * Patterns are sorted by specificity (longer patterns first).
 */
export function generateIntentPatterns(
  commands: Record<string, string>,
  agents: Record<string, string>,
  projectProfile: { language: string; framework: string; scripts: Record<string, string> },
): IntentPattern[] {
  const patterns: IntentPattern[] = [];
  const commandNames = new Set(Object.keys(commands));

  // Generate patterns for each command
  for (const [name, content] of Object.entries(commands)) {
    const description = extractDescription(content);
    const patternStr = buildPatternAlternation(name);

    patterns.push({
      pattern: patternStr,
      command: `/project:${name}`,
      description: description || `Run ${name} workflow`,
      source: 'generated',
    });
  }

  // Add patterns from npm scripts not already covered
  const scriptPatterns = generateScriptPatterns(
    projectProfile.scripts,
    commandNames,
  );
  patterns.push(...scriptPatterns);

  // Sort by specificity: longer patterns first (more specific = higher priority)
  patterns.sort((a, b) => b.pattern.length - a.pattern.length);

  return patterns;
}
