<template>
  <v-card class="linear-card sticky-preview pa-6">
    <!-- Minimal Section Header (No heavy dark banner) -->
    <div class="d-flex align-center mb-5">
      <span class="linear-step-badge mr-3">3</span>
      <div>
        <div class="text-subtitle-1 font-weight-bold text-grey-darken-4">
          Preview &amp; Create
        </div>
        <div class="text-caption text-medium-emphasis">
          Review page title and structure before generating
        </div>
      </div>
    </div>

    <div>
      <!-- Target Summary Box -->
      <v-sheet class="linear-subtle-box pa-4 mb-5">
        <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis mb-1">
          {{ createConfluence ? 'Confluence Page Title' : 'Execution Mode' }}
        </div>
        <div class="text-subtitle-2 font-weight-bold text-grey-darken-4 d-flex align-center mb-3">
          <v-icon
            :icon="createConfluence ? 'mdi-file-document-outline' : 'mdi-checkbox-marked-circle-outline'"
            size="18"
            color="primary"
            class="mr-2"
          />
          <span>{{ createConfluence ? previewPageTitle : 'Jira Subtask Only (Skip Confluence Page)' }}</span>
        </div>

        <div class="d-flex flex-wrap ga-2">
          <v-chip size="x-small" color="primary" variant="tonal" class="font-weight-medium">
            Jira: {{ selectedParentIssue?.key || 'None' }}
          </v-chip>
          <v-chip size="x-small" color="primary" variant="tonal" class="font-weight-medium">
            Squad: SQ16
          </v-chip>
          <v-chip size="x-small" color="primary" variant="tonal" class="font-weight-medium">
            Team: UCHOOSE
          </v-chip>
          <template v-if="createConfluence">
            <v-chip size="x-small" color="grey-darken-2" variant="tonal" class="font-weight-medium">
              Space: {{ spaceKey || 'Default' }}
            </v-chip>
            <v-chip size="x-small" color="grey-darken-2" variant="tonal" class="font-weight-medium">
              Parent ID: {{ parentPageId || 'Root' }}
            </v-chip>
          </template>
          <v-chip v-else size="x-small" color="grey-darken-1" variant="tonal" class="font-weight-medium">
            Confluence: Skipped
          </v-chip>
        </div>
      </v-sheet>

      <!-- Document Sections Preview -->
      <template v-if="createConfluence">
        <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis mb-2">
          Document Outline ({{
            workType === 'API_DEVELOPMENT' ? 'API Development' : 'Database Design'
          }})
        </div>

        <v-sheet class="linear-subtle-box pa-3 mb-5">
          <div
            v-for="section in sections"
            :key="section.key"
            class="py-2 px-2 rounded-lg"
          >
            <div class="d-flex align-center text-body-2 font-weight-bold text-grey-darken-4">
              <v-icon icon="mdi-circle-small" size="18" color="primary" class="mr-1" />
              <span>{{ section.title }}</span>
            </div>
            <div class="text-caption text-medium-emphasis pl-5">
              {{ section.items.join(' · ') }}
            </div>
          </div>
        </v-sheet>
      </template>

      <!-- Execution Status Stepper / Banner -->
      <v-expand-transition>
        <div v-if="executionResult" class="mb-5">
          <!-- Step Status Row -->
          <v-sheet class="linear-subtle-box pa-4 mb-3">
            <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis mb-2">
              Execution Progress
            </div>
            <div class="d-flex align-center justify-space-between text-body-2 mb-2">
              <span class="text-grey-darken-3">1. Create Jira Subtask</span>
              <v-chip
                size="x-small"
                :color="stepChipColor(executionResult.steps?.jiraSubtask)"
                variant="tonal"
                class="font-weight-bold"
              >
                {{ executionResult.steps?.jiraSubtask || 'PENDING' }}
              </v-chip>
            </div>
            <div class="d-flex align-center justify-space-between text-body-2 mb-2">
              <span class="text-grey-darken-3">2. Create Confluence Page</span>
              <v-chip
                size="x-small"
                :color="stepChipColor(executionResult.steps?.confluencePage)"
                variant="tonal"
                class="font-weight-bold"
              >
                {{ executionResult.steps?.confluencePage || 'PENDING' }}
              </v-chip>
            </div>
            <div class="d-flex align-center justify-space-between text-body-2">
              <span class="text-grey-darken-3">3. Link Page to Subtask</span>
              <v-chip
                size="x-small"
                :color="stepChipColor(executionResult.steps?.remoteLink)"
                variant="tonal"
                class="font-weight-bold"
              >
                {{ executionResult.steps?.remoteLink || 'PENDING' }}
              </v-chip>
            </div>
          </v-sheet>

          <!-- SUCCESS ALERT -->
          <v-alert
            v-if="executionResult.status === 'COMPLETED'"
            type="success"
            variant="tonal"
            rounded="lg"
            class="mb-3"
          >
            <div class="text-body-2 font-weight-bold mb-1">
              {{
                executionResult.confluencePage
                  ? 'Subtask & Confluence Page Ready'
                  : 'Jira Subtask Ready'
              }}
            </div>
            <div class="text-caption mb-3">
              <template v-if="executionResult.confluencePage">
                <strong>{{ executionResult.subtask.key }}</strong> is linked with
                <strong>{{ executionResult.confluencePage.title }}</strong>.
              </template>
              <template v-else>
                Jira Subtask <strong>{{ executionResult.subtask.key }}</strong> was created without Confluence documentation.
              </template>
            </div>
            <div class="d-flex flex-wrap ga-2">
              <v-btn
                color="primary"
                variant="flat"
                size="small"
                class="linear-btn"
                prepend-icon="mdi-open-in-new"
                :href="executionResult.subtask.url"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Jira ({{ executionResult.subtask.key }})
              </v-btn>
              <v-btn
                v-if="executionResult.confluencePage"
                color="success"
                variant="flat"
                size="small"
                class="linear-btn"
                prepend-icon="mdi-book-open-page-variant-outline"
                :href="executionResult.confluencePage.url"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Confluence Page
              </v-btn>
              <v-btn
                v-if="executionResult.confluencePage"
                color="secondary"
                variant="tonal"
                size="small"
                class="linear-btn"
                prepend-icon="mdi-creation"
                @click="$emit('open-sync-mode', executionResult)"
              >
                Sync Updates with AI
              </v-btn>
            </div>
          </v-alert>

          <!-- PARTIAL FAILURE ALERT (Confluence failed after Subtask succeeded) -->
          <v-alert
            v-else-if="executionResult.status === 'PARTIAL_FAILURE'"
            type="warning"
            variant="tonal"
            rounded="lg"
            class="mb-3"
          >
            <div class="text-body-2 font-weight-bold mb-1">
              Subtask {{ executionResult.subtask.key }} created, Confluence step failed
            </div>
            <div class="text-caption mb-3">
              {{ executionResult.error?.message }}
            </div>
            <div class="d-flex flex-wrap ga-2">
              <v-btn
                color="secondary"
                variant="tonal"
                size="small"
                class="linear-btn"
                prepend-icon="mdi-open-in-new"
                :href="executionResult.subtask.url"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Jira ({{ executionResult.subtask.key }})
              </v-btn>
              <v-btn
                color="warning"
                variant="flat"
                size="small"
                class="linear-btn"
                prepend-icon="mdi-refresh"
                :loading="submitting"
                @click="$emit('retry-confluence')"
              >
                Retry Confluence Only
              </v-btn>
            </div>
          </v-alert>

          <!-- FULL FAILURE ALERT -->
          <v-alert
            v-else-if="executionResult.status === 'FAILED'"
            type="error"
            variant="tonal"
            rounded="lg"
            class="mb-3"
          >
            <div class="text-body-2 font-weight-bold">Execution Failed</div>
            <div class="text-caption">{{ executionResult.error?.message }}</div>
          </v-alert>
        </div>
      </v-expand-transition>

      <!-- Primary Action Buttons -->
      <div class="d-flex flex-column ga-2">
        <v-btn
          v-if="!lockedSubtask"
          color="primary"
          size="large"
          block
          class="linear-btn-primary"
          :loading="submitting"
          :disabled="!canSubmit"
          prepend-icon="mdi-sparkles"
          @click="$emit('submit-create-all')"
        >
          {{
            createConfluence
              ? 'Create Subtask & Confluence Page'
              : 'Create Jira Subtask Only'
          }}
        </v-btn>

        <v-btn
          v-else-if="executionResult?.status === 'PARTIAL_FAILURE'"
          color="warning"
          size="large"
          block
          class="linear-btn"
          :loading="submitting"
          prepend-icon="mdi-refresh"
          @click="$emit('retry-confluence')"
        >
          Retry Confluence Page for {{ lockedSubtask.key }}
        </v-btn>

        <v-btn
          v-if="executionResult"
          variant="text"
          color="secondary"
          size="small"
          class="linear-btn"
          prepend-icon="mdi-plus"
          @click="$emit('reset-workflow')"
        >
          Create Another Task
        </v-btn>
      </div>
    </div>
  </v-card>
</template>

<script setup>
defineProps({
  createConfluence: {
    type: Boolean,
    default: true,
  },
  selectedParentIssue: {
    type: Object,
    default: null,
  },
  workType: {
    type: String,
    default: 'API_DEVELOPMENT',
  },
  spaceKey: {
    type: String,
    default: '',
  },
  parentPageId: {
    type: String,
    default: '',
  },
  previewPageTitle: {
    type: String,
    required: true,
  },
  sections: {
    type: Array,
    default: () => [],
  },
  submitting: {
    type: Boolean,
    default: false,
  },
  canSubmit: {
    type: Boolean,
    default: false,
  },
  lockedSubtask: {
    type: Object,
    default: null,
  },
  executionResult: {
    type: Object,
    default: null,
  },
});

defineEmits([
  'submit-create-all',
  'retry-confluence',
  'reset-workflow',
  'open-sync-mode',
]);

function stepChipColor(status) {
  if (status === 'SUCCESS') return 'success';
  if (status === 'FAILED') return 'error';
  return 'grey';
}
</script>

<style scoped>
.sticky-preview {
  position: sticky;
  top: 84px;
}
</style>
