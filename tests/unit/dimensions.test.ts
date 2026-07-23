import { describe, it, expect } from 'vitest';
import { escapeMarkdownBackticks, sanitizeWorkflowMessage } from '../../src/output/dimensions.js';

describe('escapeMarkdownBackticks', () => {
  it('escapes backticks', () => {
    expect(escapeMarkdownBackticks('a`b')).toBe('a\\`b');
  });

  it('escapes backslashes before backticks', () => {
    expect(escapeMarkdownBackticks('\\`')).toBe('\\\\\\`');
  });

  it('leaves plain text unchanged', () => {
    expect(escapeMarkdownBackticks('/api/users')).toBe('/api/users');
  });
});

describe('sanitizeWorkflowMessage', () => {
  it('strips newlines and workflow command markers', () => {
    expect(sanitizeWorkflowMessage('line1\nline2::cmd')).toBe('line1 line2 cmd');
  });
});
