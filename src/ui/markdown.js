// Markdown → HTML for AI chat text. Zero dependencies.
//
// The model returns markdown, and inserting it raw shows the syntax tokens
// (**bold**, bullet lines, links). This converts a safe subset: escape HTML
// first so model text can never inject markup, then do block layout (lists /
// paragraphs) and inline passes (code, bold, links) on the escaped string.
//
// Inline passes protect their output from later passes by stashing the
// generated HTML in tokens (\\u0000N\\u0000) and restoring at the end.

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const BLOCK_UL = /^\s*[-*+]\s+/;
const BLOCK_OL = /^\s*\d+[.)]\s+/;

export function renderMarkdown(src) {
  const text = escapeHtml(src);
  if (!text.trim()) return '';
  const lines = text.replace(/\r\n?/g, '\n').split('\n');

  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (BLOCK_UL.test(line)) {
      const items = [];
      while (i < lines.length && BLOCK_UL.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(BLOCK_UL, ''))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join('')}</ul>`);
    } else if (BLOCK_OL.test(line)) {
      const items = [];
      while (i < lines.length && BLOCK_OL.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(BLOCK_OL, ''))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join('')}</ol>`);
    } else {
      // Paragraph: consume until a blank line or the next list starts.
      const buf = [];
      while (
        i < lines.length && lines[i].trim() &&
        !BLOCK_UL.test(lines[i]) && !BLOCK_OL.test(lines[i])
      ) {
        buf.push(lines[i].trim());
        i++;
      }
      out.push(`<p>${inline(buf.join(' '))}</p>`);
    }
  }
  return out.join('');
}

function inline(text) {
  const stash = [];
  const hold = (html) => {
    const token = `\u0000${stash.length}\u0000`;
    stash.push(html);
    return token;
  };

  let s = text;
  // Inline code first: nothing inside backticks gets formatted.
  s = s.replace(/`([^`]+)`/g, (_, code) => hold(`<code>${code}</code>`));

  // Bold.
  s = s.replace(/\*\*([^*]+)\*\*/g, (_, t) => `<strong>${t}</strong>`);

  // Markdown links — only http(s) targets; anything else stays plain text.
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    (_, label, url) => hold(`<a href="${url}" target="_blank" rel="noopener noreferrer" title="Open in browser" class="md-link">${label}</a>`)
  );

  // Bare http(s) URLs (the token chars can never appear in model text).
  s = s.replace(/(https?:\/\/[^\s<>"'\u0000]+)/g, (m, url) => {
    const clean = url.replace(/[.,;:!?]+$/, '');
    const trail = url.slice(clean.length);
    return `${hold(`<a href="${clean}" target="_blank" rel="noopener noreferrer" title="Open in browser" class="md-link">${clean}</a>`)}${trail}`;
  });

  // Drop leftover unmatched asterisks instead of showing raw **.
  s = s.replace(/\*\*/g, '');

  // Restore the stashed <code>/<a> fragments.
  s = s.replace(/\u0000(\d+)\u0000/g, (_, n) => stash[Number(n)]);
  return s;
}
