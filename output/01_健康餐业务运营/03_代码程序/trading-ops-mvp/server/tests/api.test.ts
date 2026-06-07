import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app.ts'
import { createMemoryStore } from '../memoryStore.ts'

function app() {
  return createApp(createMemoryStore())
}

describe('trading ops API', () => {
  it('loads the seed dashboard', async () => {
    const response = await request(app()).get('/api/state').expect(200)
    expect(response.body.dashboard.orderCount).toBe(2)
    expect(response.body.products.length).toBeGreaterThan(0)
  })

  it('runs customer to order to manual payment to supplier batch', async () => {
    const server = app()
    const customerResponse = await request(server)
      .post('/api/customers')
      .send({
        name: '王小米',
        wechatName: 'xm',
        phone: '13800009999',
        source: '小红书',
        address: '云谷公寓 8 栋 601',
        preference: '不要辣',
      })
      .expect(201)
    const customer = customerResponse.body.customers.find((item: { name: string }) => item.name === '王小米')

    const orderResponse = await request(server)
      .post('/api/orders')
      .send({
        customerId: customer.id,
        serviceDate: '2026-06-07',
        productId: 'P-FAT-A',
        note: '午餐 12 点前送达',
      })
      .expect(201)
    const requestToPay = orderResponse.body.paymentRequests.find(
      (item: { customerId: string; status: string }) => item.customerId === customer.id && item.status === 'WAIT_PAY',
    )

    const paidResponse = await request(server)
      .post('/api/payments/confirm')
      .send({ paymentRequestId: requestToPay.id, method: '微信', idempotencyKey: 'case-payment-1' })
      .expect(200)
    const paidOrder = paidResponse.body.orders.find((item: { id: string }) => item.id === requestToPay.orderId)
    expect(paidOrder.status).toBe('PAID_WAIT_SUPPLIER')

    const batchResponse = await request(server)
      .post('/api/supplier-batches')
      .send({ supplierId: 'S-A', serviceDate: '2026-06-07' })
      .expect(201)
    expect(batchResponse.body.supplierBatches[0].copyText).toContain('健康餐下单')

    const batchId = batchResponse.body.supplierBatches[0].id
    const confirmedResponse = await request(server).patch(`/api/supplier-batches/${batchId}/confirm`).expect(200)
    expect(confirmedResponse.body.supplierBatches[0].status).toBe('CONFIRMED')
  })

  it('keeps payment confirmation idempotent', async () => {
    const server = app()
    const before = await request(server).get('/api/state').expect(200)
    const requestToPay = before.body.paymentRequests[0]
    await request(server)
      .post('/api/payments/confirm')
      .send({ paymentRequestId: requestToPay.id, method: '微信', idempotencyKey: 'repeat-key' })
      .expect(200)
    const second = await request(server)
      .post('/api/payments/confirm')
      .send({ paymentRequestId: requestToPay.id, method: '微信', idempotencyKey: 'repeat-key' })
      .expect(200)
    const payments = second.body.payments.filter((item: { idempotencyKey: string }) => item.idempotencyKey === 'repeat-key')
    expect(payments).toHaveLength(1)
  })

  it('top-up is not revenue until balance is deducted into an order', async () => {
    const server = app()
    const state = await request(server).get('/api/state').expect(200)
    const customer = state.body.customers.find((item: { id: string }) => item.id === 'C-002')
    const requestResponse = await request(server)
      .post('/api/payment-requests')
      .send({ customerId: customer.id, type: 'PREPAID_TOPUP', amount: 300, method: '微信', note: '充值 300' })
      .expect(201)
    const topupRequest = requestResponse.body.paymentRequests.find(
      (item: { customerId: string; type: string; amount: number; status: string }) =>
        item.customerId === customer.id && item.type === 'PREPAID_TOPUP' && item.amount === 300 && item.status === 'WAIT_PAY',
    )
    const topupResponse = await request(server)
      .post('/api/payments/confirm')
      .send({ paymentRequestId: topupRequest.id, method: '微信', idempotencyKey: 'topup-key' })
      .expect(200)
    expect(topupResponse.body.dashboard.prepaidTopup).toBe(300)
    expect(topupResponse.body.dashboard.revenue).toBeLessThan(300)

    const orderResponse = await request(server)
      .post('/api/orders')
      .send({
        customerId: customer.id,
        serviceDate: '2026-06-07',
        productId: 'P-FAT-B',
        payWithBalance: true,
        idempotencyKey: 'deduct-key',
      })
      .expect(201)
    expect(orderResponse.body.dashboard.prepaidDeducted).toBeGreaterThanOrEqual(42)
  })

  it('blocks balance deduction when balance is insufficient', async () => {
    const response = await request(app())
      .post('/api/orders')
      .send({
        customerId: 'C-003',
        serviceDate: '2026-06-07',
        productId: 'P-PREMIUM',
        payWithBalance: true,
        idempotencyKey: 'insufficient-key',
      })
      .expect(400)
    expect(response.body.error).toContain('余额不足')
  })
})
