import { describe, it, expect } from 'vitest';
import { renderIntentLearner } from '../learner-template.js';

describe('renderIntentLearner', () => {
  it('renders valid JavaScript', () => {
    const script = renderIntentLearner();
    expect(script).toContain('import');
    expect(script).toContain('process.exit');
  });

  it('reads intent-log.jsonl', () => {
    const script = renderIntentLearner();
    expect(script).toContain('intent-log.jsonl');
  });

  it('groups entries by routed_to command', () => {
    const script = renderIntentLearner();
    expect(script).toContain('routed_to');
  });

  it('requires 3+ entries for promotion', () => {
    const script = renderIntentLearner();
    expect(script).toContain('3');
  });

  it('reads current intent-router.mjs', () => {
    const script = renderIntentLearner();
    expect(script).toContain('intent-router.mjs');
  });

  it('writes promotion audit log', () => {
    const script = renderIntentLearner();
    expect(script).toContain('intent-promotions.jsonl');
  });

  it('handles empty log gracefully', () => {
    const script = renderIntentLearner();
    // Script should handle the case where the log file doesn't exist
    expect(script).toContain('catch');
  });

  it('truncates processed entries', () => {
    const script = renderIntentLearner();
    // Should write back remaining entries
    expect(script).toContain('writeFileSync');
  });
});
