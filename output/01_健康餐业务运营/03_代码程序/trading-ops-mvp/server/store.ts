import type {
  BalancePaymentInput,
  ConfirmPaymentInput,
  CreateCustomerInput,
  CreateOrderInput,
  OperationState,
  PaymentRequestInput,
  ProductInput,
  RefundInput,
  SupplierInput,
  SupplierBatchInput,
  UpdateCustomerInput,
  VoidPaymentInput,
} from './types.ts'

export interface TradingOpsStore {
  getState(): Promise<OperationState>
  createCustomer(input: CreateCustomerInput): Promise<OperationState>
  updateCustomer(id: string, input: UpdateCustomerInput): Promise<OperationState>
  deleteCustomer(id: string): Promise<OperationState>
  createOrder(input: CreateOrderInput): Promise<OperationState>
  payOrderWithBalance(orderId: string, input: BalancePaymentInput): Promise<OperationState>
  cancelOrder(orderId: string): Promise<OperationState>
  createPaymentRequest(input: PaymentRequestInput): Promise<OperationState>
  cancelPaymentRequest(paymentRequestId: string): Promise<OperationState>
  deletePaymentRequest(paymentRequestId: string): Promise<OperationState>
  confirmPayment(input: ConfirmPaymentInput): Promise<OperationState>
  voidPayment(paymentId: string, input: VoidPaymentInput): Promise<OperationState>
  generateSupplierBatch(input: SupplierBatchInput): Promise<OperationState>
  confirmSupplierBatch(batchId: string): Promise<OperationState>
  completeOrder(orderId: string): Promise<OperationState>
  refundOrder(input: RefundInput): Promise<OperationState>
  createProduct(input: ProductInput): Promise<OperationState>
  updateProduct(id: string, input: ProductInput): Promise<OperationState>
  deleteProduct(id: string): Promise<OperationState>
  createSupplier(input: SupplierInput): Promise<OperationState>
  updateSupplier(id: string, input: SupplierInput): Promise<OperationState>
  deleteSupplier(id: string): Promise<OperationState>
}

export class DomainError extends Error {
  public readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

let sequence = 1000

export function newId(prefix: string) {
  sequence += 1
  return `${prefix}-${sequence}`
}

export function nowIso() {
  const businessDate = process.env.BUSINESS_DATE ?? '2026-06-07'
  const clock = new Date().toISOString().slice(11)
  return `${businessDate}T${clock}`
}

export function money(value: number) {
  return Number(value.toFixed(2))
}
