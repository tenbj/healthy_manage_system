import type {
  ConfirmPaymentInput,
  CreateCustomerInput,
  CreateOrderInput,
  OperationState,
  PaymentRequestInput,
  RefundInput,
  SupplierBatchInput,
} from './types.ts'

export interface TradingOpsStore {
  getState(): Promise<OperationState>
  createCustomer(input: CreateCustomerInput): Promise<OperationState>
  createOrder(input: CreateOrderInput): Promise<OperationState>
  createPaymentRequest(input: PaymentRequestInput): Promise<OperationState>
  confirmPayment(input: ConfirmPaymentInput): Promise<OperationState>
  generateSupplierBatch(input: SupplierBatchInput): Promise<OperationState>
  confirmSupplierBatch(batchId: string): Promise<OperationState>
  completeOrder(orderId: string): Promise<OperationState>
  refundOrder(input: RefundInput): Promise<OperationState>
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
