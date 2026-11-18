<template>
  <div class="rich-editor" :class="{ 'rich-editor--disabled': disabled }">
    <div v-if="!disabled" class="rich-toolbar">
      <!-- Paragraph style -->
      <v-menu location="bottom start" :close-on-content-click="true">
        <template #activator="{ props: menuProps }">
          <button type="button" class="re-btn re-btn--label" v-bind="menuProps">
            <v-icon size="15" class="mr-1">mdi-format-paragraph</v-icon>
            {{ currentBlockLabel }}
            <v-icon size="14" class="ml-1">mdi-chevron-down</v-icon>
          </button>
        </template>
        <v-list density="compact" class="re-menu">
          <v-list-item
            v-for="opt in blockOptions"
            :key="opt.label"
            :title="opt.label"
            :class="{ 're-menu-item--active': opt.active() }"
            @click="opt.action()"
          />
        </v-list>
      </v-menu>

      <span class="re-sep" />

      <!-- Improve description -->
      <button
        type="button"
        class="re-btn re-btn--ai"
        :disabled="improving || isEmpty"
        title="Improve description with AI"
        @click="onImprove"
      >
        <v-progress-circular v-if="improving" size="12" width="2" indeterminate class="mr-1" />
        <v-icon v-else size="15" class="mr-1">mdi-creation</v-icon>
        Improve description
      </button>

      <span class="re-sep" />

      <!-- Bold / Italic group -->
      <button type="button" class="re-btn" :class="{ 'is-active': editor?.isActive('bold') }" @click="chain().toggleBold().run()">
        <strong>B</strong>
      </button>
      <v-menu location="bottom start">
        <template #activator="{ props: menuProps }">
          <button type="button" class="re-btn" :class="{ 'is-active': editor?.isActive('italic') }" v-bind="menuProps">
            <em>I</em><v-icon size="12">mdi-chevron-down</v-icon>
          </button>
        </template>
        <v-list density="compact" class="re-menu">
          <v-list-item title="Italic" @click="chain().toggleItalic().run()" />
          <v-list-item title="Underline" @click="chain().toggleUnderline().run()" />
          <v-list-item title="Strikethrough" @click="chain().toggleStrike().run()" />
          <v-list-item title="Subscript" @click="chain().toggleSubscript().run()" />
          <v-list-item title="Superscript" @click="chain().toggleSuperscript().run()" />
        </v-list>
      </v-menu>

      <span class="re-sep" />

      <button type="button" class="re-btn" :class="{ 'is-active': editor?.isActive('bulletList') }" title="Bulleted list" @click="chain().toggleBulletList().run()">
        <v-icon size="16">mdi-format-list-bulleted</v-icon>
      </button>
      <button type="button" class="re-btn" :class="{ 'is-active': editor?.isActive('orderedList') }" title="Numbered list" @click="chain().toggleOrderedList().run()">
        <v-icon size="16">mdi-format-list-numbered</v-icon>
      </button>
      <button type="button" class="re-btn" :class="{ 'is-active': editor?.isActive('taskList') }" title="Task list" @click="chain().toggleTaskList().run()">
        <v-icon size="16">mdi-checkbox-marked-outline</v-icon>
      </button>

      <span class="re-sep" />

      <!-- Text colour -->
      <v-menu location="bottom start">
        <template #activator="{ props: menuProps }">
          <button type="button" class="re-btn re-btn--color" v-bind="menuProps" title="Text color">
            <v-icon size="16">mdi-format-color-text</v-icon>
            <span class="re-color-bar" :style="{ background: textColor }" />
          </button>
        </template>
        <div class="re-popover">
          <div class="re-popover__title">Text color</div>
          <div class="re-swatches">
            <button
              v-for="c in textColors"
              :key="c"
              type="button"
              class="re-swatch"
              :style="{ background: c }"
              :title="c"
              @click="applyTextColor(c)"
            />
          </div>
          <div class="re-popover__title mt-2">Highlight</div>
          <div class="re-swatches">
            <button
              v-for="c in highlightColors"
              :key="c"
              type="button"
              class="re-swatch"
              :style="{ background: c }"
              @click="applyHighlight(c)"
            />
          </div>
          <button type="button" class="re-btn re-btn--block mt-2" @click="clearColors">Remove color</button>
        </div>
      </v-menu>

      <span class="re-sep" />

      <button type="button" class="re-btn" :class="{ 'is-active': editor?.isActive('code') }" title="Inline code" @click="chain().toggleCode().run()">
        <v-icon size="16">mdi-code-tags</v-icon>
      </button>
      <button type="button" class="re-btn" :class="{ 'is-active': editor?.isActive('codeBlock') }" title="Code block" @click="chain().toggleCodeBlock().run()">
        <v-icon size="16">mdi-code-braces-box</v-icon>
      </button>

      <span class="re-sep" />

      <!-- Status lozenge -->
      <v-menu location="bottom start">
        <template #activator="{ props: menuProps }">
          <button type="button" class="re-btn" v-bind="menuProps" title="Status">
            <v-icon size="16">mdi-flag-variant-outline</v-icon>
          </button>
        </template>
        <v-list density="compact" class="re-menu">
          <v-list-item
            v-for="s in statusPresets"
            :key="s.text"
            :title="s.text"
            @click="chain().insertStatus(s).run()"
          />
        </v-list>
      </v-menu>

      <!-- Emoji -->
      <v-menu location="bottom start">
        <template #activator="{ props: menuProps }">
          <button type="button" class="re-btn" v-bind="menuProps" title="Emoji">
            <v-icon size="16">mdi-emoticon-outline</v-icon>
          </button>
        </template>
        <div class="re-popover re-popover--emoji">
          <button
            v-for="e in emojis"
            :key="e.shortName"
            type="button"
            class="re-emoji"
            :title="e.shortName"
            @click="insertEmoji(e)"
          >
            {{ e.text }}
          </button>
        </div>
      </v-menu>

      <!-- Insert (+) -->
      <v-menu location="bottom start">
        <template #activator="{ props: menuProps }">
          <button type="button" class="re-btn" v-bind="menuProps" title="Insert">
            <v-icon size="16">mdi-plus</v-icon>
          </button>
        </template>
        <v-list density="compact" class="re-menu">
          <v-list-item prepend-icon="mdi-table" title="Table" @click="insertTable" />
          <v-list-item prepend-icon="mdi-format-horizontal-line" title="Divider" @click="chain().setHorizontalRule().run()" />
          <v-list-item prepend-icon="mdi-format-quote-close" title="Quote" @click="chain().toggleBlockquote().run()" />
          <v-list-item prepend-icon="mdi-image-outline" title="Image" @click="pickImage" />
          <v-list-item prepend-icon="mdi-link-variant" title="Link" @click="openLinkDialog" />
          <v-list-item prepend-icon="mdi-format-clear" title="Clear formatting" @click="chain().unsetAllMarks().clearNodes().run()" />
        </v-list>
      </v-menu>

      <!-- Link -->
      <button type="button" class="re-btn" :class="{ 'is-active': editor?.isActive('link') }" title="Link (Ctrl+K)" @click="openLinkDialog">
        <v-icon size="16">mdi-link-variant</v-icon>
      </button>

      <span class="re-sep" />

      <button type="button" class="re-btn" :disabled="!editor?.can().undo()" title="Undo (Ctrl+Z)" @click="chain().undo().run()">
        <v-icon size="16">mdi-undo</v-icon>
      </button>
      <button type="button" class="re-btn" :disabled="!editor?.can().redo()" title="Redo (Ctrl+Shift+Z)" @click="chain().redo().run()">
        <v-icon size="16">mdi-redo</v-icon>
      </button>

      <v-menu location="bottom end">
        <template #activator="{ props: menuProps }">
          <button type="button" class="re-btn" v-bind="menuProps" title="More">
            <v-icon size="16">mdi-dots-horizontal</v-icon>
          </button>
        </template>
        <v-list density="compact" class="re-menu">
          <v-list-item prepend-icon="mdi-format-quote-open" title="Quote" @click="chain().toggleBlockquote().run()" />
          <v-list-item prepend-icon="mdi-format-clear" title="Clear formatting" @click="chain().unsetAllMarks().clearNodes().run()" />
          <v-list-item prepend-icon="mdi-eye-outline" title="Preview ADF" @click="showAdf = true" />
        </v-list>
      </v-menu>
    </div>

    <div class="rich-surface">
      <EditorContent :editor="editor" class="rich-content" @keydown.capture="onEditorKeydown" />

      <!-- Slash / mention dropdown -->
      <div
        v-if="menu.open && menu.items.length"
        class="re-dropdown"
        :style="{ top: menu.top + 'px', left: menu.left + 'px' }"
      >
        <div class="re-dropdown__hint">{{ menu.kind === 'slash' ? 'Insert block' : 'Mention someone' }}</div>
        <button
          v-for="(item, idx) in menu.items"
          :key="item.key || item.id"
          type="button"
          class="re-dropdown__item"
          :class="{ 'is-selected': idx === menu.index }"
          @mousedown.prevent="chooseMenu(idx)"
        >
          <v-icon v-if="item.icon" size="15" class="mr-2">{{ item.icon }}</v-icon>
          <span>{{ item.label || item.displayName }}</span>
        </button>
      </div>

      <div v-if="!disabled" class="rich-footer">
        <span class="rich-hint">Type <code>/</code> for commands or <code>@</code> to mention someone.</span>
        <span class="rich-count">{{ wordCount }} words</span>
      </div>
    </div>

    <!-- Link dialog -->
    <v-dialog v-model="linkDialog" max-width="440">
      <v-card class="pa-4">
        <div class="text-subtitle-2 font-weight-bold mb-3">Insert link</div>
        <v-text-field v-model="linkUrl" label="URL" placeholder="https://..." density="compact" autofocus hide-details @keyup.enter="applyLink" />
        <div class="d-flex justify-end ga-2 mt-4">
          <v-btn variant="text" size="small" @click="linkDialog = false">Cancel</v-btn>
          <v-btn color="primary" size="small" variant="flat" @click="applyLink">Apply</v-btn>
        </div>
      </v-card>
    </v-dialog>

    <!-- ADF preview dialog -->
    <v-dialog v-model="showAdf" max-width="640">
      <v-card class="pa-4">
        <div class="text-subtitle-2 font-weight-bold mb-2">ADF payload (what Jira receives)</div>
        <pre class="adf-preview">{{ prettyAdf }}</pre>
      </v-card>
    </v-dialog>

    <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="onFilesPicked" />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Editor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import { TableKit } from '@tiptap/extension-table';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { Mention, Emoji, Status, PendingImage } from '../utils/richExtensions.js';
import { adfToPm, pmToAdf, adfToPlainText, plainTextToAdf } from '../utils/adf.js';
import { improveDescription as improveDescriptionApi, searchJiraUsers } from '../services/apiClient.js';

const props = defineProps({
  modelValue: { type: Object, default: null },
  text: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  parentKey: { type: String, default: '' },
  parentSummary: { type: String, default: '' },
  workType: { type: String, default: '' },
  aiModel: { type: String, default: '' },
});

const emit = defineEmits(['update:modelValue', 'update:text', 'update:images']);

const textColors = ['#172b4d', '#626f86', '#ffffff', '#de350b', '#ff991f', '#00875a', '#0052cc', '#5243aa', '#ff5630'];
const highlightColors = ['#fff3bf', '#d3f1f1', '#e3fcef', '#ffebe6', '#deebff', '#eae6ff', '#f4f5f7'];
const statusPresets = [
  { text: 'TODO', color: 'neutral' },
  { text: 'IN PROGRESS', color: 'blue' },
  { text: 'DONE', color: 'green' },
  { text: 'BLOCKED', color: 'red' },
];
const emojis = [
  { shortName: ':smile:', text: '😄' }, { shortName: ':thumbsup:', text: '👍' },
  { shortName: ':tada:', text: '🎉' }, { shortName: ':rocket:', text: '🚀' },
  { shortName: ':fire:', text: '🔥' }, { shortName: ':warning:', text: '⚠️' },
  { shortName: ':white_check_mark:', text: '✅' }, { shortName: ':x:', text: '❌' },
  { shortName: ':bulb:', text: '💡' }, { shortName: ':eyes:', text: '👀' },
];
const blockOptions = [
  { label: 'Normal text', icon: 'mdi-format-paragraph', action: () => chain().setParagraph().run(), active: () => editor.value?.isActive('paragraph') },
  { label: 'Heading 1', icon: 'mdi-format-header-1', action: () => chain().toggleHeading({ level: 1 }).run(), active: () => editor.value?.isActive('heading', { level: 1 }) },
  { label: 'Heading 2', icon: 'mdi-format-header-2', action: () => chain().toggleHeading({ level: 2 }).run(), active: () => editor.value?.isActive('heading', { level: 2 }) },
  { label: 'Heading 3', icon: 'mdi-format-header-3', action: () => chain().toggleHeading({ level: 3 }).run(), active: () => editor.value?.isActive('heading', { level: 3 }) },
];

const fileInput = ref(null);
const linkDialog = ref(false);
const linkUrl = ref('');
const showAdf = ref(false);
const improving = ref(false);
const improveMessage = ref('');
const wordCount = ref(0);
const pendingImages = new Map();
const imagesPayload = ref([]);

const menu = ref({ open: false, kind: 'slash', top: 0, left: 0, index: 0, from: 0, items: [] });
let mentionTimer = null;

const chain = () => editor.value.chain().focus();

const currentBlockLabel = computed(() => {
  const found = blockOptions.find((opt) => opt.active());
  return found ? found.label : 'Normal text';
});
const textColor = computed(() => editor.value?.getAttributes('textStyle')?.color || '#172b4d');
const isEmpty = computed(() => !editor.value || editor.value.isEmpty);
const prettyAdf = computed(() => JSON.stringify(pmToAdf(editor.value?.getJSON()), null, 2));

const editor = ref(null);

function buildImageAttributes(file, dataUrl) {
  const pendingId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  pendingImages.set(pendingId, { filename: file.name || 'image.png', dataUrl });
  return { src: dataUrl, alt: file.name || 'image.png', pendingId };
}

function insertFiles(files) {
  const list = Array.from(files || []).filter((f) => f.type?.startsWith('image/'));
  if (!list.length) return;
  list.forEach((file) => {
    const reader = new FileReader();
    reader.onload = () => {
      const attrs = buildImageAttributes(file, String(reader.result || ''));
      editor.value?.chain().focus().setImage(attrs).run();
      syncImagesPayload();
    };
    reader.readAsDataURL(file);
  });
}

function syncImagesPayload() {
  const json = editor.value?.getJSON();
  const found = [];
  const walk = (node) => {
    if (!node) return;
    if (node.type === 'image' && node.attrs?.pendingId) {
      const stored = pendingImages.get(node.attrs.pendingId);
      found.push({
        pendingId: node.attrs.pendingId,
        filename: node.attrs.alt || stored?.filename || 'image.png',
        dataUrl: stored?.dataUrl || node.attrs.src,
      });
    }
    (node.content || []).forEach(walk);
  };
  walk(json);
  imagesPayload.value = found;
  emit('update:images', found);
}

function onFilesPicked(event) {
  insertFiles(event.target.files);
  event.target.value = '';
}

function pickImage() {
  fileInput.value?.click();
}

function insertTable() {
  chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
}

function insertEmoji(emoji) {
  chain().insertEmoji({ shortName: emoji.shortName, text: emoji.text }).run();
}

function applyTextColor(color) {
  chain().setColor(color).run();
}

function applyHighlight(color) {
  chain().setHighlight({ color }).run();
}

function clearColors() {
  chain().unsetColor().unsetHighlight().run();
}

function openLinkDialog() {
  linkUrl.value = editor.value?.getAttributes('link')?.href || '';
  linkDialog.value = true;
}

function applyLink() {
  const url = String(linkUrl.value || '').trim();
  if (!url) {
    chain().extendMarkRange('link').unsetLink().run();
  } else {
    chain().extendMarkRange('link').setLink({ href: url }).run();
  }
  linkDialog.value = false;
}

/* ---------------- Slash + mention menus ---------------- */

const slashItems = [
  { key: 'h1', label: 'Heading 1', icon: 'mdi-format-header-1', run: () => chain().toggleHeading({ level: 1 }).run() },
  { key: 'h2', label: 'Heading 2', icon: 'mdi-format-header-2', run: () => chain().toggleHeading({ level: 2 }).run() },
  { key: 'h3', label: 'Heading 3', icon: 'mdi-format-header-3', run: () => chain().toggleHeading({ level: 3 }).run() },
  { key: 'bullet', label: 'Bulleted list', icon: 'mdi-format-list-bulleted', run: () => chain().toggleBulletList().run() },
  { key: 'ordered', label: 'Numbered list', icon: 'mdi-format-list-numbered', run: () => chain().toggleOrderedList().run() },
  { key: 'task', label: 'Task list', icon: 'mdi-checkbox-marked-outline', run: () => chain().toggleTaskList().run() },
  { key: 'quote', label: 'Quote', icon: 'mdi-format-quote-close', run: () => chain().toggleBlockquote().run() },
  { key: 'code', label: 'Code block', icon: 'mdi-code-braces-box', run: () => chain().toggleCodeBlock().run() },
  { key: 'table', label: 'Table', icon: 'mdi-table', run: () => insertTable() },
  { key: 'divider', label: 'Divider', icon: 'mdi-format-horizontal-line', run: () => chain().setHorizontalRule().run() },
  { key: 'image', label: 'Image', icon: 'mdi-image-outline', run: () => pickImage() },
  { key: 'status', label: 'Status', icon: 'mdi-flag-variant-outline', run: () => chain().insertStatus({ text: 'IN PROGRESS', color: 'blue' }).run() },
];

function menuPosition(pos) {
  const view = editor.value?.view;
  const wrapper = view?.dom?.closest('.rich-surface');
  if (!view || !wrapper) return { top: 40, left: 12 };
  const coords = view.coordsAtPos(pos);
  const rect = wrapper.getBoundingClientRect();
  return {
    top: coords.bottom - rect.top + wrapper.scrollTop + 4,
    left: Math.max(8, coords.left - rect.left),
  };
}

function openSlash(from) {
  if (props.disabled) return;
  const pos = menuPosition(from + 1);
  menu.value = { open: true, kind: 'slash', from, index: 0, items: slashItems, ...pos };
}

async function openMention(from) {
  const pos = menuPosition(from + 1);
  menu.value = { open: true, kind: 'mention', from, index: 0, items: [], ...pos };
  await fetchUsers('');
}

async function fetchUsers(query) {
  try {
    const users = await searchJiraUsers(query);
    if (menu.value.kind !== 'mention') return;
    menu.value.items = users.map((u) => ({
      id: u.accountId,
      label: u.displayName,
      displayName: u.displayName,
      avatar: u.avatarUrl,
    }));
    menu.value.index = 0;
  } catch {
    menu.value.items = [];
  }
}

function closeMenu() {
  menu.value.open = false;
  clearTimeout(mentionTimer);
}

function chooseMenu(index) {
  const item = menu.value.items[index];
  if (!item) return;
  const { kind, from } = menu.value;
  closeMenu();
  if (kind === 'slash') {
    chain().deleteRange({ from, to: from + 1 }).run();
    item.run();
  } else {
    chain()
      .insertContentAt(
        { from, to: editor.value.state.selection.from },
        { type: 'mention', attrs: { id: item.id, label: item.label } }
      )
      .insertContent(' ')
      .run();
  }
}

function onEditorKeydown(event) {
  if (menu.value.open) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      menu.value.index = (menu.value.index + 1) % menu.value.items.length;
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      menu.value.index =
        (menu.value.index - 1 + menu.value.items.length) % menu.value.items.length;
      return;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      chooseMenu(menu.value.index);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      return;
    }
  }
}

/* ---------------- AI improve ---------------- */

async function onImprove() {
  if (improving.value || !editor.value) return;
  improving.value = true;
  improveMessage.value = '';
  try {
    const adf = pmToAdf(editor.value.getJSON());
    const result = await improveDescriptionApi({
      adf,
      text: adfToPlainText(adf),
      parentKey: props.parentKey,
      parentSummary: props.parentSummary,
      workType: props.workType,
      model: props.aiModel,
    });
    if (result?.adf) {
      editor.value.commands.setContent(adfToPm(result.adf), { emitUpdate: true });
      improveMessage.value = 'Description improved — Ctrl+Z to undo.';
      setTimeout(() => {
        improveMessage.value = '';
      }, 6000);
    }
  } catch (err) {
    improveMessage.value = err?.message || 'AI could not improve the description.';
  } finally {
    improving.value = false;
  }
}

/* ---------------- Editor wiring ---------------- */

function emitState() {
  if (!editor.value) return;
  const adf = pmToAdf(editor.value.getJSON());
  emit('update:modelValue', adf);
  emit('update:text', editor.value.getText({ blockSeparator: '\n' }));
  wordCount.value = (editor.value.getText().trim().match(/\S+/g) || []).length;
  syncImagesPayload();
}

function initialContent() {
  if (props.modelValue && props.modelValue.type === 'doc') return adfToPm(props.modelValue);
  if (props.text) return adfToPm(plainTextToAdf(props.text));
  return adfToPm(plainTextToAdf(''));
}

editor.value = new Editor({
  content: initialContent(),
  editable: !props.disabled,
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true, linkOnPaste: true },
      codeBlock: { HTMLAttributes: { class: 'je-code-block' } },
    }),
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    Placeholder.configure({ placeholder: 'Describe the objective, scope, acceptance criteria…' }),
    TableKit.configure({ table: { resizable: false } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Subscript,
    Superscript,
    Mention,
    Emoji,
    Status,
    PendingImage.configure({ inline: false, allowBase64: true }),
  ],
  editorProps: {
    attributes: {
      class: 'je-prosemirror',
      'aria-label': 'Scope and description',
    },
    handleTextInput(view, from, to, text) {
      if (text === '/') {
        setTimeout(() => openSlash(from), 0);
      } else if (text === '@') {
        setTimeout(() => openMention(from), 0);
      }
      return false;
    },
    handlePaste(view, event) {
      const files = Array.from(event.clipboardData?.files || []);
      if (files.some((f) => f.type?.startsWith('image/'))) {
        event.preventDefault();
        insertFiles(files);
        return true;
      }
      return false;
    },
    handleDrop(view, event) {
      const files = Array.from(event.dataTransfer?.files || []);
      if (files.some((f) => f.type?.startsWith('image/'))) {
        event.preventDefault();
        insertFiles(files);
        return true;
      }
      return false;
    },
  },
  onUpdate: () => {
    if (menu.value.open && menu.value.kind === 'mention') {
      const { from } = menu.value;
      const cursor = editor.value.state.selection.from;
      const query = editor.value.state.doc.textBetween(from + 1, Math.max(cursor, from + 1), '\n');
      if (/\s{2,}|[\n]/.test(query) || query.length > 40) {
        closeMenu();
      } else {
        clearTimeout(mentionTimer);
        mentionTimer = setTimeout(() => fetchUsers(query.trim()), 250);
      }
    }
    emitState();
  },
  onBlur: () => {
    // let mousedown on the dropdown win before closing
    setTimeout(() => {
      if (!menu.value.open) return;
      closeMenu();
    }, 200);
  },
});

watch(
  () => props.modelValue,
  (value) => {
    if (!editor.value || !value) return;
    const current = JSON.stringify(pmToAdf(editor.value.getJSON()));
    if (JSON.stringify(value) !== current) {
      editor.value.commands.setContent(adfToPm(value), { emitUpdate: false });
    }
  },
  { deep: true }
);

watch(
  () => props.text,
  (value) => {
    if (!editor.value) return;
    if (!props.modelValue && editor.value.isEmpty && value) {
      editor.value.commands.setContent(adfToPm(plainTextToAdf(value)), { emitUpdate: false });
    }
  }
);

watch(
  () => props.disabled,
  (value) => {
    editor.value?.setEditable(!value);
  }
);

onBeforeUnmount(() => {
  clearTimeout(mentionTimer);
  editor.value?.destroy();
});

defineExpose({
  getAdf: () => pmToAdf(editor.value?.getJSON()),
  getImages: () => imagesPayload.value,
  improveMessage,
});
</script>

<style scoped>
.rich-editor {
  border: 1px solid #dfe1e6;
  border-radius: 8px;
  background: #fff;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.rich-editor:focus-within {
  border-color: #4c9aff;
  box-shadow: 0 0 0 1px #4c9aff33;
}
.rich-editor--disabled {
  background: #f7f8f9;
  opacity: 0.85;
}

.rich-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
  padding: 5px 8px;
  border-bottom: 1px solid #ebecf0;
  background: #fafbfc;
  border-radius: 8px 8px 0 0;
}

.re-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  min-width: 28px;
  padding: 0 5px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #44546f;
  font-size: 13px;
  cursor: pointer;
  line-height: 1;
}
.re-btn:hover {
  background: #091e4221;
}
.re-btn.is-active {
  background: #e9f2ff;
  color: #0c66e4;
}
.re-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.re-btn--label {
  gap: 2px;
  padding: 0 8px;
  font-size: 12.5px;
}
.re-btn--ai {
  gap: 4px;
  padding: 0 8px;
  color: #5e4db2;
  font-size: 12.5px;
  font-weight: 500;
}
.re-btn--ai:hover {
  background: #f3f0ff;
}
.re-btn--color {
  position: relative;
  padding-bottom: 6px;
}
.re-color-bar {
  position: absolute;
  bottom: 3px;
  left: 6px;
  right: 6px;
  height: 3px;
  border-radius: 2px;
}
.re-btn--block {
  width: 100%;
  justify-content: flex-start;
  font-size: 12.5px;
}
.re-sep {
  width: 1px;
  height: 18px;
  background: #dfe1e6;
  margin: 0 4px;
}

.rich-surface {
  position: relative;
}

.rich-content {
  min-height: 120px;
}

.rich-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px 6px;
  color: #7a869a;
  font-size: 11.5px;
}
.rich-hint code {
  background: #f1f2f4;
  border-radius: 3px;
  padding: 0 3px;
  font-size: 11px;
}
.rich-count {
  white-space: nowrap;
}

.re-popover {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(9, 30, 66, 0.2);
  padding: 10px;
  min-width: 180px;
}
.re-popover__title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: #7a869a;
  margin-bottom: 6px;
}
.re-popover--emoji {
  display: grid;
  grid-template-columns: repeat(5, 32px);
  gap: 4px;
  min-width: 0;
}
.re-swatches {
  display: grid;
  grid-template-columns: repeat(9, 18px);
  gap: 4px;
}
.re-swatch {
  width: 18px;
  height: 18px;
  border-radius: 3px;
  border: 1px solid rgba(9, 30, 66, 0.15);
  cursor: pointer;
}
.re-swatch:hover {
  transform: scale(1.12);
}
.re-emoji {
  width: 32px;
  height: 32px;
  font-size: 18px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
}
.re-emoji:hover {
  background: #f1f2f4;
}

.re-dropdown {
  position: absolute;
  z-index: 20;
  min-width: 220px;
  max-height: 260px;
  overflow-y: auto;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(9, 30, 66, 0.24);
  padding: 6px;
}
.re-dropdown__hint {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: #7a869a;
  padding: 4px 8px 6px;
}
.re-dropdown__item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 6px 8px;
  border: none;
  background: transparent;
  border-radius: 4px;
  font-size: 13px;
  color: #172b4d;
  text-align: left;
  cursor: pointer;
}
.re-dropdown__item.is-selected {
  background: #e9f2ff;
}

.adf-preview {
  max-height: 420px;
  overflow: auto;
  font-size: 11px;
  background: #f7f8f9;
  border-radius: 6px;
  padding: 10px;
}
</style>

<style>
/* Unscoped content styles for ProseMirror output */
.je-prosemirror {
  padding: 10px 12px;
  min-height: 100px;
  outline: none;
  color: #172b4d;
  font-size: 14px;
  line-height: 1.55;
}
.je-prosemirror > * + * {
  margin-top: 6px;
}
.je-prosemirror p {
  margin: 0;
}
.je-prosemirror h1 {
  font-size: 22px;
  font-weight: 700;
  margin: 10px 0 4px;
}
.je-prosemirror h2 {
  font-size: 18px;
  font-weight: 700;
  margin: 8px 0 4px;
}
.je-prosemirror h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 6px 0 4px;
}
.je-prosemirror ul,
.je-prosemirror ol {
  padding-left: 22px;
  margin: 2px 0;
}
.je-prosemirror ul[data-type='taskList'] {
  list-style: none;
  padding-left: 4px;
}
.je-prosemirror ul[data-type='taskList'] li {
  display: flex;
  gap: 6px;
  align-items: flex-start;
}
.je-prosemirror ul[data-type='taskList'] li > label {
  margin-top: 1px;
}
.je-prosemirror blockquote {
  border-left: 3px solid #dfe1e6;
  padding-left: 10px;
  color: #44546f;
  margin: 4px 0;
}
.je-prosemirror pre {
  background: #f4f5f7;
  border-radius: 6px;
  padding: 10px 12px;
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 12.5px;
  overflow-x: auto;
}
.je-prosemirror code {
  background: #f1f2f4;
  border-radius: 3px;
  padding: 0 4px;
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 12.5px;
}
.je-prosemirror a {
  color: #0c66e4;
  text-decoration: underline;
}
.je-prosemirror img {
  max-width: 100%;
  border-radius: 6px;
  border: 1px solid #ebecf0;
}
.je-prosemirror table {
  border-collapse: collapse;
  width: 100%;
  margin: 4px 0;
}
.je-prosemirror th,
.je-prosemirror td {
  border: 1px solid #dfe1e6;
  padding: 5px 8px;
  vertical-align: top;
  min-width: 60px;
}
.je-prosemirror th {
  background: #f7f8f9;
  font-weight: 600;
}
.je-prosemirror hr {
  border: none;
  border-top: 1px solid #dfe1e6;
  margin: 10px 0;
}
.je-prosemirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  color: #8993a4;
  float: left;
  height: 0;
  pointer-events: none;
}
.je-mention {
  background: #deebff;
  border-radius: 10px;
  padding: 0 4px;
  color: #0c66e4;
  font-weight: 500;
}
.je-emoji {
  font-size: 15px;
}
.je-status {
  display: inline-block;
  border-radius: 3px;
  padding: 0 5px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: #172b4d;
  background: #dfe1e6;
}
.je-status--blue {
  background: #deebff;
  color: #0747a6;
}
.je-status--green {
  background: #e3fcef;
  color: #006644;
}
.je-status--red {
  background: #ffebe6;
  color: #bf2600;
}
</style>
