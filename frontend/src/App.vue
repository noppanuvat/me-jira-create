<template>
  <v-app class="linear-app">
    <!-- Minimal Linear-style Top Header -->
    <v-app-bar flat class="linear-header" height="64">
      <v-container class="d-flex align-center py-0" style="max-width: 1488px">
        <div
          class="d-flex align-center justify-center rounded-lg mr-3"
          style="width: 32px; height: 32px; background: rgba(94, 106, 210, 0.1)"
        >
          <v-icon icon="mdi-vector-link" size="18" color="primary" />
        </div>
        <div>
          <div class="text-subtitle-2 font-weight-bold text-grey-darken-4">
            Jira Subtask + Confluence Spec
          </div>
          <div class="text-caption text-medium-emphasis">
            Create or sync Jira subtasks and technical specifications with Gemini AI
          </div>
        </div>
        <v-spacer />

        <!-- Top Mode Switcher (Linear Segmented Pill Control) -->
        <div class="d-flex align-center ga-3">
          <v-select
            v-model="aiModel"
            :items="aiModelOptions"
            item-title="label"
            item-value="id"
            density="compact"
            variant="outlined"
            hide-details
            prepend-inner-icon="mdi-robot-outline"
            label="AI Model"
            style="width: 280px"
            class="mr-1"
          />
          <div class="linear-segmented-group">
            <button
              type="button"
              class="linear-segmented-item"
              :class="{ 'linear-segmented-item--active': activeMode === 'CREATE' }"
              @click="activeMode = 'CREATE'"
            >
              <v-icon icon="mdi-plus-circle-outline" size="15" class="mr-1" />
              <span>Create Subtask &amp; Spec</span>
            </button>
            <button
              type="button"
              class="linear-segmented-item"
              :class="{ 'linear-segmented-item--active': activeMode === 'BATCH_SUBTASKS' }"
              @click="activeMode = 'BATCH_SUBTASKS'"
            >
              <v-icon icon="mdi-playlist-plus" size="15" class="mr-1" />
              <span>Create Subtask</span>
            </button>
            <button
              type="button"
              class="linear-segmented-item"
              :class="{ 'linear-segmented-item--active': activeMode === 'SYNC' }"
              @click="activeMode = 'SYNC'"
            >
              <v-icon icon="mdi-creation" size="15" class="mr-1" />
              <span>Sync Jira to Confluence</span>
            </button>
          </div>

          <v-tooltip text="Atlassian Connected" location="bottom">
            <template #activator="{ props: tooltipProps }">
              <div
                v-bind="tooltipProps"
                class="d-flex align-center justify-center rounded-circle"
                style="width: 32px; height: 32px; background: rgba(22, 163, 74, 0.12); cursor: default"
              >
                <v-icon icon="mdi-cloud-check-outline" size="18" color="success" />
              </div>
            </template>
          </v-tooltip>
        </div>
      </v-container>
    </v-app-bar>

    <!-- Main Workspace -->
    <v-main>
      <v-container class="py-8" style="max-width: 1488px">
        <!-- MODE 1: Create Subtask + Confluence Page -->
        <v-row v-if="activeMode === 'CREATE'">
          <!-- Left Column: Section 1 (Jira) & Section 2 (Documentation Template) -->
          <v-col cols="12" md="7" class="pr-md-4">
            <JiraSection
              :parent-issues="parentIssues"
              :loading-issues="loadingIssues"
              :selected-parent-issue="selectedParentIssue"
              :create-confluence="createConfluence"
              :work-type="workType"
              :subtask-summary="subtaskSummary"
              :subtask-description="subtaskDescription"
              :subtask-description-adf="subtaskDescriptionAdf"
              :locked-subtask="lockedSubtask"
              :ai-model="aiModel"
              @search-issues="loadParentIssues"
              @update:selected-parent-issue="onParentIssueSelected"
              @update:create-confluence="createConfluence = $event"
              @update:work-type="onWorkTypeChanged"
              @update:subtask-summary="subtaskSummary = $event"
              @update:subtask-description="subtaskDescription = $event"
              @update:subtask-description-adf="subtaskDescriptionAdf = $event"
              @update:description-images="descriptionImages = $event"
              @apply-prefix="applyWorkTypePrefix"
            />

            <ConfluenceSection
              :create-confluence="createConfluence"
              :work-type="workType"
              :spaces="spaces"
              :loading-spaces="loadingSpaces"
              :space-key="spaceKey"
              :parent-pages="parentPages"
              :loading-pages="loadingPages"
              :parent-page-id="parentPageId"
              :custom-page-title="customPageTitle"
              :template-fields="templateFields"
              @update:space-key="onSpaceChanged"
              @update:parent-page-id="onParentPageChanged"
              @update:custom-page-title="customPageTitle = $event"
              @update:template-fields="templateFields = $event"
              @search-pages="loadParentPages"
            />
          </v-col>

          <!-- Right Column: Section 3 (Live Preview & Execution Status) -->
          <v-col cols="12" md="5" class="pl-md-4">
            <PreviewSection
              :create-confluence="createConfluence"
              :selected-parent-issue="selectedParentIssue"
              :work-type="workType"
              :space-key="spaceKey"
              :parent-page-id="parentPageId"
              :preview-page-title="previewPageTitle"
              :sections="currentSections"
              :submitting="submitting"
              :can-submit="canSubmit"
              :locked-subtask="lockedSubtask"
              :execution-result="executionResult"
              @submit-create-all="handleCreateAll"
              @retry-confluence="handleRetryConfluence"
              @reset-workflow="resetFormForNextTask"
              @open-sync-mode="openSyncModeFromCreated"
            />
          </v-col>
        </v-row>

        <!-- MODE 2: Create All Subtask (Batch Subtasks) -->
        <BatchSubtaskSection
          v-else-if="activeMode === 'BATCH_SUBTASKS'"
          :parent-issues="parentIssues"
          :loading-issues="loadingIssues"
          :selected-parent-issue="selectedParentIssue"
          @search-issues="loadParentIssues"
          @update:selected-parent-issue="onParentIssueSelected"
        />

        <!-- MODE 3: Sync Jira Updates to Confluence with Gemini AI -->
        <SyncSection
          v-else
          :gemini-configured="geminiConfigured"
          :gemini-model="aiModel"
          :ai-model="aiModel"
          :initial-issue-key="syncTargetIssueKey"
          :initial-confluence-page-id="syncTargetPageId"
        />
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import JiraSection from './components/JiraSection.vue';
import ConfluenceSection from './components/ConfluenceSection.vue';
import PreviewSection from './components/PreviewSection.vue';
import BatchSubtaskSection from './components/BatchSubtaskSection.vue';
import SyncSection from './components/SyncSection.vue';
import {
  fetchDefaults,
  searchJiraParentIssues,
  fetchConfluenceSpaces,
  searchConfluencePages,
  executeCreateAllWorkflow,
  executeRetryConfluenceWorkflow,
} from './services/apiClient.js';
import {
  DEFAULT_TEMPLATE_SECTIONS,
  WORK_TYPE_OPTIONS,
  computeLivePageTitle,
} from './utils/templateDefinitions.js';

// Top-level Mode & AI Config State
const STORAGE_KEY_CREATE_PREFS = 'jira_doc_creator_create_prefs_v1';
const activeMode = ref('CREATE');
const geminiConfigured = ref(false);
const geminiModel = ref('gemini-2.5-flash');
const aiModel = ref('gemini-2.5-flash');
const aiModels = ref(['gemini-2.5-flash']);
const aiModelOptions = computed(() => aiModels.value.map((id) => ({ id, label: id })));

watch(aiModel, (value) => {
  try {
    window.localStorage.setItem('jira_doc_creator_ai_model', value);
  } catch {
    // Ignore storage errors
  }
});
const syncTargetIssueKey = ref('');
const syncTargetPageId = ref('');

// Section 1 State: Jira Issue
const parentIssues = ref([]);
const loadingIssues = ref(false);
const selectedParentIssue = ref(null);
const workType = ref('API_DEVELOPMENT');
const subtaskSummary = ref('');
const subtaskDescription = ref('');
const subtaskDescriptionAdf = ref(null);
const descriptionImages = ref([]);

// Section 2 State: Confluence Template & Destination (Default: createConfluence = true)
const createConfluence = ref(true);
const spaces = ref([]);
const loadingSpaces = ref(false);
const spaceKey = ref('1KSGA');
const parentPages = ref([]);
const loadingPages = ref(false);
const parentPageId = ref('5164335849');
const savedParentPageItem = ref(null);
const customPageTitle = ref('');

function loadSavedCreatePrefs() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_CREATE_PREFS);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveCreatePrefs() {
  try {
    const currentPageItem =
      parentPages.value.find((p) => String(p.id) === String(parentPageId.value)) ||
      (savedParentPageItem.value &&
      String(savedParentPageItem.value.id) === String(parentPageId.value)
        ? savedParentPageItem.value
        : null);

    if (currentPageItem) {
      savedParentPageItem.value = currentPageItem;
    }

    const payload = {
      selectedParentIssue: selectedParentIssue.value || null,
      spaceKey: spaceKey.value || '',
      parentPageId: parentPageId.value || '',
      parentPageItem: currentPageItem || null,
    };
    window.localStorage.setItem(STORAGE_KEY_CREATE_PREFS, JSON.stringify(payload));
  } catch {
    // Ignore localStorage quota/privacy errors
  }
}

const templateFields = ref({
  httpMethod: 'POST',
  endpointPath: 'miniapp/api/v1/xxx/xxx/xxx',
  serviceName: 'oneapp-xxx-xxx',
  dbEngine: 'SQL Server',
  schemaName: 'dbo',
  tableName: 'qr_payment_transactions',
});

// Section 3 State: Preview & Execution
const submitting = ref(false);
const lockedSubtask = ref(null);
const executionResult = ref(null);

const currentSections = computed(() => {
  return DEFAULT_TEMPLATE_SECTIONS[workType.value] || DEFAULT_TEMPLATE_SECTIONS.API_DEVELOPMENT;
});

const previewPageTitle = computed(() => {
  return computeLivePageTitle({
    subtaskKey: lockedSubtask.value?.key || '',
    workType: workType.value,
    subtaskSummary: subtaskSummary.value,
    customPageTitle: customPageTitle.value,
  });
});

const canSubmit = computed(() => {
  return Boolean(
    selectedParentIssue.value?.key &&
      subtaskSummary.value?.trim() &&
      (!createConfluence.value || spaceKey.value) &&
      !submitting.value
  );
});

async function loadParentIssues(query = '') {
  loadingIssues.value = true;
  try {
    const list = await searchJiraParentIssues(query);
    const mapped = list.map((item) => ({
      ...item,
      displayLabel: `${item.key} — ${item.summary}`,
    }));

    if (
      selectedParentIssue.value?.key &&
      !mapped.some((item) => item.key === selectedParentIssue.value.key)
    ) {
      mapped.unshift({
        ...selectedParentIssue.value,
        displayLabel:
          selectedParentIssue.value.displayLabel ||
          `${selectedParentIssue.value.key} — ${selectedParentIssue.value.summary || ''}`,
      });
    }

    parentIssues.value = mapped;
    if (!selectedParentIssue.value && parentIssues.value.length > 0 && !query) {
      selectedParentIssue.value = parentIssues.value[0];
      saveCreatePrefs();
    }
  } catch (err) {
    console.error('Failed to search parent issues:', err);
  } finally {
    loadingIssues.value = false;
  }
}

async function loadSpaces() {
  loadingSpaces.value = true;
  try {
    const rawSpaces = await fetchConfluenceSpaces();
    spaces.value = rawSpaces.map((s) => ({
      ...s,
      displayName: `${s.key} — ${s.name}`,
    }));
  } catch (err) {
    console.error('Failed to load Confluence spaces:', err);
  } finally {
    loadingSpaces.value = false;
  }
}

async function loadParentPages(query = '') {
  loadingPages.value = true;
  try {
    // Auto-extract space key if user pastes a full Confluence URL containing /wiki/spaces/<SPACE>/folder/<ID>
    const spaceMatch = String(query || '').match(/\/wiki\/spaces\/([^/]+)\/(?:folder|pages)\/(\d+)/i);
    if (spaceMatch && spaceMatch[1] && spaceMatch[1] !== spaceKey.value) {
      spaceKey.value = spaceMatch[1];
    }

    const rawPages = await searchConfluencePages(spaceKey.value, query);
    const mapped = rawPages.map((p) => ({
      ...p,
      type: p.type || 'page',
      displayTitle: `${p.type === 'folder' ? '📁' : '📄'} ${p.title} (${p.id})`,
    }));

    if (spaceMatch && spaceMatch[2]) {
      parentPageId.value = spaceMatch[2];
    }

    // Ensure the currently selected/remembered parentPageId is present in the dropdown items
    if (
      parentPageId.value &&
      !mapped.some((item) => String(item.id) === String(parentPageId.value))
    ) {
      if (
        savedParentPageItem.value &&
        String(savedParentPageItem.value.id) === String(parentPageId.value)
      ) {
        mapped.unshift(savedParentPageItem.value);
      } else if (!query) {
        try {
          const directLookup = await searchConfluencePages(
            spaceKey.value,
            String(parentPageId.value)
          );
          const found = directLookup.find(
            (p) => String(p.id) === String(parentPageId.value)
          );
          if (found) {
            const formattedFound = {
              ...found,
              type: found.type || 'folder',
              displayTitle: `${found.type === 'folder' ? '📁' : '📄'} ${found.title} (${found.id})`,
            };
            savedParentPageItem.value = formattedFound;
            mapped.unshift(formattedFound);
          }
        } catch {
          // Ignore fallback lookup errors
        }
      }
    }

    parentPages.value = mapped;
    saveCreatePrefs();
  } catch (err) {
    console.error('Failed to search Confluence pages:', err);
  } finally {
    loadingPages.value = false;
  }
}

function onParentIssueSelected(issue) {
  selectedParentIssue.value = issue;
  saveCreatePrefs();
}

function onParentPageChanged(newPageId) {
  parentPageId.value = newPageId || '';
  saveCreatePrefs();
}

function onWorkTypeChanged(newType) {
  workType.value = newType;
  const opt = WORK_TYPE_OPTIONS.find((item) => item.value === newType);
  if (opt && subtaskSummary.value && !lockedSubtask.value) {
    const stripped = subtaskSummary.value.replace(/^\[(API|DB)\]\s*/i, '');
    subtaskSummary.value = `${opt.prefix} ${stripped}`;
  }
}

function applyWorkTypePrefix() {
  const opt = WORK_TYPE_OPTIONS.find((item) => item.value === workType.value);
  if (!opt) return;
  const stripped = (subtaskSummary.value || '').replace(/^\[(API|DB)\]\s*/i, '').trim();
  subtaskSummary.value = `${opt.prefix} ${stripped}`;
}

async function onSpaceChanged(newSpaceKey) {
  spaceKey.value = newSpaceKey;
  parentPageId.value = '';
  savedParentPageItem.value = null;
  await loadParentPages('');
  if (parentPages.value.length > 0) {
    parentPageId.value = parentPages.value[0].id;
  }
  saveCreatePrefs();
}

async function handleCreateAll() {
  if (!canSubmit.value) return;
  submitting.value = true;
  executionResult.value = null;

  try {
    const { data } = await executeCreateAllWorkflow({
      parentIssueKey: selectedParentIssue.value.key,
      parentIssueSummary: selectedParentIssue.value.summary,
      workType: workType.value,
      subtaskSummary: subtaskSummary.value,
      subtaskDescription: subtaskDescription.value,
      subtaskDescriptionAdf: subtaskDescriptionAdf.value,
      images: descriptionImages.value,
      createConfluence: createConfluence.value,
      spaceKey: spaceKey.value,
      parentPageId: parentPageId.value,
      customPageTitle: customPageTitle.value,
      templateFields: templateFields.value,
    });

    executionResult.value = data;
    if (data.subtask) {
      lockedSubtask.value = data.subtask;
    }
  } catch (err) {
    executionResult.value = {
      status: 'FAILED',
      steps: {
        jiraSubtask: 'FAILED',
        confluencePage: 'PENDING',
        remoteLink: 'PENDING',
      },
      error: {
        message: err.message || 'Failed to create Jira Subtask.',
      },
    };
  } finally {
    submitting.value = false;
  }
}

async function handleRetryConfluence() {
  if (!lockedSubtask.value) return;
  submitting.value = true;

  try {
    const { data } = await executeRetryConfluenceWorkflow({
      subtask: lockedSubtask.value,
      parentIssueKey: selectedParentIssue.value?.key,
      parentIssueSummary: selectedParentIssue.value?.summary,
      workType: workType.value,
      subtaskSummary: subtaskSummary.value,
      subtaskDescription: subtaskDescription.value,
      spaceKey: spaceKey.value,
      parentPageId: parentPageId.value,
      customPageTitle: customPageTitle.value,
      templateFields: templateFields.value,
      existingConfluencePage: executionResult.value?.confluencePage || null,
    });

    executionResult.value = data;
  } catch (err) {
    executionResult.value = {
      status: 'PARTIAL_FAILURE',
      steps: {
        jiraSubtask: 'SUCCESS',
        confluencePage: 'FAILED',
        remoteLink: 'FAILED',
      },
      subtask: lockedSubtask.value,
      error: {
        message: err.message || 'Retry Confluence failed.',
        canRetryConfluence: true,
      },
    };
  } finally {
    submitting.value = false;
  }
}

function resetFormForNextTask() {
  lockedSubtask.value = null;
  executionResult.value = null;
  customPageTitle.value = '';
  const opt = WORK_TYPE_OPTIONS.find((item) => item.value === workType.value);
  subtaskSummary.value = `${opt?.prefix || '[API]'} `;
}

function openSyncModeFromCreated(result) {
  if (result?.subtask?.key) {
    syncTargetIssueKey.value = result.subtask.key;
  }
  if (result?.confluencePage?.id) {
    syncTargetPageId.value = result.confluencePage.id;
  }
  activeMode.value = 'SYNC';
}

onMounted(async () => {
  const savedPrefs = loadSavedCreatePrefs();
  if (savedPrefs?.selectedParentIssue?.key) {
    selectedParentIssue.value = savedPrefs.selectedParentIssue;
  }
  if (savedPrefs?.parentPageItem) {
    savedParentPageItem.value = savedPrefs.parentPageItem;
  }

  try {
    const configData = await fetchDefaults();
    geminiConfigured.value = Boolean(
      configData.geminiConfigured || configData.openrouterConfigured
    );
    if (configData.geminiModel) {
      geminiModel.value = configData.geminiModel;
    }
    if (Array.isArray(configData.aiModels) && configData.aiModels.length > 0) {
      aiModels.value = configData.aiModels;
    }
    const savedModel = window.localStorage.getItem('jira_doc_creator_ai_model');
    if (savedModel && aiModels.value.includes(savedModel)) {
      aiModel.value = savedModel;
    } else if (configData.defaultAiModel) {
      aiModel.value = configData.defaultAiModel;
    }
    if (savedPrefs?.spaceKey) {
      spaceKey.value = savedPrefs.spaceKey;
    } else if (configData.defaults?.confluenceSpaceKey) {
      spaceKey.value = configData.defaults.confluenceSpaceKey;
    }

    if (savedPrefs?.parentPageId !== undefined && savedPrefs?.parentPageId !== '') {
      parentPageId.value = savedPrefs.parentPageId;
    } else if (configData.defaults?.confluenceParentPageId) {
      parentPageId.value = configData.defaults.confluenceParentPageId;
    }
  } catch (err) {
    console.error('Failed to load defaults:', err);
  }

  await Promise.all([loadParentIssues(''), loadSpaces(), loadParentPages('')]);
});
</script>
