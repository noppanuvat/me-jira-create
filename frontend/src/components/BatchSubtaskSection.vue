<template>
  <v-row>
    <!-- Left Column: Parent Issue & Subtask Checklist -->
    <v-col cols="12" md="7" class="pr-md-4">
      <v-card class="linear-card mb-6 pa-6">
        <div class="d-flex align-center justify-space-between mb-5">
          <div class="d-flex align-center">
            <span class="linear-step-badge mr-3">1</span>
            <div>
              <div class="text-subtitle-1 font-weight-bold text-grey-darken-4">
                Parent Jira Issue
              </div>
              <div class="text-caption text-medium-emphasis">
                Select the parent story/task to create multiple subtasks under
              </div>
            </div>
          </div>

          <v-chip
            v-if="selectedParentIssue?.key"
            color="primary"
            variant="tonal"
            size="small"
            class="font-weight-medium"
          >
            {{ selectedParentIssue.key }}
          </v-chip>
        </div>

        <v-autocomplete
          :model-value="selectedParentIssue"
          :items="parentIssues"
          :loading="loadingIssues"
          item-title="displayLabel"
          item-value="key"
          return-object
          no-filter
          clearable
          :disabled="submitting"
          label="Parent Jira Issue"
          placeholder="Search by issue key (e.g. ONEKSGA-101) or summary..."
          prepend-inner-icon="mdi-magnify"
          class="mb-3"
          @update:search="onSearchInput"
          @update:model-value="$emit('update:selectedParentIssue', $event)"
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

        <!-- Fixed Jira Work Item Attributes -->
        <div class="d-flex align-center flex-wrap ga-2">
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
      </v-card>

      <!-- Step 2: Subtask Checklist -->
      <v-card class="linear-card pa-6">
        <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-4">
          <div class="d-flex align-center">
            <span class="linear-step-badge mr-3">2</span>
            <div>
              <div class="text-subtitle-1 font-weight-bold text-grey-darken-4">
                Subtasks to Create
              </div>
              <div class="text-caption text-medium-emphasis">
                Check, edit, or add subtasks to create in one click
              </div>
            </div>
          </div>

          <div class="d-flex align-center ga-2">
            <v-btn
              size="small"
              variant="tonal"
              color="grey-darken-2"
              :disabled="submitting"
              @click="toggleSelectAll"
            >
              {{ allUncreatedSelected ? 'Deselect All' : 'Select All' }}
            </v-btn>
            <v-btn
              size="small"
              variant="text"
              color="primary"
              prepend-icon="mdi-restore"
              :disabled="submitting"
              @click="resetToPresets"
            >
              Reset Presets
            </v-btn>
          </div>
        </div>

        <!-- Subtask Rows -->
        <div class="d-flex flex-column ga-2 mb-4">
          <div
            v-for="(item, index) in subtaskItems"
            :key="item.id"
            class="linear-subtask-row px-3 py-2 rounded-lg"
            :class="{
              'linear-subtask-row--selected': item.selected && !item.createdSubtask,
              'linear-subtask-row--created': Boolean(item.createdSubtask),
              'linear-subtask-row--error': Boolean(item.error),
            }"
          >
            <div class="d-flex align-center ga-2">
              <v-checkbox-btn
                v-model="item.selected"
                color="primary"
                density="compact"
                class="linear-subtask-checkbox flex-grow-0 flex-shrink-0"
                :disabled="submitting || Boolean(item.createdSubtask)"
              />

              <span class="text-caption font-weight-bold text-medium-emphasis flex-shrink-0" style="min-width: 20px">
                #{{ index + 1 }}
              </span>

              <v-text-field
                v-model="item.summary"
                placeholder="Subtask summary..."
                density="compact"
                hide-details
                :disabled="submitting || Boolean(item.createdSubtask)"
                class="linear-subtask-input flex-grow-1"
              />

              <!-- Created Badge & Link -->
              <v-btn
                v-if="item.createdSubtask"
                :href="item.createdSubtask.url"
                target="_blank"
                rel="noopener"
                size="small"
                color="success"
                variant="tonal"
                prepend-icon="mdi-check-circle-outline"
                append-icon="mdi-open-in-new"
                class="font-weight-bold"
              >
                {{ item.createdSubtask.key }}
              </v-btn>

              <!-- Remove row button -->
              <v-btn
                v-else
                icon="mdi-close"
                size="x-small"
                variant="text"
                color="grey-darken-1"
                :disabled="submitting || subtaskItems.length <= 1"
                title="Remove subtask"
                @click="removeSubtaskRow(item.id)"
              />
            </div>

            <div
              v-if="item.error"
              class="text-caption text-error mt-2 pl-9 d-flex align-center"
            >
              <v-icon icon="mdi-alert-circle-outline" size="14" class="mr-1" />
              {{ item.error }}
            </div>
          </div>
        </div>

        <!-- Add Custom Subtask Row -->
        <v-btn
          variant="tonal"
          color="primary"
          size="small"
          prepend-icon="mdi-plus"
          :disabled="submitting"
          @click="addSubtaskRow"
        >
          Add Subtask
        </v-btn>
      </v-card>
    </v-col>

    <!-- Right Column: Batch Summary & Execution Status -->
    <v-col cols="12" md="5" class="pl-md-4">
      <div class="sticky-preview">
        <v-card class="linear-card pa-6">
          <div class="d-flex align-center mb-5">
            <span class="linear-step-badge mr-3">3</span>
            <div>
              <div class="text-subtitle-1 font-weight-bold text-grey-darken-4">
                Batch Creation Summary
              </div>
              <div class="text-caption text-medium-emphasis">
                Review selected subtasks and create all at once
              </div>
            </div>
          </div>

          <!-- Target Summary Box -->
          <div class="linear-surface pa-4 mb-5">
            <div class="d-flex align-center justify-space-between mb-2">
              <span class="text-caption text-medium-emphasis">Parent Issue</span>
              <span class="text-caption font-weight-bold text-grey-darken-4">
                {{ selectedParentIssue ? selectedParentIssue.key : 'Not selected' }}
              </span>
            </div>
            <div class="d-flex align-center justify-space-between mb-2">
              <span class="text-caption text-medium-emphasis">Squad / Team</span>
              <span class="text-caption font-weight-bold text-primary">
                SQ16 · UCHOOSE
              </span>
            </div>
            <div class="d-flex align-center justify-space-between">
              <span class="text-caption text-medium-emphasis">Pending to Create</span>
              <span class="text-caption font-weight-bold text-grey-darken-4">
                {{ pendingSelectedSubtasks.length }} subtask(s)
              </span>
            </div>
          </div>

          <!-- Selected Subtasks Preview List -->
          <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis mb-2">
            Queue ({{ activePreviewItems.length }})
          </div>
          <div class="linear-surface pa-3 mb-5" style="max-height: 280px; overflow-y: auto">
            <div
              v-if="activePreviewItems.length === 0"
              class="text-caption text-medium-emphasis text-center py-4"
            >
              Select at least one subtask on the left to create.
            </div>
            <div
              v-for="(item, idx) in activePreviewItems"
              :key="item.id"
              class="d-flex align-center justify-space-between py-2 px-2 rounded"
            >
              <div class="d-flex align-center text-body-2 text-grey-darken-3 mr-2" style="min-width: 0">
                <v-icon
                  :icon="
                    item.createdSubtask
                      ? 'mdi-check-circle'
                      : item.error
                      ? 'mdi-alert-circle'
                      : 'mdi-checkbox-blank-circle-outline'
                  "
                  :color="
                    item.createdSubtask
                      ? 'success'
                      : item.error
                      ? 'error'
                      : 'primary'
                  "
                  size="16"
                  class="mr-2 flex-shrink-0"
                />
                <span class="text-truncate">{{ idx + 1 }}. {{ item.summary }}</span>
              </div>

              <v-chip
                v-if="item.createdSubtask"
                size="x-small"
                color="success"
                variant="tonal"
                class="font-weight-bold flex-shrink-0"
              >
                {{ item.createdSubtask.key }}
              </v-chip>
              <v-chip
                v-else-if="item.error"
                size="x-small"
                color="error"
                variant="tonal"
                class="font-weight-bold flex-shrink-0"
              >
                Failed
              </v-chip>
            </div>
          </div>

          <!-- Primary Submit Button -->
          <v-btn
            v-if="pendingSelectedSubtasks.length > 0 || !hasCreatedAny"
            color="primary"
            size="large"
            block
            :loading="submitting"
            :disabled="!canSubmitBatch"
            prepend-icon="mdi-playlist-plus"
            class="font-weight-bold"
            @click="handleCreateBatch"
          >
            {{
              hasFailedItems
                ? `Retry ${pendingSelectedSubtasks.length} Failed Subtask(s)`
                : `Create All Subtasks (${pendingSelectedSubtasks.length})`
            }}
          </v-btn>

          <!-- Error Alert -->
          <v-alert
            v-if="globalError"
            type="error"
            variant="tonal"
            density="compact"
            rounded="lg"
            class="mt-4 text-body-2"
          >
            {{ globalError }}
          </v-alert>

          <!-- Created Results Banner -->
          <v-expand-transition>
            <div v-if="createdSubtasksList.length > 0" class="mt-5">
              <div
                class="pa-4 rounded-xl"
                :style="{
                  background: hasFailedItems ? '#FFFBEB' : '#F0FDF4',
                  border: hasFailedItems
                    ? '1px solid rgba(245, 158, 11, 0.25)'
                    : '1px solid rgba(22, 163, 74, 0.2)',
                }"
              >
                <div class="d-flex align-center justify-space-between mb-3">
                  <div
                    class="text-subtitle-2 font-weight-bold"
                    :class="hasFailedItems ? 'text-amber-darken-4' : 'text-success'"
                  >
                    {{
                      hasFailedItems
                        ? `Created ${createdSubtasksList.length} Subtask(s) (${failedCount} failed)`
                        : `All ${createdSubtasksList.length} Subtasks Created!`
                    }}
                  </div>
                </div>

                <div class="d-flex flex-wrap ga-2 mb-3">
                  <v-btn
                    v-for="sub in createdSubtasksList"
                    :key="sub.key"
                    :href="sub.url"
                    target="_blank"
                    rel="noopener"
                    color="primary"
                    variant="flat"
                    size="small"
                    prepend-icon="mdi-open-in-new"
                  >
                    {{ sub.key }}
                  </v-btn>
                </div>

                <v-btn
                  variant="text"
                  size="small"
                  color="grey-darken-2"
                  block
                  prepend-icon="mdi-refresh"
                  @click="startNewBatch"
                >
                  Reset for Next Batch
                </v-btn>
              </div>
            </div>
          </v-expand-transition>
        </v-card>
      </div>
    </v-col>
  </v-row>
</template>

<script setup>
import { ref, computed } from 'vue';
import { executeCreateBatchSubtasksWorkflow } from '../services/apiClient.js';

const DEFAULT_PRESET_SUMMARIES = [
  '[DEV][BE] Create New Adapter For Call 3rd Party Endpoint /miniapp/api/v1/xxx/xxx/xxx',
  '[DEV][BE] Create New Datasource Query/Mutation For xxxx',
  '[DEV][FE] Create New Hook For Call Endpoint /miniapp/api/v1/xxx/xxx/xxx',
  '[FE][QA] Create New UI for XXX',
  '[FE][QA] Create Logic Call Endpoint And Handle Error Endpoint /miniapp/api/v1/xxx/xxx/xxx'
];

const props = defineProps({
  parentIssues: { type: Array, default: () => [] },
  loadingIssues: { type: Boolean, default: false },
  selectedParentIssue: { type: Object, default: null },
});

const emit = defineEmits(['search-issues', 'update:selectedParentIssue']);

let nextRowId = 1;
function createInitialRows() {
  return DEFAULT_PRESET_SUMMARIES.map((summary) => ({
    id: `subtask-row-${nextRowId++}`,
    selected: true,
    summary,
    createdSubtask: null,
    error: null,
  }));
}

const subtaskItems = ref(createInitialRows());
const submitting = ref(false);
const globalError = ref('');

let debounceTimer = null;
function onSearchInput(val) {
  if (props.selectedParentIssue && val === props.selectedParentIssue.displayLabel) {
    return;
  }
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    emit('search-issues', val || '');
  }, 280);
}

const activePreviewItems = computed(() => {
  return subtaskItems.value.filter(
    (item) => (item.selected || item.createdSubtask) && String(item.summary || '').trim()
  );
});

const pendingSelectedSubtasks = computed(() => {
  return subtaskItems.value.filter(
    (item) => item.selected && !item.createdSubtask && String(item.summary || '').trim()
  );
});

const createdSubtasksList = computed(() => {
  return subtaskItems.value
    .filter((item) => Boolean(item.createdSubtask))
    .map((item) => item.createdSubtask);
});

const hasCreatedAny = computed(() => createdSubtasksList.value.length > 0);

const failedCount = computed(() => {
  return subtaskItems.value.filter((item) => Boolean(item.error) && !item.createdSubtask).length;
});

const hasFailedItems = computed(() => failedCount.value > 0);

const allUncreatedSelected = computed(() => {
  const uncreated = subtaskItems.value.filter((item) => !item.createdSubtask);
  return uncreated.length > 0 && uncreated.every((item) => item.selected);
});

const canSubmitBatch = computed(() => {
  return Boolean(
    props.selectedParentIssue?.key &&
      pendingSelectedSubtasks.value.length > 0 &&
      !submitting.value
  );
});

function toggleSelectAll() {
  const target = !allUncreatedSelected.value;
  subtaskItems.value.forEach((item) => {
    if (!item.createdSubtask) {
      item.selected = target;
    }
  });
}

function addSubtaskRow() {
  subtaskItems.value.push({
    id: `subtask-row-${nextRowId++}`,
    selected: true,
    summary: '',
    createdSubtask: null,
    error: null,
  });
}

function removeSubtaskRow(id) {
  if (subtaskItems.value.length <= 1) return;
  subtaskItems.value = subtaskItems.value.filter((item) => item.id !== id);
}

function resetToPresets() {
  globalError.value = '';
  subtaskItems.value = createInitialRows();
}

function startNewBatch() {
  globalError.value = '';
  subtaskItems.value.forEach((item) => {
    item.createdSubtask = null;
    item.error = null;
    item.selected = true;
  });
}

async function handleCreateBatch() {
  if (!canSubmitBatch.value) return;

  submitting.value = true;
  globalError.value = '';

  const toCreate = pendingSelectedSubtasks.value.map((item) => ({
    id: item.id,
    summary: String(item.summary).trim(),
    description: '',
  }));

  try {
    const { data } = await executeCreateBatchSubtasksWorkflow({
      parentIssueKey: props.selectedParentIssue.key,
      subtasks: toCreate,
    });

    const resultsById = new Map((data.results || []).map((r) => [r.id, r]));
    subtaskItems.value.forEach((item) => {
      const res = resultsById.get(item.id);
      if (!res) return;
      if (res.status === 'SUCCESS' && res.subtask) {
        item.createdSubtask = res.subtask;
        item.error = null;
      } else {
        item.error = res.error || 'Failed to create subtask';
      }
    });
  } catch (err) {
    globalError.value = err.message || 'Failed to create batch subtasks.';
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.sticky-preview {
  position: sticky;
  top: 84px;
}

.linear-subtask-row {
  background: #fafafc;
  border: 1px solid rgba(0, 0, 0, 0.06);
  transition: all 0.15s ease;
}

.linear-subtask-row--selected {
  background: #ffffff;
  border-color: rgba(94, 106, 210, 0.28);
}

.linear-subtask-row--created {
  background: #f0fdf4;
  border-color: rgba(22, 163, 74, 0.25);
}

.linear-subtask-row--error {
  background: #fef2f2;
  border-color: rgba(220, 38, 38, 0.3);
}

.linear-subtask-checkbox {
  flex: 0 0 auto !important;
  margin-inline-end: 0 !important;
}

.linear-subtask-checkbox :deep(.v-selection-control__wrapper) {
  width: 24px;
  height: 24px;
}

.linear-subtask-input :deep(.v-field__input) {
  min-height: 34px;
  padding-top: 4px;
  padding-bottom: 4px;
  font-size: 0.875rem;
}
</style>
