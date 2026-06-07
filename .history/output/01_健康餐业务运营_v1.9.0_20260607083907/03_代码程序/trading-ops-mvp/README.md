# 健康餐交易运营中台 MVP

这是按 `02_课题研究/03_健康餐交易运营中台开发实施计划书.html` 落地的可运行 MVP。

## 已实现范围

- 今日运营台：订单数、待付款、待下单、供应商未确认、毛利。
- 客户：新建客户、客户详情、地址/忌口/余额。
- 订单：新建订单、余额核销、订单状态流转。
- 收款：付款请求、人工确认收款、幂等确认。
- 预付款：充值请求、充值入账、余额核销流水。
- 供应商：按日期和供应商生成批次、复制微信下单文本、供应商确认。
- 复盘：营业额、实收、预收款、核销、成本、毛利、异常池。
- 数据层：内存演示模式 + MySQL 迁移与运行模式。

## 本地运行

```powershell
npm install
npm run dev
```

前端：http://127.0.0.1:5173
API：http://127.0.0.1:4310/api/health

默认 `DATA_STORE=memory`，可直接演示和测试。

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
```

## 安全注意

- `.env`、`.env.local` 已被 `.gitignore` 忽略。
- `db_config.md` 中已有明文数据库资源，本工程不复制真实密码。
- 生产上线前应轮换数据库密码、限制 RDS 白名单、开启备份和最小权限账号。
