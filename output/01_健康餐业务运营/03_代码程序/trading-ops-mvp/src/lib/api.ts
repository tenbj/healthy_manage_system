import type { CustomerStatus, OperationState, PaymentRequestType, ProductStatus, SupplierStatus } from '../types/domain'

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
  updateCustomer: (
    id: string,
    payload: {
      name: string
      wechatName: string
      phone?: string
      source: string
      address: string
      preference: string
      status: CustomerStatus
    },
  ) =>
    request<OperationState>(`/customers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteCustomer: (id: string) =>
    request<OperationState>(`/customers/${id}`, {
      method: 'DELETE',
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
  cancelOrder: (orderId: string) =>
    request<OperationState>(`/orders/${orderId}/cancel`, {
      method: 'PATCH',
    }),
  payOrderWithBalance: (orderId: string) =>
    request<OperationState>(`/orders/${orderId}/balance-payment`, {
      method: 'POST',
      body: JSON.stringify({ idempotencyKey: `balance-${orderId}-${Date.now()}` }),
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
  cancelPaymentRequest: (paymentRequestId: string) =>
    request<OperationState>(`/payment-requests/${paymentRequestId}/cancel`, {
      method: 'PATCH',
    }),
  deletePaymentRequest: (paymentRequestId: string) =>
    request<OperationState>(`/payment-requests/${paymentRequestId}`, {
      method: 'DELETE',
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
  voidPayment: (paymentId: string, reason: string) =>
    request<OperationState>(`/payments/${paymentId}/void`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
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
  createProduct: (payload: {
    name: string
    category: string
    description?: string
    amount: number
    supplierCost: number
    deliveryCost: number
    supplierId: string
    status?: ProductStatus
  }) =>
    request<OperationState>('/products', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateProduct: (
    id: string,
    payload: {
      name: string
      category: string
      description?: string
      amount: number
      supplierCost: number
      deliveryCost: number
      supplierId: string
      status?: ProductStatus
    },
  ) =>
    request<OperationState>(`/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteProduct: (id: string) =>
    request<OperationState>(`/products/${id}`, {
      method: 'DELETE',
    }),
  createSupplier: (payload: { name: string; contact: string; status?: SupplierStatus; notes?: string }) =>
    request<OperationState>('/suppliers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateSupplier: (id: string, payload: { name: string; contact: string; status?: SupplierStatus; notes?: string }) =>
    request<OperationState>(`/suppliers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteSupplier: (id: string) =>
    request<OperationState>(`/suppliers/${id}`, {
      method: 'DELETE',
    }),
}
