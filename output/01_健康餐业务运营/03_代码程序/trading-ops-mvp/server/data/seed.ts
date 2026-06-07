import type { Customer, Product, Supplier } from '../types.ts'

export const today = '2026-06-07'

export const suppliers: Supplier[] = [
  { id: 'S-A', name: 'A小饭桌', contact: '王姐 13800000001' },
  { id: 'S-B', name: '轻食工坊', contact: '李师傅 13800000002' },
]

export const products: Product[] = [
  {
    id: 'P-FAT-A',
    name: '减脂午餐A',
    amount: 38,
    supplierCost: 24,
    deliveryCost: 5,
    supplierId: 'S-A',
    supplierName: 'A小饭桌',
  },
  {
    id: 'P-FAT-B',
    name: '控糖晚餐B',
    amount: 42,
    supplierCost: 26,
    deliveryCost: 6,
    supplierId: 'S-B',
    supplierName: '轻食工坊',
  },
  {
    id: 'P-PREMIUM',
    name: '高蛋白全天套餐',
    amount: 68,
    supplierCost: 42,
    deliveryCost: 8,
    supplierId: 'S-A',
    supplierName: 'A小饭桌',
  },
]

export const customers: Customer[] = [
  {
    id: 'C-001',
    name: '张琳',
    wechatName: 'Lynn减脂',
    phone: '13800001111',
    source: '小红书',
    address: '滨江花园 3 栋 1202',
    preference: '少油，不要香菜，午餐送 12:00 前',
    status: 'ACTIVE',
    balance: 262,
    createdAt: '2026-06-06T09:20:00.000Z',
  },
  {
    id: 'C-002',
    name: '陈诺',
    wechatName: 'nono',
    phone: '13800002222',
    source: '微信',
    address: '绿地中心 A 座 18F',
    preference: '控糖，晚餐不加主食',
    status: 'QUOTED',
    balance: 0,
    createdAt: '2026-06-06T10:10:00.000Z',
  },
  {
    id: 'C-003',
    name: '李可',
    wechatName: 'Kiki',
    phone: '13800003333',
    source: '老客推荐',
    address: '星河湾 6 栋 903',
    preference: '低盐，配送前电话',
    status: 'WAIT_PAY',
    balance: 0,
    createdAt: '2026-06-06T14:32:00.000Z',
  },
]
