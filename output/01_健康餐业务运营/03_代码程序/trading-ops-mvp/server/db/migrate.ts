import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import mysql from 'mysql2/promise'
import { customers, products, today } from '../data/seed.ts'

dotenv.config({ path: '.env.local' })
dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required. Use .env.local or set it in the shell.')
  return new URL(url)
}

async function ensureDatabase(url: URL) {
  const database = url.pathname.replace('/', '')
  if (!database) throw new Error('DATABASE_URL must include a database name.')
  const baseConnection = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || '3306'),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    multipleStatements: true,
    connectTimeout: 60000,
  })
  await baseConnection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  await baseConnection.end()
  return database
}

async function connect(url: URL) {
  return mysql.createConnection({
    uri: url.toString(),
    multipleStatements: true,
    connectTimeout: 60000,
    ssl: process.env.MYSQL_SSL === 'true' ? {} : undefined,
  })
}

async function seed(connection: mysql.Connection) {
  for (const customer of customers) {
    await connection.execute(
      `INSERT INTO customers
        (id, name, wechat_name, phone, source, address, preference, status, balance, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at)`,
      [
        customer.id,
        customer.name,
        customer.wechatName,
        customer.phone,
        customer.source,
        customer.address,
        customer.preference,
        customer.status,
        customer.balance,
        new Date(customer.createdAt),
        new Date(),
      ],
    )
  }

  const zhang = customers[0]
  const li = customers[2]
  const productA = products[0]
  const productB = products[1]
  await connection.execute(
    `INSERT IGNORE INTO orders
      (id, customer_id, customer_name, service_date, meal_name, supplier_id, supplier_name, amount, supplier_cost, delivery_cost, gross_profit, status, payment_status, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'O-001',
      zhang.id,
      zhang.name,
      today,
      productA.name,
      productA.supplierId,
      productA.supplierName,
      productA.amount,
      productA.supplierCost,
      productA.deliveryCost,
      productA.amount - productA.supplierCost - productA.deliveryCost,
      'PAID_WAIT_SUPPLIER',
      'PAID',
      zhang.preference,
      new Date('2026-06-07T01:20:00.000Z'),
      new Date(),
    ],
  )
  await connection.execute(
    `INSERT IGNORE INTO orders
      (id, customer_id, customer_name, service_date, meal_name, supplier_id, supplier_name, amount, supplier_cost, delivery_cost, gross_profit, status, payment_status, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'O-002',
      li.id,
      li.name,
      today,
      productB.name,
      productB.supplierId,
      productB.supplierName,
      productB.amount,
      productB.supplierCost,
      productB.deliveryCost,
      productB.amount - productB.supplierCost - productB.deliveryCost,
      'WAIT_PAY',
      'UNPAID',
      li.preference,
      new Date('2026-06-07T02:00:00.000Z'),
      new Date(),
    ],
  )
  await connection.execute(
    `INSERT IGNORE INTO payment_requests
      (id, customer_id, customer_name, order_id, type, amount, status, method, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['PR-001', li.id, li.name, 'O-002', 'ORDER_PAYMENT', productB.amount, 'WAIT_PAY', '微信', '订单 O-002 应收', new Date()],
  )
  await connection.execute(
    `INSERT IGNORE INTO prepaid_ledger
      (id, customer_id, order_id, type, amount, balance_after, note, idempotency_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['LEDGER-001', zhang.id, 'O-001', 'DEDUCT', -38, 262, '余额核销订单 O-001', 'seed-ledger-001', new Date()],
  )
}

const url = getDatabaseUrl()
const database = await ensureDatabase(url)
const connection = await connect(url)
const schema = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8')
await connection.query(schema)
if (process.argv.includes('--seed')) await seed(connection)
await connection.end()

console.log(`MySQL ready: ${url.hostname}:${url.port || '3306'}/${database}`)
