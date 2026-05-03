import { describe, it, expect } from 'vitest';
import { detectIntent } from './detectIntent';
import { Intent } from '../types';

describe('detectIntent', () => {
  // ── IMAGE_ANALYSIS ────────────────────────────────────────────────────────

  describe('IMAGE_ANALYSIS', () => {
    it('detects when hasImages=true regardless of content', () => {
      expect(detectIntent('hello', true)).toBe(Intent.IMAGE_ANALYSIS);
      expect(detectIntent('write me a function', true)).toBe(Intent.IMAGE_ANALYSIS);
    });

    it('detects image-related keywords without attachment', () => {
      expect(detectIntent('describe this image', false)).toBe(Intent.IMAGE_ANALYSIS);
      expect(detectIntent('what is in this photo?', false)).toBe(Intent.IMAGE_ANALYSIS);
      expect(detectIntent('explain this chart', false)).toBe(Intent.IMAGE_ANALYSIS);
      expect(detectIntent('read this screenshot', false)).toBe(Intent.IMAGE_ANALYSIS);
    });

    it('detects "describe the figure" pattern', () => {
      expect(detectIntent('describe the diagram', false)).toBe(Intent.IMAGE_ANALYSIS);
    });
  });

  // ── WEB_SEARCH ────────────────────────────────────────────────────────────

  describe('WEB_SEARCH', () => {
    it('detects "search for" pattern', () => {
      expect(detectIntent('search for the latest React release', false)).toBe(Intent.WEB_SEARCH);
    });

    it('detects "look up" pattern', () => {
      expect(detectIntent('look up the current Bitcoin price', false)).toBe(Intent.WEB_SEARCH);
    });

    it("detects \"what's the latest\" pattern", () => {
      expect(detectIntent("what's the latest news on AI?", false)).toBe(Intent.WEB_SEARCH);
    });

    it('detects "today" pattern', () => {
      expect(detectIntent("what is today's weather in Tokyo?", false)).toBe(Intent.WEB_SEARCH);
    });

    it('detects "breaking" pattern', () => {
      expect(detectIntent('any breaking news in tech?', false)).toBe(Intent.WEB_SEARCH);
    });

    it('detects "latest" without "search" keyword', () => {
      expect(detectIntent('what are the latest updates to GPT-4?', false)).toBe(Intent.WEB_SEARCH);
    });

    it('detects "recent" pattern', () => {
      expect(detectIntent('recent developments in quantum computing', false)).toBe(Intent.WEB_SEARCH);
    });

    it('detects year reference pattern', () => {
      expect(detectIntent('best laptops in 2026', false)).toBe(Intent.WEB_SEARCH);
    });
  });

  // ── TRANSLATING ───────────────────────────────────────────────────────────

  describe('TRANSLATING', () => {
    it('detects "translate" verb', () => {
      expect(detectIntent('translate this to French', false)).toBe(Intent.TRANSLATING);
    });

    it('detects "translation" noun', () => {
      expect(detectIntent('I need a translation of this document', false)).toBe(Intent.TRANSLATING);
    });

    it('detects "translating" gerund', () => {
      expect(detectIntent('help me with translating this text', false)).toBe(Intent.TRANSLATING);
    });

    it('detects "in Spanish" pattern', () => {
      expect(detectIntent('how do you say hello in Spanish?', false)).toBe(Intent.TRANSLATING);
    });

    it('detects "in Japanese" pattern', () => {
      expect(detectIntent('write this in Japanese', false)).toBe(Intent.TRANSLATING);
    });

    it('detects "in German" pattern', () => {
      expect(detectIntent('say this in German', false)).toBe(Intent.TRANSLATING);
    });

    it('detects "Chinese version" pattern', () => {
      expect(detectIntent('give me the Chinese version of this sentence', false)).toBe(Intent.TRANSLATING);
    });
  });

  // ── SUMMARIZING ───────────────────────────────────────────────────────────

  describe('SUMMARIZING', () => {
    it('detects "summarize" verb', () => {
      expect(detectIntent('summarize this article', false)).toBe(Intent.SUMMARIZING);
    });

    it('detects "summarise" British spelling', () => {
      expect(detectIntent('summarise the following text', false)).toBe(Intent.SUMMARIZING);
    });

    it('detects "tldr"', () => {
      expect(detectIntent('tldr of this document', false)).toBe(Intent.SUMMARIZING);
    });

    it('detects "tl;dr"', () => {
      expect(detectIntent('tl;dr please', false)).toBe(Intent.SUMMARIZING);
    });

    it('detects "key points"', () => {
      expect(detectIntent('what are the key points of this?', false)).toBe(Intent.SUMMARIZING);
    });

    it('detects "key takeaways"', () => {
      expect(detectIntent('list the key takeaways', false)).toBe(Intent.SUMMARIZING);
    });

    it('detects "main ideas"', () => {
      expect(detectIntent('what are the main ideas here?', false)).toBe(Intent.SUMMARIZING);
    });

    it('detects "brief me"', () => {
      expect(detectIntent('brief me on this topic', false)).toBe(Intent.SUMMARIZING);
    });

    it('detects "condense"', () => {
      expect(detectIntent('condense this into bullet points', false)).toBe(Intent.SUMMARIZING);
    });

    it('detects "overview of"', () => {
      expect(detectIntent('give me an overview of this paper', false)).toBe(Intent.SUMMARIZING);
    });
  });

  // ── DRAFTING ─────────────────────────────────────────────────────────────

  describe('DRAFTING', () => {
    it('detects "write a blog"', () => {
      expect(detectIntent('write a blog post about TypeScript', false)).toBe(Intent.DRAFTING);
    });

    it('detects "write an article"', () => {
      expect(detectIntent('write an article about climate change', false)).toBe(Intent.DRAFTING);
    });

    it('detects "write me an email"', () => {
      expect(detectIntent('write me an email to my boss', false)).toBe(Intent.DRAFTING);
    });

    it('detects "draft a"', () => {
      expect(detectIntent('draft a proposal for the client', false)).toBe(Intent.DRAFTING);
    });

    it('detects "draft me a"', () => {
      expect(detectIntent('draft me a cover letter', false)).toBe(Intent.DRAFTING);
    });

    it('detects "compose an email"', () => {
      expect(detectIntent('compose an email to the team', false)).toBe(Intent.DRAFTING);
    });

    it('detects "help me write"', () => {
      expect(detectIntent('help me write a README', false)).toBe(Intent.DRAFTING);
    });

    it('detects "create a report"', () => {
      expect(detectIntent('create a report on Q1 results', false)).toBe(Intent.DRAFTING);
    });
  });

  // ── DEBUGGING ─────────────────────────────────────────────────────────────

  describe('DEBUGGING', () => {
    it('detects "debug" keyword', () => {
      expect(detectIntent('debug this function for me', false)).toBe(Intent.DEBUGGING);
    });

    it('detects "why does" pattern', () => {
      expect(detectIntent('why does this throw an error?', false)).toBe(Intent.DEBUGGING);
    });

    it("detects \"why doesn't\" pattern", () => {
      expect(detectIntent("why doesn't this work?", false)).toBe(Intent.DEBUGGING);
    });

    it('detects "fix this" pattern', () => {
      expect(detectIntent('fix this code please', false)).toBe(Intent.DEBUGGING);
    });

    it('detects "not working"', () => {
      expect(detectIntent('my login is not working', false)).toBe(Intent.DEBUGGING);
    });

    it('detects "TypeError" error name', () => {
      expect(detectIntent('TypeError: cannot read properties of undefined', false)).toBe(Intent.DEBUGGING);
    });

    it('detects "SyntaxError" error name', () => {
      expect(detectIntent('SyntaxError: unexpected token', false)).toBe(Intent.DEBUGGING);
    });

    it('detects "exception" keyword', () => {
      expect(detectIntent('I get an exception when I run this', false)).toBe(Intent.DEBUGGING);
    });

    it('detects "fails" pattern', () => {
      expect(detectIntent('this test fails', false)).toBe(Intent.DEBUGGING);
    });

    it('detects "crashes"', () => {
      expect(detectIntent('the app crashes on startup', false)).toBe(Intent.DEBUGGING);
    });

    it('detects "stack trace"', () => {
      expect(detectIntent('here is the stack trace', false)).toBe(Intent.DEBUGGING);
    });
  });

  // ── CODING ────────────────────────────────────────────────────────────────

  describe('CODING', () => {
    it('detects "implement" keyword', () => {
      expect(detectIntent('implement a binary search tree', false)).toBe(Intent.CODING);
    });

    it('detects "function" keyword', () => {
      expect(detectIntent('write a function that reverses a string', false)).toBe(Intent.CODING);
    });

    it('detects "class" keyword', () => {
      expect(detectIntent('create a class for user authentication', false)).toBe(Intent.CODING);
    });

    it('detects "algorithm" keyword', () => {
      expect(detectIntent('explain the quicksort algorithm', false)).toBe(Intent.CODING);
    });

    it('detects "TypeScript" language keyword', () => {
      expect(detectIntent('how do I use generics in TypeScript?', false)).toBe(Intent.CODING);
    });

    it('detects "Python" language keyword', () => {
      expect(detectIntent('write this in Python', false)).toBe(Intent.CODING);
    });

    it('detects "refactor" keyword', () => {
      expect(detectIntent('refactor this component', false)).toBe(Intent.CODING);
    });

    it('detects "unit test" keyword', () => {
      expect(detectIntent('write unit tests for this module', false)).toBe(Intent.CODING);
    });

    it('detects "API" keyword', () => {
      expect(detectIntent('design a REST API for users', false)).toBe(Intent.CODING);
    });

    it('detects "SQL" keyword', () => {
      expect(detectIntent('write a SQL query to get all users', false)).toBe(Intent.CODING);
    });

    it('detects "component" keyword', () => {
      expect(detectIntent('create a React component for a dropdown', false)).toBe(Intent.CODING);
    });
  });

  // ── Default ───────────────────────────────────────────────────────────────

  describe('default fallback', () => {
    it('returns CODING for ambiguous content', () => {
      expect(detectIntent('hello', false)).toBe(Intent.CODING);
      expect(detectIntent('hi there', false)).toBe(Intent.CODING);
      expect(detectIntent('can you help me?', false)).toBe(Intent.CODING);
    });

    it('is case-insensitive', () => {
      expect(detectIntent('SUMMARIZE THIS', false)).toBe(Intent.SUMMARIZING);
      expect(detectIntent('TRANSLATE TO FRENCH', false)).toBe(Intent.TRANSLATING);
      expect(detectIntent('LATEST NEWS', false)).toBe(Intent.WEB_SEARCH);
    });
  });

  // ── Priority ordering ────────────────────────────────────────────────────

  describe('priority ordering', () => {
    it('IMAGE_ANALYSIS wins over all others when hasImages=true', () => {
      expect(detectIntent('translate this image to French', true)).toBe(Intent.IMAGE_ANALYSIS);
      expect(detectIntent('debug this screenshot', true)).toBe(Intent.IMAGE_ANALYSIS);
    });

    it('prefers TRANSLATING over DRAFTING for "write in Spanish"', () => {
      expect(detectIntent('write this in Spanish', false)).toBe(Intent.TRANSLATING);
    });

    it('prefers SUMMARIZING over CODING for "summarize this Python script"', () => {
      expect(detectIntent('summarize this Python script for me', false)).toBe(Intent.SUMMARIZING);
    });

    it('prefers DEBUGGING over CODING for "fix this function"', () => {
      expect(detectIntent('fix this function', false)).toBe(Intent.DEBUGGING);
    });
  });
});
