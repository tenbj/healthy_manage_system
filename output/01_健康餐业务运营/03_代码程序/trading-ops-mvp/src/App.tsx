import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
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
  Settings2,
  Store,
  Trash2,
  Truck,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react'
import './App.css'
import { api } from './lib/api'
import type {
  Customer,
  CustomerStatus,
  OperationState,
  Order,
  PaymentRequest,
  Product,
  ProductStatus,
  Supplier,
  SupplierBatch,
  SupplierStatus,
} from './types/domain'

type RouteKey = '/dashboard' | '/customers' | '/orders' | '/payments' | '/products' | '/suppliers' | '/review'

const routes: Array<{ path: RouteKey; label: string; icon: typeof Database }> = [
  { path: '/dashboard', label: '今日运营台', icon: Database },
  { path: '/customers', label: '客户管理', icon: UserRound },
  { path: '/orders', label: '订单管理', icon: PackageCheck },
  { path: '/payments', label: '收款充值', icon: HandCoins },
  { path: '/products', label: '商品套餐', icon: Settings2 },
  { path: '/suppliers', label: '供应商', icon: Truck },
  { path: '/review', label: '每日复盘', icon: AlertTriangle },
]

const orderStatusText: Record<Order['status'], string> = {
  WAIT_PAY: '待付款',
  PAID_WAIT_SUPPLIER: '已付款待下单',
  SENT_TO_SUPPLIER: '已下发供应商',
  SUPPLIER_CONFIRMED: '供应商已确认',
  COMPLETED: '已完成',
  AFTER_SALE: '售后中',
  REFUNDED: '已退款',
  CANCELED: '已取消',
}

const customerStatusText: Record<CustomerStatus, string> = {
  NEW: '新咨询',
  QUOTED: '已报价',
  WAIT_PAY: '待付款',
  ACTIVE: '履约中',
  REPEAT: '可复购',
  LOST: '流失',
}

const requestTypeText: Record<PaymentRequest['type'], string> = {
  ORDER_PAYMENT: '订单收款',
  PREPAID_TOPUP: '预付款充值',
  BALANCE_SHORTFALL: '余额补差',
}

const paymentRequestStatusText: Record<PaymentRequest['status'], string> = {
  WAIT_PAY: '待确认',
  PAID: '已确认',
  CANCELED: '已取消',
}

function currency(value: number) {
  return `¥${value.toFixed(2)}`
}

function getRoute(): RouteKey {
  const path = window.location.pathname as RouteKey
  return routes.some((route) => route.path === path) ? path : '/dashboard'
}

function paymentTone(status: PaymentRequest['status']): 'green' | 'amber' | 'red' {
  if (status === 'PAID') return 'green'
  if (status === 'CANCELED') return 'red'
  return 'amber'
}

function customerPaymentSummary(requests: PaymentRequest[], customerId: string) {
  const customerRequests = requests.filter((request) => request.customerId === customerId)
  const pendingRequests = customerRequests.filter((request) => request.status === 'WAIT_PAY')
  const pending = pendingRequests.length
  const paid = customerRequests.filter((request) => request.status === 'PAID').length
  const canceled = customerRequests.filter((request) => request.status === 'CANCELED').length
  if (pending > 0) return { label: `待确认 ${pending} 笔 ${currency(pendingRequests.reduce((sum, request) => sum + request.amount, 0))}`, tone: 'amber' as const }
  if (paid > 0) return { label: `已确认 ${paid}`, tone: 'green' as const }
  if (canceled > 0) return { label: `已取消 ${canceled}`, tone: 'red' as const }
  return { label: '无请求', tone: 'blue' as const }
}

function latestOrderRequest(requests: PaymentRequest[], orderId: string) {
  const orderRequests = requests.filter((request) => request.orderId === orderId)
  return orderRequests.find((request) => request.status === 'WAIT_PAY') ?? orderRequests.find((request) => request.status === 'PAID')
}

function App() {
  const [route, setRoute] = useState<RouteKey>(getRoute())
  const [state, setState] = useState<OperationState | null>(null)
  const [toast, setToast] = useState('正在加载运营数据')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setBusy(true)
      setState(await api.state())
      setToast('数据已同步')
    } catch (error) {
      setToast(error instanceof Error ? error.message : '加载失败')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0)
    const onPop = () => setRoute(getRoute())
    window.addEventListener('popstate', onPop)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('popstate', onPop)
    }
  }, [refresh])

  function navigate(path: RouteKey) {
    window.history.pushState({}, '', path)
    setRoute(path)
  }

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

  if (!state) {
    return (
      <main className="loading">
        <RefreshCw className="spin" aria-hidden="true" />
        <span>{toast}</span>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="主导航">
        <div className="brand">
          <div className="brand-mark">餐</div>
          <div>
            <strong>健康餐交易中台</strong>
            <span>多页面运营后台</span>
          </div>
        </div>
        <nav>
          {routes.map((item) => {
            const Icon = item.icon
            return (
              <a
                key={item.path}
                className={route === item.path ? 'active' : ''}
                href={item.path}
                onClick={(event) => {
                  event.preventDefault()
                  navigate(item.path)
                }}
              >
                <Icon size={17} /> {item.label}
              </a>
            )
          })}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{routes.find((item) => item.path === route)?.label}</h1>
            <p>业务日 {state.dashboard.today}，所有页面共享同一套客户、订单、收款、商品和供应商数据。</p>
          </div>
          <button type="button" className="icon-button" onClick={refresh} disabled={busy} title="刷新">
            <RefreshCw size={17} className={busy ? 'spin' : ''} />
          </button>
        </header>

        <div className="toast" role="status">
          {toast}
        </div>

        {route === '/dashboard' && <DashboardPage state={state} navigate={navigate} />}
        {route === '/customers' && <CustomersPage state={state} busy={busy} runAction={runAction} />}
        {route === '/orders' && <OrdersPage state={state} busy={busy} runAction={runAction} navigate={navigate} />}
        {route === '/payments' && <PaymentsPage state={state} busy={busy} runAction={runAction} />}
        {route === '/products' && <ProductsPage state={state} busy={busy} runAction={runAction} />}
        {route === '/suppliers' && <SuppliersPage state={state} busy={busy} runAction={runAction} setToast={setToast} />}
        {route === '/review' && <ReviewPage state={state} navigate={navigate} />}
      </section>
    </main>
  )
}

function DashboardPage({ state, navigate }: { state: OperationState; navigate: (path: RouteKey) => void }) {
  return (
    <div className="page-stack">
      <section className="metric-strip">
        <Metric label="今日订单" value={state.dashboard.orderCount} tone="blue" />
        <Metric label="待付款" value={state.dashboard.waitPayCount} tone="amber" />
        <Metric label="待下单" value={state.dashboard.waitSupplierCount} tone="green" />
        <Metric label="供应商未确认" value={state.dashboard.unconfirmedBatchCount} tone="red" />
        <Metric label="今日毛利" value={currency(state.dashboard.grossProfit)} tone="green" />
      </section>
      <section className="split-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>今日待办</h2>
              <p>从这里进入具体页面处理，不再把所有操作挤在同一屏。</p>
            </div>
          </div>
          <div className="action-list">
            <button type="button" onClick={() => navigate('/payments')}>
              <CreditCard size={18} /> 待确认收款 {state.paymentRequests.filter((item) => item.status === 'WAIT_PAY').length}
            </button>
            <button type="button" onClick={() => navigate('/suppliers')}>
              <Truck size={18} /> 待生成供应商批次 {state.dashboard.waitSupplierCount}
            </button>
            <button type="button" onClick={() => navigate('/review')}>
              <AlertTriangle size={18} /> 未解决异常 {state.dashboard.issueCount}
            </button>
          </div>
        </article>
        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>收工判断</h2>
              <p>待付款、待下单、供应商未确认和异常池都清完，才算当天流程闭合。</p>
            </div>
          </div>
          <div className="finance-grid">
            <span>实收 {currency(state.dashboard.cashIn)}</span>
            <span>营业额 {currency(state.dashboard.revenue)}</span>
            <span>预收款 {currency(state.dashboard.prepaidTopup)}</span>
            <span>余额核销 {currency(state.dashboard.prepaidDeducted)}</span>
            <span>退款 {currency(state.dashboard.refund)}</span>
            <span>成本 {currency(state.dashboard.supplierCost + state.dashboard.deliveryCost)}</span>
          </div>
        </article>
      </section>
    </div>
  )
}

function CustomersPage({ state, busy, runAction }: PageProps) {
  const [keyword, setKeyword] = useState('')
  const [drawer, setDrawer] = useState<CustomerDrawer | null>(null)
  const [createForm, setCreateForm] = useState<CustomerFormState>(blankCustomer())
  const [editForm, setEditForm] = useState<CustomerEditState>(customerToEdit())
  const [orderForm, setOrderForm] = useState<OrderFormState>(() => blankOrder(state))
  const [topupForm, setTopupForm] = useState<TopupFormState>(() => blankTopup(state.customers[0]?.id ?? ''))

  const customers = state.customers.filter((customer) => `${customer.name}${customer.wechatName}${customer.phone}${customer.status}`.includes(keyword.trim()))

  function openOrder(customer: Customer, payWithBalance: boolean) {
    setOrderForm(blankOrder(state, customer.id, payWithBalance))
    setDrawer({ type: 'createOrder', customerId: customer.id })
  }

  function openTopup(customer: Customer) {
    setTopupForm(blankTopup(customer.id))
    setDrawer({ type: 'createTopup', customerId: customer.id })
  }

  function openEdit(customer: Customer) {
    setEditForm(customerToEdit(customer))
    setDrawer({ type: 'editCustomer', customerId: customer.id })
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void runAction(async () => {
      const next = await api.createCustomer(createForm)
      setCreateForm(blankCustomer())
      setDrawer(null)
      return next
    }, '客户已新增')
  }

  function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const selected = drawer?.type === 'editCustomer' ? state.customers.find((customer) => customer.id === drawer.customerId) : null
    if (!selected) return
    void runAction(async () => {
      const next = await api.updateCustomer(selected.id, editForm)
      setDrawer(null)
      return next
    }, '客户资料已保存')
  }

  function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void runAction(async () => {
      const next = await api.createOrder({
        ...orderForm,
        idempotencyKey: `ui-order-${orderForm.customerId}-${Date.now()}`,
      })
      setDrawer(null)
      return next
    }, orderForm.payWithBalance ? '订单已创建并核销余额' : '订单已创建，付款请求已生成')
  }

  function createTopup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void runAction(async () => {
      const next = await api.createPaymentRequest({
        customerId: topupForm.customerId,
        type: 'PREPAID_TOPUP',
        amount: topupForm.amount,
        method: '微信',
        note: `预付款充值 ${topupForm.amount}`,
      })
      setDrawer(null)
      return next
    }, '充值请求已生成')
  }

  return (
    <section className="page-stack">
      <article className="panel">
        <div className="panel-heading">
          <div>
            <h2>客户列表</h2>
            <p>客户主档独立维护，右侧直接处理建单、充值和收款确认。</p>
          </div>
          <button className="primary" type="button" onClick={() => setDrawer({ type: 'createCustomer' })}>
            <Plus size={16} /> 新增客户
          </button>
        </div>
        <div className="filters">
          <SearchBox value={keyword} onChange={setKeyword} placeholder="搜索客户/微信/电话/状态" />
        </div>
        <div className="list-table dense">
          {customers.map((customer) => (
            <CustomerListRow
              key={customer.id}
              customer={customer}
              state={state}
              busy={busy}
              onEdit={() => openEdit(customer)}
              onCreateOrder={() => openOrder(customer, false)}
              onCreateBalanceOrder={() => openOrder(customer, true)}
              onCreateTopup={() => openTopup(customer)}
              onConfirmPayment={(requestId) => void runAction(() => api.confirmPayment(requestId), '收款已确认并归账')}
              onDelete={() => void runAction(() => api.deleteCustomer(customer.id), '客户已删除')}
            />
          ))}
          {customers.length === 0 && <EmptyState text="没有匹配客户。" />}
        </div>
      </article>

      {drawer?.type === 'createCustomer' && (
        <Drawer title="新增客户" note="新咨询客户先进客户主档，保存后再建单或发起充值。" onClose={() => setDrawer(null)}>
          <CustomerForm value={createForm} onChange={setCreateForm} onSubmit={create} busy={busy} submitLabel="新增客户" />
        </Drawer>
      )}
      {drawer?.type === 'editCustomer' && (
        <Drawer title="编辑客户" note="删除为软删除，不影响历史订单、批次和收款记录。" onClose={() => setDrawer(null)}>
          <CustomerEditForm value={editForm} onChange={setEditForm} onSubmit={update} busy={busy} />
        </Drawer>
      )}
      {drawer?.type === 'createOrder' && (
        <Drawer title="创建订单" note="可在这里选择普通收款或直接使用客户余额核销。" onClose={() => setDrawer(null)}>
          <OrderCreateForm state={state} value={orderForm} onChange={setOrderForm} onSubmit={createOrder} busy={busy} />
        </Drawer>
      )}
      {drawer?.type === 'createTopup' && (
        <Drawer title="发起充值请求" note="充值是预收款，确认收款后才进入客户余额。" onClose={() => setDrawer(null)}>
          <TopupRequestForm state={state} value={topupForm} onChange={setTopupForm} onSubmit={createTopup} busy={busy} />
        </Drawer>
      )}
    </section>
  )
}

function OrdersPage({ state, busy, runAction, navigate }: PageProps & { navigate: (path: RouteKey) => void }) {
  const [status, setStatus] = useState<Order['status'] | 'ALL'>('ALL')
  const [keyword, setKeyword] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [form, setForm] = useState<OrderFormState>(() => blankOrder(state))

  const orders = state.orders.filter((order) => {
    const statusOk = status === 'ALL' || order.status === status
    const keywordOk = `${order.id}${order.customerName}${order.mealName}${order.status}`.includes(keyword.trim())
    return statusOk && keywordOk
  })

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void runAction(async () => {
      const next = await api.createOrder({
        ...form,
        idempotencyKey: `ui-deduct-${form.customerId}-${Date.now()}`,
      })
      setDrawerOpen(false)
      return next
    }, form.payWithBalance ? '订单已创建并核销余额' : '订单已创建，付款请求已生成')
  }

  return (
    <section className="page-stack">
      <article className="panel">
        <div className="panel-heading">
          <div>
            <h2>订单列表</h2>
            <p>订单动作只在状态允许时出现，右侧集中显示付款请求、付款状态和余额核销。</p>
          </div>
          <button
            className="primary"
            type="button"
            onClick={() => {
              setForm(blankOrder(state))
              setDrawerOpen(true)
            }}
          >
            <Plus size={16} /> 新增订单
          </button>
        </div>
        <div className="filters">
          <SearchBox value={keyword} onChange={setKeyword} placeholder="搜索订单/客户/餐品/状态" />
          <select value={status} onChange={(event) => setStatus(event.target.value as Order['status'] | 'ALL')}>
            <option value="ALL">全部状态</option>
            {Object.entries(orderStatusText).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="order-list">
          {orders.map((order) => (
            <OrderListRow key={order.id} order={order} state={state} busy={busy} runAction={runAction} navigate={navigate} />
          ))}
          {orders.length === 0 && <EmptyState text="没有匹配订单。" />}
        </div>
      </article>
      {drawerOpen && (
        <Drawer title="新增订单" note="商品改价不会反向影响历史订单，订单保存的是当时的售价和成本快照。" onClose={() => setDrawerOpen(false)}>
          <OrderCreateForm state={state} value={form} onChange={setForm} onSubmit={create} busy={busy} />
        </Drawer>
      )}
    </section>
  )
}

function PaymentsPage({ state, busy, runAction }: PageProps) {
  const [activeTab, setActiveTab] = useState<'requests' | 'ledger'>('requests')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [topupForm, setTopupForm] = useState<TopupFormState>(() => blankTopup(state.customers[0]?.id ?? ''))
  const requests = state.paymentRequests
  const topupPayments = state.payments.filter((payment) => payment.type === 'PREPAID_TOPUP')

  function createTopup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void runAction(async () => {
      const next = await api.createPaymentRequest({
        customerId: topupForm.customerId,
        type: 'PREPAID_TOPUP',
        amount: topupForm.amount,
        method: '微信',
        note: `预付款充值 ${topupForm.amount}`,
      })
      setDrawerOpen(false)
      return next
    }, '充值请求已生成')
  }

  return (
    <section className="page-stack">
      <article className="panel">
        <div className="panel-heading">
          <div>
            <h2>收款充值</h2>
            <p>付款请求和充值记录分开处理，发起充值请求从右上角进入。</p>
          </div>
          <button
            className="primary"
            type="button"
            onClick={() => {
              setTopupForm(blankTopup(state.customers[0]?.id ?? ''))
              setDrawerOpen(true)
            }}
          >
            <WalletCards size={16} /> 发起充值请求
          </button>
        </div>
        <div className="tabs" role="tablist" aria-label="收款充值视图">
          <button className={activeTab === 'requests' ? 'active' : ''} type="button" onClick={() => setActiveTab('requests')}>
            付款请求
          </button>
          <button className={activeTab === 'ledger' ? 'active' : ''} type="button" onClick={() => setActiveTab('ledger')}>
            充值记录/余额流水
          </button>
        </div>
        {activeTab === 'requests' && (
          <div className="request-list">
            {requests.map((request) => (
              <div className="request-row" key={request.id}>
                <div>
                  <strong>{request.customerName}</strong>
                  <span>
                    {requestTypeText[request.type]} · {currency(request.amount)} · {paymentRequestStatusText[request.status]}
                  </span>
                  {request.orderId && <small>关联订单 {request.orderId}</small>}
                </div>
                <StatusPill label={paymentRequestStatusText[request.status]} tone={paymentTone(request.status)} />
                <PaymentRequestActions
                  request={request}
                  busy={busy}
                  onConfirm={() => void runAction(() => api.confirmPayment(request.id), '收款已确认并归账')}
                  onCancel={() => void runAction(() => api.cancelPaymentRequest(request.id), '付款请求已取消')}
                  onDelete={() => void runAction(() => api.deletePaymentRequest(request.id), '付款请求已删除')}
                />
              </div>
            ))}
            {requests.length === 0 && <EmptyState text="暂无付款请求。" />}
          </div>
        )}
        {activeTab === 'ledger' && (
          <div className="ledger-layout">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>记录</th>
                    <th>客户</th>
                    <th>金额</th>
                    <th>状态</th>
                    <th>动作</th>
                  </tr>
                </thead>
                <tbody>
                  {topupPayments.map((payment) => (
                    <tr key={payment.id}>
                      <td>
                        <strong>{payment.id}</strong>
                        <small>{payment.createdAt.slice(0, 10)}</small>
                      </td>
                      <td>{state.customers.find((customer) => customer.id === payment.customerId)?.name ?? payment.customerId}</td>
                      <td>{currency(payment.amount)}</td>
                      <td>
                        <StatusPill label={payment.status === 'POSTED' ? '已入账' : '已作废'} tone={payment.status === 'POSTED' ? 'green' : 'red'} />
                      </td>
                      <td>
                        {payment.status === 'POSTED' && (
                          <button
                            className="secondary"
                            type="button"
                            onClick={() => {
                              const reason = window.prompt('请输入作废原因', '运营作废充值')
                              if (reason) void runAction(() => api.voidPayment(payment.id, reason), '充值已作废并冲正余额')
                            }}
                          >
                            作废/冲正
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ledger">
              {state.prepaidLedger.map((ledger) => (
                <div key={ledger.id}>
                  <span>
                    {ledger.note}
                    <small>{ledger.createdAt.slice(0, 10)} · 余额 {currency(ledger.balanceAfter)}</small>
                  </span>
                  <strong>{currency(ledger.amount)}</strong>
                </div>
              ))}
              {state.prepaidLedger.length === 0 && <EmptyState text="暂无余额流水。" />}
            </div>
          </div>
        )}
      </article>
      {drawerOpen && (
        <Drawer title="发起充值请求" note="充值是预收款，不直接算订单营业额。" onClose={() => setDrawerOpen(false)}>
          <TopupRequestForm state={state} value={topupForm} onChange={setTopupForm} onSubmit={createTopup} busy={busy} />
        </Drawer>
      )}
    </section>
  )
}

function ProductsPage({ state, busy, runAction }: PageProps) {
  const [drawer, setDrawer] = useState<ProductDrawer | null>(null)
  const [form, setForm] = useState<ProductFormState>(blankProduct(state.suppliers[0]?.id ?? ''))
  const [createForm, setCreateForm] = useState<ProductFormState>(blankProduct(state.suppliers[0]?.id ?? ''))

  function openEdit(product: Product) {
    setForm(productToForm(product, state.suppliers[0]?.id ?? ''))
    setDrawer({ type: 'edit', productId: product.id })
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void runAction(async () => {
      const next = await api.createProduct(createForm)
      setCreateForm(blankProduct(state.suppliers[0]?.id ?? ''))
      setDrawer(null)
      return next
    }, '商品/套餐已新增')
  }

  function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const selected = drawer?.type === 'edit' ? state.products.find((product) => product.id === drawer.productId) : null
    if (!selected) return
    void runAction(async () => {
      const next = await api.updateProduct(selected.id, form)
      setDrawer(null)
      return next
    }, '商品/套餐已保存')
  }

  return (
    <section className="page-stack">
      <article className="panel">
        <div className="panel-heading">
          <div>
            <h2>商品/套餐列表</h2>
            <p>售价、成本和默认供应商直接在列表里扫；编辑从每行右侧进入。</p>
          </div>
          <button
            className="primary"
            type="button"
            onClick={() => {
              setCreateForm(blankProduct(state.suppliers[0]?.id ?? ''))
              setDrawer({ type: 'create' })
            }}
          >
            <Plus size={16} /> 新增商品/套餐
          </button>
        </div>
        <div className="list-table dense">
          {state.products.map((product) => (
            <ProductListRow
              key={product.id}
              product={product}
              busy={busy}
              onEdit={() => openEdit(product)}
              onDisable={() => void runAction(() => api.deleteProduct(product.id), '商品/套餐已停用')}
            />
          ))}
          {state.products.length === 0 && <EmptyState text="还没有商品/套餐配置。" />}
        </div>
      </article>

      {drawer?.type === 'create' && (
        <Drawer title="新增商品/套餐" note="套餐第一版按商品分类管理，适合固定售价套餐。" onClose={() => setDrawer(null)}>
          <ProductForm value={createForm} suppliers={state.suppliers} onChange={setCreateForm} onSubmit={create} busy={busy} submitLabel="新增配置" />
        </Drawer>
      )}
      {drawer?.type === 'edit' && (
        <Drawer title="编辑商品/套餐" note="价格、成本和默认供应商只影响后续新订单。" onClose={() => setDrawer(null)}>
          <ProductForm value={form} suppliers={state.suppliers} onChange={setForm} onSubmit={update} busy={busy} submitLabel="保存配置">
            <button className="danger" type="button" disabled={busy} onClick={() => void runAction(() => api.deleteProduct(drawer.productId), '商品/套餐已停用')}>
              <Trash2 size={16} /> 停用
            </button>
          </ProductForm>
        </Drawer>
      )}
    </section>
  )
}

function SuppliersPage({ state, busy, runAction, setToast }: PageProps & { setToast: (message: string) => void }) {
  const [activeTab, setActiveTab] = useState<'suppliers' | 'batches'>('suppliers')
  const [batchDate, setBatchDate] = useState(state.dashboard.today)
  const [drawer, setDrawer] = useState<SupplierDrawer | null>(null)
  const [form, setForm] = useState<SupplierFormState>(blankSupplier())
  const [createForm, setCreateForm] = useState<SupplierFormState>(blankSupplier())

  const batches = state.supplierBatches.filter((batch) => !batchDate || batch.serviceDate === batchDate)

  async function copy(batch: SupplierBatch) {
    await navigator.clipboard.writeText(batch.copyText)
    setToast('下单文本已复制，可以粘贴给供应商')
  }

  function openSupplierEdit(supplier: Supplier) {
    setForm(supplierToForm(supplier))
    setDrawer({ type: 'edit', supplierId: supplier.id })
  }

  function createSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void runAction(async () => {
      const next = await api.createSupplier(createForm)
      setCreateForm(blankSupplier())
      setDrawer(null)
      return next
    }, '供应商已新增')
  }

  function updateSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const selected = drawer?.type === 'edit' ? state.suppliers.find((supplier) => supplier.id === drawer.supplierId) : null
    if (!selected) return
    void runAction(async () => {
      const next = await api.updateSupplier(selected.id, form)
      setDrawer(null)
      return next
    }, '供应商已保存')
  }

  return (
    <section className="page-stack">
      <article className="panel">
        <div className="panel-heading">
          <div>
            <h2>供应商</h2>
            <p>供应商列表和批次列表分开处理；下单批次从供应商行内生成。</p>
          </div>
          <button
            className="primary"
            type="button"
            onClick={() => {
              setCreateForm(blankSupplier())
              setDrawer({ type: 'create' })
            }}
          >
            <Plus size={16} /> 新增供应商
          </button>
        </div>
        <div className="tabs" role="tablist" aria-label="供应商视图">
          <button className={activeTab === 'suppliers' ? 'active' : ''} type="button" onClick={() => setActiveTab('suppliers')}>
            供应商列表
          </button>
          <button className={activeTab === 'batches' ? 'active' : ''} type="button" onClick={() => setActiveTab('batches')}>
            批次列表
          </button>
        </div>
        <div className="filters">
          <Field label="批次日期">
            <input type="date" value={batchDate} onChange={(event) => setBatchDate(event.target.value)} />
          </Field>
        </div>
        {activeTab === 'suppliers' && (
          <div className="list-table dense">
            {state.suppliers.map((supplier) => (
              <SupplierListRow
                key={supplier.id}
                supplier={supplier}
                state={state}
                batchDate={batchDate}
                busy={busy}
                onGenerate={() =>
                  void runAction(async () => {
                    const next = await api.generateBatch(supplier.id, batchDate)
                    setActiveTab('batches')
                    return next
                  }, '供应商下单批次已生成，已切到批次列表')
                }
                onEdit={() => openSupplierEdit(supplier)}
                onDisable={() => void runAction(() => api.deleteSupplier(supplier.id), '供应商已停用')}
              />
            ))}
            {state.suppliers.length === 0 && <EmptyState text="还没有供应商。" />}
          </div>
        )}
        {activeTab === 'batches' && (
          <div className="batch-list">
            {batches.map((batch) => (
              <div className="batch-card" key={batch.id}>
                <div className="batch-meta">
                  <span>
                    <strong>{batch.supplierName}</strong>
                    <small>
                      {batch.serviceDate} · {batch.itemCount} 单 · 成本 {currency(batch.totalCost)}
                    </small>
                  </span>
                  <StatusPill label={batch.status === 'CONFIRMED' ? '供应商已确认' : '等待供应商回复'} tone={batch.status === 'CONFIRMED' ? 'green' : 'amber'} />
                </div>
                <pre>{batch.copyText}</pre>
                <div className="batch-actions">
                  <button className="secondary" type="button" onClick={() => void copy(batch)}>
                    <ClipboardCopy size={16} /> 复制微信文本
                  </button>
                  {batch.status !== 'CONFIRMED' && (
                    <button className="primary" type="button" onClick={() => void runAction(() => api.confirmBatch(batch.id), '供应商已回复确认，批次订单可完成')}>
                      <Store size={16} /> 供应商已回复确认
                    </button>
                  )}
                </div>
              </div>
            ))}
            {batches.length === 0 && <EmptyState text="当前日期和供应商还没有批次。" />}
          </div>
        )}
      </article>
      {drawer?.type === 'create' && (
        <Drawer title="新增供应商" note="停用供应商会同步停用其商品，历史订单和批次仍保留名称快照。" onClose={() => setDrawer(null)}>
          <form className="form-grid" onSubmit={createSupplier}>
            <SupplierFields value={createForm} onChange={setCreateForm} includeStatus />
            <button className="primary" type="submit" disabled={busy}>
              <Plus size={16} /> 新增供应商
            </button>
          </form>
        </Drawer>
      )}
      {drawer?.type === 'edit' && (
        <Drawer title="编辑供应商" note="联系人、状态和备注会影响后续商品配置与批次处理。" onClose={() => setDrawer(null)}>
          <form className="form-grid" onSubmit={updateSupplier}>
            <SupplierFields value={form} onChange={setForm} includeStatus />
            <div className="form-actions">
              <button className="primary" type="submit" disabled={busy}>
                <Check size={16} /> 保存供应商
              </button>
              <button className="danger" type="button" disabled={busy} onClick={() => void runAction(() => api.deleteSupplier(drawer.supplierId), '供应商已停用')}>
                <Trash2 size={16} /> 停用
              </button>
            </div>
          </form>
        </Drawer>
      )}
    </section>
  )
}

function ReviewPage({ state, navigate }: { state: OperationState; navigate: (path: RouteKey) => void }) {
  return (
    <section className="page-stack">
      <section className="metric-strip">
        <Metric label="实收" value={currency(state.dashboard.cashIn)} tone="blue" />
        <Metric label="营业额" value={currency(state.dashboard.revenue)} tone="green" />
        <Metric label="预收款" value={currency(state.dashboard.prepaidTopup)} tone="amber" />
        <Metric label="退款" value={currency(state.dashboard.refund)} tone="red" />
        <Metric label="毛利" value={currency(state.dashboard.grossProfit)} tone="green" />
      </section>
      <article className="panel">
        <PanelTitle title="异常池" note="异常没有清完不建议收工，点击入口回到对应处理页面。" />
        <div className="issue-list">
          {state.issues.map((issue) => (
            <button
              key={issue.id}
              className={`issue ${issue.level.toLowerCase()}`}
              type="button"
              onClick={() => navigate(issue.type === 'BATCH_UNCONFIRMED' ? '/suppliers' : '/orders')}
            >
              <strong>{issue.title}</strong>
              <span>{issue.detail}</span>
            </button>
          ))}
          {state.issues.length === 0 && <EmptyState text="暂无异常，可以进入收工复盘。" />}
        </div>
      </article>
    </section>
  )
}

type PageProps = {
  state: OperationState
  busy: boolean
  runAction: (action: () => Promise<OperationState>, message: string) => void
}

type CustomerFormState = {
  name: string
  wechatName: string
  phone: string
  source: string
  address: string
  preference: string
}

type CustomerEditState = CustomerFormState & { status: CustomerStatus }
type OrderFormState = {
  customerId: string
  productId: string
  serviceDate: string
  note: string
  payWithBalance: boolean
}
type TopupFormState = {
  customerId: string
  amount: number
}
type CustomerDrawer =
  | { type: 'createCustomer' }
  | { type: 'editCustomer'; customerId: string }
  | { type: 'createOrder'; customerId: string }
  | { type: 'createTopup'; customerId: string }
type ProductDrawer = { type: 'create' } | { type: 'edit'; productId: string }
type SupplierDrawer = { type: 'create' } | { type: 'edit'; supplierId: string }
type ProductFormState = Omit<Product, 'id' | 'supplierName'>
type SupplierFormState = Omit<Supplier, 'id'>

function blankCustomer(): CustomerFormState {
  return { name: '', wechatName: '', phone: '', source: '小红书', address: '', preference: '' }
}

function customerToEdit(customer?: Customer): CustomerEditState {
  return {
    name: customer?.name ?? '',
    wechatName: customer?.wechatName ?? '',
    phone: customer?.phone ?? '',
    source: customer?.source ?? '小红书',
    address: customer?.address ?? '',
    preference: customer?.preference ?? '',
    status: customer?.status ?? 'NEW',
  }
}

function blankOrder(state: OperationState, customerId = state.customers[0]?.id ?? '', payWithBalance = false): OrderFormState {
  return {
    customerId,
    productId: state.products.find((product) => product.status === 'ACTIVE')?.id ?? '',
    serviceDate: state.dashboard.today,
    note: '',
    payWithBalance,
  }
}

function blankTopup(customerId: string): TopupFormState {
  return { customerId, amount: 300 }
}

function blankProduct(supplierId: string): ProductFormState {
  return {
    name: '',
    category: '单餐',
    description: '',
    amount: 38,
    supplierCost: 24,
    deliveryCost: 5,
    supplierId,
    status: 'ACTIVE',
  }
}

function productToForm(product: Product | undefined, supplierId: string): ProductFormState {
  return product ? { ...product } : blankProduct(supplierId)
}

function blankSupplier(): SupplierFormState {
  return { name: '', contact: '', status: 'ACTIVE', notes: '' }
}

function supplierToForm(supplier?: Supplier): SupplierFormState {
  return supplier ? { name: supplier.name, contact: supplier.contact, status: supplier.status, notes: supplier.notes } : blankSupplier()
}

function ProductListRow({
  product,
  busy,
  onEdit,
  onDisable,
}: {
  product: Product
  busy: boolean
  onEdit: () => void
  onDisable: () => void
}) {
  const margin = currency(product.amount - product.supplierCost - product.deliveryCost)

  return (
    <div className="list-row rich">
      <div className="row-main">
        <div className="entity-title">
          <strong>{product.name}</strong>
          <small>
            {product.category} · {product.description || '无说明'}
          </small>
        </div>
        <div className="pill-line">
          <StatusPill label={product.status === 'ACTIVE' ? '启用' : '停用'} tone={product.status === 'ACTIVE' ? 'green' : 'red'} />
          <StatusPill label={`售价 ${currency(product.amount)}`} tone="blue" />
          <StatusPill label={`毛利 ${margin}`} tone={product.amount - product.supplierCost - product.deliveryCost >= 0 ? 'green' : 'red'} />
        </div>
      </div>
      <div className="row-side">
        <div className="mini-window">
          <span>成本结构</span>
          <strong>
            供应商 {currency(product.supplierCost)} · 配送 {currency(product.deliveryCost)}
          </strong>
        </div>
        <div className="mini-window">
          <span>默认供应商</span>
          <strong>{product.supplierName}</strong>
        </div>
        <div className="row-actions text-actions">
          <button type="button" disabled={busy} onClick={onEdit}>
            编辑
          </button>
          <button type="button" disabled={busy || product.status === 'INACTIVE'} onClick={onDisable}>
            停用
          </button>
        </div>
      </div>
    </div>
  )
}

function SupplierListRow({
  supplier,
  state,
  batchDate,
  busy,
  onGenerate,
  onEdit,
  onDisable,
}: {
  supplier: Supplier
  state: OperationState
  batchDate: string
  busy: boolean
  onGenerate: () => void
  onEdit: () => void
  onDisable: () => void
}) {
  const activeProducts = state.products.filter((product) => product.supplierId === supplier.id && product.status === 'ACTIVE').length
  const waitingOrders = state.orders.filter(
    (order) => order.supplierId === supplier.id && order.serviceDate === batchDate && order.status === 'PAID_WAIT_SUPPLIER',
  )

  return (
    <div className="list-row rich">
      <div className="row-main">
        <div className="entity-title">
          <strong>{supplier.name}</strong>
          <small>{supplier.contact}</small>
        </div>
        <div className="pill-line">
          <StatusPill label={supplier.status === 'ACTIVE' ? '启用' : '停用'} tone={supplier.status === 'ACTIVE' ? 'green' : 'red'} />
          <StatusPill label={`在售商品 ${activeProducts}`} tone="blue" />
        </div>
        <small>{supplier.notes || '无备注'}</small>
      </div>
      <div className="row-side">
        <div className="mini-window">
          <span>生成下单批次</span>
          <strong>
            {batchDate} · 可生成 {waitingOrders.length} 单
          </strong>
          <button className="primary" type="button" disabled={busy || supplier.status !== 'ACTIVE' || waitingOrders.length === 0} onClick={onGenerate}>
            <Send size={15} /> 生成批次
          </button>
        </div>
        <div className="mini-window">
          <span>批次依据</span>
          <strong>只汇总已付款待下单订单</strong>
        </div>
        <div className="row-actions text-actions">
          <button type="button" disabled={busy} onClick={onEdit}>
            编辑
          </button>
          <button type="button" disabled={busy || supplier.status === 'INACTIVE'} onClick={onDisable}>
            停用
          </button>
        </div>
      </div>
    </div>
  )
}

function CustomerListRow({
  customer,
  state,
  busy,
  onEdit,
  onCreateOrder,
  onCreateBalanceOrder,
  onCreateTopup,
  onConfirmPayment,
  onDelete,
}: {
  customer: Customer
  state: OperationState
  busy: boolean
  onEdit: () => void
  onCreateOrder: () => void
  onCreateBalanceOrder: () => void
  onCreateTopup: () => void
  onConfirmPayment: (requestId: string) => void
  onDelete: () => void
}) {
  const summary = customerPaymentSummary(state.paymentRequests, customer.id)
  const pendingRequests = state.paymentRequests.filter((request) => request.customerId === customer.id && request.status === 'WAIT_PAY')
  const pendingRequest = pendingRequests[0]
  const pendingDetail = pendingRequest
    ? `${requestTypeText[pendingRequest.type]} ${currency(pendingRequest.amount)}${pendingRequests.length > 1 ? ` 等 ${pendingRequests.length} 笔` : ''}`
    : '无待确认'
  const orderCount = state.orders.filter((order) => order.customerId === customer.id && order.status !== 'CANCELED').length

  return (
    <div className="list-row rich">
      <div className="row-main">
        <div className="entity-title">
          <strong>{customer.name}</strong>
          <small>
            {customer.wechatName} · {customer.phone || '无电话'} · {customer.source}
          </small>
        </div>
        <div className="pill-line">
          <StatusPill label={customerStatusText[customer.status]} tone={customer.status === 'ACTIVE' ? 'green' : 'blue'} />
          <StatusPill label={`收款 ${summary.label}`} tone={summary.tone} />
          <StatusPill label={`余额 ${currency(customer.balance)}`} tone={customer.balance > 0 ? 'green' : 'blue'} />
        </div>
        <small>{customer.address}</small>
      </div>
      <div className="row-side">
        <div className="mini-window">
          <span>订单/预充值</span>
          <strong>{orderCount} 单</strong>
          <div className="mini-actions">
            <button className="secondary" type="button" onClick={onCreateOrder} disabled={busy}>
              <Plus size={15} /> 创建订单
            </button>
            <button className="secondary" type="button" onClick={onCreateBalanceOrder} disabled={busy || customer.balance <= 0}>
              <WalletCards size={15} /> 余额下单
            </button>
          </div>
        </div>
        <div className="mini-window">
          <span>充值/收款</span>
          <strong>{pendingDetail}</strong>
          <div className="mini-actions">
            <button className="secondary" type="button" onClick={onCreateTopup} disabled={busy}>
              <HandCoins size={15} /> 发起充值
            </button>
            {pendingRequest && (
              <button className="primary" type="button" onClick={() => onConfirmPayment(pendingRequest.id)} disabled={busy}>
                <Check size={15} /> 确认本笔
              </button>
            )}
          </div>
        </div>
        <div className="row-actions text-actions">
          <button type="button" onClick={onEdit} disabled={busy}>
            编辑
          </button>
          <button type="button" onClick={onDelete} disabled={busy}>
            删除
          </button>
        </div>
      </div>
    </div>
  )
}

function OrderListRow({
  order,
  state,
  busy,
  runAction,
  navigate,
}: {
  order: Order
  state: OperationState
  busy: boolean
  runAction: (action: () => Promise<OperationState>, message: string) => void
  navigate: (path: RouteKey) => void
}) {
  const customer = state.customers.find((item) => item.id === order.customerId)
  const request = latestOrderRequest(state.paymentRequests, order.id)
  const canPayWithBalance = order.paymentStatus === 'UNPAID' && order.status === 'WAIT_PAY' && (customer?.balance ?? 0) >= order.amount

  return (
    <div className="order-card">
      <div className="row-main">
        <div className="entity-title">
          <strong>{order.id}</strong>
          <small>
            {order.serviceDate} · {order.mealName} · {order.supplierName}
          </small>
        </div>
        <div className="pill-line">
          <OrderStatusPill status={order.status} />
          <StatusPill label={order.paymentStatus === 'PAID' ? '已付款' : order.paymentStatus === 'REFUNDED' ? '已退款' : '未付款'} tone={order.paymentStatus === 'PAID' ? 'green' : order.paymentStatus === 'REFUNDED' ? 'red' : 'amber'} />
          {request && <StatusPill label={`请求 ${paymentRequestStatusText[request.status]}`} tone={paymentTone(request.status)} />}
        </div>
        <div className="order-meta">
          <button className="link-button" type="button" onClick={() => navigate('/customers')}>
            {order.customerName}
          </button>
          <span>{currency(order.amount)}</span>
          <span className={order.grossProfit < 0 ? 'danger-text' : ''}>毛利 {currency(order.grossProfit)}</span>
        </div>
      </div>
      <div className="row-side">
        <div className="mini-window">
          <span>付款请求</span>
          <strong>{request ? `${requestTypeText[request.type]} · ${paymentRequestStatusText[request.status]}` : '未发起'}</strong>
          <div className="mini-actions">
            {!request && order.paymentStatus === 'UNPAID' && (
              <button
                className="secondary"
                type="button"
                disabled={busy}
                onClick={() =>
                  void runAction(
                    () =>
                      api.createPaymentRequest({
                        customerId: order.customerId,
                        orderId: order.id,
                        type: 'ORDER_PAYMENT',
                        amount: order.amount,
                        method: '微信',
                        note: `订单收款 ${order.id}`,
                      }),
                    '订单付款请求已发起',
                  )
                }
              >
                <CreditCard size={15} /> 发起付款
              </button>
            )}
            {request?.status === 'WAIT_PAY' && (
              <button className="primary" type="button" disabled={busy} onClick={() => void runAction(() => api.confirmPayment(request.id), '收款已确认并归账')}>
                <Check size={15} /> 确认收款
              </button>
            )}
          </div>
        </div>
        <div className="mini-window">
          <span>余额核销</span>
          <strong>{customer ? `余额 ${currency(customer.balance)}` : '客户不存在'}</strong>
          <button
            className="secondary"
            type="button"
            disabled={busy || !canPayWithBalance}
            onClick={() => void runAction(() => api.payOrderWithBalance(order.id), '订单已使用余额核销')}
          >
            <WalletCards size={15} /> {canPayWithBalance ? '余额核销' : '余额不足/不可核销'}
          </button>
        </div>
        <div className="row-actions text-actions">
          {order.status === 'WAIT_PAY' && (
            <button type="button" disabled={busy} onClick={() => void runAction(() => api.cancelOrder(order.id), '订单已取消')}>
              取消订单
            </button>
          )}
          {order.status === 'SUPPLIER_CONFIRMED' && (
            <button type="button" disabled={busy} onClick={() => void runAction(() => api.completeOrder(order.id), '订单已完成')}>
              完成订单
            </button>
          )}
          {order.paymentStatus === 'PAID' && order.status !== 'REFUNDED' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const amount = Number(window.prompt('请输入退款金额', String(order.amount)))
                if (Number.isFinite(amount) && amount > 0) void runAction(() => api.refundOrder(order.id, amount), '退款已登记')
              }}
            >
              登记退款
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function PaymentRequestActions({
  request,
  busy,
  onConfirm,
  onCancel,
  onDelete,
}: {
  request: PaymentRequest
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
  onDelete: () => void
}) {
  if (request.status !== 'WAIT_PAY') return null
  return (
    <div className="row-actions text-actions">
      <button type="button" disabled={busy} onClick={onConfirm}>
        确认
      </button>
      <button type="button" disabled={busy} onClick={onCancel}>
        取消
      </button>
      <button type="button" disabled={busy} onClick={onDelete}>
        删除
      </button>
    </div>
  )
}

function CustomerEditForm({
  value,
  onChange,
  onSubmit,
  busy,
}: {
  value: CustomerEditState
  onChange: (value: CustomerEditState) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  busy: boolean
}) {
  return (
    <form className="form-grid" onSubmit={onSubmit}>
      <CustomerFields value={value} onChange={(next) => onChange({ ...value, ...next })} />
      <Field label="客户状态">
        <select value={value.status} onChange={(event) => onChange({ ...value, status: event.target.value as CustomerStatus })}>
          {Object.entries(customerStatusText).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <button className="primary" type="submit" disabled={busy}>
        <Check size={16} /> 保存客户
      </button>
    </form>
  )
}

function OrderCreateForm({
  state,
  value,
  onChange,
  onSubmit,
  busy,
}: {
  state: OperationState
  value: OrderFormState
  onChange: (value: OrderFormState) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  busy: boolean
}) {
  const activeProducts = state.products.filter((product) => product.status === 'ACTIVE')
  const selectedProduct = activeProducts.find((product) => product.id === value.productId)

  return (
    <form className="form-grid" onSubmit={onSubmit}>
      <Field label="客户">
        <select value={value.customerId} onChange={(event) => onChange({ ...value, customerId: event.target.value })}>
          {state.customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name} · 余额 {currency(customer.balance)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="商品/套餐">
        <select value={value.productId} onChange={(event) => onChange({ ...value, productId: event.target.value })}>
          {activeProducts.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name} · {currency(product.amount)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="服务日期">
        <input type="date" value={value.serviceDate} onChange={(event) => onChange({ ...value, serviceDate: event.target.value })} />
      </Field>
      <Field label="订单备注">
        <input value={value.note} onChange={(event) => onChange({ ...value, note: event.target.value })} placeholder="例如：午餐 12 点前送达" />
      </Field>
      <label className="checkbox">
        <input type="checkbox" checked={value.payWithBalance} onChange={(event) => onChange({ ...value, payWithBalance: event.target.checked })} />
        使用余额核销
      </label>
      {selectedProduct && (
        <div className="summary-card">
          <strong>{selectedProduct.name}</strong>
          <span>
            售价 {currency(selectedProduct.amount)} · 供应商 {selectedProduct.supplierName}
          </span>
        </div>
      )}
      <button className="primary" type="submit" disabled={busy || !value.customerId || !value.productId}>
        <Plus size={16} /> 创建订单
      </button>
    </form>
  )
}

function TopupRequestForm({
  state,
  value,
  onChange,
  onSubmit,
  busy,
}: {
  state: OperationState
  value: TopupFormState
  onChange: (value: TopupFormState) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  busy: boolean
}) {
  return (
    <form className="form-grid" onSubmit={onSubmit}>
      <Field label="充值客户">
        <select value={value.customerId} onChange={(event) => onChange({ ...value, customerId: event.target.value })}>
          {state.customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name} · 余额 {currency(customer.balance)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="充值金额">
        <input type="number" min="1" value={value.amount} onChange={(event) => onChange({ ...value, amount: Number(event.target.value) })} />
      </Field>
      <button className="primary" type="submit" disabled={busy || !value.customerId || value.amount <= 0}>
        <WalletCards size={16} /> 生成充值请求
      </button>
    </form>
  )
}

function Drawer({ title, note, onClose, children }: { title: string; note?: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="drawer-backdrop" role="presentation">
      <aside className="drawer-panel" role="dialog" aria-modal="true" aria-label={title}>
        <div className="panel-heading">
          <div>
            <h2>{title}</h2>
            {note && <p>{note}</p>}
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="关闭">
            <X size={17} />
          </button>
        </div>
        {children}
      </aside>
    </div>
  )
}

function CustomerForm({
  value,
  onChange,
  onSubmit,
  busy,
  submitLabel,
}: {
  value: CustomerFormState
  onChange: (value: CustomerFormState) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  busy: boolean
  submitLabel: string
}) {
  return (
    <form className="form-grid" onSubmit={onSubmit}>
      <CustomerFields value={value} onChange={onChange} />
      <button className="primary" type="submit" disabled={busy}>
        <Plus size={16} /> {submitLabel}
      </button>
    </form>
  )
}

function CustomerFields({
  value,
  onChange,
}: {
  value: CustomerFormState
  onChange: (value: CustomerFormState) => void
}) {
  return (
    <>
      <Field label="客户姓名">
        <input required placeholder="例如：张琳" value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} />
      </Field>
      <Field label="微信昵称">
        <input required placeholder="例如：zl-fit" value={value.wechatName} onChange={(event) => onChange({ ...value, wechatName: event.target.value })} />
      </Field>
      <Field label="手机号">
        <input placeholder="例如：13800000000" value={value.phone} onChange={(event) => onChange({ ...value, phone: event.target.value })} />
      </Field>
      <Field label="客户来源">
        <input required placeholder="例如：小红书/微信/老客转介绍" value={value.source} onChange={(event) => onChange({ ...value, source: event.target.value })} />
      </Field>
      <Field label="配送地址">
        <input required placeholder="例如：云谷公寓 8 栋 601" value={value.address} onChange={(event) => onChange({ ...value, address: event.target.value })} />
      </Field>
      <Field label="忌口/偏好/备注">
        <textarea required placeholder="例如：不要香菜，午餐 12 点前送达" value={value.preference} onChange={(event) => onChange({ ...value, preference: event.target.value })} />
      </Field>
    </>
  )
}

function ProductForm({
  value,
  suppliers,
  onChange,
  onSubmit,
  busy,
  submitLabel,
  children,
}: {
  value: ProductFormState
  suppliers: Supplier[]
  onChange: (value: ProductFormState) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  busy: boolean
  submitLabel: string
  children?: ReactNode
}) {
  return (
    <form className="form-grid" onSubmit={onSubmit}>
      <Field label="商品/套餐名称">
        <input required placeholder="例如：减脂午餐A" value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} />
      </Field>
      <Field label="商品分类">
        <select value={value.category} onChange={(event) => onChange({ ...value, category: event.target.value })}>
          <option value="单餐">单餐</option>
          <option value="套餐">套餐</option>
          <option value="加购">加购</option>
        </select>
      </Field>
      <Field label="商品说明">
        <textarea placeholder="例如：低脂高蛋白，适合午餐" value={value.description} onChange={(event) => onChange({ ...value, description: event.target.value })} />
      </Field>
      <Field label="销售价格">
        <input type="number" min="0" value={value.amount} onChange={(event) => onChange({ ...value, amount: Number(event.target.value) })} />
      </Field>
      <Field label="供应商成本">
        <input type="number" min="0" value={value.supplierCost} onChange={(event) => onChange({ ...value, supplierCost: Number(event.target.value) })} />
      </Field>
      <Field label="配送成本">
        <input type="number" min="0" value={value.deliveryCost} onChange={(event) => onChange({ ...value, deliveryCost: Number(event.target.value) })} />
      </Field>
      <Field label="默认供应商">
        <select value={value.supplierId} onChange={(event) => onChange({ ...value, supplierId: event.target.value })}>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="启停状态">
        <select value={value.status} onChange={(event) => onChange({ ...value, status: event.target.value as ProductStatus })}>
          <option value="ACTIVE">启用</option>
          <option value="INACTIVE">停用</option>
        </select>
      </Field>
      <div className="form-actions">
        <button className="primary" type="submit" disabled={busy}>
          <Check size={16} /> {submitLabel}
        </button>
        {children}
      </div>
    </form>
  )
}

function SupplierFields({
  value,
  onChange,
  includeStatus,
}: {
  value: SupplierFormState
  onChange: (value: SupplierFormState) => void
  includeStatus?: boolean
}) {
  return (
    <>
      <Field label="供应商名称">
        <input required placeholder="例如：轻食小厨房" value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} />
      </Field>
      <Field label="联系人/电话">
        <input required placeholder="例如：李姐 13800000000" value={value.contact} onChange={(event) => onChange({ ...value, contact: event.target.value })} />
      </Field>
      <Field label="供应商备注">
        <textarea placeholder="例如：午餐最晚 10:30 前下单" value={value.notes} onChange={(event) => onChange({ ...value, notes: event.target.value })} />
      </Field>
      {includeStatus && (
        <Field label="启停状态">
          <select value={value.status} onChange={(event) => onChange({ ...value, status: event.target.value as SupplierStatus })}>
            <option value="ACTIVE">启用</option>
            <option value="INACTIVE">停用</option>
          </select>
        </Field>
      )}
    </>
  )
}

function PanelTitle({ title, note }: { title: string; note?: string }) {
  return (
    <div className="panel-heading">
      <div>
        <h2>{title}</h2>
        {note && <p>{note}</p>}
      </div>
    </div>
  )
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="search">
      <Search size={16} />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
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

function OrderStatusPill({ status }: { status: Order['status'] }) {
  return <span className={`status ${status.toLowerCase()}`}>{orderStatusText[status]}</span>
}

function StatusPill({ label, tone }: { label: string; tone: 'blue' | 'green' | 'amber' | 'red' }) {
  return <span className={`status tone-${tone}`}>{label}</span>
}

function EmptyState({ text }: { text: string }) {
  return <p className="empty">{text}</p>
}

export default App
