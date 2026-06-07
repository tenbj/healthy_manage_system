# 健康餐交易运营中台 MVP

这是按 `02_课题研究/03_健康餐交易运营中台开发实施计划书.html` 落地的可运行 MVP。

## 已实现范围

- 今日运营台：订单数、待付款、待下单、供应商未确认、毛利。
- 独立页面：`/dashboard`、`/customers`、`/orders`、`/payments`、`/products`、`/suppliers`、`/review`。
- 客户：客户列表、新增、编辑、删除、地址/忌口/余额。
- 订单：独立建单、状态筛选、余额核销、取消、完成、退款。
- 收款：付款请求、人工确认收款、取消/删除待付款请求、幂等确认。
- 预付款：充值请求、充值入账、余额核销流水、已确认充值作废/冲正。
- 商品/套餐：管理商品名称、分类、售价、供应商成本、配送成本、默认供应商和启停状态。
- 供应商：供应商新增/编辑/停用、按日期和供应商生成批次、复制微信下单文本、显式标记“供应商已回复确认”。
- 复盘：营业额、实收、预收款、核销、成本、毛利、异常池。
- 数据层：内存演示模式 + MySQL 迁移与运行模式。

## 本地运行

```powershell
npm install
npm run dev
```

前端：http://127.0.0.1:5173
API：http://127.0.0.1:4310/api/health

当前 `.env.local` 使用 `DATA_STORE=mysql`，默认连接用户提供的阿里云 MySQL。需要临时演示内存模式时，可改为 `DATA_STORE=memory` 后重启服务。

如本机端口已被占用，可改用：

```powershell
$env:PORT='4410'
$env:VITE_PORT='5273'
$env:VITE_API_PROXY='http://127.0.0.1:4410'
$env:VITE_API_BASE='http://127.0.0.1:4410/api'
npm run dev
```

## 使用 MySQL

不要把真实密码写入代码。将运行时连接串放入 `.env.local`：

```text
PORT=4310
DATA_STORE=mysql
DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/healthy_meal_ops_mvp
MYSQL_SSL=false
```

然后执行：

```powershell
npm run db:seed
npm run dev
```

`db:seed` 会创建数据库、核心表和演示数据。

## 验收命令

```powershell
npm run build
npm test
npm run lint
npm audit --audit-level=moderate
```

## 维护文档

- [服务启停维护](docs/01_服务启停维护.md)
- [数据库口径解读](docs/02_数据库口径解读.md)

## 安全注意

- `.env`、`.env.local` 已被 `.gitignore` 忽略。
- `db_config.md` 中已有明文数据库资源，本工程不复制真实密码。
- 生产上线前应轮换数据库密码、限制 RDS 白名单、开启备份和最小权限账号。
