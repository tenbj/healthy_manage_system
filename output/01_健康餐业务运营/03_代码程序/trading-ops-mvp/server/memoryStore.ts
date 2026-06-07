import { customers as seedCustomers, products, suppliers, today } from './data/seed.ts'
import { DomainError, money, newId, nowIso, type TradingOpsStore } from './store.ts'
import type {
  BatchStatus,
  ConfirmPaymentInput,
  CreateCustomerInput,
  CreateOrderInput,
  Customer,
  DashboardSummary,
  OperationState,
  Order,
  OrderStatus,
  OrderStatusLog,
  Payment,
  PaymentRequest,
  PaymentRequestInput,
  PrepaidLedger,
  ReconciliationIssue,
  RefundInput,
  SupplierBatch,
  SupplierBatchInput,
  SupplierBatchItem,
} from './types.ts'

interface MemoryData {
  customers: Customer[]
  orders: Order[]
  orderLogs: OrderStatusLog[]
  paymentRequests: PaymentRequest[]
  payments: Payment[]
  prepaidLedger: PrepaidLedger[]
  supplierBatches: SupplierBatch[]
  issues: ReconciliationIssue[]
}

export function createMemoryStore(): TradingOpsStore {
  const data: MemoryData = {
    customers: seedCustomers.map((customer) => ({ ...customer })),
    orders: [],
    orderLogs: [],
    paymentRequests: [],
    payments: [],
    prepaidLedger: [],
    supplierBatches: [],
    issues: [],
  }

  seedInitialOrders(data)

  function findCustomer(id: string) {
    const customer = data.customers.find((item) => item.id === id)
    if (!customer) throw new DomainError('客户不存在', 404)
    return customer
  }

  function findOrder(id: string) {
    const order = data.orders.find((item) => item.id === id)
    if (!order) throw new DomainError('订单不存在', 404)
    return order
  }

  function setOrderStatus(order: Order, status: OrderStatus, note: string) {
    if (order.status === status) return
    data.orderLogs.push({
      id: newId('LOG'),
      orderId: order.id,
      fromStatus: order.status,
      toStatus: status,
      note,
      createdAt: nowIso(),
    })
    order.status = status
  }

  function buildCopyText(batch: SupplierBatch) {
    const lines = [
      `【${batch.serviceDate} 健康餐下单】`,
      `供应商：${batch.supplierName}`,
      `订单数：${batch.items.length}`,
      '',
      ...batch.items.map(
        (item, index) =>
          `${index + 1}. ${item.customerName}｜${item.mealName}｜${item.address}｜备注：${item.note || '无'}`,
      ),
      '',
      '请确认以上订单可接单，如有异常请直接回复序号。',
    ]
    return lines.join('\n')
  }

  function getState(): Promise<OperationState> {
    refreshIssues(data)
    return Promise.resolve({
      dashboard: calculateDashboard(data),
      customers: [...data.customers],
      orders: [...data.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      paymentRequests: [...data.paymentRequests].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      payments: [...data.payments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      prepaidLedger: [...data.prepaidLedger].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      supplierBatches: [...data.supplierBatches].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      issues: [...data.issues],
      products,
      suppliers,
    })
  }

  return {
    getState,

    async createCustomer(input: CreateCustomerInput) {
      const customer: Customer = {
        id: newId('C'),
        name: input.name,
        wechatName: input.wechatName,
        phone: input.phone ?? '',
        source: input.source,
        address: input.address,
        preference: input.preference,
        status: 'NEW',
        balance: 0,
        createdAt: nowIso(),
      }
      data.customers.unshift(customer)
      return getState()
    },

    async createOrder(input: CreateOrderInput) {
      if (input.idempotencyKey) {
        const existingLedger = data.prepaidLedger.find((item) => item.idempotencyKey === input.idempotencyKey)
        if (existingLedger?.orderId) return getState()
      }

      const customer = findCustomer(input.customerId)
      const product = products.find((item) => item.id === input.productId)
      if (!product) throw new DomainError('餐品不存在', 404)

      const order: Order = {
        id: newId('O'),
        customerId: customer.id,
        customerName: customer.name,
        serviceDate: input.serviceDate,
        mealName: product.name,
        supplierId: product.supplierId,
        supplierName: product.supplierName,
        amount: product.amount,
        supplierCost: product.supplierCost,
        deliveryCost: product.deliveryCost,
        grossProfit: money(product.amount - product.supplierCost - product.deliveryCost),
        status: 'WAIT_PAY',
        paymentStatus: 'UNPAID',
        note: input.note ?? customer.preference,
        createdAt: nowIso(),
      }
      data.orders.unshift(order)
      data.orderLogs.push({
        id: newId('LOG'),
        orderId: order.id,
        fromStatus: 'CREATED',
        toStatus: 'WAIT_PAY',
        note: '创建订单',
        createdAt: nowIso(),
      })

      if (input.payWithBalance) {
        if (customer.balance < order.amount) throw new DomainError('客户预付款余额不足，不能核销')
        customer.balance = money(customer.balance - order.amount)
        data.prepaidLedger.push({
          id: newId('LEDGER'),
          customerId: customer.id,
          orderId: order.id,
          type: 'DEDUCT',
          amount: -order.amount,
          balanceAfter: customer.balance,
          note: `余额核销订单 ${order.id}`,
          idempotencyKey: input.idempotencyKey ?? `deduct-${order.id}`,
          createdAt: nowIso(),
        })
        order.paymentStatus = 'PAID'
        setOrderStatus(order, 'PAID_WAIT_SUPPLIER', '余额支付完成，进入待下发供应商')
      } else {
        data.paymentRequests.push({
          id: newId('PR'),
          customerId: customer.id,
          customerName: customer.name,
          orderId: order.id,
          type: 'ORDER_PAYMENT',
          amount: order.amount,
          status: 'WAIT_PAY',
          method: '微信',
          note: `订单 ${order.id} 应收`,
          createdAt: nowIso(),
          paidAt: null,
        })
      }

      return getState()
    },

    async createPaymentRequest(input: PaymentRequestInput) {
      const customer = findCustomer(input.customerId)
      if (input.orderId) findOrder(input.orderId)
      data.paymentRequests.unshift({
        id: newId('PR'),
        customerId: customer.id,
        customerName: customer.name,
        orderId: input.orderId ?? null,
        type: input.type,
        amount: input.amount,
        status: 'WAIT_PAY',
        method: input.method ?? '微信',
        note: input.note ?? '',
        createdAt: nowIso(),
        paidAt: null,
      })
      return getState()
    },

    async confirmPayment(input: ConfirmPaymentInput) {
      const existing = data.payments.find((item) => item.idempotencyKey === input.idempotencyKey)
      if (existing) return getState()

      const request = data.paymentRequests.find((item) => item.id === input.paymentRequestId)
      if (!request) throw new DomainError('付款请求不存在', 404)
      if (request.status === 'PAID') return getState()

      const customer = findCustomer(request.customerId)
      const payment: Payment = {
        id: newId('PAY'),
        paymentRequestId: request.id,
        customerId: request.customerId,
        orderId: request.orderId,
        type: request.type === 'PREPAID_TOPUP' ? 'PREPAID_TOPUP' : 'ORDER_PAYMENT',
        amount: request.amount,
        method: input.method,
        idempotencyKey: input.idempotencyKey,
        createdAt: nowIso(),
      }
      data.payments.unshift(payment)
      request.status = 'PAID'
      request.paidAt = payment.createdAt

      if (request.type === 'PREPAID_TOPUP') {
        customer.balance = money(customer.balance + request.amount)
        customer.status = 'ACTIVE'
        data.prepaidLedger.unshift({
          id: newId('LEDGER'),
          customerId: customer.id,
          orderId: null,
          type: 'TOPUP',
          amount: request.amount,
          balanceAfter: customer.balance,
          note: `预付款充值 ${request.amount}`,
          idempotencyKey: input.idempotencyKey,
          createdAt: nowIso(),
        })
      } else if (request.orderId) {
        const order = findOrder(request.orderId)
        order.paymentStatus = 'PAID'
        setOrderStatus(order, 'PAID_WAIT_SUPPLIER', '人工确认收款，进入待下发供应商')
        customer.status = 'ACTIVE'
      }

      return getState()
    },

    async generateSupplierBatch(input: SupplierBatchInput) {
      const supplier = suppliers.find((item) => item.id === input.supplierId)
      if (!supplier) throw new DomainError('供应商不存在', 404)

      const existing = data.supplierBatches.find(
        (item) =>
          item.supplierId === input.supplierId &&
          item.serviceDate === input.serviceDate &&
          item.status !== 'CONFIRMED',
      )
      if (existing) return getState()

      const targetOrders = data.orders.filter(
        (order) =>
          order.supplierId === input.supplierId &&
          order.serviceDate === input.serviceDate &&
          order.status === 'PAID_WAIT_SUPPLIER',
      )
      if (targetOrders.length === 0) throw new DomainError('没有可下发供应商的已付款订单')

      const batchId = newId('BATCH')
      const items: SupplierBatchItem[] = targetOrders.map((order) => ({
        id: newId('BITEM'),
        batchId,
        orderId: order.id,
        customerName: order.customerName,
        mealName: order.mealName,
        address: findCustomer(order.customerId).address,
        note: order.note,
        amount: order.amount,
        supplierCost: order.supplierCost,
      }))
      const batch: SupplierBatch = {
        id: batchId,
        supplierId: supplier.id,
        supplierName: supplier.name,
        serviceDate: input.serviceDate,
        status: 'SENT',
        copyText: '',
        itemCount: items.length,
        totalCost: money(items.reduce((sum, item) => sum + item.supplierCost, 0)),
        createdAt: nowIso(),
        confirmedAt: null,
        items,
      }
      batch.copyText = buildCopyText(batch)
      data.supplierBatches.unshift(batch)
      targetOrders.forEach((order) => setOrderStatus(order, 'SENT_TO_SUPPLIER', `生成供应商批次 ${batch.id}`))
      return getState()
    },

    async confirmSupplierBatch(batchId: string) {
      const batch = data.supplierBatches.find((item) => item.id === batchId)
      if (!batch) throw new DomainError('供应商批次不存在', 404)
      if (batch.status === 'CONFIRMED') return getState()
      batch.status = 'CONFIRMED' satisfies BatchStatus
      batch.confirmedAt = nowIso()
      batch.items.forEach((item) => {
        const order = findOrder(item.orderId)
        setOrderStatus(order, 'SUPPLIER_CONFIRMED', `供应商确认批次 ${batch.id}`)
      })
      return getState()
    },

    async completeOrder(orderId: string) {
      const order = findOrder(orderId)
      if (order.status !== 'SUPPLIER_CONFIRMED') throw new DomainError('只有供应商已确认订单才能完成')
      setOrderStatus(order, 'COMPLETED', '订单履约完成')
      return getState()
    },

    async refundOrder(input: RefundInput) {
      if (data.payments.find((item) => item.idempotencyKey === input.idempotencyKey)) return getState()
      const order = findOrder(input.orderId)
      if (input.amount <= 0 || input.amount > order.amount) throw new DomainError('退款金额不合法')
      data.payments.unshift({
        id: newId('REFUND'),
        paymentRequestId: '',
        customerId: order.customerId,
        orderId: order.id,
        type: 'REFUND',
        amount: -input.amount,
        method: '人工退款',
        idempotencyKey: input.idempotencyKey,
        createdAt: nowIso(),
      })
      order.grossProfit = money(order.grossProfit - input.amount)
      order.paymentStatus = 'REFUNDED'
      setOrderStatus(order, 'REFUNDED', input.reason)
      return getState()
    },
  }
}

function seedInitialOrders(data: MemoryData) {
  const zhang = data.customers[0]
  const li = data.customers[2]
  const productA = products[0]
  const productB = products[1]
  data.orders.push(
    {
      id: 'O-001',
      customerId: zhang.id,
      customerName: zhang.name,
      serviceDate: today,
      mealName: productA.name,
      supplierId: productA.supplierId,
      supplierName: productA.supplierName,
      amount: productA.amount,
      supplierCost: productA.supplierCost,
      deliveryCost: productA.deliveryCost,
      grossProfit: money(productA.amount - productA.supplierCost - productA.deliveryCost),
      status: 'PAID_WAIT_SUPPLIER',
      paymentStatus: 'PAID',
      note: zhang.preference,
      createdAt: '2026-06-07T01:20:00.000Z',
    },
    {
      id: 'O-002',
      customerId: li.id,
      customerName: li.name,
      serviceDate: today,
      mealName: productB.name,
      supplierId: productB.supplierId,
      supplierName: productB.supplierName,
      amount: productB.amount,
      supplierCost: productB.supplierCost,
      deliveryCost: productB.deliveryCost,
      grossProfit: money(productB.amount - productB.supplierCost - productB.deliveryCost),
      status: 'WAIT_PAY',
      paymentStatus: 'UNPAID',
      note: li.preference,
      createdAt: '2026-06-07T02:00:00.000Z',
    },
  )
  data.prepaidLedger.push({
    id: 'LEDGER-001',
    customerId: zhang.id,
    orderId: 'O-001',
    type: 'DEDUCT',
    amount: -38,
    balanceAfter: 262,
    note: '余额核销订单 O-001',
    idempotencyKey: 'seed-ledger-001',
    createdAt: '2026-06-07T01:21:00.000Z',
  })
  data.paymentRequests.push({
    id: 'PR-001',
    customerId: li.id,
    customerName: li.name,
    orderId: 'O-002',
    type: 'ORDER_PAYMENT',
    amount: 42,
    status: 'WAIT_PAY',
    method: '微信',
    note: '订单 O-002 应收',
    createdAt: '2026-06-07T02:01:00.000Z',
    paidAt: null,
  })
}

function calculateDashboard(data: MemoryData): DashboardSummary {
  const orders = data.orders.filter((order) => order.serviceDate === today)
  const paidOrders = orders.filter((order) => order.paymentStatus === 'PAID' || order.paymentStatus === 'REFUNDED')
  const paymentsToday = data.payments.filter((payment) => payment.createdAt.slice(0, 10) === today)
  const ledgersToday = data.prepaidLedger.filter((ledger) => ledger.createdAt.slice(0, 10) === today)
  const revenue = money(paidOrders.reduce((sum, order) => sum + order.amount, 0))
  const refund = money(
    paymentsToday.filter((payment) => payment.type === 'REFUND').reduce((sum, payment) => sum + Math.abs(payment.amount), 0),
  )
  return {
    today,
    orderCount: orders.length,
    waitPayCount: orders.filter((order) => order.status === 'WAIT_PAY').length,
    waitSupplierCount: orders.filter((order) => order.status === 'PAID_WAIT_SUPPLIER').length,
    unconfirmedBatchCount: data.supplierBatches.filter((batch) => batch.status !== 'CONFIRMED').length,
    revenue: money(revenue - refund),
    cashIn: money(paymentsToday.filter((payment) => payment.amount > 0).reduce((sum, payment) => sum + payment.amount, 0)),
    prepaidTopup: money(ledgersToday.filter((ledger) => ledger.type === 'TOPUP').reduce((sum, ledger) => sum + ledger.amount, 0)),
    prepaidDeducted: money(
      Math.abs(ledgersToday.filter((ledger) => ledger.type === 'DEDUCT').reduce((sum, ledger) => sum + ledger.amount, 0)),
    ),
    refund,
    supplierCost: money(paidOrders.reduce((sum, order) => sum + order.supplierCost, 0)),
    deliveryCost: money(paidOrders.reduce((sum, order) => sum + order.deliveryCost, 0)),
    grossProfit: money(paidOrders.reduce((sum, order) => sum + order.grossProfit, 0)),
    issueCount: data.issues.filter((issue) => !issue.resolved).length,
  }
}

function refreshIssues(data: MemoryData) {
  const issues: ReconciliationIssue[] = []
  data.orders
    .filter((order) => order.status === 'WAIT_PAY')
    .forEach((order) =>
      issues.push({
        id: `ISSUE-WAIT-${order.id}`,
        level: 'MEDIUM',
        type: 'WAIT_PAY',
        title: '订单待付款',
        detail: `${order.customerName} 的 ${order.mealName} 尚未确认收款`,
        relatedId: order.id,
        resolved: false,
      }),
    )
  data.orders
    .filter((order) => order.grossProfit < 0)
    .forEach((order) =>
      issues.push({
        id: `ISSUE-LOSS-${order.id}`,
        level: 'HIGH',
        type: 'NEGATIVE_MARGIN',
        title: '负毛利订单',
        detail: `${order.id} 毛利为 ${order.grossProfit}`,
        relatedId: order.id,
        resolved: false,
      }),
    )
  data.supplierBatches
    .filter((batch) => batch.status !== 'CONFIRMED')
    .forEach((batch) =>
      issues.push({
        id: `ISSUE-BATCH-${batch.id}`,
        level: 'HIGH',
        type: 'BATCH_UNCONFIRMED',
        title: '供应商未确认',
        detail: `${batch.supplierName} ${batch.serviceDate} 批次尚未确认`,
        relatedId: batch.id,
        resolved: false,
      }),
    )
  data.issues = issues
}
