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

function currency(value: number) {
  return `¥${value.toFixed(2)}`
}

function getRoute(): RouteKey {
  const path = window.location.pathname as RouteKey
  return routes.some((route) => route.path === path) ? path : '/dashboard'
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
  const [selectedId, setSelectedId] = useState(state.customers[0]?.id ?? '')
  const selected = state.customers.find((customer) => customer.id === selectedId) ?? state.customers[0]
  const [createForm, setCreateForm] = useState<CustomerFormState>(blankCustomer())
  const [editForm, setEditForm] = useState<CustomerEditState>(customerToEdit(selected))

  const customers = state.customers.filter((customer) => `${customer.name}${customer.wechatName}${customer.phone}${customer.status}`.includes(keyword.trim()))

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void runAction(async () => {
      const next = await api.createCustomer(createForm)
      setCreateForm(blankCustomer())
      return next
    }, '客户已新增')
  }

  function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    void runAction(() => api.updateCustomer(selected.id, editForm), '客户资料已保存')
  }

  return (
    <section className="content-grid">
      <article className="panel">
        <PanelTitle title="客户列表" note="客户主档独立维护，订单和收款会保留客户姓名快照。" />
        <SearchBox value={keyword} onChange={setKeyword} placeholder="搜索客户/微信/电话/状态" />
        <div className="list-table">
          {customers.map((customer) => (
            <button
              key={customer.id}
              className={selected?.id === customer.id ? 'list-row active' : 'list-row'}
              type="button"
              onClick={() => {
                setSelectedId(customer.id)
                setEditForm(customerToEdit(customer))
              }}
            >
              <span>
                <strong>{customer.name}</strong>
                <small>{customer.wechatName} · {customer.phone || '无电话'}</small>
              </span>
              <StatusPill label={customerStatusText[customer.status]} tone={customer.status === 'ACTIVE' ? 'green' : 'blue'} />
            </button>
          ))}
        </div>
      </article>

      <article className="panel">
        <PanelTitle title="新增客户" note="新咨询客户先进客户主档，再从订单页建单或从收款页发起充值。" />
        <CustomerForm value={createForm} onChange={setCreateForm} onSubmit={create} busy={busy} submitLabel="新增客户" />
      </article>

      <article className="panel wide">
        <PanelTitle title="客户详情与编辑" note="删除为软删除，不影响历史订单、批次和收款记录。" />
        {selected ? (
          <form className="form-grid" onSubmit={update}>
            <CustomerFields value={editForm} onChange={(next) => setEditForm({ ...editForm, ...next })} />
            <select value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value as CustomerStatus })}>
              {Object.entries(customerStatusText).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <div className="summary-card">
              <strong>当前余额 {currency(selected.balance)}</strong>
              <span>{selected.address}</span>
              <span>{selected.preference}</span>
            </div>
            <div className="form-actions">
              <button className="primary" type="submit" disabled={busy}>
                <Check size={16} /> 保存客户
              </button>
              <button className="danger" type="button" disabled={busy} onClick={() => void runAction(() => api.deleteCustomer(selected.id), '客户已删除')}>
                <Trash2 size={16} /> 删除客户
              </button>
            </div>
          </form>
        ) : (
          <EmptyState text="还没有客户。" />
        )}
      </article>
    </section>
  )
}

function OrdersPage({ state, busy, runAction, navigate }: PageProps & { navigate: (path: RouteKey) => void }) {
  const [status, setStatus] = useState<Order['status'] | 'ALL'>('ALL')
  const [keyword, setKeyword] = useState('')
  const [form, setForm] = useState({
    customerId: state.customers[0]?.id ?? '',
    productId: state.products.find((product) => product.status === 'ACTIVE')?.id ?? '',
    serviceDate: state.dashboard.today,
    note: '',
    payWithBalance: false,
  })

  const orders = state.orders.filter((order) => {
    const statusOk = status === 'ALL' || order.status === status
    const keywordOk = `${order.id}${order.customerName}${order.mealName}${order.status}`.includes(keyword.trim())
    return statusOk && keywordOk
  })

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void runAction(
      () =>
        api.createOrder({
          ...form,
          idempotencyKey: `ui-deduct-${form.customerId}-${Date.now()}`,
        }),
      form.payWithBalance ? '订单已创建并核销余额' : '订单已创建，付款请求已生成',
    )
  }

  return (
    <section className="page-stack">
      <article className="panel">
        <PanelTitle title="新建订单" note="商品改价不会反向影响历史订单，订单保存的是当时的售价和成本快照。" />
        <form className="inline-grid" onSubmit={create}>
          <select value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })}>
            {state.customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name} · 余额 {currency(customer.balance)}
              </option>
            ))}
          </select>
          <select value={form.productId} onChange={(event) => setForm({ ...form, productId: event.target.value })}>
            {state.products
              .filter((product) => product.status === 'ACTIVE')
              .map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} · {currency(product.amount)}
                </option>
              ))}
          </select>
          <input type="date" value={form.serviceDate} onChange={(event) => setForm({ ...form, serviceDate: event.target.value })} />
          <input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="订单备注" />
          <label className="checkbox">
            <input type="checkbox" checked={form.payWithBalance} onChange={(event) => setForm({ ...form, payWithBalance: event.target.checked })} />
            使用余额核销
          </label>
          <button className="primary" type="submit" disabled={busy || !form.customerId || !form.productId}>
            <Plus size={16} /> 创建订单
          </button>
        </form>
      </article>

      <article className="panel">
        <PanelTitle title="订单列表" note="订单动作只在状态允许时出现，供应商确认后的订单才可以完成。" />
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
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <strong>{order.id}</strong>
                    <small>{order.serviceDate}</small>
                  </td>
                  <td>
                    <button className="link-button" type="button" onClick={() => navigate('/customers')}>
                      {order.customerName}
                    </button>
                  </td>
                  <td>{order.mealName}</td>
                  <td>{currency(order.amount)}</td>
                  <td className={order.grossProfit < 0 ? 'danger-text' : ''}>{currency(order.grossProfit)}</td>
                  <td>
                    <OrderStatusPill status={order.status} />
                  </td>
                  <td>
                    <div className="row-actions">
                      {order.status === 'WAIT_PAY' && (
                        <button type="button" title="取消订单" onClick={() => void runAction(() => api.cancelOrder(order.id), '订单已取消')}>
                          <X size={15} />
                        </button>
                      )}
                      {order.status === 'SUPPLIER_CONFIRMED' && (
                        <button type="button" title="完成订单" onClick={() => void runAction(() => api.completeOrder(order.id), '订单已完成')}>
                          <Check size={15} />
                        </button>
                      )}
                      {order.paymentStatus === 'PAID' && order.status !== 'REFUNDED' && (
                        <button
                          type="button"
                          title="登记退款"
                          onClick={() => {
                            const amount = Number(window.prompt('请输入退款金额', String(order.amount)))
                            if (Number.isFinite(amount) && amount > 0) void runAction(() => api.refundOrder(order.id, amount), '退款已登记')
                          }}
                        >
                          <CreditCard size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  )
}

function PaymentsPage({ state, busy, runAction }: PageProps) {
  const [customerId, setCustomerId] = useState(state.customers[0]?.id ?? '')
  const [amount, setAmount] = useState(300)
  const requests = state.paymentRequests
  const topupPayments = state.payments.filter((payment) => payment.type === 'PREPAID_TOPUP')

  function createTopup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void runAction(
      () =>
        api.createPaymentRequest({
          customerId,
          type: 'PREPAID_TOPUP',
          amount,
          method: '微信',
          note: `预付款充值 ${amount}`,
        }),
      '充值请求已生成',
    )
  }

  return (
    <section className="content-grid two">
      <article className="panel">
        <PanelTitle title="发起充值请求" note="充值是预收款，不直接算订单营业额。" />
        <form className="form-grid" onSubmit={createTopup}>
          <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
            {state.customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name} · 余额 {currency(customer.balance)}
              </option>
            ))}
          </select>
          <input type="number" min="1" value={amount} onChange={(event) => setAmount(Number(event.target.value))} />
          <button className="primary" type="submit" disabled={busy || !customerId}>
            <WalletCards size={16} /> 生成充值请求
          </button>
        </form>
      </article>

      <article className="panel">
        <PanelTitle title="付款请求" note="待付款请求可以确认、取消或删除；取消后不能再确认。" />
        <div className="request-list">
          {requests.map((request) => (
            <div className="request-row" key={request.id}>
              <div>
                <strong>{request.customerName}</strong>
                <span>
                  {requestTypeText[request.type]} · {currency(request.amount)} · {request.status === 'WAIT_PAY' ? '待确认' : request.status === 'PAID' ? '已确认' : '已取消'}
                </span>
              </div>
              {request.status === 'WAIT_PAY' && (
                <div className="row-actions text-actions">
                  <button type="button" onClick={() => void runAction(() => api.confirmPayment(request.id), '收款已确认并归账')}>
                    确认
                  </button>
                  <button type="button" onClick={() => void runAction(() => api.cancelPaymentRequest(request.id), '付款请求已取消')}>
                    取消
                  </button>
                  <button type="button" onClick={() => void runAction(() => api.deletePaymentRequest(request.id), '付款请求已删除')}>
                    删除
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </article>

      <article className="panel wide">
        <PanelTitle title="充值记录与余额流水" note="已确认充值不能硬删除，只能作废/冲正并回滚余额。" />
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
          {state.prepaidLedger.slice(0, 8).map((ledger) => (
            <div key={ledger.id}>
              <span>{ledger.note}</span>
              <strong>{currency(ledger.amount)}</strong>
            </div>
          ))}
        </div>
      </article>
    </section>
  )
}

function ProductsPage({ state, busy, runAction }: PageProps) {
  const [selectedId, setSelectedId] = useState(state.products[0]?.id ?? '')
  const selected = state.products.find((product) => product.id === selectedId) ?? state.products[0]
  const [form, setForm] = useState<ProductFormState>(productToForm(selected, state.suppliers[0]?.id ?? ''))
  const [createForm, setCreateForm] = useState<ProductFormState>(blankProduct(state.suppliers[0]?.id ?? ''))

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void runAction(async () => {
      const next = await api.createProduct(createForm)
      setCreateForm(blankProduct(state.suppliers[0]?.id ?? ''))
      return next
    }, '商品/套餐已新增')
  }

  function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    void runAction(() => api.updateProduct(selected.id, form), '商品/套餐已保存')
  }

  return (
    <section className="content-grid">
      <article className="panel">
        <PanelTitle title="商品/套餐列表" note="停售不会影响历史订单，只会阻止新订单继续使用。" />
        <div className="list-table">
          {state.products.map((product) => (
            <button
              key={product.id}
              className={selected?.id === product.id ? 'list-row active' : 'list-row'}
              type="button"
              onClick={() => {
                setSelectedId(product.id)
                setForm(productToForm(product, state.suppliers[0]?.id ?? ''))
              }}
            >
              <span>
                <strong>{product.name}</strong>
                <small>
                  {product.category} · {currency(product.amount)} · 毛利 {currency(product.amount - product.supplierCost - product.deliveryCost)}
                </small>
              </span>
              <StatusPill label={product.status === 'ACTIVE' ? '启用' : '停用'} tone={product.status === 'ACTIVE' ? 'green' : 'red'} />
            </button>
          ))}
        </div>
      </article>

      <article className="panel">
        <PanelTitle title="新增商品/套餐" note="套餐第一版按商品分类管理，适合固定售价套餐。" />
        <ProductForm value={createForm} suppliers={state.suppliers} onChange={setCreateForm} onSubmit={create} busy={busy} submitLabel="新增配置" />
      </article>

      <article className="panel wide">
        <PanelTitle title="编辑配置" note="价格、成本和默认供应商只影响后续新订单。" />
        {selected ? (
          <ProductForm value={form} suppliers={state.suppliers} onChange={setForm} onSubmit={update} busy={busy} submitLabel="保存配置">
            <button className="danger" type="button" disabled={busy} onClick={() => void runAction(() => api.deleteProduct(selected.id), '商品/套餐已停用')}>
              <Trash2 size={16} /> 停用
            </button>
          </ProductForm>
        ) : (
          <EmptyState text="还没有商品配置。" />
        )}
      </article>
    </section>
  )
}

function SuppliersPage({ state, busy, runAction, setToast }: PageProps & { setToast: (message: string) => void }) {
  const [supplierId, setSupplierId] = useState(state.suppliers.find((supplier) => supplier.status === 'ACTIVE')?.id ?? state.suppliers[0]?.id ?? '')
  const [serviceDate, setServiceDate] = useState(state.dashboard.today)
  const [selectedSupplierId, setSelectedSupplierId] = useState(state.suppliers[0]?.id ?? '')
  const selected = state.suppliers.find((supplier) => supplier.id === selectedSupplierId) ?? state.suppliers[0]
  const [form, setForm] = useState<SupplierFormState>(supplierToForm(selected))
  const [createForm, setCreateForm] = useState<SupplierFormState>(blankSupplier())

  const waitingOrders = state.orders.filter((order) => order.supplierId === supplierId && order.serviceDate === serviceDate && order.status === 'PAID_WAIT_SUPPLIER')
  const batches = state.supplierBatches.filter((batch) => (!supplierId || batch.supplierId === supplierId) && (!serviceDate || batch.serviceDate === serviceDate))

  async function copy(batch: SupplierBatch) {
    await navigator.clipboard.writeText(batch.copyText)
    setToast('下单文本已复制，可以粘贴给供应商')
  }

  function createSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void runAction(async () => {
      const next = await api.createSupplier(createForm)
      setCreateForm(blankSupplier())
      return next
    }, '供应商已新增')
  }

  function updateSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    void runAction(() => api.updateSupplier(selected.id, form), '供应商已保存')
  }

  return (
    <section className="page-stack">
      <article className="panel">
        <PanelTitle title="供应商确认流程" note="按步骤处理：已付款订单 → 生成批次 → 复制并发送文本 → 供应商回复确认 → 订单可完成。" />
        <div className="steps">
          <span>1 已付款待下单</span>
          <span>2 生成批次</span>
          <span>3 发送微信文本</span>
          <span>4 供应商已回复确认</span>
        </div>
      </article>

      <section className="content-grid two">
        <article className="panel">
          <PanelTitle title="生成下单批次" note="只会汇总同一日期、同一供应商的已付款待下单订单。" />
          <div className="inline-grid">
            <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
              {state.suppliers
                .filter((supplier) => supplier.status === 'ACTIVE')
                .map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
            </select>
            <input type="date" value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} />
            <div className="summary-card">
              <strong>可生成 {waitingOrders.length} 单</strong>
              <span>这些订单已付款，但还没有发给供应商。</span>
            </div>
            <button className="primary" type="button" disabled={busy || waitingOrders.length === 0} onClick={() => void runAction(() => api.generateBatch(supplierId, serviceDate), '供应商下单批次已生成')}>
              <Send size={16} /> 生成批次
            </button>
          </div>
        </article>

        <article className="panel">
          <PanelTitle title="供应商管理" note="停用供应商会同步停用其商品，历史订单和批次仍保留名称快照。" />
          <form className="form-grid" onSubmit={createSupplier}>
            <SupplierFields value={createForm} onChange={setCreateForm} />
            <button className="primary" type="submit" disabled={busy}>
              <Plus size={16} /> 新增供应商
            </button>
          </form>
        </article>
      </section>

      <section className="content-grid two">
        <article className="panel">
          <PanelTitle title="供应商列表" note="点击供应商后可编辑联系方式和状态。" />
          <div className="list-table">
            {state.suppliers.map((supplier) => (
              <button
                key={supplier.id}
                className={selected?.id === supplier.id ? 'list-row active' : 'list-row'}
                type="button"
                onClick={() => {
                  setSelectedSupplierId(supplier.id)
                  setForm(supplierToForm(supplier))
                }}
              >
                <span>
                  <strong>{supplier.name}</strong>
                  <small>{supplier.contact}</small>
                </span>
                <StatusPill label={supplier.status === 'ACTIVE' ? '启用' : '停用'} tone={supplier.status === 'ACTIVE' ? 'green' : 'red'} />
              </button>
            ))}
          </div>
          {selected && (
            <form className="form-grid stacked" onSubmit={updateSupplier}>
              <SupplierFields value={form} onChange={setForm} includeStatus />
              <div className="form-actions">
                <button className="primary" type="submit" disabled={busy}>
                  <Check size={16} /> 保存供应商
                </button>
                <button className="danger" type="button" disabled={busy} onClick={() => void runAction(() => api.deleteSupplier(selected.id), '供应商已停用')}>
                  <Trash2 size={16} /> 停用
                </button>
              </div>
            </form>
          )}
        </article>

        <article className="panel">
          <PanelTitle title="批次列表与确认" note="不要只看最新批次；按日期和供应商确认每个批次。" />
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
        </article>
      </section>
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
      <input required placeholder="客户姓名" value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} />
      <input required placeholder="微信昵称" value={value.wechatName} onChange={(event) => onChange({ ...value, wechatName: event.target.value })} />
      <input placeholder="手机号" value={value.phone} onChange={(event) => onChange({ ...value, phone: event.target.value })} />
      <input required placeholder="来源" value={value.source} onChange={(event) => onChange({ ...value, source: event.target.value })} />
      <input required placeholder="配送地址" value={value.address} onChange={(event) => onChange({ ...value, address: event.target.value })} />
      <textarea required placeholder="忌口/偏好/备注" value={value.preference} onChange={(event) => onChange({ ...value, preference: event.target.value })} />
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
      <input required placeholder="商品/套餐名称" value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} />
      <select value={value.category} onChange={(event) => onChange({ ...value, category: event.target.value })}>
        <option value="单餐">单餐</option>
        <option value="套餐">套餐</option>
        <option value="加购">加购</option>
      </select>
      <textarea placeholder="说明" value={value.description} onChange={(event) => onChange({ ...value, description: event.target.value })} />
      <input type="number" min="0" value={value.amount} onChange={(event) => onChange({ ...value, amount: Number(event.target.value) })} placeholder="售价" />
      <input type="number" min="0" value={value.supplierCost} onChange={(event) => onChange({ ...value, supplierCost: Number(event.target.value) })} placeholder="供应商成本" />
      <input type="number" min="0" value={value.deliveryCost} onChange={(event) => onChange({ ...value, deliveryCost: Number(event.target.value) })} placeholder="配送成本" />
      <select value={value.supplierId} onChange={(event) => onChange({ ...value, supplierId: event.target.value })}>
        {suppliers.map((supplier) => (
          <option key={supplier.id} value={supplier.id}>
            {supplier.name}
          </option>
        ))}
      </select>
      <select value={value.status} onChange={(event) => onChange({ ...value, status: event.target.value as ProductStatus })}>
        <option value="ACTIVE">启用</option>
        <option value="INACTIVE">停用</option>
      </select>
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
      <input required placeholder="供应商名称" value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} />
      <input required placeholder="联系人/电话" value={value.contact} onChange={(event) => onChange({ ...value, contact: event.target.value })} />
      <textarea placeholder="备注" value={value.notes} onChange={(event) => onChange({ ...value, notes: event.target.value })} />
      {includeStatus && (
        <select value={value.status} onChange={(event) => onChange({ ...value, status: event.target.value as SupplierStatus })}>
          <option value="ACTIVE">启用</option>
          <option value="INACTIVE">停用</option>
        </select>
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
