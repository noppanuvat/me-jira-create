<template>
  <v-card class="linear-card mb-6 pa-6">
    <!-- Minimal Section Header (No dark bar, no divider) -->
    <div class="d-flex align-center justify-space-between mb-5">
      <div class="d-flex align-center">
        <span class="linear-step-badge mr-3">1</span>
        <div>
          <div class="text-subtitle-1 font-weight-bold text-grey-darken-4">
            Jira Issue &amp; Work Type
          </div>
          <div class="text-caption text-medium-emphasis">
            Select parent issue and work type to auto-match the documentation template
          </div>
        </div>
      </div>

      <v-chip
        v-if="lockedSubtask"
        color="success"
        variant="tonal"
        size="small"
        class="font-weight-medium"
        prepend-icon="mdi-check-circle-outline"
      >
        {{ lockedSubtask.key }} Created
      </v-chip>
    </div>

    <div>
      <v-alert
        v-if="lockedSubtask"
        type="info"
        variant="tonal"
        density="compact"
        rounded="lg"
        class="mb-5 text-body-2"
        icon="mdi-lock-check-outline"
      >
        Subtask <strong>{{ lockedSubtask.key }}</strong> is already created. Retrying will only
        create and link the Confluence page without duplicating the subtask.
      </v-alert>

      <!-- Parent Issue Autocomplete -->
      <v-autocomplete
        :model-value="selectedParentIssue"
        :items="parentIssues"
        :loading="loadingIssues"
        item-title="displayLabel"
        item-value="key"
        return-object
        no-filter
        clearable
        :disabled="Boolean(lockedSubtask)"
        label="Parent Jira Issue"
        placeholder="Search by issue key (e.g. PAY-101) or summary..."
        prepend-inner-icon="mdi-magnify"
        class="mb-3"
        @update:search="onSearchInput"
        @update:model-value="onSelectParentIssue"
      >
        <template #item="{ props, item }">
          <v-list-item v-bind="props" :title="undefined" :subtitle="undefined" class="py-2">
            <template #prepend>
              <v-chip size="x-small" color="primary" variant="tonal" class="mr-2 font-weight-bold">
                {{ item.raw.key }}
              </v-chip>
            </template>
            <v-list-item-title class="text-body-2 font-weight-medium">
              {{ item.raw.summary }}
            </v-list-item-title>
            <v-list-item-subtitle class="text-caption">
              {{ item.raw.issueType }} · {{ item.raw.status }}
            </v-list-item-subtitle>
          </v-list-item>
        </template>
      </v-autocomplete>

      <!-- Fixed Jira Work Item Attributes (Squad & Team) -->
      <div class="d-flex align-center flex-wrap ga-2 mb-5">
        <span class="text-caption font-weight-bold text-uppercase text-medium-emphasis mr-1">
          Jira Attributes:
        </span>
        <v-chip
          size="small"
          color="primary"
          variant="tonal"
          class="font-weight-medium"
          prepend-icon="mdi-account-group-outline"
        >
          Squad: SQ16
        </v-chip>
        <v-chip
          size="small"
          color="primary"
          variant="tonal"
          class="font-weight-medium"
          prepend-icon="mdi-shield-account-outline"
        >
          Team: UCHOOSE
        </v-chip>
      </div>

      <!-- Work Type Header with Compact Confluence Toggle -->
      <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-2">
        <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis">
          Work Type &amp; Documentation Template
        </div>
        <div class="d-flex align-center">
          <span class="text-caption font-weight-medium text-medium-emphasis mr-2">
            Confluence
          </span>
          <v-switch
            :model-value="createConfluence"
            color="primary"
            density="compact"
            hide-details
            inset
            class="linear-compact-switch"
            @update:model-value="$emit('update:createConfluence', Boolean($event))"
          />
        </div>
      </div>

      <!-- Work Type Selection (Auto-switches Template, collapses when Confluence is off) -->
      <v-expand-transition>
        <div v-if="createConfluence">
          <v-row dense class="mb-5">
            <v-col
              v-for="option in workTypeOptions"
              :key="option.value"
              cols="12"
              sm="6"
            >
              <v-sheet
                class="linear-choice-card pa-3"
                :class="{ 'linear-choice-card--active': workType === option.value }"
                @click="onSelectWorkType(option.value)"
              >
                <div class="d-flex align-center">
                  <div
                    class="d-flex align-center justify-center rounded-lg mr-3"
                    style="width: 34px; height: 34px; background: rgba(94, 106, 210, 0.08)"
                  >
                    <v-icon :icon="option.icon" color="primary" size="18" />
                  </div>
                  <div class="flex-grow-1">
                    <div class="text-body-2 font-weight-bold text-grey-darken-4">
                      {{ option.title }}
                    </div>
                    <div class="text-caption text-medium-emphasis">
                      {{ option.subtitle }}
                    </div>
                  </div>
                  <v-icon
                    v-if="workType === option.value"
                    color="primary"
                    size="18"
                    icon="mdi-check-circle"
                  />
                </div>
              </v-sheet>
            </v-col>
          </v-row>
        </div>
      </v-expand-transition>

      <!-- Subtask Summary -->
      <v-text-field
        :model-value="subtaskSummary"
        :disabled="Boolean(lockedSubtask)"
        label="Subtask Summary"
        placeholder="e.g. [API] Create QR Generation Endpoint"
        class="mb-2"
        @update:model-value="onSubtaskInput"
      >
        <template #append-inner>
          <v-btn
            v-if="!lockedSubtask"
            size="x-small"
            variant="tonal"
            color="primary"
            class="linear-btn"
            @click="$emit('apply-prefix')"
          >
            {{ currentPrefix }}
          </v-btn>
        </template>
      </v-text-field>

      <!-- AI name suggestions (debounced, click to apply only) -->
      <div
        v-if="suggestionsLoading"
        class="text-caption text-medium-emphasis mb-3 d-flex align-center"
      >
        <v-progress-circular
          size="12"
          width="2"
          indeterminate
          color="primary"
          class="mr-2"
        />
        AI is suggesting names...
      </div>
      <div
        v-else-if="suggestions.length"
        class="mb-3 d-flex flex-wrap align-center ga-1"
      >
        <span class="text-caption text-medium-emphasis mr-1">
          ✨ AI suggestions (click to apply):
        </span>
        <v-chip
          v-for="suggestion in suggestions"
          :key="suggestion"
          size="small"
          variant="tonal"
          color="secondary"
          class="cursor-pointer"
          @click="applySuggestion(suggestion)"
        >
          {{ suggestion }}
        </v-chip>
      </div>
      <div v-else-if="suggestionError" class="text-caption text-error mb-3">
        {{ suggestionError }}
      </div>

      <!-- Subtask Description -->
      <v-textarea
        :model-value="subtaskDescription"
        :disabled="Boolean(lockedSubtask)"
        label="Scope &amp; Description"
        placeholder="Describe objective, acceptance criteria, or key technical context..."
        rows="3"
        auto-grow
        hide-details
        @update:model-value="$emit('update:subtaskDescription', $event)"
      />
    </div>
  </v-card>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { WORK_TYPE_OPTIONS } from '../utils/templateDefinitions.js';
import { suggestSubtaskNames } from '../services/apiClient.js';

const props = defineProps({
  parentIssues: {
    type: Array,
    default: () => [],
  },
  loadingIssues: {
    type: Boolean,
    default: false,
  },
  selectedParentIssue: {
    type: Object,
    default: null,
  },
  createConfluence: {
    type: Boolean,
    default: true,
  },
  workType: {
    type: String,
    default: 'API_DEVELOPMENT',
  },
  subtaskSummary: {
    type: String,
    default: '',
  },
  subtaskDescription: {
    type: String,
    default: '',
  },
  lockedSubtask: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits([
  'search-issues',
  'update:selectedParentIssue',
  'update:createConfluence',
  'update:workType',
  'update:subtaskSummary',
  'update:subtaskDescription',
  'apply-prefix',
]);

const workTypeOptions = WORK_TYPE_OPTIONS;

const currentPrefix = computed(() => {
  const found = workTypeOptions.find((o) => o.value === props.workType);
  return found ? found.prefix : '[API]';
});

let searchTimer = null;
function onSearchInput(val) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    emit('search-issues', val || '');
  }, 250);
}

function onSelectParentIssue(issue) {
  emit('update:selectedParentIssue', issue);
}

function onSelectWorkType(newType) {
  emit('update:workType', newType);
}

// AI subtask name suggestions (debounced 3s, click to apply only)
const SUGGEST_DEBOUNCE_MS = 3000;
const suggestions = ref([]);
const suggestionsLoading = ref(false);
const suggestionError = ref('');
const lastSuggestedText = ref('');
const latestDraft = ref(props.subtaskSummary || '');
let suggestTimer = null;

function meaningfulLength(value) {
  return String(value || '')
    .replace(/^(\[[^\]]+\]\s*)+/, '')
    .trim().length;
}

function clearSuggestTimer() {
  if (suggestTimer) {
    clearTimeout(suggestTimer);
    suggestTimer = null;
  }
}

function onSubtaskInput(value) {
  latestDraft.value = value;
  emit('update:subtaskSummary', value);
  clearSuggestTimer();

  const text = String(value || '').trim();
  if (text !== lastSuggestedText.value) {
    suggestions.value = [];
    suggestionError.value = '';
  }

  if (props.lockedSubtask) return;
  if (text === lastSuggestedText.value) return;
  if (meaningfulLength(text) < 3) return;

  suggestTimer = setTimeout(() => {
    suggestTimer = null;
    fetchSuggestions(text);
  }, SUGGEST_DEBOUNCE_MS);
}

async function fetchSuggestions(text) {
  if (props.lockedSubtask) return;
  suggestionsLoading.value = true;
  suggestionError.value = '';

  try {
    const data = await suggestSubtaskNames({
      parentKey: props.selectedParentIssue?.key || '',
      parentSummary: props.selectedParentIssue?.summary || '',
      parentDescription: '',
      draftName: text,
      workType: props.workType,
    });

    // Discard stale responses if the user kept typing.
    if (String(latestDraft.value || '').trim() !== text) return;

    lastSuggestedText.value = text;
    suggestions.value = Array.isArray(data?.suggestions) ? data.suggestions : [];
  } catch (err) {
    if (String(latestDraft.value || '').trim() === text) {
      suggestionError.value = err.message || 'Failed to get AI suggestions.';
    }
  } finally {
    suggestionsLoading.value = false;
  }
}

function applySuggestion(suggestion) {
  clearSuggestTimer();
  lastSuggestedText.value = suggestion;
  suggestions.value = [];
  suggestionError.value = '';
  latestDraft.value = suggestion;
  emit('update:subtaskSummary', suggestion);
}

watch(
  () => props.subtaskSummary,
  (value) => {
    latestDraft.value = value;
    const text = String(value || '').trim();
    if (text !== lastSuggestedText.value) {
      suggestions.value = [];
      suggestionError.value = '';
    }
  }
);

onBeforeUnmount(() => {
  clearSuggestTimer();
});
</script>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}
.border-primary {
  border-color: #0052cc !important;
  border-width: 2px !important;
}
.linear-compact-switch {
  transform: scale(0.76);
  transform-origin: right center;
  margin-right: -4px;
}
</style>
