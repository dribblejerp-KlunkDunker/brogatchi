// @vitest-environment node
// Markdown renderer used by the Live Gaming Intel feed: bold, lists, links,
// inline code — with HTML escaping so model text can never inject markup.
import { describe, it, expect } from 'vitest';
import { renderMarkdown, escapeHtml } from '../src/ui/markdown.js';

describe('escapeHtml', () => {
  it('neutralizes markup and quotes', () => {
    const out = escapeHtml('<img src=x onerror=alert(1)> & "quoted"');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
    expect(out).toContain('&amp;');
    expect(out).toContain('&quot;');
  });

  it('handles nullish input', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('renderMarkdown', () => {
  it('renders bold instead of raw asterisks', () => {
    const out = renderMarkdown('Energy at **99** and rising.');
    expect(out).toContain('<strong>99</strong>');
    expect(out).not.toContain('**');
  });

  it('turns bullet lines into a list', () => {
    const md = [
      'Latest heat:',
      '* **CoD: Black Ops 6** is finally here.',
      '* Sonic x Shadow Generations: goated remaster.',
    ].join('\n');
    const out = renderMarkdown(md);
    expect(out).toContain('<p>Latest heat:</p>');
    expect(out).toContain('<ul>');
    expect(out).toMatch(/<li><strong>CoD: Black Ops 6<\/strong> is finally here\.<\/li>/);
    expect(out.match(/<li>/g)).toHaveLength(2);
    expect(out.match(/<ul>/g)).toHaveLength(1); // consecutive bullets share one list
  });

  it('supports ordered lists', () => {
    const out = renderMarkdown('1. Patch notes\n2. Patch notes 2');
    expect(out).toContain('<ol>');
    expect(out.match(/<li>/g)).toHaveLength(2);
  });

  it('keeps paragraphs separate on blank lines', () => {
    expect(renderMarkdown('First line.\n\nSecond para.')).toBe(
      '<p>First line.</p><p>Second para.</p>'
    );
  });

  it('converts markdown links and bare URLs, http(s) only', () => {
    const out = renderMarkdown(
      'Read [patch notes](https://example.com/a?x=1&y=2) or https://example.com/b.'
    );
    expect(out).toContain(
      '<a href="https://example.com/a?x=1&amp;y=2" target="_blank" rel="noopener noreferrer" title="Open in browser" class="md-link">patch notes</a>'
    );
    expect(out).toContain(
      '<a href="https://example.com/b" target="_blank" rel="noopener noreferrer" title="Open in browser" class="md-link">https://example.com/b</a>.'
    );
    // non-http schemes stay inert plain text
    const evil = renderMarkdown('[click](javascript:alert(1))');
    expect(evil).not.toContain('<a');
    expect(evil).toContain('javascript:alert(1)');
  });

  it('protects inline code, including markup inside it', () => {
    const out = renderMarkdown('Run `npm test` and keep `**stars**` literal.');
    expect(out).toContain('<code>npm test</code>');
    expect(out).toContain('<code>**stars**</code>');
    expect(out).not.toContain('<strong>stars</strong>');
  });

  it('escapes HTML before formatting', () => {
    const out = renderMarkdown('<b>nope</b> **fine**');
    expect(out).not.toContain('<b>');
    expect(out).toContain('&lt;b&gt;');
    expect(out).toContain('<strong>fine</strong>');
  });

  it('normalizes CRLF and handles empty input', () => {
    expect(renderMarkdown('a\r\nb')).toBe('<p>a b</p>');
    expect(renderMarkdown('')).toBe('');
    expect(renderMarkdown(null)).toBe('');
    expect(renderMarkdown('   \n  ')).toBe('');
  });
});
