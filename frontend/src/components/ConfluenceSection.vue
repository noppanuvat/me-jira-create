<template>
  <v-card class="linear-card mb-6 pa-6">
    <!-- Minimal Section Header -->
    <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-4">
      <div class="d-flex align-center">
        <span class="linear-step-badge mr-3">2</span>
        <div>
          <div class="text-subtitle-1 font-weight-bold text-grey-darken-4">
            Confluence Documentation
          </div>
          <div class="text-caption text-medium-emphasis">
            Configure target space, folder/page, and specification parameters
          </div>
        </div>
      </div>

      <v-chip
        v-if="createConfluence"
        color="primary"
        variant="tonal"
        size="small"
        class="font-weight-medium"
        :prepend-icon="
          workType === 'API_DEVELOPMENT' ? 'mdi-api' : 'mdi-database-cog-outline'
        "
      >
        {{ workType === 'API_DEVELOPMENT' ? 'API Development' : 'Database Design' }}
      </v-chip>
      <v-chip
        v-else
        color="grey-darken-1"
        variant="tonal"
        size="small"
        class="font-weight-medium"
      >
        Skipped
      </v-chip>
    </div>

    <v-expand-transition>
      <div v-if="createConfluence">
        <v-row dense>
          <!-- Space Selector -->
          <v-col cols="12" sm="5">
            <v-select
              :model-value="spaceKey"
              :items="spaces"
              :loading="loadingSpaces"
              item-title="displayName"
              item-value="key"
              label="Confluence Space"
              prepend-inner-icon="mdi-folder-outline"
              @update:model-value="$emit('update:spaceKey', $event)"
            />
          </v-col>

          <!-- Parent Folder / Page Selector / Search -->
          <v-col cols="12" sm="7">
            <v-autocomplete
              :model-value="parentPageId"
              :items="parentPages"
              :loading="loadingPages"
              item-title="displayTitle"
              item-value="id"
              clearable
              no-filter
              label="Parent Folder or Page"
              placeholder="Search title, ID, or paste Confluence Folder/Page URL..."
              prepend-inner-icon="mdi-folder-open-outline"
              @update:search="onSearchParentPages"
              @update:model-value="$emit('update:parentPageId', $event)"
            >
              <template #item="{ props: itemProps, item }">
                <v-list-item v-bind="itemProps" :title="undefined" :subtitle="undefined" class="py-2">
                  <template #prepend>
                    <v-icon
                      :icon="item.raw.type === 'folder' ? 'mdi-folder-outline' : 'mdi-file-document-outline'"
                      :color="item.raw.type === 'folder' ? 'amber-darken-3' : 'primary'"
                      size="18"
                      class="mr-2"
                    />
                  </template>
                  <v-list-item-title class="text-body-2 font-weight-medium">
                    {{ item.raw.title }}
                  </v-list-item-title>
                  <v-list-item-subtitle class="text-caption">
                    {{ item.raw.type === 'folder' ? 'Folder' : 'Page' }} · ID: {{ item.raw.id }}
                  </v-list-item-subtitle>
                </v-list-item>
              </template>
            </v-autocomplete>
          </v-col>
        </v-row>

        <!-- Custom Page Title Override (optional) -->
        <v-text-field
          :model-value="customPageTitle"
          label="Custom Page Title (Optional)"
          placeholder="Leave blank to auto-format as [SUBTASK-KEY] Spec Title"
          prepend-inner-icon="mdi-file-document-edit-outline"
          clearable
          class="mb-2"
          @update:model-value="$emit('update:customPageTitle', $event || '')"
        />

        <!-- Template Specific Quick Inputs (Soft borderless box) -->
        <v-sheet class="linear-subtle-box pa-4 mt-1">
          <div class="d-flex align-center justify-space-between mb-3">
            <span class="text-caption font-weight-bold text-uppercase text-medium-emphasis">
              {{
                workType === 'API_DEVELOPMENT'
                  ? 'API Specification Parameters'
                  : 'Database Schema Parameters'
              }}
            </span>
            <span class="text-caption text-medium-emphasis">
              Pre-fills Confluence tables
            </span>
          </div>

          <!-- API Development Parameters -->
          <v-row v-if="workType === 'API_DEVELOPMENT'" dense>
            <v-col cols="12" sm="4">
              <v-select
                :model-value="templateFields.httpMethod"
                :items="['GET', 'POST', 'PUT', 'PATCH', 'DELETE']"
                label="Method"
                density="compact"
                @update:model-value="updateField('httpMethod', $event)"
              />
            </v-col>
            <v-col cols="12" sm="8">
              <v-text-field
                :model-value="templateFields.endpointPath"
                label="URI Path"
                placeholder="/api/v1/payments/qr"
                density="compact"
                @update:model-value="updateField('endpointPath', $event)"
              />
            </v-col>
            <v-col cols="12">
              <v-text-field
                :model-value="templateFields.serviceName"
                label="Target Service"
                placeholder="Payment Gateway Service"
                density="compact"
                hide-details
                @update:model-value="updateField('serviceName', $event)"
              />
            </v-col>
          </v-row>

          <!-- Database Design Parameters -->
          <v-row v-else dense>
            <v-col cols="12" sm="6">
              <v-text-field
                :model-value="templateFields.schemaName"
                label="Schema"
                placeholder="dbo / payment"
                density="compact"
                hide-details
                @update:model-value="updateField('schemaName', $event)"
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                :model-value="templateFields.tableName"
                label="Table Name"
                placeholder="payment_transactions"
                density="compact"
                hide-details
                @update:model-value="updateField('tableName', $event)"
              />
            </v-col>
          </v-row>
        </v-sheet>
      </div>

      <!-- Shown when Confluence creation is toggled off -->
      <v-sheet v-else class="linear-subtle-box pa-4 d-flex align-center">
        <v-icon icon="mdi-checkbox-marked-circle-outline" color="secondary" size="20" class="mr-3" />
        <div class="text-body-2 text-medium-emphasis">
          Confluence page creation is turned off. Only the <strong>Jira Subtask</strong> will be created.
        </div>
      </v-sheet>
    </v-expand-transition>
  </v-card>
</template>

<script setup>
const props = defineProps({
  createConfluence: {
    type: Boolean,
    default: true,
  },
  workType: {
    type: String,
    default: 'API_DEVELOPMENT',
  },
  spaces: {
    type: Array,
    default: () => [],
  },
  loadingSpaces: {
    type: Boolean,
    default: false,
  },
  spaceKey: {
    type: String,
    default: '',
  },
  parentPages: {
    type: Array,
    default: () => [],
  },
  loadingPages: {
    type: Boolean,
    default: false,
  },
  parentPageId: {
    type: String,
    default: '',
  },
  customPageTitle: {
    type: String,
    default: '',
  },
  templateFields: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits([
  'update:spaceKey',
  'update:parentPageId',
  'update:customPageTitle',
  'update:templateFields',
  'search-pages',
]);

let pageSearchTimer = null;
function onSearchParentPages(query) {
  clearTimeout(pageSearchTimer);
  pageSearchTimer = setTimeout(() => {
    emit('search-pages', query || '');
  }, 250);
}

function updateField(key, value) {
  emit('update:templateFields', {
    ...props.templateFields,
    [key]: value,
  });
}
</script>
