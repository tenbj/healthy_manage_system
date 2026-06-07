export type CustomerStatus = 'NEW' | 'QUOTED' | 'WAIT_PAY' | 'ACTIVE' | 'REPEAT' | 'LOST'

export type OrderStatus =
  | 'WAIT_PAY'
  | 'PAID_WAIT_SUPPLIER'
  | 'SENT_TO_SUPPLIER'
  | 'SUPPLIER_CONFIRMED'
  | 'COMPLETED'
  | 'AFTER_SALE'
  | 'REFUNDED'
  | 'CANCELED'

export type PaymentRequestType = 'ORDER_PAYMENT' | 'PREPAID_TOPUP' | 'BALANCE_SHORTFALL'
export type PaymentRequestStatus = 'WAIT_PAY' | 'PAID' | 'CANCELED'
export type PaymentType = 'ORDER_PAYMENT' | 'PREPAID_TOPUP' | 'REFUND'
export type PaymentStatus = 'POSTED' | 'VOIDED'
export type LedgerType = 'TOPUP' | 'DEDUCT' | 'REFUND' | 'ADJUST'
export type BatchStatus = 'GENERATED' | 'SENT' | 'CONFIRMED'
export type ProductStatus = 'ACTIVE' | 'INACTIVE'
export type SupplierStatus = 'ACTIVE' | 'INACTIVE'

export interface Customer {
  id: string
  name: string
  wechatName: string
  phone: string
  source: string
  address: string
  preference: string
  status: CustomerStatus
  balance: number
  createdAt: string
}

export interface Order {
  id: string
  customerId: string
  customerName: string
  serviceDate: string
  mealName: string
  supplierId: string
  supplierName: string
  amount: number
  supplierCost: number
  deliveryCost: number
  grossProfit: number
  status: OrderStatus
  paymentStatus: 'UNPAID' | 'PAID' | 'REFUNDED'
  note: string
  createdAt: string
}

export interface OrderStatusLog {
  id: string
  orderId: string
  fromStatus: OrderStatus | 'CREATED'
  toStatus: OrderStatus
  note: string
  createdAt: string
}

export interface PaymentRequest {
  id: string
  customerId: string
  customerName: string
  orderId: string | null
  type: PaymentRequestType
  amount: number
  status: PaymentRequestStatus
  method: string
  note: string
  createdAt: string
  paidAt: string | null
}

export interface Payment {
  id: string
  paymentRequestId: string
  customerId: string
  orderId: string | null
  type: PaymentType
  amount: number
  method: string
  idempotencyKey: string
  createdAt: string
  status: PaymentStatus
  voidedAt: string | null
  voidReason: string | null
}

export interface PrepaidLedger {
  id: string
  customerId: string
  orderId: string | null
  type: LedgerType
  amount: number
  balanceAfter: number
  note: string
  idempotencyKey: string
  createdAt: string
}

export interface SupplierBatchItem {
  id: string
  batchId: string
  orderId: string
  customerName: string
  mealName: string
  address: string
  note: string
  amount: number
  supplierCost: number
}

export interface SupplierBatch {
  id: string
  supplierId: string
  supplierName: string
  serviceDate: string
  status: BatchStatus
  copyText: string
  itemCount: number
  totalCost: number
  createdAt: string
  confirmedAt: string | null
  items: SupplierBatchItem[]
}

export interface ReconciliationIssue {
  id: string
  level: 'BLOCKER' | 'HIGH' | 'MEDIUM' | 'LOW'
  type: string
  title: string
  detail: string
  relatedId: string | null
  resolved: boolean
}

export interface Product {
  id: string
  name: string
  category: string
  description: string
  amount: number
  supplierCost: number
  deliveryCost: number
  supplierId: string
  supplierName: string
  status: ProductStatus
}

export interface Supplier {
  id: string
  name: string
  contact: string
  status: SupplierStatus
  notes: string
}

export interface DashboardSummary {
  today: string
  orderCount: number
  waitPayCount: number
  waitSupplierCount: number
  unconfirmedBatchCount: number
  revenue: number
  cashIn: number
  prepaidTopup: number
  prepaidDeducted: number
  refund: number
  supplierCost: number
  deliveryCost: number
  grossProfit: number
  issueCount: number
}

export interface OperationState {
  dashboard: DashboardSummary
  customers: Customer[]
  orders: Order[]
  paymentRequests: PaymentRequest[]
  payments: Payment[]
  prepaidLedger: PrepaidLedger[]
  supplierBatches: SupplierBatch[]
  issues: ReconciliationIssue[]
  products: Product[]
  suppliers: Supplier[]
}

export interface CreateCustomerInput {
  name: string
  wechatName: string
  phone?: string
  source: string
  address: string
  preference: string
}

export interface UpdateCustomerInput extends CreateCustomerInput {
  status: CustomerStatus
}

export interface CreateOrderInput {
  customerId: string
  serviceDate: string
  productId: string
  note?: string
  payWithBalance?: boolean
  idempotencyKey?: string
}

export interface PaymentRequestInput {
  customerId: string
  orderId?: string | null
  type: PaymentRequestType
  amount: number
  method?: string
  note?: string
}

export interface ConfirmPaymentInput {
  paymentRequestId: string
  method: string
  idempotencyKey: string
}

export interface BalancePaymentInput {
  idempotencyKey?: string
}

export interface SupplierBatchInput {
  supplierId: string
  serviceDate: string
}

export interface RefundInput {
  orderId: string
  amount: number
  reason: string
  idempotencyKey: string
}

export interface ProductInput {
  name: string
  category: string
  description?: string
  amount: number
  supplierCost: number
  deliveryCost: number
  supplierId: string
  status?: ProductStatus
}

export interface SupplierInput {
  name: string
  contact: string
  status?: SupplierStatus
  notes?: string
}

export interface VoidPaymentInput {
  reason: string
}
