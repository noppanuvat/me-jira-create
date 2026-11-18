import { Node, mergeAttributes } from '@tiptap/core';
import Image from '@tiptap/extension-image';

/** Inline @mention (ADF: mention node). */
export const Mention = Node.create({
  name: 'mention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      id: { default: '' },
      label: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-mention]',
        getAttrs: (el) => ({
          id: el.getAttribute('data-mention') || '',
          label: el.getAttribute('data-label') || el.textContent.replace(/^@/, ''),
        }),
      },
    ];
  },

  renderHTML({ node }) {
    return [
      'span',
      mergeAttributes({
        'data-mention': node.attrs.id,
        'data-label': node.attrs.label,
        class: 'je-mention',
      }),
      `@${node.attrs.label}`,
    ];
  },

  addCommands() {
    return {
      insertMention:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});

/** Inline emoji (ADF: emoji node). */
export const Emoji = Node.create({
  name: 'emoji',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      shortName: { default: '' },
      id: { default: '' },
      text: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-emoji]' }];
  },

  renderHTML({ node }) {
    return [
      'span',
      mergeAttributes({ 'data-emoji': node.attrs.shortName, class: 'je-emoji' }),
      node.attrs.text || '',
    ];
  },

  addCommands() {
    return {
      insertEmoji:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});

/** Inline status lozenge (ADF: status node). */
export const Status = Node.create({
  name: 'status',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      text: { default: 'TODO' },
      color: { default: 'neutral' },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-status]' }];
  },

  renderHTML({ node }) {
    return [
      'span',
      mergeAttributes({
        'data-status': node.attrs.text,
        'data-color': node.attrs.color,
        class: `je-status je-status--${node.attrs.color}`,
      }),
      node.attrs.text,
    ];
  },

  addCommands() {
    return {
      insertStatus:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});

/** Image node that also tracks pending uploads (data URLs not yet on Jira). */
export const PendingImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      pendingId: { default: null, renderHTML: () => ({}) },
    };
  },
});
