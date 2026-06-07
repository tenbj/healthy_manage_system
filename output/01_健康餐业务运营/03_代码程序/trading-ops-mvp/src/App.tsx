import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  CreditCard,
  Database,
  HandCoins,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  Send,
  Truck,
  UserPlus,
  WalletCards,
} from 'lucide-react'
import './App.css'
import { api } from './lib/api'
import type { Customer, OperationState, Order, PaymentRequest, SupplierBatch } from './types/domain'

const statusText: Record<Order['status'], string> = {
  WAIT_PAY: '待付款',
  PAID_WAIT_SUPPLIER: '已付款待下单',
  SENT_TO_SUPPLIER: '已下发供应商',
  SUPPLIER_CONFIRMED: '供应商已确认',
  COMPLETED: '已完成',
  AFTER_SALE: '售后中',
  REFUNDED: '已退款',
  CANCELED: '已取消',
}

const customerStatusText: Record<Customer['status'], string> = {
  NEW: '新咨询',
  QUOTED: '已报价',
  WAIT_PAY: '待付款',
  ACTIVE: '履约中',
  REPEAT: '可复购',
  LOST: '流失',
}

function currency(value: number) {
  return `¥${value.toFixed(2)}`
}

function App() {
  const [state, setState] = useState<OperationState | null>(null)
  const [selectedCustomerId, setSelectedCustomerId] = useState('C-001')
  const [selectedSupplierId, setSelectedSupplierId] = useState('S-A')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('正在加载运营台')
  const [busy, setBusy] = useState(false)
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    wechatName: '',
    phone: '',
    source: '小红书',
    address: '',
    preference: '',
  })
  const [orderForm, setOrderForm] = useState({
    productId: 'P-FAT-A',
    serviceDate: '2026-06-07',
    note: '',
    payWithBalance: false,
  })
  const [topupAmount, setTopupAmount] = useState(300)

  const refresh = useCallback(async () => {
    try {
      setBusy(true)
      const next = await api.state()
      setState(next)
      setSelectedCustomerId((current) => (next.customers.find((customer) => customer.id === current) ? current : (next.customers[0]?.id ?? '')))
      setToast('运营台已同步')
    } catch (error) {
      setToast(error instanceof Error ? error.message : '加载失败')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  async function runAction(action: () => Promise<OperationState>, message: string) {
    try {
      setBusy(true)
      const next = await action()
      setState(next)
      setToast(message)
    } catch (error) {
      setToast(error instanceof Error ? error.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  const selectedCustomer = state?.customers.find((customer) => customer.id === selectedCustomerId) ?? state?.customers[0]
  const filteredOrders = useMemo(() => {
    const keyword = search.trim()
    if (!state) return []
    if (!keyword) return state.orders
    return state.orders.filter((order) => `${order.id}${order.customerName}${order.mealName}${order.status}`.includes(keyword))
  }, [search, state])

  if (!state) {
    return (
      <main className="loading">
        <RefreshCw className="spin" aria-hidden="true" />
        <span>{toast}</span>
      </main>
    )
  }

  const primaryRequests = state.paymentRequests.filter((request) => request.status === 'WAIT_PAY')
  const latestBatch = state.supplierBatches[0]

  function handleCustomerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void runAction(async () => {
      const next = await api.createCustomer(newCustomer)
      setNewCustomer({ name: '', wechatName: '', phone: '', source: '小红书', address: '', preference: '' })
      return next
    }, '客户已进入今日待办')
  }

  function handleOrderSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedCustomer) return
    void runAction(
      () =>
        api.createOrder({
          customerId: selectedCustomer.id,
          serviceDate: orderForm.serviceDate,
          productId: orderForm.productId,
          note: orderForm.note || selectedCustomer.preference,
          payWithBalance: orderForm.payWithBalance,
          idempotencyKey: `ui-deduct-${selectedCustomer.id}-${Date.now()}`,
        }),
      orderForm.payWithBalance ? '订单已创建并核销余额' : '订单已创建，付款请求已生成',
    )
  }

  function handleTopup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedCustomer) return
    void runAction(
      () =>
        api.createPaymentRequest({
          customerId: selectedCustomer.id,
          type: 'PREPAID_TOPUP',
          amount: topupAmount,
          method: '微信',
          note: `预付款充值 ${topupAmount}`,
        }),
      '预付款充值请求已生成',
    )
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="主导航">
        <div className="brand">
          <div className="brand-mark">餐</div>
          <div>
            <strong>健康餐交易中台</strong>
            <span>内部运营 MVP</span>
          </div>
        </div>
        <nav>
          <a className="active" href="#dashboard">
            <Database size={17} /> 今日运营台
          </a>
          <a href="#orders">
            <PackageCheck size={17} /> 订单工作台
          </a>
          <a href="#payments">
            <HandCoins size={17} /> 收款与预付款
          </a>
          <a href="#supplier">
            <Truck size={17} /> 供应商批次
          </a>
          <a href="#review">
            <AlertTriangle size={17} /> 每日复盘
          </a>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>今日运营台</h1>
            <p>客户、订单、收款、预付款、供应商批次和每日复盘同屏推进。</p>
          </div>
          <div className="top-actions">
            <label className="search">
              <Search size={16} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索订单/客户/状态" />
            </label>
            <button type="button" className="icon-button" onClick={refresh} disabled={busy} title="刷新">
              <RefreshCw size={17} className={busy ? 'spin' : ''} />
            </button>
          </div>
        </header>

        <div className="toast" role="status">
          {toast}
        </div>

        <section id="dashboard" className="metric-strip" aria-label="今日核心数据">
          <Metric label="今日订单" value={state.dashboard.orderCount} tone="blue" />
          <Metric label="待付款" value={state.dashboard.waitPayCount} tone="amber" />
          <Metric label="待下单" value={state.dashboard.waitSupplierCount} tone="green" />
          <Metric label="供应商未确认" value={state.dashboard.unconfirmedBatchCount} tone="red" />
          <Metric label="今日毛利" value={currency(state.dashboard.grossProfit)} tone="green" />
        </section>

        <section className="grid-main">
          <article id="orders" className="panel order-panel">
            <div className="panel-heading">
              <div>
                <h2>订单工作台</h2>
                <p>主链路：客户 → 订单 → 付款/余额 → 供应商批次 → 完成。</p>
              </div>
              <span className="count">{filteredOrders.length} 单</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>订单</th>
                    <th>客户</th>
                    <th>餐品</th>
                    <th>金额</th>
                    <th>毛利</th>
                    <th>状态</th>
                    <th>动作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <button className="link-button" type="button" onClick={() => setSelectedCustomerId(order.customerId)}>
                          {order.id}
                        </button>
                        <span className="subtle">{order.serviceDate}</span>
                      </td>
                      <td>{order.customerName}</td>
                      <td>{order.mealName}</td>
                      <td>{currency(order.amount)}</td>
                      <td className={order.grossProfit < 0 ? 'danger-text' : ''}>{currency(order.grossProfit)}</td>
                      <td>
                        <StatusPill status={order.status} />
                      </td>
                      <td>
                        <RowActions order={order} onDone={(next) => setState(next)} onToast={setToast} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <aside className="side-stack">
            <article className="panel" aria-label="客户详情">
              <div className="panel-heading compact">
                <h2>客户详情</h2>
                <span className="count">{state.customers.length} 人</span>
              </div>
              <select value={selectedCustomer?.id} onChange={(event) => setSelectedCustomerId(event.target.value)}>
                {state.customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} · {customerStatusText[customer.status]}
                  </option>
                ))}
              </select>
              {selectedCustomer && (
                <div className="customer-card">
                  <strong>{selectedCustomer.name}</strong>
                  <span>{selectedCustomer.wechatName} · {selectedCustomer.source}</span>
                  <p>{selectedCustomer.address}</p>
                  <p>{selectedCustomer.preference}</p>
                  <div className="balance">余额 {currency(selectedCustomer.balance)}</div>
                </div>
              )}
              <form className="mini-form" onSubmit={handleCustomerSubmit}>
                <input required placeholder="客户姓名" value={newCustomer.name} onChange={(event) => setNewCustomer({ ...newCustomer, name: event.target.value })} />
                <input required placeholder="微信昵称" value={newCustomer.wechatName} onChange={(event) => setNewCustomer({ ...newCustomer, wechatName: event.target.value })} />
                <input placeholder="手机号" value={newCustomer.phone} onChange={(event) => setNewCustomer({ ...newCustomer, phone: event.target.value })} />
                <input required placeholder="配送地址" value={newCustomer.address} onChange={(event) => setNewCustomer({ ...newCustomer, address: event.target.value })} />
                <textarea required placeholder="忌口/偏好/备注" value={newCustomer.preference} onChange={(event) => setNewCustomer({ ...newCustomer, preference: event.target.value })} />
                <button className="primary" type="submit" disabled={busy}>
                  <UserPlus size={16} /> 新建客户
                </button>
              </form>
            </article>

            <article className="panel" aria-label="新建订单">
              <div className="panel-heading compact">
                <h2>新建订单</h2>
              </div>
              <form className="mini-form" onSubmit={handleOrderSubmit}>
                <select value={orderForm.productId} onChange={(event) => setOrderForm({ ...orderForm, productId: event.target.value })}>
                  {state.products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} · {currency(product.amount)}
                    </option>
                  ))}
                </select>
                <input type="date" value={orderForm.serviceDate} onChange={(event) => setOrderForm({ ...orderForm, serviceDate: event.target.value })} />
                <textarea placeholder="订单备注，默认带出客户偏好" value={orderForm.note} onChange={(event) => setOrderForm({ ...orderForm, note: event.target.value })} />
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={orderForm.payWithBalance}
                    onChange={(event) => setOrderForm({ ...orderForm, payWithBalance: event.target.checked })}
                  />
                  使用客户余额核销
                </label>
                <button className="primary" type="submit" disabled={busy || !selectedCustomer}>
                  <Plus size={16} /> 创建订单
                </button>
              </form>
            </article>
          </aside>
        </section>

        <section className="grid-secondary">
          <article id="payments" className="panel">
            <div className="panel-heading">
              <div>
                <h2>收款与预付款</h2>
                <p>确认收款幂等处理；充值只进预收款，余额核销后才转营业额。</p>
              </div>
              <CreditCard size={20} />
            </div>
            <div className="request-list">
              {primaryRequests.map((request) => (
                <PaymentRequestRow key={request.id} request={request} onDone={setState} onToast={setToast} />
              ))}
            </div>
            <form className="inline-form" onSubmit={handleTopup}>
              <input type="number" min="1" value={topupAmount} onChange={(event) => setTopupAmount(Number(event.target.value))} />
              <button className="secondary" type="submit" disabled={!selectedCustomer || busy}>
                <WalletCards size={16} /> 生成充值请求
              </button>
            </form>
            <div className="ledger">
              {state.prepaidLedger.slice(0, 4).map((ledger) => (
                <div key={ledger.id}>
                  <span>{ledger.note}</span>
                  <strong>{currency(ledger.amount)}</strong>
                </div>
              ))}
            </div>
          </article>

          <article id="supplier" className="panel">
            <div className="panel-heading">
              <div>
                <h2>供应商批次</h2>
                <p>按日期和供应商汇总已付款订单，生成可复制微信文本。</p>
              </div>
              <Truck size={20} />
            </div>
            <div className="inline-form">
              <select value={selectedSupplierId} onChange={(event) => setSelectedSupplierId(event.target.value)}>
                {state.suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
              <button className="secondary" type="button" onClick={() => void runAction(() => api.generateBatch(selectedSupplierId, '2026-06-07'), '供应商下单批次已生成')}>
                <Send size={16} /> 生成批次
              </button>
            </div>
            <BatchPreview batch={latestBatch} onDone={setState} onToast={setToast} />
          </article>

          <article id="review" className="panel">
            <div className="panel-heading">
              <div>
                <h2>每日复盘</h2>
                <p>对账异常和经营数据是当天能否收工的判断。</p>
              </div>
              <AlertTriangle size={20} />
            </div>
            <div className="finance-grid">
              <span>实收 {currency(state.dashboard.cashIn)}</span>
              <span>营业额 {currency(state.dashboard.revenue)}</span>
              <span>预收款 {currency(state.dashboard.prepaidTopup)}</span>
              <span>核销 {currency(state.dashboard.prepaidDeducted)}</span>
              <span>供应商成本 {currency(state.dashboard.supplierCost)}</span>
              <span>配送成本 {currency(state.dashboard.deliveryCost)}</span>
            </div>
            <div className="issue-list">
              {state.issues.map((issue) => (
                <div className={`issue ${issue.level.toLowerCase()}`} key={issue.id}>
                  <strong>{issue.title}</strong>
                  <span>{issue.detail}</span>
                </div>
              ))}
            </div>
          </article>
        </section>
      </section>
    </main>
  )
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone: 'blue' | 'green' | 'amber' | 'red' }) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function StatusPill({ status }: { status: Order['status'] }) {
  return <span className={`status ${status.toLowerCase()}`}>{statusText[status]}</span>
}

function RowActions({ order, onDone, onToast }: { order: Order; onDone: (state: OperationState) => void; onToast: (message: string) => void }) {
  async function act(action: Promise<OperationState>, message: string) {
    try {
      onDone(await action)
      onToast(message)
    } catch (error) {
      onToast(error instanceof Error ? error.message : '操作失败')
    }
  }
  return (
    <div className="row-actions">
      {order.status === 'SUPPLIER_CONFIRMED' && (
        <button type="button" title="完成订单" onClick={() => void act(api.completeOrder(order.id), '订单已完成')}>
          <Check size={15} />
        </button>
      )}
      {order.paymentStatus === 'PAID' && order.status !== 'REFUNDED' && (
        <button type="button" title="登记退款" onClick={() => void act(api.refundOrder(order.id, Math.min(order.amount, 10)), '退款已登记')}>
          <CreditCard size={15} />
        </button>
      )}
    </div>
  )
}

function PaymentRequestRow({ request, onDone, onToast }: { request: PaymentRequest; onDone: (state: OperationState) => void; onToast: (message: string) => void }) {
  async function confirm() {
    try {
      onDone(await api.confirmPayment(request.id))
      onToast('收款已确认并归账')
    } catch (error) {
      onToast(error instanceof Error ? error.message : '确认失败')
    }
  }
  return (
    <div className="request-row">
      <div>
        <strong>{request.customerName}</strong>
        <span>
          {request.type === 'PREPAID_TOPUP' ? '预付款充值' : '订单收款'} · {currency(request.amount)}
        </span>
      </div>
      <button type="button" className="secondary" onClick={confirm}>
        <HandCoins size={16} /> 确认
      </button>
    </div>
  )
}

function BatchPreview({ batch, onDone, onToast }: { batch?: SupplierBatch; onDone: (state: OperationState) => void; onToast: (message: string) => void }) {
  if (!batch) return <p className="empty">还没有供应商批次。先确认收款，再生成批次。</p>
  const currentBatch = batch
  async function copy() {
    await navigator.clipboard.writeText(currentBatch.copyText)
    onToast('下单文本已复制')
  }
  async function confirm() {
    try {
      onDone(await api.confirmBatch(currentBatch.id))
      onToast('供应商已确认')
    } catch (error) {
      onToast(error instanceof Error ? error.message : '确认失败')
    }
  }
  return (
    <div className="batch-preview">
      <div className="batch-meta">
        <strong>{batch.supplierName}</strong>
        <span>
          {batch.serviceDate} · {batch.itemCount} 单 · 成本 {currency(batch.totalCost)}
        </span>
        <span className={`status ${batch.status.toLowerCase()}`}>{batch.status === 'CONFIRMED' ? '已确认' : '待确认'}</span>
      </div>
      <pre>{batch.copyText}</pre>
      <div className="batch-actions">
        <button className="secondary" type="button" onClick={copy}>
          <ClipboardCopy size={16} /> 复制文本
        </button>
        <button className="primary" type="button" onClick={confirm}>
          <PackageCheck size={16} /> 标记确认
        </button>
      </div>
    </div>
  )
}

export default App
