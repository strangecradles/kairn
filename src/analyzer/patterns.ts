/**
 * Language-specific file sampling strategies for the semantic codebase analyzer.
 *
 * Each strategy defines how to discover and prioritize files for a given language
 * ecosystem: where to find entry points, which directories contain domain logic,
 * which config files to always include, and what to exclude.
 */

/** Describes how to sample files from a codebase for a specific language. */
export interface SamplingStrategy {
  /** Human-readable language name (e.g., "Python", "TypeScript"). */
  language: string;
  /** File extensions associated with this language. */
  extensions: string[];
  /** Entry-point file paths to try, in priority order. */
  entryPoints: string[];
  /** Glob patterns for directories containing core domain logic. */
  domainPatterns: string[];
  /** Config files to always include when present. */
  configPatterns: string[];
  /** Glob patterns for files/directories to never include. */
  excludePatterns: string[];
  /** Maximum number of files to select per category (entry/domain/config). */
  maxFilesPerCategory: number;
}

/** Language-keyed registry of sampling strategies. */
export const STRATEGIES: Record<string, SamplingStrategy> = {
  python: {
    language: 'Python',
    extensions: ['.py'],
    entryPoints: [
      'main.py',
      'app.py',
      'run.py',
      'cli.py',
      'server.py',
      '__main__.py',
      'src/main.py',
      'src/app.py',
      'src/__main__.py',
    ],
    domainPatterns: [
      'src/',
      'lib/',
      'app/',
      'models/',
      'pipelines/',
      'services/',
      'api/',
      'core/',
      'engine/',
    ],
    configPatterns: [
      'pyproject.toml',
      'setup.py',
      'setup.cfg',
      'requirements.txt',
      'Pipfile',
      'poetry.lock',
    ],
    excludePatterns: [
      '**/__pycache__/**',
      '**/*.pyc',
      '**/test_*',
      '**/*_test.py',
      '**/tests/**',
      '**/.venv/**',
      '**/venv/**',
      '**/dist/**',
      '**/build/**',
      '**/*.egg-info/**',
    ],
    maxFilesPerCategory: 5,
  },

  typescript: {
    language: 'TypeScript',
    extensions: ['.ts', '.tsx'],
    entryPoints: [
      'src/index.ts',
      'src/main.ts',
      'src/app.ts',
      'index.ts',
      'src/server.ts',
      'src/cli.ts',
      'pages/index.tsx',
      'app/page.tsx',
    ],
    domainPatterns: [
      'src/lib/',
      'src/services/',
      'src/modules/',
      'src/api/',
      'src/core/',
      'src/components/',
      'src/routes/',
      'src/handlers/',
    ],
    configPatterns: ['tsconfig.json', 'package.json'],
    excludePatterns: [
      '**/__tests__/**',
      '**/*.test.ts',
      '**/*.spec.ts',
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
    ],
    maxFilesPerCategory: 5,
  },

  go: {
    language: 'Go',
    extensions: ['.go'],
    entryPoints: ['main.go', 'cmd/main.go', 'cmd/server/main.go'],
    domainPatterns: ['internal/', 'pkg/', 'api/', 'handlers/', 'services/'],
    configPatterns: ['go.mod', 'go.sum'],
    excludePatterns: ['**/*_test.go', '**/vendor/**', '**/testdata/**'],
    maxFilesPerCategory: 5,
  },

  rust: {
    language: 'Rust',
    extensions: ['.rs'],
    entryPoints: ['src/main.rs', 'src/lib.rs'],
    domainPatterns: ['src/', 'crates/'],
    configPatterns: ['Cargo.toml', 'Cargo.lock'],
    excludePatterns: ['**/target/**', '**/tests/**', '**/benches/**'],
    maxFilesPerCategory: 5,
  },
};

/**
 * Look up a sampling strategy by language name (case-insensitive).
 *
 * @param language - Language identifier (e.g., "python", "TypeScript") or null.
 * @returns The matching SamplingStrategy, or null if not found.
 */
export function getStrategy(language: string | null): SamplingStrategy | null {
  if (language === null) {
    return null;
  }
  const key = language.toLowerCase();
  return STRATEGIES[key] ?? null;
}

/**
 * Returns glob patterns for files that should always be included in any sample,
 * regardless of detected language.
 *
 * @returns Array of file path patterns to always include.
 */
export function getAlwaysInclude(): string[] {
  return ['README.md', 'README.rst', '*.toml', '*.yaml', '*.yml'];
}

/**
 * Priority tiers for file sampling. Lower number = higher priority.
 * When a token budget forces truncation, files are dropped from the
 * highest tier number first, guaranteeing that entry points, READMEs,
 * and config files always survive.
 */
export const enum FileTier {
  /** README, project config — project identity (always kept) */
  IDENTITY = 0,
  /** Entry points — what starts the app */
  ENTRY = 1,
  /** Core domain files in known domain directories */
  DOMAIN = 2,
  /** Everything else that matched include patterns */
  OTHER = 3,
}

/**
 * Classify a file path into a priority tier for budget truncation.
 *
 * @param filePath - Relative file path (e.g. "src/cli.ts", "README.md")
 * @param strategy - The language sampling strategy being used
 * @returns The priority tier (lower = higher priority, kept first)
 */
export function classifyFilePriority(filePath: string, strategy: SamplingStrategy): FileTier {
  const lower = filePath.toLowerCase();

  // Tier 0: README and config files — project identity
  if (lower.startsWith('readme') || lower.endsWith('readme.md') || lower.endsWith('readme.rst')) {
    return FileTier.IDENTITY;
  }
  for (const cfg of strategy.configPatterns) {
    if (lower === cfg.toLowerCase() || filePath === cfg) {
      return FileTier.IDENTITY;
    }
  }
  // Also catch always-include config files
  if (lower === 'package.json' || lower === 'pyproject.toml' || lower === 'cargo.toml' || lower === 'go.mod') {
    return FileTier.IDENTITY;
  }

  // Tier 1: Entry points — what boots the app
  for (const entry of strategy.entryPoints) {
    if (filePath === entry || lower === entry.toLowerCase()) {
      return FileTier.ENTRY;
    }
  }

  // Tier 2: Domain directories — the interesting code
  for (const domain of strategy.domainPatterns) {
    if (filePath.startsWith(domain) || lower.startsWith(domain.toLowerCase())) {
      return FileTier.DOMAIN;
    }
  }

  // Tier 3: Everything else
  return FileTier.OTHER;
}
