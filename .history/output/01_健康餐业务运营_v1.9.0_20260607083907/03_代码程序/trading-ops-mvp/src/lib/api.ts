import type { OperationState, PaymentRequestType } from '../types/domain'

const apiBase = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${url}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `请求失败：${response.status}`)
  }
  return response.json() as Promise<T>
}

export const api = {
  state: () => request<OperationState>('/state'),
  createCustomer: (payload: {
    name: string
    wechatName: string
    phone?: string
    source: string
    address: string
    preference: string
  }) =>
    request<OperationState>('/customers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  createOrder: (payload: {
    customerId: string
    serviceDate: string
    productId: string
    note?: string
    payWithBalance?: boolean
    idempotencyKey?: string
  }) =>
    request<OperationState>('/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  createPaymentRequest: (payload: {
    customerId: string
    orderId?: string | null
    type: PaymentRequestType
    amount: number
    method?: string
    note?: string
  }) =>
    request<OperationState>('/payment-requests', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  confirmPayment: (paymentRequestId: string) =>
    request<OperationState>('/payments/confirm', {
      method: 'POST',
      body: JSON.stringify({
        paymentRequestId,
        method: '微信',
        idempotencyKey: `ui-${paymentRequestId}`,
      }),
    }),
  generateBatch: (supplierId: string, serviceDate: string) =>
    request<OperationState>('/supplier-batches', {
      method: 'POST',
      body: JSON.stringify({ supplierId, serviceDate }),
    }),
  confirmBatch: (batchId: string) =>
    request<OperationState>(`/supplier-batches/${batchId}/confirm`, {
      method: 'PATCH',
    }),
  completeOrder: (orderId: string) =>
    request<OperationState>(`/orders/${orderId}/complete`, {
      method: 'PATCH',
    }),
  refundOrder: (orderId: string, amount: number) =>
    request<OperationState>('/refunds', {
      method: 'POST',
      body: JSON.stringify({
        orderId,
        amount,
        reason: '运营登记退款',
        idempotencyKey: `refund-${orderId}-${amount}`,
      }),
    }),
}
