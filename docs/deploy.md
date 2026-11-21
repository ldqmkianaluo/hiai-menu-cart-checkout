# 把它部署成一个能发出去的在线 Demo

这个项目是「前端 dist + Spring Boot」打成一个 JAR 的单体，**不能用 GitHub Pages**（Pages 只能托管静态文件）。
下面三条路都验证过结构可行，选一条走即可。

---

## 0. 先确认镜像能构建

仓库里有三阶段 `Dockerfile`（node 构建前端 → maven 编译后端 → JRE 运行），`.github/workflows/docker.yml` 会在推送到 `main` 时自动构建并推到 GitHub 容器仓库：

```text
ghcr.io/<你的用户名>/hiai-menu-cart-checkout:main
```

本地验证（需要 Docker Desktop）：

```sh
docker build -t hiai-demo .
docker run --rm -p 8080:8080 hiai-demo
# 打开 http://localhost:8080/?table=A08
```

---

## 1. Render（最省事，免费额度够演示）

1. 打开 <https://render.com>，用 GitHub 登录；
2. **New → Web Service**，选 `hiai-menu-cart-checkout` 仓库；
3. Runtime 选 **Docker**，Branch `main`，Plan 选 Free；
4. 环境变量加 `PORT=10000`（Render 会注入自己的 PORT，容器入口已经用 `${PORT}` 读）；
5. Deploy，等 3~5 分钟，拿到形如 `https://hiai-demo.onrender.com` 的地址。

> 免费实例 15 分钟无访问会休眠，第一次打开要等 30 秒左右冷启动，发帖子时最好先自己点一次。

## 2. Zeabur / Fly.io（亚洲节点更快）

- Zeabur：新建项目 → Deploy from GitHub → 选 Docker，自动识别 `Dockerfile`；
- Fly.io：`fly launch --no-deploy` 后把 `fly.toml` 的 `internal_port` 改成 `8080`，再 `fly deploy`。

## 3. 自己的 VPS（最可控）

```sh
git clone https://github.com/lllllkkkk/hiai-menu-cart-checkout.git
cd hiai-menu-cart-checkout
docker build -t hiai-demo .
docker run -d --name hiai-demo -p 80:8080 --restart=always hiai-demo
```

前面套 Nginx + HTTPS 时，记得把 `/api` 也反代到同一个容器（前端和服务同源，不需要额外配置跨域）。

---

## 部署完要改的三处

1. **README 首屏**：把「在线 Demo」链接换成你的地址，让人点进来就能玩；
2. **桌号二维码**：这个地址后面加 `?table=A08`，用任意二维码工具生成桌贴，扫码直接进桌；
3. **仓库 About**：Description 写一句话、Website 填在线地址、Topics 加上
   `vue3` `spring-boot` `h5` `qr-order` `shared-cart` `persona-ui` `demo`。

## 放开推广前的边界

- 购物车、券、预约全在内存里，进程重启即清空——演示够用，别当生产用；
- 没有任何支付渠道、没有账号体系、没有数据库；
- 演示页面上写的「演示环境」提示不要删，避免被当成真实点单系统。
