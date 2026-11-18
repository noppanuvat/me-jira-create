/**
 * Minimal Markdown -> ADF converter used for AI-improved descriptions.
 * Supports the subset the Improve-description prompt is allowed to emit:
 * headings, bullet/numbered/task lists, fenced code, quotes and inline
 * bold/italic/code/link marks.
 */

const INLINE_PATTERN =
  /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

function textNode(text, marks) {
  if (!text) return null;
  const node = { type: 'text', text };
  if (marks?.length) node.marks = marks;
  return node;
}

export function inlineMarkdownToAdf(text = '') {
  const out = [];
  let lastIndex = 0;
  const input = String(text);
  const regex = new RegExp(INLINE_PATTERN);

  let match;
  while ((match = regex.exec(input)) !== null) {
    if (match.index > lastIndex) {
      out.push(textNode(input.slice(lastIndex, match.index)));
    }
    const token = match[0];
    if (token.startsWith('**') || token.startsWith('__')) {
      out.push(textNode(token.slice(2, -2), [{ type: 'strong' }]));
    } else if (token.startsWith('`')) {
      out.push(textNode(token.slice(1, -1), [{ type: 'code' }]));
    } else if (token.startsWith('[')) {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      if (link) {
        out.push(textNode(link[1], [{ type: 'link', attrs: { href: link[2] } }]));
      } else {
        out.push(textNode(token));
      }
    } else if (token.startsWith('*') || token.startsWith('_')) {
      out.push(textNode(token.slice(1, -1), [{ type: 'em' }]));
    } else {
      out.push(textNode(token));
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < input.length) {
    out.push(textNode(input.slice(lastIndex)));
  }

  return out.filter(Boolean);
}

function paragraph(text = '') {
  const content = inlineMarkdownToAdf(text);
  return { type: 'paragraph', content };
}

function flushList(state, adfBlocks) {
  if (!state.items.length) return;
  const type = state.listType === 'ordered' ? 'orderedList' : state.listType === 'task' ? 'taskList' : 'bulletList';
  if (type === 'taskList') {
    adfBlocks.push({
      type: 'taskList',
      attrs: { localId: `md-${adfBlocks.length}` },
      content: state.items.map((item, idx) => ({
        type: 'taskItem',
        attrs: {
          localId: `md-${adfBlocks.length}-${idx}`,
          state: item.checked ? 'DONE' : 'TODO',
        },
        content: [paragraph(item.text)],
      })),
    });
  } else {
    adfBlocks.push({
      type,
      content: state.items.map((item) => ({
        type: 'listItem',
        content: [paragraph(item.text)],
      })),
    });
  }
  state.items = [];
  state.listType = null;
}

export function markdownToAdf(markdown = '') {
  const lines = String(markdown).replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  const listState = { items: [], listType: null };
  let inCode = false;
  let codeLines = [];
  let codeLanguage = null;
  let paragraphBuffer = [];

  const flushParagraph = () => {
    if (!paragraphBuffer.length) return;
    blocks.push(paragraph(paragraphBuffer.join(' ').trim()));
    paragraphBuffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');

    if (line.trim().startsWith('```')) {
      if (inCode) {
        blocks.push({
          type: 'codeBlock',
          attrs: { language: codeLanguage || null },
          content: codeLines.length ? [{ type: 'text', text: codeLines.join('\n') }] : [],
        });
        inCode = false;
        codeLines = [];
        codeLanguage = null;
      } else {
        flushParagraph();
        flushList(listState, blocks);
        inCode = true;
        codeLanguage = line.trim().slice(3).trim() || null;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(rawLine);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList(listState, blocks);
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList(listState, blocks);
      blocks.push({
        type: 'heading',
        attrs: { level: Math.min(3, heading[1].length) },
        content: inlineMarkdownToAdf(heading[2].trim()),
      });
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      flushList(listState, blocks);
      blocks.push({ type: 'blockquote', content: [paragraph(quote[1])] });
      continue;
    }

    const task = /^\s*[-*]\s+\[(x|X| )]\s+(.*)$/.exec(line);
    if (task) {
      flushParagraph();
      if (listState.listType && listState.listType !== 'task') flushList(listState, blocks);
      listState.listType = 'task';
      listState.items.push({ text: task[2].trim(), checked: task[1].toLowerCase() === 'x' });
      continue;
    }

    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      if (listState.listType && listState.listType !== 'bullet') flushList(listState, blocks);
      listState.listType = 'bullet';
      listState.items.push({ text: bullet[1].trim() });
      continue;
    }

    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ordered) {
      flushParagraph();
      if (listState.listType && listState.listType !== 'ordered') flushList(listState, blocks);
      listState.listType = 'ordered';
      listState.items.push({ text: ordered[1].trim() });
      continue;
    }

    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      flushParagraph();
      flushList(listState, blocks);
      blocks.push({ type: 'rule' });
      continue;
    }

    paragraphBuffer.push(line.trim());
  }

  flushParagraph();
  flushList(listState, blocks);
  if (inCode && codeLines.length) {
    blocks.push({
      type: 'codeBlock',
      attrs: { language: codeLanguage || null },
      content: [{ type: 'text', text: codeLines.join('\n') }],
    });
  }

  return {
    type: 'doc',
    version: 1,
    content: blocks.length ? blocks : [paragraph('')],
  };
}
