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

  app.post('/api/orders', async (req: Request, res: Response) => {
    res.status(201).json(await store.createOrder(orderSchema.parse(req.body)))
  })

  app.post('/api/payment-requests', async (req: Request, res: Response) => {
    res.status(201).json(await store.createPaymentRequest(paymentRequestSchema.parse(req.body)))
  })

  app.post('/api/payments/confirm', async (req: Request, res: Response) => {
    res.json(await store.confirmPayment(confirmPaymentSchema.parse(req.body)))
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
