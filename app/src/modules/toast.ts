import type { PluginOptions } from 'vue-toastification'
import Toast from 'vue-toastification'
import type { UserModule } from '~/types'

// Import CSS for toastification
import 'vue-toastification/dist/index.css'

const POSITION = {
  TOP_LEFT: 'top-left',
  TOP_CENTER: 'top-center',
  TOP_RIGHT: 'top-right',
  BOTTOM_LEFT: 'bottom-left',
  BOTTOM_CENTER: 'bottom-center',
  BOTTOM_RIGHT: 'bottom-right',
} as const

const options: PluginOptions = {
  position: POSITION.TOP_CENTER,
  timeout: 5000,
  closeButton: 'button',
  icon: false,
  hideProgressBar: true,
  pauseOnFocusLoss: false,
  pauseOnHover: true,
  transition: 'Vue-Toastification__fade', // Vue-Toastification__bounce | Vue-Toastification__slideBlurred
  maxToasts: 5,
  newestOnTop: true,
  // toastDefaults: {
  //   [TYPE.ERROR]: {
  //     timeout: 10000,
  //   },
  //   [TYPE.WARNING]: {
  //     timeout: false,
  //   },
  // },
}

// https://github.com/Maronato/vue-toastification/
export const install: UserModule = ({ app, router, isClient }) => {
  if (isClient) {
    options.onMounted = (_, toastApp) => {
      // Register the router. See here https://github.com/Maronato/vue-toastification/issues/162#issuecomment-945208145
      toastApp.use(router)
    }
    app.use(Toast, options)
    
    // Make toast available globally
    const toast = app.config.globalProperties.$toast
    if (toast) {
      // Store toast instance for use in pinia
      (window as any).__vueToast = toast
    }
  }
}
