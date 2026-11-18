/**
 * Atlassian Document Format (ADF) <-> TipTap/ProseMirror JSON conversion.
 *
 * ADF is the canonical storage format for the Scope & Description field so the
 * editor can round-trip formatting (headings, lists, tables, colors, mentions,
 * media, ...) exactly like the Jira Cloud editor.
 */

let localIdSeq = 0;
function nextLocalId() {
  localIdSeq += 1;
  return `local-${Date.now().toString(36)}-${localIdSeq.toString(36)}`;
}

export function createEmptyAdf() {
  return {
    type: 'doc',
    version: 1,
    content: [{ type: 'paragraph', content: [] }],
  };
}

function paragraph(text = '') {
  return text
    ? { type: 'paragraph', content: [{ type: 'text', text }] }
    : { type: 'paragraph', content: [] };
}

/* ------------------------------------------------------------------ */
/* ProseMirror -> ADF                                                  */
/* ------------------------------------------------------------------ */

function marksToAdf(marks = []) {
  const out = [];
  for (const mark of marks) {
    if (!mark || !mark.type) continue;
    switch (mark.type) {
      case 'bold':
        out.push({ type: 'strong' });
        break;
      case 'italic':
        out.push({ type: 'em' });
        break;
      case 'strike':
        out.push({ type: 'strike' });
        break;
      case 'underline':
        out.push({ type: 'underline' });
        break;
      case 'code':
        out.push({ type: 'code' });
        break;
      case 'link':
        if (mark.attrs?.href) {
          out.push({ type: 'link', attrs: { href: mark.attrs.href } });
        }
        break;
      case 'textStyle':
        if (mark.attrs?.color) {
          out.push({ type: 'textColor', attrs: { color: mark.attrs.color } });
        }
        break;
      case 'highlight':
        out.push({
          type: 'backgroundColor',
          attrs: { color: mark.attrs?.color || '#fff3bf' },
        });
        break;
      default:
        break;
    }
  }
  return out;
}

function inlineToAdf(node) {
  if (!node) return null;
  if (node.type === 'text') {
    if (!node.text) return null;
    const marks = marksToAdf(node.marks);
    const out = { type: 'text', text: node.text };
    if (marks.length) out.marks = marks;
    return out;
  }
  if (node.type === 'hardBreak') return { type: 'hardBreak' };
  if (node.type === 'mention') {
    return {
      type: 'mention',
      attrs: {
        id: node.attrs?.id || '',
        text: `@${node.attrs?.label || node.attrs?.text || ''}`,
      },
    };
  }
  if (node.type === 'emoji') {
    return {
      type: 'emoji',
      attrs: {
        shortName: node.attrs?.shortName || '',
        id: node.attrs?.id || '',
        text: node.attrs?.text || node.attrs?.shortName || '',
      },
    };
  }
  if (node.type === 'status') {
    return {
      type: 'status',
      attrs: {
        text: node.attrs?.text || 'TODO',
        color: node.attrs?.color || 'neutral',
      },
    };
  }
  if (node.type === 'image') {
    // Images are block nodes in the editor; handled by blockToAdf.
    return null;
  }
  return null;
}

function inlineContent(nodes = []) {
  return nodes.map(inlineToAdf).filter(Boolean);
}

function blockToAdf(node) {
  if (!node) return [];

  switch (node.type) {
    case 'paragraph':
      return [{ type: 'paragraph', content: inlineContent(node.content) }];

    case 'heading':
      return [
        {
          type: 'heading',
          attrs: { level: Math.min(6, Math.max(1, node.attrs?.level || 2)) },
          content: inlineContent(node.content),
        },
      ];

    case 'bulletList':
      return [
        {
          type: 'bulletList',
          content: (node.content || []).flatMap(blockToAdf),
        },
      ];

    case 'orderedList':
      return [
        {
          type: 'orderedList',
          content: (node.content || []).flatMap(blockToAdf),
        },
      ];

    case 'listItem':
      return [
        {
          type: 'listItem',
          content: (node.content || []).flatMap(blockToAdf),
        },
      ];

    case 'taskList':
      return [
        {
          type: 'taskList',
          attrs: { localId: nextLocalId() },
          content: (node.content || []).flatMap(blockToAdf),
        },
      ];

    case 'taskItem':
      return [
        {
          type: 'taskItem',
          attrs: {
            localId: nextLocalId(),
            state: node.attrs?.checked ? 'DONE' : 'TODO',
          },
          content: (node.content || []).flatMap(blockToAdf),
        },
      ];

    case 'blockquote':
      return [
        {
          type: 'blockquote',
          content: (node.content || []).flatMap(blockToAdf),
        },
      ];

    case 'codeBlock':
      return [
        {
          type: 'codeBlock',
          attrs: { language: node.attrs?.language || null },
          content: node.textContent
            ? [{ type: 'text', text: node.textContent }]
            : [],
        },
      ];

    case 'horizontalRule':
      return [{ type: 'rule' }];

    case 'image': {
      const alt = node.attrs?.alt || node.attrs?.title || 'image';
      const pendingId = node.attrs?.pendingId || '';
      return [
        {
          type: 'mediaSingle',
          attrs: { layout: 'center' },
          content: [
            {
              type: 'media',
              attrs: {
                type: 'file',
                id: pendingId || node.attrs?.src || '',
                collection: '',
                alt,
              },
            },
          ],
        },
      ];
    }

    case 'table': {
      const rows = (node.content || []).flatMap(blockToAdf);
      return [
        {
          type: 'table',
          attrs: { isNumberColumnEnabled: false, layout: 'default' },
          content: rows,
        },
      ];
    }

    case 'tableRow':
      return [{ type: 'tableRow', content: (node.content || []).flatMap(blockToAdf) }];

    case 'tableHeader':
    case 'tableCell': {
      const type = node.type === 'tableHeader' ? 'tableHeader' : 'tableCell';
      return [
        {
          type,
          attrs: {
            colspan: node.attrs?.colspan || 1,
            rowspan: node.attrs?.rowspan || 1,
          },
          content:
            (node.content || []).flatMap(blockToAdf).length > 0
              ? (node.content || []).flatMap(blockToAdf)
              : [paragraph('')],
        },
      ];
    }

    case 'doc':
      return (node.content || []).flatMap(blockToAdf);

    default:
      if (node.content) return (node.content || []).flatMap(blockToAdf);
      if (node.text) return [paragraph(node.text)];
      return [];
  }
}

export function pmToAdf(pmDoc) {
  const content = blockToAdf(pmDoc || { type: 'doc', content: [] });
  return {
    type: 'doc',
    version: 1,
    content: content.length ? content : [paragraph('')],
  };
}

/* ------------------------------------------------------------------ */
/* ADF -> ProseMirror                                                  */
/* ------------------------------------------------------------------ */

function adfMarksToPm(marks = []) {
  const out = [];
  for (const mark of marks) {
    switch (mark.type) {
      case 'strong':
        out.push({ type: 'bold' });
        break;
      case 'em':
        out.push({ type: 'italic' });
        break;
      case 'strike':
        out.push({ type: 'strike' });
        break;
      case 'underline':
        out.push({ type: 'underline' });
        break;
      case 'code':
        out.push({ type: 'code' });
        break;
      case 'link':
        out.push({ type: 'link', attrs: { href: mark.attrs?.href || '' } });
        break;
      case 'textColor':
        out.push({
          type: 'textStyle',
          attrs: { color: mark.attrs?.color || null },
        });
        break;
      case 'backgroundColor':
        out.push({
          type: 'highlight',
          attrs: { color: mark.attrs?.color || '#fff3bf' },
        });
        break;
      default:
        break;
    }
  }
  return out;
}

function inlineToPm(node) {
  if (!node) return null;
  switch (node.type) {
    case 'text': {
      const out = { type: 'text', text: node.text ?? '' };
      const marks = adfMarksToPm(node.marks);
      if (marks.length) out.marks = marks;
      return out;
    }
    case 'hardBreak':
      return { type: 'hardBreak' };
    case 'mention':
      return {
        type: 'mention',
        attrs: {
          id: node.attrs?.id || '',
          label: String(node.attrs?.text || '').replace(/^@/, ''),
        },
      };
    case 'emoji':
      return {
        type: 'emoji',
        attrs: {
          shortName: node.attrs?.shortName || '',
          id: node.attrs?.id || '',
          text: node.attrs?.text || '',
        },
      };
    case 'status':
      return {
        type: 'status',
        attrs: {
          text: node.attrs?.text || 'TODO',
          color: node.attrs?.color || 'neutral',
        },
      };
    default:
      return null;
  }
}

function adfNodeToPm(node) {
  if (!node) return [];
  switch (node.type) {
    case 'paragraph':
      return [
        {
          type: 'paragraph',
          content: (node.content || []).map(inlineToPm).filter(Boolean),
        },
      ];
    case 'heading':
      return [
        {
          type: 'heading',
          attrs: { level: Math.min(6, Math.max(1, node.attrs?.level || 2)) },
          content: (node.content || []).map(inlineToPm).filter(Boolean),
        },
      ];
    case 'bulletList':
    case 'orderedList':
      return [
        {
          type: node.type,
          content: (node.content || []).flatMap(adfNodeToPm),
        },
      ];
    case 'listItem':
      return [
        {
          type: 'listItem',
          content: (node.content || []).flatMap(adfNodeToPm),
        },
      ];
    case 'taskList':
      return [
        {
          type: 'taskList',
          content: (node.content || []).flatMap(adfNodeToPm),
        },
      ];
    case 'taskItem':
      return [
        {
          type: 'taskItem',
          attrs: { checked: node.attrs?.state === 'DONE' },
          content: (node.content || []).flatMap(adfNodeToPm),
        },
      ];
    case 'blockquote':
      return [
        {
          type: 'blockquote',
          content: (node.content || []).flatMap(adfNodeToPm),
        },
      ];
    case 'codeBlock':
      return [
        {
          type: 'codeBlock',
          attrs: { language: node.attrs?.language || null },
          content: (node.content || [])
            .map((child) => (child.type === 'text' ? { type: 'text', text: child.text } : null))
            .filter(Boolean),
        },
      ];
    case 'rule':
      return [{ type: 'horizontalRule' }];
    case 'mediaSingle': {
      const media = (node.content || []).find((child) => child.type === 'media');
      const alt = media?.attrs?.alt || 'image';
      return [paragraph(`[image: ${alt}]`)];
    }
    case 'table':
      return [
        {
          type: 'table',
          content: (node.content || []).flatMap(adfNodeToPm),
        },
      ];
    case 'tableRow':
      return [
        {
          type: 'tableRow',
          content: (node.content || []).flatMap(adfNodeToPm),
        },
      ];
    case 'tableHeader':
    case 'tableCell':
      return [
        {
          type: node.type === 'tableHeader' ? 'tableHeader' : 'tableCell',
          attrs: {
            colspan: node.attrs?.colspan || 1,
            rowspan: node.attrs?.rowspan || 1,
          },
          content:
            (node.content || []).flatMap(adfNodeToPm).length > 0
              ? (node.content || []).flatMap(adfNodeToPm)
              : [paragraph('')],
        },
      ];
    default:
      if (node.content) return (node.content || []).flatMap(adfNodeToPm);
      return [];
  }
}

export function adfToPm(adf) {
  if (!adf || adf.type !== 'doc' || !Array.isArray(adf.content)) {
    return { type: 'doc', content: [paragraph('')] };
  }
  const content = adfNodeToPm(adf);
  return {
    type: 'doc',
    content: content.length ? content : [paragraph('')],
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function adfToPlainText(adf) {
  const lines = [];

  const walkInline = (node) => {
    if (!node) return '';
    if (node.type === 'text') return node.text || '';
    if (node.type === 'hardBreak') return '\n';
    if (node.type === 'mention') return node.attrs?.text || '';
    if (node.type === 'emoji') return node.attrs?.text || node.attrs?.shortName || '';
    if (node.type === 'status') return node.attrs?.text || '';
    return (node.content || []).map(walkInline).join('');
  };

  const walkBlock = (node, depth = 0) => {
    if (!node) return;
    const pad = '  '.repeat(depth);
    switch (node.type) {
      case 'paragraph':
        lines.push(pad + (node.content || []).map(walkInline).join(''));
        break;
      case 'heading':
        lines.push(pad + (node.content || []).map(walkInline).join(''));
        break;
      case 'bulletList':
      case 'orderedList':
      case 'taskList':
        (node.content || []).forEach((item) => {
          const firstParagraph = (item.content || []).find((c) => c.type === 'paragraph');
          const marker = node.type === 'orderedList' ? '1. ' : '- ';
          lines.push(
            pad + marker + ((firstParagraph?.content || []).map(walkInline).join('') || '')
          );
          (item.content || [])
            .filter((c) => c.type !== 'paragraph')
            .forEach((c) => walkBlock(c, depth + 1));
        });
        break;
      case 'codeBlock':
        lines.push(pad + (node.content || []).map((c) => c.text || '').join(''));
        break;
      case 'blockquote':
        (node.content || []).forEach((c) => walkBlock(c, depth));
        break;
      case 'rule':
        lines.push('');
        break;
      case 'mediaSingle': {
        const media = (node.content || []).find((c) => c.type === 'media');
        lines.push(pad + `[image: ${media?.attrs?.alt || 'image'}]`);
        break;
      }
      case 'table':
        (node.content || []).forEach((row) => {
          const cells = (row.content || []).map((cell) =>
            (cell.content || [])
              .map((p) => (p.content || []).map(walkInline).join(''))
              .join(' ')
          );
          lines.push(pad + cells.join(' | '));
        });
        break;
      case 'doc':
        (node.content || []).forEach((c) => walkBlock(c, depth));
        break;
      default:
        if (node.content) (node.content || []).forEach((c) => walkBlock(c, depth));
        break;
    }
  };

  walkBlock(adf);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function plainTextToAdf(text = '') {
  const lines = String(text || '').split(/\r?\n/);
  const content = lines.map((line) => paragraph(line));
  return {
    type: 'doc',
    version: 1,
    content: content.length ? content : [paragraph('')],
  };
}

/** Replace pending media nodes with visible placeholder paragraphs before create. */
export function adfWithImagePlaceholders(adf) {
  const placeholders = [];
  const walk = (node) => {
    if (!node) return node;
    if (node.type === 'mediaSingle') {
      const media = (node.content || []).find((c) => c.type === 'media');
      const id = media?.attrs?.id || '';
      if (String(id).startsWith('pending-')) {
        const alt = media?.attrs?.alt || 'image';
        const marker = `[[image:${id}:${alt}]]`;
        placeholders.push({ id, marker });
        return { type: 'paragraph', content: [{ type: 'text', text: marker }] };
      }
      return node;
    }
    if (Array.isArray(node.content)) {
      node.content = node.content.map(walk);
    }
    return node;
  };
  return { adf: walk(structuredCloneSafe(adf)), placeholders };
}

/** Swap placeholder paragraphs back to real mediaSingle nodes. */
export function adfWithResolvedImages(adf, replacements = []) {
  const map = new Map(replacements.map((r) => [r.marker, r.mediaId]));
  const walk = (node) => {
    if (!node) return node;
    if (node.type === 'paragraph') {
      const text = (node.content || [])
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('');
      if (map.has(text)) {
        const mediaId = map.get(text);
        const alt = text.split(':')[2]?.replace(/\]\]$/, '') || 'image';
        return {
          type: 'mediaSingle',
          attrs: { layout: 'center' },
          content: [
            {
              type: 'media',
              attrs: { type: 'file', id: mediaId, collection: '', alt },
            },
          ],
        };
      }
      return node;
    }
    if (Array.isArray(node.content)) node.content = node.content.map(walk);
    return node;
  };
  return walk(structuredCloneSafe(adf));
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      /* fall through */
    }
  }
  return JSON.parse(JSON.stringify(value));
}

export { nextLocalId };
