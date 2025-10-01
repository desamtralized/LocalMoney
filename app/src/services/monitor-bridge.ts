import axios from 'axios'

// Construct URL from current location with different port
// In development: http://localhost:8081
// In production: uses same hostname as frontend with monitor port
const MONITOR_API_PORT = import.meta.env.VITE_MONITOR_API_PORT || '8081'
const MONITOR_API_BASE_URL = typeof window !== 'undefined'
  ? `${window.location.protocol}//${window.location.hostname}:${MONITOR_API_PORT}`
  : 'http://localhost:8081'

export interface TransactionStatus {
  status: string
  kujira_tx_hash: string
  amount: string
  bsc_recipient: string
  bsc_tx_hash: string | null
  error_message: string | null
  created_at: string
  processed_at: string | null
}

class MonitorService {
  async getTransactionStatus(txHash: string): Promise<TransactionStatus | null> {
    try {
      const response = await axios.get<TransactionStatus>(
        `${MONITOR_API_BASE_URL}/api/transaction/${txHash}`
      )
      return response.data
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null
      }
      throw error
    }
  }
}

export const monitorService = new MonitorService()
