import { createPinia } from 'pinia'
import type { Router } from 'vue-router'
import { type UserModule } from '~/types'
import type { FeedbackHandler } from '~/stores/FeedbackHandler'
import useFeedbackHandle from '~/stores/FeedbackHandler'

// Setup Pinia
// https://pinia.esm.dev/

declare module 'pinia' {
  export interface PiniaCustomProperties {
    router: Router
    handle: FeedbackHandler
  }
}

// Access useToast from the global app instance after vue-toastification is installed
let useToast: any

export const install: UserModule = ({ isClient, initialState, app }) => {
  const pinia = createPinia()
  
  pinia.use(({ store }) => {
    const router = useRouter()
    
    // Get toast instance - it should be available after toast module is installed
    let toast: any = null
    
    if (isClient) {
      // Try multiple ways to get the toast instance
      const globalProps = app.config.globalProperties
      
      // Check for toast in different locations
      toast = globalProps.$toast || (window as any).__vueToast
      
      // If still not available, create a working fallback using native notifications or console
      if (!toast) {
        toast = {
          success: (msg: string) => {
            console.log('✅ Success:', msg)
            // Try to show native notification if available
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('Success', { body: msg })
            }
          },
          error: (msg: string) => {
            console.error('❌ Error:', msg)
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('Error', { body: msg })
            }
          },
          warning: (msg: string) => {
            console.warn('⚠️ Warning:', msg)
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('Warning', { body: msg })
            }
          },
          info: (msg: string) => {
            console.info('ℹ️ Info:', msg)
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('Info', { body: msg })
            }
          },
          clear: () => {},
        }
      }
    } else {
      // Server-side: provide a no-op toast
      toast = {
        success: () => {},
        error: () => {},
        warning: () => {},
        info: () => {},
        clear: () => {},
      }
    }
    
    store.router = markRaw(router)
    store.handle = markRaw(useFeedbackHandle(toast))
  })
  
  app.use(pinia)
  // Refer to
  // https://github.com/antfu/vite-ssg/blob/main/README.md#state-serialization
  // for other serialization strategies.
  if (isClient) {
    pinia.state.value = initialState.pinia || {}
  } else {
    initialState.pinia = pinia.state.value
  }
}
