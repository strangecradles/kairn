/**
 * Extract the first description line from command/agent markdown content.
 * Skips heading lines (starting with #) and returns the first non-empty line.
 */
function extractFirstLine(content: string): string {
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
 * Compile the Tier 2 intent classification prompt.
 *
 * Builds a project-specific prompt by extracting first-line descriptions
 * from each command and agent, then embedding them into a classification
 * template. The resulting prompt is baked into settings.json at generation
 * time — no runtime template interpolation needed.
 */
export function compileIntentPrompt(
  commands: Record<string, string>,
  agents: Record<string, string>,
): string {
  // Build workflow manifest
  const workflowLines: string[] = [];
  for (const [name, content] of Object.entries(commands)) {
    const desc = extractFirstLine(content);
    workflowLines.push(`- /project:${name} — ${desc}`);
  }
  const workflowManifest = workflowLines.length > 0
    ? workflowLines.join('\n')
    : '(no workflows defined)';

  // Build agent manifest
  const agentLines: string[] = [];
  for (const [name, content] of Object.entries(agents)) {
    const desc = extractFirstLine(content);
    agentLines.push(`- @${name} — ${desc}`);
  }
  const agentManifest = agentLines.length > 0
    ? agentLines.join('\n')
    : '(no agents defined)';

  return `You are an intent classifier for a software project. The user said something that didn't match any known command keyword.

Available workflows:
${workflowManifest}

Available agents:
${agentManifest}

User input: $PROMPT

If this maps to one or more workflows, return JSON:
{"additionalContext": "[INTENT ROUTED] Based on your request, use: /project:<command> — <description>"}

If the user is asking a question or making a statement that doesn't need a workflow, return:
{"ok": true}

Do not activate workflows for questions like 'what does deploy do?' or 'how do I test?'. Only activate for action requests.`;
}
