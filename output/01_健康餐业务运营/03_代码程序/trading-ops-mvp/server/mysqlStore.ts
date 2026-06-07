import dotenv from 'dotenv'
import mysql from 'mysql2/promise'
import { today } from './data/seed.ts'
import { DomainError, money, newId, type TradingOpsStore } from './store.ts'
import type {
  BalancePaymentInput,
  BatchStatus,
  ConfirmPaymentInput,
  CreateCustomerInput,
  CreateOrderInput,
  Customer,
  DashboardSummary,
  OperationState,
  Order,
  Payment,
  PaymentRequest,
  PaymentRequestInput,
  PrepaidLedger,
  Product,
  ProductInput,
  ReconciliationIssue,
  RefundInput,
  Supplier,
  SupplierBatch,
  SupplierBatchInput,
  SupplierBatchItem,
  SupplierInput,
  UpdateCustomerInput,
  VoidPaymentInput,
} from './types.ts'

dotenv.config({ path: '.env.local' })
dotenv.config()

type Row = Record<string, unknown>
type SqlValue = string | number | Date | null

function asNumber(value: unknown) {
  return typeof value === 'number' ? value : Number(value)
}

function dateText(value: unknown) {
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function dateOnly(value: unknown) {
  if (value instanceof Date) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  return String(value).slice(0, 10)
}

export function createMysqlStore(): TradingOpsStore {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for DATA_STORE=mysql')
  const pool = mysql.createPool({
    uri: process.env.DATABASE_URL,
    connectionLimit: 8,
    connectTimeout: 60000,
    ssl: process.env.MYSQL_SSL === 'true' ? {} : undefined,
  })

  async function query<T extends Row>(sql: string, params: SqlValue[] = []) {
    const [rows] = await pool.query(sql, params)
    return rows as T[]
  }

  async function execute(sql: string, params: SqlValue[] = []) {
    await pool.execute(sql, params)
  }

  async function findCustomer(id: string) {
    const rows = await query<Row>('SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL', [id])
    if (!rows[0]) throw new DomainError('客户不存在', 404)
    return mapCustomer(rows[0])
  }

  async function findOrder(id: string) {
    const rows = await query<Row>('SELECT * FROM orders WHERE id = ? AND deleted_at IS NULL', [id])
    if (!rows[0]) throw new DomainError('订单不存在', 404)
    return mapOrder(rows[0])
  }

  async function findProduct(id: string) {
    const rows = await query<Row>('SELECT * FROM products WHERE id = ? AND deleted_at IS NULL', [id])
    if (!rows[0]) throw new DomainError('商品不存在', 404)
    return mapProduct(rows[0])
  }

  async function findSupplier(id: string) {
    const rows = await query<Row>('SELECT * FROM suppliers WHERE id = ? AND deleted_at IS NULL', [id])
    if (!rows[0]) throw new DomainError('供应商不存在', 404)
    return mapSupplier(rows[0])
  }

  async function setOrderStatus(order: Order, status: Order['status'], note: string) {
    if (order.status === status) return
    await execute('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?', [status, new Date(), order.id])
    await execute(
      'INSERT INTO order_status_logs (id, order_id, from_status, to_status, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [newId('LOG'), order.id, order.status, status, note, new Date()],
    )
  }

  async function getState(): Promise<OperationState> {
    const customerRows = await query<Row>('SELECT * FROM customers WHERE deleted_at IS NULL ORDER BY created_at DESC')
    const orderRows = await query<Row>('SELECT * FROM orders WHERE deleted_at IS NULL ORDER BY created_at DESC')
    const requestRows = await query<Row>('SELECT * FROM payment_requests ORDER BY created_at DESC')
    const paymentRows = await query<Row>('SELECT * FROM payments ORDER BY created_at DESC')
    const ledgerRows = await query<Row>('SELECT * FROM prepaid_ledger ORDER BY created_at DESC')
    const batchRows = await query<Row>('SELECT * FROM supplier_batches ORDER BY created_at DESC')
    const itemRows = await query<Row>('SELECT * FROM supplier_batch_items ORDER BY id ASC')
    const productRows = await query<Row>('SELECT * FROM products WHERE deleted_at IS NULL ORDER BY created_at DESC')
    const supplierRows = await query<Row>('SELECT * FROM suppliers WHERE deleted_at IS NULL ORDER BY created_at DESC')
    const customers = customerRows.map(mapCustomer)
    const orders = orderRows.map(mapOrder)
    const paymentRequests = requestRows.map(mapPaymentRequest)
    const payments = paymentRows.map(mapPayment)
    const prepaidLedger = ledgerRows.map(mapPrepaidLedger)
    const products = productRows.map(mapProduct)
    const suppliers = supplierRows.map(mapSupplier)
    const supplierBatches = batchRows.map((row) =>
      mapSupplierBatch(
        row,
        itemRows.filter((item) => item.batch_id === row.id).map(mapSupplierBatchItem),
      ),
    )
    const issues = calculateIssues(orders, supplierBatches)
    return {
      dashboard: calculateDashboard(orders, payments, prepaidLedger, supplierBatches, issues),
      customers,
      orders,
      paymentRequests,
      payments,
      prepaidLedger,
      supplierBatches,
      issues,
      products,
      suppliers,
    }
  }

  return {
    getState,

    async createCustomer(input: CreateCustomerInput) {
      await execute(
        `INSERT INTO customers
          (id, name, wechat_name, phone, source, address, preference, status, balance, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId('C'),
          input.name,
          input.wechatName,
          input.phone ?? '',
          input.source,
          input.address,
          input.preference,
          'NEW',
          0,
          new Date(),
          new Date(),
        ],
      )
      return getState()
    },

    async updateCustomer(id: string, input: UpdateCustomerInput) {
      await findCustomer(id)
      await execute(
        `UPDATE customers
         SET name = ?, wechat_name = ?, phone = ?, source = ?, address = ?, preference = ?, status = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [
          input.name,
          input.wechatName,
          input.phone ?? '',
          input.source,
          input.address,
          input.preference,
          input.status,
          new Date(),
          id,
        ],
      )
      await execute('UPDATE orders SET customer_name = ?, updated_at = ? WHERE customer_id = ? AND deleted_at IS NULL', [
        input.name,
        new Date(),
        id,
      ])
      await execute('UPDATE payment_requests SET customer_name = ? WHERE customer_id = ?', [input.name, id])
      return getState()
    },

    async deleteCustomer(id: string) {
      await findCustomer(id)
      await execute('UPDATE customers SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', [new Date(), new Date(), id])
      return getState()
    },

    async createOrder(input: CreateOrderInput) {
      const customer = await findCustomer(input.customerId)
      const product = await findProduct(input.productId)
      if (product.status !== 'ACTIVE') throw new DomainError('商品已停用，不能下单')
      const id = newId('O')
      const status = input.payWithBalance ? 'PAID_WAIT_SUPPLIER' : 'WAIT_PAY'
      const paymentStatus = input.payWithBalance ? 'PAID' : 'UNPAID'
      const grossProfit = money(product.amount - product.supplierCost - product.deliveryCost)

      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        if (input.payWithBalance) {
          if (customer.balance < product.amount) throw new DomainError('客户预付款余额不足，不能核销')
          const balanceAfter = money(customer.balance - product.amount)
          await connection.execute('UPDATE customers SET balance = ?, status = ?, updated_at = ? WHERE id = ?', [
            balanceAfter,
            'ACTIVE',
            new Date(),
            customer.id,
          ])
          await connection.execute(
            `INSERT INTO prepaid_ledger
              (id, customer_id, order_id, type, amount, balance_after, note, idempotency_key, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              newId('LEDGER'),
              customer.id,
              id,
              'DEDUCT',
              -product.amount,
              balanceAfter,
              `余额核销订单 ${id}`,
              input.idempotencyKey ?? `deduct-${id}`,
              new Date(),
            ],
          )
        }
        await connection.execute(
          `INSERT INTO orders
            (id, customer_id, customer_name, service_date, meal_name, supplier_id, supplier_name, amount, supplier_cost, delivery_cost, gross_profit, status, payment_status, note, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            customer.id,
            customer.name,
            input.serviceDate,
            product.name,
            product.supplierId,
            product.supplierName,
            product.amount,
            product.supplierCost,
            product.deliveryCost,
            grossProfit,
            status,
            paymentStatus,
            input.note ?? customer.preference,
            new Date(),
            new Date(),
          ],
        )
        await connection.execute(
          'INSERT INTO order_status_logs (id, order_id, from_status, to_status, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [newId('LOG'), id, 'CREATED', status, '创建订单', new Date()],
        )
        if (!input.payWithBalance) {
          await connection.execute(
            `INSERT INTO payment_requests
              (id, customer_id, customer_name, order_id, type, amount, status, method, note, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [newId('PR'), customer.id, customer.name, id, 'ORDER_PAYMENT', product.amount, 'WAIT_PAY', '微信', `订单 ${id} 应收`, new Date()],
          )
        }
        await connection.commit()
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
      return getState()
    },

    async payOrderWithBalance(orderId: string, input: BalancePaymentInput) {
      const idempotencyKey = input.idempotencyKey ?? `balance-payment-${orderId}`
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        const [ledgerRowsRaw] = await connection.query('SELECT * FROM prepaid_ledger WHERE idempotency_key = ? FOR UPDATE', [
          idempotencyKey,
        ])
        const ledgerRows = ledgerRowsRaw as Row[]
        if (ledgerRows[0]) {
          const existingLedger = mapPrepaidLedger(ledgerRows[0])
          if (existingLedger.orderId === orderId && existingLedger.type === 'DEDUCT') {
            await connection.commit()
            return getState()
          }
          throw new DomainError('幂等键已被其他余额核销使用')
        }

        const [orderRowsRaw] = await connection.query('SELECT * FROM orders WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [orderId])
        const orderRows = orderRowsRaw as Row[]
        if (!orderRows[0]) throw new DomainError('订单不存在', 404)
        const order = mapOrder(orderRows[0])
        if (order.paymentStatus !== 'UNPAID' || order.status !== 'WAIT_PAY') throw new DomainError('订单不可重复核销')

        const [customerRowsRaw] = await connection.query('SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [
          order.customerId,
        ])
        const customerRows = customerRowsRaw as Row[]
        if (!customerRows[0]) throw new DomainError('客户不存在', 404)
        const customer = mapCustomer(customerRows[0])
        if (customer.balance < order.amount) throw new DomainError('客户余额不足，不能核销')

        const balanceAfter = money(customer.balance - order.amount)
        await connection.execute('UPDATE customers SET balance = ?, status = ?, updated_at = ? WHERE id = ?', [
          balanceAfter,
          'ACTIVE',
          new Date(),
          customer.id,
        ])
        await connection.execute(
          `INSERT INTO prepaid_ledger
            (id, customer_id, order_id, type, amount, balance_after, note, idempotency_key, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newId('LEDGER'),
            customer.id,
            order.id,
            'DEDUCT',
            -order.amount,
            balanceAfter,
            `余额核销订单 ${order.id}`,
            idempotencyKey,
            new Date(),
          ],
        )
        await connection.execute('UPDATE orders SET payment_status = ?, status = ?, updated_at = ? WHERE id = ?', [
          'PAID',
          'PAID_WAIT_SUPPLIER',
          new Date(),
          order.id,
        ])
        await connection.execute(
          'INSERT INTO order_status_logs (id, order_id, from_status, to_status, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [newId('LOG'), order.id, order.status, 'PAID_WAIT_SUPPLIER', '余额支付完成，进入待下发供应商', new Date()],
        )
        await connection.execute(
          "UPDATE payment_requests SET status = ?, note = CONCAT(note, ?) WHERE order_id = ? AND status = ?",
          ['CANCELED', '；取消原因：余额核销已完成', order.id, 'WAIT_PAY'],
        )
        await connection.commit()
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
      return getState()
    },

    async cancelOrder(orderId: string) {
      const order = await findOrder(orderId)
      if (order.status === 'CANCELED') return getState()
      if (order.paymentStatus === 'PAID' || order.status !== 'WAIT_PAY') throw new DomainError('只有未付款待付款订单可以取消')
      await execute('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?', ['CANCELED', new Date(), order.id])
      await execute(
        'INSERT INTO order_status_logs (id, order_id, from_status, to_status, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [newId('LOG'), order.id, order.status, 'CANCELED', '运营取消订单', new Date()],
      )
      await execute('UPDATE payment_requests SET status = ? WHERE order_id = ? AND status = ?', ['CANCELED', order.id, 'WAIT_PAY'])
      return getState()
    },

    async createPaymentRequest(input: PaymentRequestInput) {
      const customer = await findCustomer(input.customerId)
      if (input.orderId) await findOrder(input.orderId)
      await execute(
        `INSERT INTO payment_requests
          (id, customer_id, customer_name, order_id, type, amount, status, method, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId('PR'),
          customer.id,
          customer.name,
          input.orderId ?? null,
          input.type,
          input.amount,
          'WAIT_PAY',
          input.method ?? '微信',
          input.note ?? '',
          new Date(),
        ],
      )
      return getState()
    },

    async cancelPaymentRequest(paymentRequestId: string) {
      const rows = await query<Row>('SELECT * FROM payment_requests WHERE id = ?', [paymentRequestId])
      if (!rows[0]) throw new DomainError('付款请求不存在', 404)
      const request = mapPaymentRequest(rows[0])
      if (request.status !== 'WAIT_PAY') throw new DomainError('只有待付款请求可以取消')
      await execute('UPDATE payment_requests SET status = ? WHERE id = ?', ['CANCELED', paymentRequestId])
      return getState()
    },

    async deletePaymentRequest(paymentRequestId: string) {
      const rows = await query<Row>('SELECT * FROM payment_requests WHERE id = ?', [paymentRequestId])
      if (!rows[0]) throw new DomainError('付款请求不存在', 404)
      const request = mapPaymentRequest(rows[0])
      if (request.status !== 'WAIT_PAY') throw new DomainError('只有待付款请求可以删除')
      await execute('DELETE FROM payment_requests WHERE id = ?', [paymentRequestId])
      return getState()
    },

    async confirmPayment(input: ConfirmPaymentInput) {
      const existing = await query<Row>('SELECT id FROM payments WHERE idempotency_key = ?', [input.idempotencyKey])
      if (existing[0]) return getState()
      const requestRows = await query<Row>('SELECT * FROM payment_requests WHERE id = ?', [input.paymentRequestId])
      if (!requestRows[0]) throw new DomainError('付款请求不存在', 404)
      const request = mapPaymentRequest(requestRows[0])
      if (request.status === 'PAID') return getState()
      if (request.status === 'CANCELED') throw new DomainError('已取消的付款请求不能确认')
      const customer = await findCustomer(request.customerId)

      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        await connection.execute(
          `INSERT INTO payments
            (id, payment_request_id, customer_id, order_id, type, amount, method, idempotency_key, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newId('PAY'),
            request.id,
            request.customerId,
            request.orderId,
            request.type === 'PREPAID_TOPUP' ? 'PREPAID_TOPUP' : 'ORDER_PAYMENT',
            request.amount,
            input.method,
            input.idempotencyKey,
            new Date(),
          ],
        )
        await connection.execute('UPDATE payment_requests SET status = ?, paid_at = ? WHERE id = ?', ['PAID', new Date(), request.id])
        if (request.type === 'PREPAID_TOPUP') {
          const balanceAfter = money(customer.balance + request.amount)
          await connection.execute('UPDATE customers SET balance = ?, status = ?, updated_at = ? WHERE id = ?', [
            balanceAfter,
            'ACTIVE',
            new Date(),
            customer.id,
          ])
          await connection.execute(
            `INSERT INTO prepaid_ledger
              (id, customer_id, order_id, type, amount, balance_after, note, idempotency_key, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [newId('LEDGER'), customer.id, null, 'TOPUP', request.amount, balanceAfter, `预付款充值 ${request.amount}`, input.idempotencyKey, new Date()],
          )
        } else if (request.orderId) {
          await connection.execute('UPDATE orders SET payment_status = ?, status = ?, updated_at = ? WHERE id = ?', [
            'PAID',
            'PAID_WAIT_SUPPLIER',
            new Date(),
            request.orderId,
          ])
          await connection.execute(
            'INSERT INTO order_status_logs (id, order_id, from_status, to_status, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [newId('LOG'), request.orderId, 'WAIT_PAY', 'PAID_WAIT_SUPPLIER', '人工确认收款，进入待下发供应商', new Date()],
          )
        }
        await connection.commit()
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
      return getState()
    },

    async voidPayment(paymentId: string, input: VoidPaymentInput) {
      const rows = await query<Row>('SELECT * FROM payments WHERE id = ?', [paymentId])
      if (!rows[0]) throw new DomainError('收款记录不存在', 404)
      const payment = mapPayment(rows[0])
      if (payment.status === 'VOIDED') return getState()
      if (payment.type !== 'PREPAID_TOPUP' || payment.amount <= 0) throw new DomainError('只有已确认的预付款充值可以作废')
      const customer = await findCustomer(payment.customerId)
      if (customer.balance < payment.amount) throw new DomainError('该充值已被核销，不能直接作废')
      const balanceAfter = money(customer.balance - payment.amount)
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        await connection.execute('UPDATE payments SET status = ?, voided_at = ?, void_reason = ? WHERE id = ?', [
          'VOIDED',
          new Date(),
          input.reason,
          payment.id,
        ])
        await connection.execute('UPDATE customers SET balance = ?, updated_at = ? WHERE id = ?', [balanceAfter, new Date(), customer.id])
        await connection.execute(
          `INSERT INTO prepaid_ledger
            (id, customer_id, order_id, type, amount, balance_after, note, idempotency_key, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [newId('LEDGER'), customer.id, null, 'ADJUST', -payment.amount, balanceAfter, `作废充值 ${payment.id}：${input.reason}`, `void-${payment.id}`, new Date()],
        )
        await connection.commit()
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
      return getState()
    },

    async generateSupplierBatch(input: SupplierBatchInput) {
      const supplier = await findSupplier(input.supplierId)
      if (supplier.status !== 'ACTIVE') throw new DomainError('供应商已停用，不能生成批次')
      const orders = (await query<Row>(
        'SELECT * FROM orders WHERE supplier_id = ? AND service_date = ? AND status = ? AND deleted_at IS NULL',
        [input.supplierId, input.serviceDate, 'PAID_WAIT_SUPPLIER'],
      )).map(mapOrder)
      if (orders.length === 0) throw new DomainError('没有可下发供应商的已付款订单')
      const customers = await query<Row>('SELECT * FROM customers WHERE deleted_at IS NULL')
      const batchId = newId('BATCH')
      const items = orders.map((order) => {
        const customer = customers.find((item) => item.id === order.customerId)
        return {
          id: newId('BITEM'),
          batchId,
          orderId: order.id,
          customerName: order.customerName,
          mealName: order.mealName,
          address: String(customer?.address ?? ''),
          note: order.note,
          amount: order.amount,
          supplierCost: order.supplierCost,
        }
      })
      const copyText = buildCopyText(supplier.name, input.serviceDate, items)
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        await connection.execute(
          `INSERT INTO supplier_batches
            (id, supplier_id, supplier_name, service_date, status, copy_text, item_count, total_cost, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [batchId, supplier.id, supplier.name, input.serviceDate, 'SENT', copyText, items.length, money(items.reduce((sum, item) => sum + item.supplierCost, 0)), new Date()],
        )
        for (const item of items) {
          await connection.execute(
            `INSERT INTO supplier_batch_items
              (id, batch_id, order_id, customer_name, meal_name, address, note, amount, supplier_cost)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [item.id, batchId, item.orderId, item.customerName, item.mealName, item.address, item.note, item.amount, item.supplierCost],
          )
          await connection.execute('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?', ['SENT_TO_SUPPLIER', new Date(), item.orderId])
          await connection.execute(
            'INSERT INTO order_status_logs (id, order_id, from_status, to_status, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [newId('LOG'), item.orderId, 'PAID_WAIT_SUPPLIER', 'SENT_TO_SUPPLIER', `生成供应商批次 ${batchId}`, new Date()],
          )
        }
        await connection.commit()
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
      return getState()
    },

    async confirmSupplierBatch(batchId: string) {
      const batchRows = await query<Row>('SELECT * FROM supplier_batches WHERE id = ?', [batchId])
      if (!batchRows[0]) throw new DomainError('供应商批次不存在', 404)
      const itemRows = await query<Row>('SELECT * FROM supplier_batch_items WHERE batch_id = ?', [batchId])
      await execute('UPDATE supplier_batches SET status = ?, confirmed_at = ? WHERE id = ?', ['CONFIRMED' satisfies BatchStatus, new Date(), batchId])
      for (const item of itemRows) {
        const order = await findOrder(String(item.order_id))
        await setOrderStatus(order, 'SUPPLIER_CONFIRMED', `供应商确认批次 ${batchId}`)
      }
      return getState()
    },

    async completeOrder(orderId: string) {
      const order = await findOrder(orderId)
      if (order.status !== 'SUPPLIER_CONFIRMED') throw new DomainError('只有供应商已确认订单才能完成')
      await setOrderStatus(order, 'COMPLETED', '订单履约完成')
      return getState()
    },

    async refundOrder(input: RefundInput) {
      const existing = await query<Row>('SELECT id FROM payments WHERE idempotency_key = ?', [input.idempotencyKey])
      if (existing[0]) return getState()
      const order = await findOrder(input.orderId)
      if (input.amount <= 0 || input.amount > order.amount) throw new DomainError('退款金额不合法')
      await execute(
        `INSERT INTO payments
          (id, payment_request_id, customer_id, order_id, type, amount, method, idempotency_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [newId('REFUND'), '', order.customerId, order.id, 'REFUND', -input.amount, '人工退款', input.idempotencyKey, new Date()],
      )
      await execute('UPDATE orders SET gross_profit = ?, payment_status = ?, status = ?, updated_at = ? WHERE id = ?', [
        money(order.grossProfit - input.amount),
        'REFUNDED',
        'REFUNDED',
        new Date(),
        order.id,
      ])
      return getState()
    },

    async createProduct(input: ProductInput) {
      const supplier = await findSupplier(input.supplierId)
      await execute(
        `INSERT INTO products
          (id, name, category, description, amount, supplier_cost, delivery_cost, supplier_id, supplier_name, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId('P'),
          input.name,
          input.category,
          input.description ?? '',
          input.amount,
          input.supplierCost,
          input.deliveryCost,
          supplier.id,
          supplier.name,
          input.status ?? 'ACTIVE',
          new Date(),
          new Date(),
        ],
      )
      return getState()
    },

    async updateProduct(id: string, input: ProductInput) {
      await findProduct(id)
      const supplier = await findSupplier(input.supplierId)
      await execute(
        `UPDATE products
         SET name = ?, category = ?, description = ?, amount = ?, supplier_cost = ?, delivery_cost = ?, supplier_id = ?, supplier_name = ?, status = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [
          input.name,
          input.category,
          input.description ?? '',
          input.amount,
          input.supplierCost,
          input.deliveryCost,
          supplier.id,
          supplier.name,
          input.status ?? 'ACTIVE',
          new Date(),
          id,
        ],
      )
      return getState()
    },

    async deleteProduct(id: string) {
      await findProduct(id)
      await execute('UPDATE products SET status = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', ['INACTIVE', new Date(), id])
      return getState()
    },

    async createSupplier(input: SupplierInput) {
      await execute(
        `INSERT INTO suppliers
          (id, name, contact, status, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [newId('S'), input.name, input.contact, input.status ?? 'ACTIVE', input.notes ?? '', new Date(), new Date()],
      )
      return getState()
    },

    async updateSupplier(id: string, input: SupplierInput) {
      await findSupplier(id)
      await execute(
        'UPDATE suppliers SET name = ?, contact = ?, status = ?, notes = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
        [input.name, input.contact, input.status ?? 'ACTIVE', input.notes ?? '', new Date(), id],
      )
      await execute('UPDATE products SET supplier_name = ?, updated_at = ? WHERE supplier_id = ? AND deleted_at IS NULL', [
        input.name,
        new Date(),
        id,
      ])
      return getState()
    },

    async deleteSupplier(id: string) {
      await findSupplier(id)
      await execute('UPDATE suppliers SET status = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', ['INACTIVE', new Date(), id])
      await execute('UPDATE products SET status = ?, updated_at = ? WHERE supplier_id = ? AND deleted_at IS NULL', ['INACTIVE', new Date(), id])
      return getState()
    },
  }
}

function mapCustomer(row: Row): Customer {
  return {
    id: String(row.id),
    name: String(row.name),
    wechatName: String(row.wechat_name),
    phone: String(row.phone),
    source: String(row.source),
    address: String(row.address),
    preference: String(row.preference),
    status: row.status as Customer['status'],
    balance: asNumber(row.balance),
    createdAt: dateText(row.created_at),
  }
}

function mapOrder(row: Row): Order {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    customerName: String(row.customer_name),
    serviceDate: dateOnly(row.service_date),
    mealName: String(row.meal_name),
    supplierId: String(row.supplier_id),
    supplierName: String(row.supplier_name),
    amount: asNumber(row.amount),
    supplierCost: asNumber(row.supplier_cost),
    deliveryCost: asNumber(row.delivery_cost),
    grossProfit: asNumber(row.gross_profit),
    status: row.status as Order['status'],
    paymentStatus: row.payment_status as Order['paymentStatus'],
    note: String(row.note),
    createdAt: dateText(row.created_at),
  }
}

function mapPaymentRequest(row: Row): PaymentRequest {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    customerName: String(row.customer_name),
    orderId: row.order_id ? String(row.order_id) : null,
    type: row.type as PaymentRequest['type'],
    amount: asNumber(row.amount),
    status: row.status as PaymentRequest['status'],
    method: String(row.method),
    note: String(row.note),
    createdAt: dateText(row.created_at),
    paidAt: row.paid_at ? dateText(row.paid_at) : null,
  }
}

function mapPayment(row: Row): Payment {
  return {
    id: String(row.id),
    paymentRequestId: String(row.payment_request_id),
    customerId: String(row.customer_id),
    orderId: row.order_id ? String(row.order_id) : null,
    type: row.type as Payment['type'],
    amount: asNumber(row.amount),
    method: String(row.method),
    idempotencyKey: String(row.idempotency_key),
    createdAt: dateText(row.created_at),
    status: (row.status ?? 'POSTED') as Payment['status'],
    voidedAt: row.voided_at ? dateText(row.voided_at) : null,
    voidReason: row.void_reason ? String(row.void_reason) : null,
  }
}

function mapPrepaidLedger(row: Row): PrepaidLedger {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    orderId: row.order_id ? String(row.order_id) : null,
    type: row.type as PrepaidLedger['type'],
    amount: asNumber(row.amount),
    balanceAfter: asNumber(row.balance_after),
    note: String(row.note),
    idempotencyKey: String(row.idempotency_key),
    createdAt: dateText(row.created_at),
  }
}

function mapSupplierBatch(row: Row, items: SupplierBatchItem[]): SupplierBatch {
  return {
    id: String(row.id),
    supplierId: String(row.supplier_id),
    supplierName: String(row.supplier_name),
    serviceDate: dateOnly(row.service_date),
    status: row.status as SupplierBatch['status'],
    copyText: String(row.copy_text),
    itemCount: asNumber(row.item_count),
    totalCost: asNumber(row.total_cost),
    createdAt: dateText(row.created_at),
    confirmedAt: row.confirmed_at ? dateText(row.confirmed_at) : null,
    items,
  }
}

function mapSupplierBatchItem(row: Row): SupplierBatchItem {
  return {
    id: String(row.id),
    batchId: String(row.batch_id),
    orderId: String(row.order_id),
    customerName: String(row.customer_name),
    mealName: String(row.meal_name),
    address: String(row.address),
    note: String(row.note),
    amount: asNumber(row.amount),
    supplierCost: asNumber(row.supplier_cost),
  }
}

function mapProduct(row: Row): Product {
  return {
    id: String(row.id),
    name: String(row.name),
    category: String(row.category),
    description: String(row.description),
    amount: asNumber(row.amount),
    supplierCost: asNumber(row.supplier_cost),
    deliveryCost: asNumber(row.delivery_cost),
    supplierId: String(row.supplier_id),
    supplierName: String(row.supplier_name),
    status: row.status as Product['status'],
  }
}

function mapSupplier(row: Row): Supplier {
  return {
    id: String(row.id),
    name: String(row.name),
    contact: String(row.contact),
    status: row.status as Supplier['status'],
    notes: String(row.notes),
  }
}

function buildCopyText(supplierName: string, serviceDate: string, items: SupplierBatchItem[]) {
  return [
    `【${serviceDate} 健康餐下单】`,
    `供应商：${supplierName}`,
    `订单数：${items.length}`,
    '',
    ...items.map((item, index) => `${index + 1}. ${item.customerName}｜${item.mealName}｜${item.address}｜备注：${item.note || '无'}`),
    '',
    '请确认以上订单可接单，如有异常请直接回复序号。',
  ].join('\n')
}

function calculateIssues(orders: Order[], batches: SupplierBatch[]): ReconciliationIssue[] {
  return [
    ...orders
      .filter((order) => order.status === 'WAIT_PAY')
      .map((order) => ({
        id: `ISSUE-WAIT-${order.id}`,
        level: 'MEDIUM' as const,
        type: 'WAIT_PAY',
        title: '订单待付款',
        detail: `${order.customerName} 的 ${order.mealName} 尚未确认收款`,
        relatedId: order.id,
        resolved: false,
      })),
    ...orders
      .filter((order) => order.grossProfit < 0)
      .map((order) => ({
        id: `ISSUE-LOSS-${order.id}`,
        level: 'HIGH' as const,
        type: 'NEGATIVE_MARGIN',
        title: '负毛利订单',
        detail: `${order.id} 毛利为 ${order.grossProfit}`,
        relatedId: order.id,
        resolved: false,
      })),
    ...batches
      .filter((batch) => batch.status !== 'CONFIRMED')
      .map((batch) => ({
        id: `ISSUE-BATCH-${batch.id}`,
        level: 'HIGH' as const,
        type: 'BATCH_UNCONFIRMED',
        title: '供应商未确认',
        detail: `${batch.supplierName} ${batch.serviceDate} 批次尚未确认`,
        relatedId: batch.id,
        resolved: false,
      })),
  ]
}

function calculateDashboard(
  orders: Order[],
  payments: Payment[],
  prepaidLedger: PrepaidLedger[],
  supplierBatches: SupplierBatch[],
  issues: ReconciliationIssue[],
): DashboardSummary {
  const ordersToday = orders.filter((order) => order.serviceDate === today)
  const paidOrders = ordersToday.filter((order) => order.paymentStatus === 'PAID' || order.paymentStatus === 'REFUNDED')
  const paymentsToday = payments.filter((payment) => payment.status === 'POSTED' && payment.createdAt.slice(0, 10) === today)
  const ledgersToday = prepaidLedger.filter((ledger) => ledger.createdAt.slice(0, 10) === today)
  const prepaidAdjustment = ledgersToday.filter((ledger) => ledger.type === 'ADJUST').reduce((sum, ledger) => sum + ledger.amount, 0)
  const refund = money(
    paymentsToday.filter((payment) => payment.type === 'REFUND').reduce((sum, payment) => sum + Math.abs(payment.amount), 0),
  )
  return {
    today,
    orderCount: ordersToday.length,
    waitPayCount: ordersToday.filter((order) => order.status === 'WAIT_PAY').length,
    waitSupplierCount: ordersToday.filter((order) => order.status === 'PAID_WAIT_SUPPLIER').length,
    unconfirmedBatchCount: supplierBatches.filter((batch) => batch.status !== 'CONFIRMED').length,
    revenue: money(paidOrders.reduce((sum, order) => sum + order.amount, 0) - refund),
    cashIn: money(paymentsToday.filter((payment) => payment.amount > 0).reduce((sum, payment) => sum + payment.amount, 0)),
    prepaidTopup: money(ledgersToday.filter((ledger) => ledger.type === 'TOPUP').reduce((sum, ledger) => sum + ledger.amount, 0) + prepaidAdjustment),
    prepaidDeducted: money(
      Math.abs(ledgersToday.filter((ledger) => ledger.type === 'DEDUCT').reduce((sum, ledger) => sum + ledger.amount, 0)),
    ),
    refund,
    supplierCost: money(paidOrders.reduce((sum, order) => sum + order.supplierCost, 0)),
    deliveryCost: money(paidOrders.reduce((sum, order) => sum + order.deliveryCost, 0)),
    grossProfit: money(paidOrders.reduce((sum, order) => sum + order.grossProfit, 0)),
    issueCount: issues.filter((issue) => !issue.resolved).length,
  }
}
