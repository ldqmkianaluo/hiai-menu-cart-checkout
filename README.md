# hiAi 菜品—购物车—支付确认演示项目

这是从原 hiAi 用户端流程中抽出的轻量独立项目。页面沿用原项目菜单、购物车和支付页的布局与暖米色视觉，只保留：

1. 菜品分类与列表；
2. 加入、增减和删除购物车菜品；
3. 后端重新核算金额并生成支付确认预览；
4. 支付方式界面展示。

项目**不会创建真实订单、不会调用微信或其他支付渠道、不会扣款**。支付确认页点击按钮后仅显示“演示结束”。

## 技术与目录

- `frontend`：Vue 3 + Vite 的移动端 H5；
- `backend`：Java 17 + Spring Boot，菜品及购物车数据保存在内存；
- 不需要 `hiai-core`、MySQL、Redis、微信配置或任何密钥；
- 后端打包时会把前端 `dist` 一起放入可执行 JAR。

## 一键打包

环境要求：Java 17、Maven 3.8+、Node.js 20+。

Windows 如果同时安装了多个 Java，请将 `JAVA_HOME` 指向 Java 17；启动脚本会优先使用该目录下的 Java。

Windows PowerShell：

```powershell
.\build.ps1
```

macOS/Linux：

```sh
sh ./build.sh
```

产物：

```text
build/backend/hiai-menu-cart-checkout-1.0.0.jar
```

## 运行

```powershell
.\run.ps1
```

或者：

```sh
java -jar build/backend/hiai-menu-cart-checkout-1.0.0.jar
```

访问：<http://localhost:8080>

健康检查：<http://localhost:8080/api/demo/health>

## 前端单独开发

先启动后端，再执行：

```powershell
cd frontend
npm install
npm run dev
```

访问 <http://localhost:3000>。Vite 会把 `/api` 代理到本机 8080 端口。

## 演示接口

- `GET /api/demo/menu`：菜品列表；
- `GET /api/demo/cart?sessionId=...`：读取购物车；
- `POST /api/demo/cart/items`：设置菜品数量；
- `POST /api/demo/checkout/preview`：后端核算结算预览；
- `GET /api/demo/health`：运行状态，固定返回 `paymentEnabled=false`。

购物车使用内存存储，重启后自动清空，适合交互演示和二次开发。
