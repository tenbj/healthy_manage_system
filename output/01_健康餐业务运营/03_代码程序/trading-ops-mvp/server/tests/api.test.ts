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

  it('manages customers, products, and suppliers on independent pages', async () => {
    const server = app()
    const createdCustomer = await request(server)
      .post('/api/customers')
      .send({
        name: '赵青',
        wechatName: 'qing',
        phone: '13800008888',
        source: '微信',
        address: '江南里 1 栋 201',
        preference: '不吃葱',
      })
      .expect(201)
    const customer = createdCustomer.body.customers.find((item: { name: string }) => item.name === '赵青')

    const updatedCustomer = await request(server)
      .patch(`/api/customers/${customer.id}`)
      .send({
        name: '赵青云',
        wechatName: 'qing',
        phone: '13800008888',
        source: '微信',
        address: '江南里 1 栋 201',
        preference: '不吃葱，不要辣',
        status: 'ACTIVE',
      })
      .expect(200)
    expect(updatedCustomer.body.customers.find((item: { id: string }) => item.id === customer.id).name).toBe('赵青云')

    const supplierResponse = await request(server)
      .post('/api/suppliers')
      .send({ name: '测试供应商', contact: '刘姐 13800006666', notes: '测试供应商' })
      .expect(201)
    const supplier = supplierResponse.body.suppliers.find((item: { name: string }) => item.name === '测试供应商')

    const productResponse = await request(server)
      .post('/api/products')
      .send({
        name: '测试套餐',
        category: '套餐',
        description: '测试用套餐',
        amount: 99,
        supplierCost: 60,
        deliveryCost: 8,
        supplierId: supplier.id,
      })
      .expect(201)
    const product = productResponse.body.products.find((item: { name: string }) => item.name === '测试套餐')
    expect(product.amount).toBe(99)

    const disabledProduct = await request(server).delete(`/api/products/${product.id}`).expect(200)
    expect(disabledProduct.body.products.find((item: { id: string }) => item.id === product.id).status).toBe('INACTIVE')

    const disabledSupplier = await request(server).delete(`/api/suppliers/${supplier.id}`).expect(200)
    expect(disabledSupplier.body.suppliers.find((item: { id: string }) => item.id === supplier.id).status).toBe('INACTIVE')

    const deletedCustomer = await request(server).delete(`/api/customers/${customer.id}`).expect(200)
    expect(deletedCustomer.body.customers.find((item: { id: string }) => item.id === customer.id)).toBeUndefined()
  })

  it('cancels and deletes pending payment requests, and blocks confirming canceled requests', async () => {
    const server = app()
    const state = await request(server).get('/api/state').expect(200)
    const customer = state.body.customers.find((item: { id: string }) => item.id === 'C-002')

    const cancelResponse = await request(server)
      .post('/api/payment-requests')
      .send({ customerId: customer.id, type: 'PREPAID_TOPUP', amount: 100, method: '微信', note: '取消测试' })
      .expect(201)
    const cancelRequest = cancelResponse.body.paymentRequests.find((item: { amount: number; status: string }) => item.amount === 100 && item.status === 'WAIT_PAY')
    await request(server).patch(`/api/payment-requests/${cancelRequest.id}/cancel`).expect(200)
    const confirmCanceled = await request(server)
      .post('/api/payments/confirm')
      .send({ paymentRequestId: cancelRequest.id, method: '微信', idempotencyKey: 'canceled-request-key' })
      .expect(400)
    expect(confirmCanceled.body.error).toContain('不能确认')

    const deleteResponse = await request(server)
      .post('/api/payment-requests')
      .send({ customerId: customer.id, type: 'PREPAID_TOPUP', amount: 120, method: '微信', note: '删除测试' })
      .expect(201)
    const deleteRequest = deleteResponse.body.paymentRequests.find((item: { amount: number; status: string }) => item.amount === 120 && item.status === 'WAIT_PAY')
    const deleted = await request(server).delete(`/api/payment-requests/${deleteRequest.id}`).expect(200)
    expect(deleted.body.paymentRequests.find((item: { id: string }) => item.id === deleteRequest.id)).toBeUndefined()
  })

  it('voids confirmed top-up by reversing customer balance and ledger', async () => {
    const server = app()
    const state = await request(server).get('/api/state').expect(200)
    const customer = state.body.customers.find((item: { id: string }) => item.id === 'C-002')
    const requestResponse = await request(server)
      .post('/api/payment-requests')
      .send({ customerId: customer.id, type: 'PREPAID_TOPUP', amount: 200, method: '微信', note: '作废测试' })
      .expect(201)
    const topupRequest = requestResponse.body.paymentRequests.find((item: { amount: number; status: string }) => item.amount === 200 && item.status === 'WAIT_PAY')
    const paidResponse = await request(server)
      .post('/api/payments/confirm')
      .send({ paymentRequestId: topupRequest.id, method: '微信', idempotencyKey: 'void-topup-key' })
      .expect(200)
    const payment = paidResponse.body.payments.find((item: { idempotencyKey: string }) => item.idempotencyKey === 'void-topup-key')
    expect(paidResponse.body.customers.find((item: { id: string }) => item.id === customer.id).balance).toBe(200)

    const voided = await request(server).post(`/api/payments/${payment.id}/void`).send({ reason: '测试作废' }).expect(200)
    expect(voided.body.payments.find((item: { id: string }) => item.id === payment.id).status).toBe('VOIDED')
    expect(voided.body.customers.find((item: { id: string }) => item.id === customer.id).balance).toBe(0)
    expect(voided.body.prepaidLedger.find((item: { note: string }) => item.note.includes(payment.id)).amount).toBe(-200)
  })

  it('cancels only unpaid wait-pay orders', async () => {
    const server = app()
    const state = await request(server).get('/api/state').expect(200)
    const customer = state.body.customers.find((item: { id: string }) => item.id === 'C-002')
    const orderResponse = await request(server)
      .post('/api/orders')
      .send({ customerId: customer.id, serviceDate: '2026-06-07', productId: 'P-FAT-A' })
      .expect(201)
    const order = orderResponse.body.orders.find((item: { customerId: string; status: string }) => item.customerId === customer.id && item.status === 'WAIT_PAY')
    const canceled = await request(server).patch(`/api/orders/${order.id}/cancel`).expect(200)
    expect(canceled.body.orders.find((item: { id: string }) => item.id === order.id).status).toBe('CANCELED')

    await request(server).patch('/api/orders/O-001/cancel').expect(400)
  })
})
