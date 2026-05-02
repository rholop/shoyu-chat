import { Intent } from '../types';

/**
 * Heuristic intent detection from message content.
 * Runs synchronously in the browser — zero latency, no network call.
 * Order matters: more specific patterns are checked before general ones.
 */
export function detectIntent(content: string, hasImages: boolean): Intent {
  if (hasImages) return Intent.IMAGE_ANALYSIS;

  const lower = content.toLowerCase();

  // IMAGE_ANALYSIS: explicit image keywords even without attachment
  if (/\b(image|photo|picture|screenshot|chart|diagram|graph|figure|describe (this|the))\b/.test(lower)) {
    return Intent.IMAGE_ANALYSIS;
  }

  // WEB_SEARCH: real-time / current-events patterns
  if (
    /\b(search (for|the web|online)|look up|what'?s (new|happening|the latest)|current(ly)?|as of today|right now|breaking|live|stock price|weather|sports score)\b/.test(lower) ||
    /\b(latest|recent|news|today'?s?|this (week|month|year)|in \d{4})\b/.test(lower)
  ) {
    return Intent.WEB_SEARCH;
  }

  // TRANSLATING: explicit language / translation patterns
  if (
    /\btranslat(e|ion|ing)\b/.test(lower) ||
    /\bin (french|spanish|german|italian|portuguese|japanese|chinese|korean|russian|arabic|hindi|dutch|swedish|turkish)\b/.test(lower) ||
    /\b(spanish|french|german|italian|portuguese|japanese|chinese|korean|russian|arabic|hindi)\s+(version|translation|equivalent)\b/.test(lower)
  ) {
    return Intent.TRANSLATING;
  }

  // SUMMARIZING: distillation / brevity patterns
  if (
    /\b(summar(ize|ise|y|ies)|tl;?dr|key (points|takeaways|ideas)|main (points|ideas|takeaways)|brief (me|overview)|condense|shorten|distill|in a nutshell|overview of)\b/.test(lower)
  ) {
    return Intent.SUMMARIZING;
  }

  // DRAFTING: long-form prose writing — requires explicit content-type nouns
  // (avoids matching "write a function", "write a query", etc.)
  const PROSE_TYPES = 'blog|article|email|essay|post|letter|report|proposal|cover letter|readme|changelog|paragraph|story|poem|announcement|newsletter|press release|job description';
  if (
    /\b(draft (a|an|me|the)|compose (a|an)|help me write|write up)\b/.test(lower) ||
    new RegExp(`\\b(write|create)\\b.{0,25}\\b(${PROSE_TYPES})\\b`).test(lower)
  ) {
    return Intent.DRAFTING;
  }

  // DEBUGGING: error / fix patterns
  if (
    /\b(debug|why (is|does|doesn'?t|isn'?t|won'?t|can'?t)|fix (this|the|my)|not working|broken|fails?|failing|crash(es|ing)?|error|exception|stack trace|undefined is not|cannot read|null pointer|typeerror|syntaxerror|referenceerror|attributeerror|keyerror|indexerror|unexpected token)\b/.test(lower)
  ) {
    return Intent.DEBUGGING;
  }

  // CODING: implementation / code patterns
  if (
    /\b(code|implement|function|class|method|algorithm|api|endpoint|query|script|program|module|component|hook|interface|type|schema|regex|sql|bash|shell|cli)\b/.test(lower) ||
    /\b(typescript|javascript|python|rust|go|java|c\+\+|c#|ruby|php|swift|kotlin|html|css)\b/.test(lower) ||
    /\b(refactor|optimis[ez]|unit test|how (do i|to) (use|set up|configure|install))\b/.test(lower)
  ) {
    return Intent.CODING;
  }

  return Intent.CODING;
}
