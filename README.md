# Hum

Hum 是一个面向 Node.js 的 islands 服务端渲染框架。页面默认渲染为静态
HTML，只有显式声明为 island 的组件才会在客户端加载并水合。

- **运行时**：Node.js ≥ 20，纯 ESM
- **视图层**：Preact
- **HTTP**：Hono
- **构建与开发**：Vite

## 新建项目

```bash
pnpm dlx create-hum my-app
# 或
npm create hum@latest my-app
```

生成的项目包含 Tailwind CSS v4、Vite 配置、路由与 island 示例：

```bash
cd my-app
npm install
npm run dev
```

生产构建与运行：

```bash
npm run build
npm start
```

生产构建会将服务端用到的 npm 依赖打入 `_hum/server/` 的 ESM 产物中，
部署运行时不需要安装项目的 `node_modules`。运行环境仍需提供 Node.js ≥ 20，
`_hum/` 可以随应用根目录一起移动；保留该目录结构即可，其中包含服务端代码、
manifest 和客户端静态资源。

## 文件路由

路由目录中的文件布局对应 URL：

| 文件             | 说明                                           |
| ---------------- | ---------------------------------------------- |
| `index.tsx`      | 目录首页（`routes/index.tsx` → `/`）           |
| `_app.tsx`       | 文档外壳，负责 `<html>`、`<head>` 和 `<body>`  |
| `_layout.tsx`    | 布局，按目录层级由外向内嵌套                   |
| `_middleware.ts` | 中间件，按目录层级依次执行                     |
| `_error.tsx`     | 错误页（500）                                  |
| `_404.tsx`       | 未匹配时的兜底页，作用于所在目录及子目录       |
| `_components/`   | 私有组件目录，不生成路由，可在附近页面中导入   |
| `_islands/`      | 局部 island 目录，不生成路由，可在附近页面导入 |

路径语法：

| 语法        | 含义                                |
| ----------- | ----------------------------------- |
| `[id]`      | 动态段                              |
| `[...slug]` | 通配段，可匹配零个或多个段          |
| `[[lang]]`  | 可选段，展开成多条具体路由          |
| `(group)`   | 分组段，对 URL 透明，只影响磁盘布局 |

普通 `.tsx` 文件默认都会被识别为路由；把页面使用的组件放在任意层级的
`_components/` 目录即可排除路由发现，例如 `routes/blog/_components/Card.tsx`。
页面仍可通过相对路径直接导入它。

## 页面、Head 与请求处理

路由文件默认导出的组件负责页面渲染：

```tsx
import Counter from "../islands/Counter.js";
import { define } from "@hum/core";

export const head = define.head(<title>首页</title>);

export default function Home() {
  return (
    <main>
      <h1>欢迎</h1>
      <Counter start={0} />
    </main>
  );
}
```

放在顶层 `islands/` 并被页面引用的组件会加载客户端交互代码。只在局部使用的
island 也可以放在就近路由的 `_islands/` 目录，例如
`routes/blog/_islands/Editor.tsx`；在页面中通过相对路径导入即可。其余页面内容
仍作为静态 HTML 输出。

`define` 是可选的类型辅助 helper，并非定义路由导出的必要步骤。它不增加运行时
行为；你可以直接导出 `head`、`config`、`handlers` 等值，也可以直接声明默认页面
组件。使用 `define.*` 可以让编辑器检查相应导出的类型，并明确表达定义意图。

`define.head()` 可以接收静态 JSX 或读取路由数据的函数：

```tsx
import { define } from "@hum/core";

export const head = define.head(({ params }) => <title>文章 {params.id}
</title>);
```

路由配置也可以直接导出对象；`define.config()` 则提供相同配置的类型检查，例如跳过
继承的布局或 `_app` 包装：

```tsx
export const config = define.config({
  skipInheritedLayouts: true,
  skipAppWrapper: true,
});
```

路由也可以直接导出基于 HTTP 方法的处理器，或使用 `define.handlers()`
获得类型检查。 处理器接收 Hono `Context`：

```tsx
import { define, page } from "@hum/core";

export const handlers = {
  GET: async (c) => page({ post: await load(c.req.param("id")) }),
  POST: async (c) => c.redirect("/thanks"),
};

type PageData = { post: { title: string } };
export default define.page<PageData>(({ data }) => <h1>{data?.post.title}</h1>);
```

`define.page<Data>()` 是可选的页面组件类型辅助；也可以直接导出默认组件。 handler
调用 `page(data)` 后，视图通过 `data` 读取它，路由的 `params`、`url`、`state` 等
框架属性保持独立。需要设置 HTML 状态码时传第二个参数，例如
`page({ post }, { status: 201 })`。处理器返回 `Response` 时直接应答；返回
`page()` 可渲染当前页面。没有返回响应时，框架会回落到默认页面渲染。

## 样式

脚手架默认集成 Tailwind CSS v4。全局样式位于 `client/style.css`，由
`client/main.ts` 引入；可在路由和 islands 中使用 Tailwind utility
class。也可以按需修改 Vite 配置或替换样式方案。

## Hono 应用入口

`server.ts` 导出一个 Hono app，可用普通 Hono API 配置 middleware、API 路由和
`onError`。Vite 插件会调用 `mountHum(app, config)` 将文件路由直接挂载到这个
app，接管全局 `notFound`，但不会覆盖 Hono 的 `onError`：Hum 页面错误渲染
`_error`，API 错误仍交给 Hono 的错误处理器。独立集成也可从 `@hum/core` 调用
`mountHum`；`createApp(config)` 仍可创建独立的 Hum Hono app。开发模式仍由 Vite
创建 listener 并提供 SSR/HMR；生产模式由生成的入口启动导出的 Hono
app。脚手架包含 `/api/health` 示例。

全局 middleware 应在 Hono app 上先注册，再注册 API routes；Vite 插件会在加载
`server.ts` 后挂载 Hum，因此此前注册的 middleware 也会包裹 Hum routes。Hono 的
`csrf()` 通过 `Origin`/`Sec-Fetch-Site` 来源信息检查跨站表单请求，不是 token
机制。参见站点指南：`/docs/routing` 和 `/docs/hono`。

## 测试与版本兼容

仓库使用 `pnpm test` 运行单元/集成测试，`pnpm typecheck` 做 workspace 类型检查。
`pnpm test:standalone` 会构建生产产物，将 `_hum/` 移到临时目录，并在不含
`node_modules` 和应用 `package.json` 的环境启动，检查 API、页面、静态资源和
404。

Hum 目前处于 pre-1.0 阶段。`@hum/core`、`@hum/vite-plugin` 与 `create-hum`
文档中列出的导出是受支持的使用面，但 1.0 之前仍可能有不兼容变更；升级时请固定
版本并查看变更说明。内部文件、`.hum/` 构建输入以及生成的 chunk 名称不属于稳定
API。
