import { createApp } from 'vue';
import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';
import './styles/linear.css';
import { createVuetify } from 'vuetify';
import App from './App.vue';

const vuetify = createVuetify({
  defaults: {
    VCard: {
      elevation: 0,
      rounded: 'xl',
    },
    VBtn: {
      elevation: 0,
      rounded: 'lg',
    },
    VTextField: {
      variant: 'outlined',
      density: 'comfortable',
      color: 'primary',
    },
    VSelect: {
      variant: 'outlined',
      density: 'comfortable',
      color: 'primary',
    },
    VAutocomplete: {
      variant: 'outlined',
      density: 'comfortable',
      color: 'primary',
    },
    VTextarea: {
      variant: 'outlined',
      density: 'comfortable',
      color: 'primary',
    },
  },
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        colors: {
          primary: '#5E6AD2',
          secondary: '#18181B',
          accent: '#6366F1',
          success: '#10B981',
          warning: '#F59E0B',
          error: '#EF4444',
          background: '#F8F9FB',
          surface: '#FFFFFF',
        },
      },
    },
  },
});

createApp(App).use(vuetify).mount('#app');
