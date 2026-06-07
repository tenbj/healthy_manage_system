import cors from 'cors'
import express, { type Request, type Response } from 'express'
import { z } from 'zod'
import { createMemoryStore } from './memoryStore.ts'
import { createMysqlStore } from './mysqlStore.ts'
import { DomainError, type TradingOpsStore } from './store.ts'

const customerSchema = z.object({
  name: z.string().min(1),
  wechatName: z.string().min(1),
  phone: z.string().optional(),
  source: z.string().min(1),
  address: z.string().min(1),
  preference: z.string().min(1),
})

const updateCustomerSchema = customerSchema.extend({
  status: z.enum(['NEW', 'QUOTED', 'WAIT_PAY', 'ACTIVE', 'REPEAT', 'LOST']),
})

const orderSchema = z.object({
  customerId: z.string().min(1),
  serviceDate: z.string().min(1),
  productId: z.string().min(1),
  note: z.string().optional(),
  payWithBalance: z.boolean().optional(),
  idempotencyKey: z.string().optional(),
})

const paymentRequestSchema = z.object({
  customerId: z.string().min(1),
  orderId: z.string().nullable().optional(),
  type: z.enum(['ORDER_PAYMENT', 'PREPAID_TOPUP', 'BALANCE_SHORTFALL']),
  amount: z.number().positive(),
  method: z.string().optional(),
  note: z.string().optional(),
})

const confirmPaymentSchema = z.object({
  paymentRequestId: z.string().min(1),
  method: z.string().min(1),
  idempotencyKey: z.string().min(1),
})

const balancePaymentSchema = z.object({
  idempotencyKey: z.string().optional(),
})

const supplierBatchSchema = z.object({
  supplierId: z.string().min(1),
  serviceDate: z.string().min(1),
})

const refundSchema = z.object({
  orderId: z.string().min(1),
  amount: z.number().positive(),
  reason: z.string().min(1),
  idempotencyKey: z.string().min(1),
})

const productSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  description: z.string().optional(),
  amount: z.number().positive(),
  supplierCost: z.number().nonnegative(),
  deliveryCost: z.number().nonnegative(),
  supplierId: z.string().min(1),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
})

const supplierSchema = z.object({
  name: z.string().min(1),
  contact: z.string().min(1),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  notes: z.string().optional(),
})

const voidPaymentSchema = z.object({
  reason: z.string().min(1),
})

export function createApp(store: TradingOpsStore = process.env.DATA_STORE === 'mysql' ? createMysqlStore() : createMemoryStore()) {
  const app = express()
  app.use(cors())
  app.use(express.json())

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, store: process.env.DATA_STORE === 'mysql' ? 'mysql' : 'memory' })
  })

  app.get('/api/state', async (_req: Request, res: Response) => {
    res.json(await store.getState())
  })

  app.post('/api/customers', async (req: Request, res: Response) => {
    res.status(201).json(await store.createCustomer(customerSchema.parse(req.body)))
  })

  app.patch('/api/customers/:id', async (req: Request, res: Response) => {
    res.json(await store.updateCustomer(String(req.params.id), updateCustomerSchema.parse(req.body)))
  })

  app.delete('/api/customers/:id', async (req: Request, res: Response) => {
    res.json(await store.deleteCustomer(String(req.params.id)))
  })

  app.post('/api/orders', async (req: Request, res: Response) => {
    res.status(201).json(await store.createOrder(orderSchema.parse(req.body)))
  })

  app.patch('/api/orders/:id/cancel', async (req: Request, res: Response) => {
    res.json(await store.cancelOrder(String(req.params.id)))
  })

  app.post('/api/orders/:id/balance-payment', async (req: Request, res: Response) => {
    res.json(await store.payOrderWithBalance(String(req.params.id), balancePaymentSchema.parse(req.body ?? {})))
  })

  app.post('/api/payment-requests', async (req: Request, res: Response) => {
    res.status(201).json(await store.createPaymentRequest(paymentRequestSchema.parse(req.body)))
  })

  app.patch('/api/payment-requests/:id/cancel', async (req: Request, res: Response) => {
    res.json(await store.cancelPaymentRequest(String(req.params.id)))
  })

  app.delete('/api/payment-requests/:id', async (req: Request, res: Response) => {
    res.json(await store.deletePaymentRequest(String(req.params.id)))
  })

  app.post('/api/payments/confirm', async (req: Request, res: Response) => {
    res.json(await store.confirmPayment(confirmPaymentSchema.parse(req.body)))
  })

  app.post('/api/payments/:id/void', async (req: Request, res: Response) => {
    res.json(await store.voidPayment(String(req.params.id), voidPaymentSchema.parse(req.body)))
  })

  app.post('/api/supplier-batches', async (req: Request, res: Response) => {
    res.status(201).json(await store.generateSupplierBatch(supplierBatchSchema.parse(req.body)))
  })

  app.patch('/api/supplier-batches/:id/confirm', async (req: Request, res: Response) => {
    res.json(await store.confirmSupplierBatch(String(req.params.id)))
  })

  app.patch('/api/orders/:id/complete', async (req: Request, res: Response) => {
    res.json(await store.completeOrder(String(req.params.id)))
  })

  app.post('/api/refunds', async (req: Request, res: Response) => {
    res.status(201).json(await store.refundOrder(refundSchema.parse(req.body)))
  })

  app.post('/api/products', async (req: Request, res: Response) => {
    res.status(201).json(await store.createProduct(productSchema.parse(req.body)))
  })

  app.patch('/api/products/:id', async (req: Request, res: Response) => {
    res.json(await store.updateProduct(String(req.params.id), productSchema.parse(req.body)))
  })

  app.delete('/api/products/:id', async (req: Request, res: Response) => {
    res.json(await store.deleteProduct(String(req.params.id)))
  })

  app.post('/api/suppliers', async (req: Request, res: Response) => {
    res.status(201).json(await store.createSupplier(supplierSchema.parse(req.body)))
  })

  app.patch('/api/suppliers/:id', async (req: Request, res: Response) => {
    res.json(await store.updateSupplier(String(req.params.id), supplierSchema.parse(req.body)))
  })

  app.delete('/api/suppliers/:id', async (req: Request, res: Response) => {
    res.json(await store.deleteSupplier(String(req.params.id)))
  })

  app.use((error: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
    void _next
    if (error instanceof z.ZodError) {
      res.status(422).json({ error: '请求参数不合法', details: error.issues })
      return
    }
    if (error instanceof DomainError) {
      res.status(error.status).json({ error: error.message })
      return
    }
    console.error(error)
    res.status(500).json({ error: '服务端异常' })
  })

  return app
}
