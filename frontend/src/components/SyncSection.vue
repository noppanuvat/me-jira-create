<template>
  <v-row>
    <!-- Left Column: Select Jira Issue, Source Context & Gemini Editable Extraction -->
    <v-col cols="12" md="7" class="pr-md-4">
      <v-card class="linear-card mb-6 pa-6">
        <div class="d-flex align-center justify-space-between mb-5">
          <div class="d-flex align-center">
            <span class="linear-step-badge mr-3">1</span>
            <div>
              <div class="text-subtitle-1 font-weight-bold text-grey-darken-4">
                Select Jira Work Item to Sync
              </div>
              <div class="text-caption text-medium-emphasis">
                Pull latest description &amp; comments from Jira and analyze with Gemini AI
              </div>
            </div>
          </div>

          <v-chip
            size="small"
            :color="geminiConfigured ? 'primary' : 'warning'"
            variant="tonal"
            class="font-weight-medium"
            prepend-icon="mdi-creation"
          >
            {{ geminiConfigured ? `Gemini (${geminiModel})` : 'GEMINI_API_KEY Required' }}
          </v-chip>
        </div>

        <!-- Jira Issue Search Autocomplete -->
        <v-autocomplete
          v-model="selectedIssue"
          :items="syncIssues"
          :loading="loadingIssues"
          item-title="displayLabel"
          item-value="key"
          return-object
          no-filter
          clearable
          label="Jira Subtask / Issue"
          placeholder="Search by Jira key (e.g. ONEKSGA-17918) or summary..."
          prepend-inner-icon="mdi-magnify"
          class="mb-3"
          @update:search="onSearchSyncIssues"
          @update:model-value="onSelectSyncIssue"
        >
          <template #item="{ props: itemProps, item }">
            <v-list-item v-bind="itemProps" :title="undefined" :subtitle="undefined" class="py-2">
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

        <!-- Linked Confluence Page ID / URL + Template Type -->
        <v-row dense class="mb-2">
          <v-col cols="12" sm="7">
            <v-text-field
              v-model="targetPageInput"
              :loading="loadingContext"
              label="Linked Confluence Page ID or URL"
              placeholder="Auto-detected from Jira Remote Link or paste Page URL/ID"
              prepend-inner-icon="mdi-book-open-page-variant-outline"
              hint="Automatically filled if the Jira card already has a linked Confluence page"
              persistent-hint
            />
          </v-col>
          <v-col cols="12" sm="5">
            <v-select
              v-model="workType"
              :items="workTypeSelectItems"
              item-title="title"
              item-value="value"
              label="Template Format"
              prepend-inner-icon="mdi-file-tree-outline"
            />
          </v-col>
        </v-row>

        <!-- Jira Card Latest Content Snapshot -->
        <v-expand-transition>
          <v-sheet v-if="issueContext" class="linear-subtle-box pa-4 mt-3 mb-4">
            <div class="d-flex align-center justify-space-between mb-2">
              <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis">
                Latest Jira Card Content ({{ issueContext.key }})
              </div>
              <v-btn
                size="x-small"
                variant="text"
                color="primary"
                class="linear-btn"
                prepend-icon="mdi-refresh"
                :loading="loadingContext"
                @click="loadIssueContext(issueContext.key)"
              >
                Refresh from Jira
              </v-btn>
            </div>
            <div class="text-body-2 font-weight-medium text-grey-darken-4 mb-1">
              {{ issueContext.summary }}
            </div>
            <div
              class="text-caption text-grey-darken-2"
              style="white-space: pre-wrap; max-height: 150px; overflow-y: auto"
            >
              {{ issueContext.descriptionText || 'No description text on this Jira card.' }}
            </div>
            <div v-if="issueContext.comments?.length" class="mt-2 pt-2" style="border-top: 1px solid rgba(0,0,0,0.05)">
              <div class="text-caption font-weight-bold text-medium-emphasis">
                {{ issueContext.comments.length }} Recent Comment(s) included for AI analysis
              </div>
            </div>
          </v-sheet>
        </v-expand-transition>

        <!-- Analyze Button -->
        <v-btn
          color="primary"
          size="large"
          block
          class="linear-btn-primary"
          prepend-icon="mdi-creation"
          :loading="analyzing"
          :disabled="!selectedIssue?.key || analyzing"
          @click="handleAnalyzeWithAi"
        >
          Analyze Jira Updates with AI
        </v-btn>

        <v-alert
          v-if="analyzeError"
          type="error"
          variant="tonal"
          density="compact"
          rounded="lg"
          class="mt-4 text-body-2"
        >
          {{ analyzeError }}
        </v-alert>
      </v-card>

      <!-- Step 2: Review & Edit AI-Extracted Specification Fields -->
      <v-expand-transition>
        <v-card v-if="analysisResult" class="linear-card mb-6 pa-6">
          <div class="d-flex align-center justify-space-between mb-4">
            <div class="d-flex align-center">
              <span class="linear-step-badge mr-3">2</span>
              <div>
                <div class="text-subtitle-1 font-weight-bold text-grey-darken-4">
                  AI Analysis &amp; Template Mapping
                </div>
                <div class="text-caption text-medium-emphasis">
                  Review or fine-tune the structured fields extracted by Gemini before syncing
                </div>
              </div>
            </div>
            <v-chip size="small" color="success" variant="tonal" prepend-icon="mdi-check-decagram">
              AI Extracted
            </v-chip>
          </div>

          <!-- AI Change Summary Bullets -->
          <v-sheet class="linear-subtle-box pa-4 mb-5">
            <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis mb-2">
              What Gemini Found in Jira
            </div>
            <ul class="pl-4 text-body-2 text-grey-darken-3">
              <li v-for="(item, idx) in analysisResult.changeSummary" :key="idx" class="mb-1">
                {{ item }}
              </li>
            </ul>
          </v-sheet>

          <!-- Synthesized Overview / Description -->
          <v-textarea
            v-model="editableSpec.subtaskDescription"
            label="1. Objective &amp; Context Summary"
            rows="2"
            auto-grow
            class="mb-2"
          />

          <!-- API DEVELOPMENT FIELDS -->
          <template v-if="workType === 'API_DEVELOPMENT'">
            <v-row dense>
              <v-col cols="12" sm="4">
                <v-select
                  v-model="editableSpec.templateFields.httpMethod"
                  :items="['GET', 'POST', 'PUT', 'PATCH', 'DELETE']"
                  label="HTTP Method"
                  density="compact"
                />
              </v-col>
              <v-col cols="12" sm="8">
                <v-text-field
                  v-model="editableSpec.templateFields.endpointPath"
                  label="URI Path"
                  density="compact"
                />
              </v-col>
              <v-col cols="12">
                <v-text-field
                  v-model="editableSpec.templateFields.serviceName"
                  label="Target Service"
                  density="compact"
                />
              </v-col>
              <v-col cols="12" sm="6">
                <v-textarea
                  v-model="editableSpec.templateFields.requestPayloadJson"
                  label="3.2 Sample Request Payload (JSON)"
                  rows="6"
                  auto-grow
                  class="font-monospace"
                />
              </v-col>
              <v-col cols="12" sm="6">
                <v-textarea
                  v-model="editableSpec.templateFields.responsePayloadJson"
                  label="4.2 Sample Response Payload (JSON)"
                  rows="6"
                  auto-grow
                  class="font-monospace"
                />
              </v-col>
            </v-row>
          </template>

          <!-- DATABASE DESIGN FIELDS -->
          <template v-else>
            <v-row dense>
              <v-col cols="12" sm="6">
                <v-text-field
                  v-model="editableSpec.templateFields.schemaName"
                  label="Schema"
                  density="compact"
                />
              </v-col>
              <v-col cols="12" sm="6">
                <v-text-field
                  v-model="editableSpec.templateFields.tableName"
                  label="Table Name"
                  density="compact"
                />
              </v-col>
              <v-col cols="12">
                <v-textarea
                  v-model="editableSpec.templateFields.erdSummary"
                  label="2. Entity Relationship &amp; Schema Summary"
                  rows="2"
                  auto-grow
                  hide-details
                />
              </v-col>
            </v-row>
          </template>
        </v-card>
      </v-expand-transition>
    </v-col>

    <!-- Right Column: Live Template Preview & Confirm Sync to Confluence -->
    <v-col cols="12" md="5" class="pl-md-4">
      <v-card class="linear-card sticky-preview pa-6">
        <div class="d-flex align-center mb-5">
          <span class="linear-step-badge mr-3">3</span>
          <div>
            <div class="text-subtitle-1 font-weight-bold text-grey-darken-4">
              Confluence Sync Preview
            </div>
            <div class="text-caption text-medium-emphasis">
              Verify structured template output before updating Confluence
            </div>
          </div>
        </div>

        <!-- Target Page Summary -->
        <v-sheet class="linear-subtle-box pa-4 mb-5">
          <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis mb-1">
            Target Confluence Page
          </div>
          <div class="text-subtitle-2 font-weight-bold text-grey-darken-4 d-flex align-center mb-2">
            <v-icon icon="mdi-book-sync-outline" size="18" color="primary" class="mr-2" />
            <span>
              {{
                linkedPageInfo?.title ||
                (resolvedConfluencePageId
                  ? `Confluence Page #${resolvedConfluencePageId}`
                  : 'No Confluence Page Selected')
              }}
            </span>
          </div>
          <div class="d-flex flex-wrap ga-2">
            <v-chip size="x-small" color="primary" variant="tonal" class="font-weight-medium">
              Jira: {{ selectedIssue?.key || 'None' }}
            </v-chip>
            <v-chip size="x-small" color="grey-darken-2" variant="tonal" class="font-weight-medium">
              Page ID: {{ resolvedConfluencePageId || 'Missing' }}
            </v-chip>
            <v-chip
              v-if="linkedPageInfo?.versionNumber"
              size="x-small"
              color="info"
              variant="tonal"
              class="font-weight-medium"
            >
              v{{ linkedPageInfo.versionNumber }} &rarr; v{{ linkedPageInfo.versionNumber + 1 }}
            </v-chip>
          </div>
        </v-sheet>

        <!-- Preview of Structured Sections to be Updated -->
        <v-sheet v-if="analysisResult" class="linear-subtle-box pa-4 mb-5">
          <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis mb-2">
            Template Sections Ready to Update
          </div>

          <template v-if="workType === 'API_DEVELOPMENT'">
            <div class="text-body-2 mb-2">
              <strong>Endpoint:</strong>
              <code class="ml-1">{{ editableSpec.templateFields.httpMethod }} {{ editableSpec.templateFields.endpointPath }}</code>
            </div>
            <div class="text-caption text-medium-emphasis mb-2">
              3.1 Request Params ({{ editableSpec.templateFields.headersAndParams?.length || 0 }}) ·
              4.1 Response Fields ({{ editableSpec.templateFields.responseFields?.length || 0 }}) ·
              4.3 Status Codes ({{ editableSpec.templateFields.statusCodes?.length || 0 }})
            </div>
            <div
              v-if="editableSpec.templateFields.headersAndParams?.length"
              class="mb-2 pa-2 rounded bg-white"
              style="border: 1px solid rgba(0,0,0,0.05)"
            >
              <div class="text-caption font-weight-bold mb-1">
                3.1 Headers &amp; Parameters (Header / Path / Query / Body)
              </div>
              <div
                v-for="(h, i) in editableSpec.templateFields.headersAndParams"
                :key="i"
                class="text-caption text-grey-darken-3 mb-1"
              >
                <code>{{ h.name }}</code>
                <span class="text-medium-emphasis">[{{ h.location || 'Body' }} · {{ h.type || 'String' }}]</span>
                <strong> · {{ h.mandatory || h.required || 'Mandatory' }}</strong>
                <span v-if="h.example"> · Ex: <code>{{ h.example }}</code></span>
                — {{ h.description }}
              </div>
            </div>
            <div
              v-if="editableSpec.templateFields.responseFields?.length"
              class="mb-2 pa-2 rounded bg-white"
              style="border: 1px solid rgba(0,0,0,0.05)"
            >
              <div class="text-caption font-weight-bold mb-1">
                4.1 Response Fields
              </div>
              <div
                v-for="(rf, i) in editableSpec.templateFields.responseFields"
                :key="i"
                class="text-caption text-grey-darken-3 mb-1"
              >
                <code>{{ rf.name }}</code>
                <span class="text-medium-emphasis">[{{ rf.type || 'String' }}]</span>
                <strong> · {{ rf.mandatory || 'Mandatory' }}</strong>
                <span v-if="rf.example"> · Ex: <code>{{ rf.example }}</code></span>
                — {{ rf.description }}
              </div>
            </div>
            <div
              v-if="editableSpec.templateFields.statusCodes?.length"
              class="pa-2 rounded bg-white"
              style="border: 1px solid rgba(0,0,0,0.05)"
            >
              <div class="text-caption font-weight-bold mb-1">4.3 Status &amp; Error Codes</div>
              <div
                v-for="(s, i) in editableSpec.templateFields.statusCodes"
                :key="i"
                class="text-caption text-grey-darken-3"
              >
                <code>{{ s.httpStatus }}</code> <strong>{{ s.errorCode }}</strong> — {{ s.scenario }}
              </div>
            </div>
          </template>

          <template v-else>
            <div class="text-body-2 mb-2">
              <strong>Table:</strong>
              <code class="ml-1">{{ editableSpec.templateFields.schemaName }}.{{ editableSpec.templateFields.tableName }}</code>
            </div>
            <div class="text-caption text-medium-emphasis mb-2">
              Columns ({{ editableSpec.templateFields.columns?.length || 0 }}) ·
              Indexes ({{ editableSpec.templateFields.indexes?.length || 0 }})
            </div>
            <div
              v-if="editableSpec.templateFields.columns?.length"
              class="pa-2 rounded bg-white"
              style="border: 1px solid rgba(0,0,0,0.05)"
            >
              <div class="text-caption font-weight-bold mb-1">3. Extracted Table Columns</div>
              <div
                v-for="(col, i) in editableSpec.templateFields.columns"
                :key="i"
                class="text-caption text-grey-darken-3"
              >
                <code>{{ col.name }}</code> ({{ col.dataType }}) — {{ col.description }}
              </div>
            </div>
          </template>
        </v-sheet>

        <v-sheet v-else class="linear-subtle-box pa-4 mb-5 text-caption text-medium-emphasis">
          Select a Jira card and click <strong>Analyze Jira Updates with AI</strong> on the left to preview the formatted Confluence specification before syncing.
        </v-sheet>

        <!-- Sync Result Alert -->
        <v-alert
          v-if="syncResult"
          type="success"
          variant="tonal"
          rounded="lg"
          class="mb-4"
        >
          <div class="text-body-2 font-weight-bold mb-1">
            Confluence Page Updated (v{{ syncResult.confluencePage.versionNumber }})
          </div>
          <div class="text-caption mb-3">
            <strong>{{ syncResult.confluencePage.title }}</strong> has been synced with the latest specification from <strong>{{ syncResult.issueKey }}</strong>.
          </div>
          <div class="d-flex flex-wrap ga-2">
            <v-btn
              color="success"
              variant="flat"
              size="small"
              class="linear-btn"
              prepend-icon="mdi-book-open-page-variant-outline"
              :href="syncResult.confluencePage.url"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Updated Confluence Page
            </v-btn>
          </div>
        </v-alert>

        <v-alert
          v-if="syncError"
          type="error"
          variant="tonal"
          rounded="lg"
          class="mb-4 text-caption"
        >
          {{ syncError }}
        </v-alert>

        <!-- Confirm & Sync Button -->
        <v-btn
          color="primary"
          size="large"
          block
          class="linear-btn-primary"
          prepend-icon="mdi-cloud-upload-outline"
          :loading="syncing"
          :disabled="!analysisResult || !resolvedConfluencePageId || syncing"
          @click="handleConfirmSync"
        >
          Confirm &amp; Sync to Confluence
        </v-btn>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import {
  searchJiraSyncIssues,
  fetchJiraSyncContext,
  executeSyncAnalyzeWorkflow,
  executeSyncApplyWorkflow,
} from '../services/apiClient.js';
import { WORK_TYPE_OPTIONS } from '../utils/templateDefinitions.js';

const props = defineProps({
  geminiConfigured: {
    type: Boolean,
    default: false,
  },
  geminiModel: {
    type: String,
    default: 'gemini-2.5-flash',
  },
  initialIssueKey: {
    type: String,
    default: '',
  },
  initialConfluencePageId: {
    type: String,
    default: '',
  },
});

const workTypeSelectItems = WORK_TYPE_OPTIONS;

const syncIssues = ref([]);
const loadingIssues = ref(false);
const selectedIssue = ref(null);
const loadingContext = ref(false);
const issueContext = ref(null);

const targetPageInput = ref('');
const workType = ref('API_DEVELOPMENT');
const linkedPageInfo = ref(null);

const analyzing = ref(false);
const analyzeError = ref('');
const analysisResult = ref(null);

const editableSpec = ref({
  subtaskDescription: '',
  templateFields: {
    httpMethod: 'POST',
    endpointPath: '/api/v1/resource',
    serviceName: '',
    headersAndParams: [],
    requestPayloadJson: '',
    responseFields: [],
    responsePayloadJson: '',
    statusCodes: [],
    dbEngine: 'SQL Server',
    schemaName: 'dbo',
    tableName: '',
    erdSummary: '',
    columns: [],
    indexes: [],
  },
});

const syncing = ref(false);
const syncResult = ref(null);
const syncError = ref('');

const resolvedConfluencePageId = computed(() => {
  const raw = String(targetPageInput.value || '').trim();
  if (!raw) return linkedPageInfo.value?.id || '';
  const urlMatch = raw.match(/\/pages\/(\d+)/i) || raw.match(/pageId=(\d+)/i);
  if (urlMatch) return urlMatch[1];
  if (/^\d+$/.test(raw)) return raw;
  return raw;
});

async function loadSyncIssues(query = '') {
  loadingIssues.value = true;
  try {
    const list = await searchJiraSyncIssues(query);
    syncIssues.value = list.map((item) => ({
      ...item,
      displayLabel: `${item.key} — ${item.summary}`,
    }));
  } catch (err) {
    console.error('Failed to search sync issues:', err);
  } finally {
    loadingIssues.value = false;
  }
}

let searchTimer = null;
function onSearchSyncIssues(val) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    loadSyncIssues(val || '');
  }, 250);
}

async function loadIssueContext(issueKey) {
  if (!issueKey) return;
  loadingContext.value = true;
  analyzeError.value = '';
  syncResult.value = null;

  try {
    const ctx = await fetchJiraSyncContext(issueKey);
    issueContext.value = ctx;
    if (ctx.inferredWorkType) {
      workType.value = ctx.inferredWorkType;
    }
    if (ctx.linkedConfluencePage?.id) {
      linkedPageInfo.value = ctx.linkedConfluencePage;
      targetPageInput.value = ctx.linkedConfluencePage.id;
    }
  } catch (err) {
    analyzeError.value = err.message || 'Failed to load Jira issue details.';
  } finally {
    loadingContext.value = false;
  }
}

async function onSelectSyncIssue(issue) {
  analysisResult.value = null;
  syncResult.value = null;
  syncError.value = '';
  if (!issue?.key) {
    issueContext.value = null;
    linkedPageInfo.value = null;
    return;
  }
  await loadIssueContext(issue.key);
}

async function handleAnalyzeWithAi() {
  if (!selectedIssue.value?.key) return;
  analyzing.value = true;
  analyzeError.value = '';
  syncResult.value = null;
  syncError.value = '';

  try {
    const { data } = await executeSyncAnalyzeWorkflow({
      issueKey: selectedIssue.value.key,
      confluencePageId: resolvedConfluencePageId.value || undefined,
      workType: workType.value,
    });

    issueContext.value = data.issueContext;
    if (data.confluencePage) {
      linkedPageInfo.value = data.confluencePage;
      if (!targetPageInput.value && data.confluencePage.id) {
        targetPageInput.value = data.confluencePage.id;
      }
    }

    analysisResult.value = data.analysis;
    workType.value = data.analysis.workType || workType.value;
    editableSpec.value = {
      subtaskDescription: data.analysis.subtaskDescription || '',
      templateFields: {
        ...editableSpec.value.templateFields,
        ...(data.analysis.templateFields || {}),
      },
    };
  } catch (err) {
    analyzeError.value = err.message || 'Gemini AI analysis failed.';
  } finally {
    analyzing.value = false;
  }
}

async function handleConfirmSync() {
  if (!selectedIssue.value?.key || !resolvedConfluencePageId.value) return;
  syncing.value = true;
  syncError.value = '';
  syncResult.value = null;

  try {
    const { data } = await executeSyncApplyWorkflow({
      issueKey: selectedIssue.value.key,
      parentIssueKey: issueContext.value?.parentIssueKey || selectedIssue.value.key,
      parentIssueSummary: issueContext.value?.parentIssueSummary || selectedIssue.value.summary,
      subtaskSummary: issueContext.value?.summary || selectedIssue.value.summary,
      subtaskDescription: editableSpec.value.subtaskDescription,
      workType: workType.value,
      confluencePageId: resolvedConfluencePageId.value,
      templateFields: editableSpec.value.templateFields,
    });

    syncResult.value = data;
    linkedPageInfo.value = data.confluencePage;
  } catch (err) {
    syncError.value = err.message || 'Failed to update Confluence page.';
  } finally {
    syncing.value = false;
  }
}

watch(
  () => props.initialIssueKey,
  async (newKey) => {
    if (newKey) {
      selectedIssue.value = {
        key: newKey,
        summary: newKey,
        displayLabel: newKey,
      };
      if (props.initialConfluencePageId) {
        targetPageInput.value = props.initialConfluencePageId;
      }
      await loadIssueContext(newKey);
    }
  },
  { immediate: true }
);

onMounted(async () => {
  await loadSyncIssues('');
});
</script>

<style scoped>
.sticky-preview {
  position: sticky;
  top: 84px;
}
.font-monospace :deep(textarea) {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12.5px;
}
</style>
