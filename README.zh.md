# Hum

[English](./README.md)

Hum 是一个基于 [Preact](https://preactjs.com)和[Hono](https://hono.dev) 服务端渲染框架。

项目主要灵感和相当部分代码来自 [Fresh](https://usefresh.dev)，保留了其特色的 [Partial](https://usefresh.dev/docs/advanced/partials)机制，并做了一些额外的改进和功能。

## 开始使用

```sh
pnpm dlx create-hum my-app     # 或：npm create hum@latest my-app
```

脚手架生成的项目结构如下：

```
routes/
  _app.tsx       文档外壳（html/head/body）+ 默认 head 标签
  _404.tsx       未找到页面
  index.tsx      /
  ...
islands/
  Counter.tsx    交互组件
client/
  main.ts        客户端入口；导入全局 CSS
  style.css      全局样式
server.ts        Hono 应用，包含中间件与 API 路由
vite.config.ts   plugins: [hum(), tailwindcss()]
```

项目使用vite进行dev/build，build产物可以直接`node _hum/server/server.js`运行。


## 文件路由

`routes/` 下的每个文件都会根据其相对路径生成一个 URL。

| 文件路径                       | URL                      |
| ----------------------------- | ------------------------ |
| `routes/index.tsx`            | `/`                      |
| `routes/about.tsx`            | `/about`                 |
| `routes/blog/[id].tsx`        | `/blog/:id`              |
| `routes/docs/[...slug].tsx`   | `/docs/*`（零个或多个）   |
| `routes/[[lang]]/about.tsx`   | `/about` 或 `/:lang/about` |
| `routes/(marketing)/a.tsx`    | `/a`                     |

- `[id].tsx` 匹配单个动态段，通过 Hono 的 context 读取。
- `[[id]].tsx` 是可选段，路由在带与不带该段时都能匹配。
- `[...slug].tsx` 是通配段，匹配剩余零个或多个段。
- `(group)/` 目录是透明分组，不会出现在 URL 中。
- 静态路由优先于动态匹配。

**特殊文件**通过路由树提供额外行为：

- `_app.tsx` —— 外层文档外壳（`<html>`、`<head>`、`<body>`），树中更深者生效。
- `_layout.tsx` —— 包裹其所在目录及后代的页面，布局从 routes 根到匹配路由依次嵌套。
- `_middleware.ts` —— 对其下的路由生效（见[中间件](#5-中间件)）。
- `_error.tsx`（别名 `_500.tsx`）—— 渲染路由错误。
- `_404.tsx` —— 处理其目录子树下未匹配的路径。
- `server.ts` —— 你的 Hono 应用（不在 `routes/` 下）。
- `client/main.ts` —— 默认的客户端入口。

名为 `_components/` 和 `_islands/` 的目录会被排除在路由发现之外，因此你可以把可复用
组件与某个路由分支放在一起，并通过相对路径导入。

当组件位于 `islands/` 或路由局部的 `_islands/` 下、并被页面使用时，它就成为islands组件。

### Head 标签与 SEO

Fresh 的 `head` 注入机制颇为复杂，Hum 在这方面做了一些改进。`head` 由每个路由文件导出，可以是 JSX 片段，也可以是接收路由 props 的函数；它会按标签覆盖 `_app.tsx` 中的默认值。

```tsx
export const head = define.head(<title>Home</title>); // `define` 只是一个用于类型检查的 helper

export function head({ params }: RouteProps) {
  return <title>Blog {params.id}</title>;
}
```

### handlers 与表单

导出一个以 HTTP 方法为键的 `handlers` 对象。每个 handler 接收原始的 Hono `Context`，
既可以返回 `Response`，也可以用 `page(data)` 渲染同一文件的页面。当没有定义 `handlers` 时,
将渲染默认导出的视图。

```tsx
import { define, page, type Handlers } from "@humjs/core";

export const handlers: Handlers = {
  GET: async (c) => {
    const post = await loadPost(c.req.param("id"));
    return page({ post });
  },
  POST: async (c) => {
    const form = await c.req.formData();
    await savePost(form);
    return c.redirect("/blog");
  },
};

export default define.page<{ post: { title: string } }>(({ data }) => (
  <article><h1>{data.post.title}</h1></article>
));
```

### 中间件

Hum 的 `_middleware.ts` 只对其所在目录及后代中的 Hum 文件路由生效。父级中间件会被继承，
执行链从 routes 根依次走向匹配的路由；它同时也会包裹该路由的 handlers。

```ts
// routes/admin/_middleware.ts
import { define } from "@humjs/core";

export default define.middleware(async (c, next) => {
  const session = await getSession(c.req.raw);
  if (!session) {
    c.res = c.redirect("/login"); // 短路
    return;
  }
  c.set("user", session.user);
  await next();
});
```

Hum 本身就是基于Hono的，`vite` 插件将在 `server.ts` 之后注册Hum，因此，Hono 注册的 API 异常仍由应用的`onError` 处理，而 Hum 的异常会渲染 `_error.tsx`。


### 客户端导航与 Partial

可以直接参考 [Fresh 文档](https://usefresh.dev/docs/advanced/partials)。也可以对比Hum的[文档](https://hum.runasp.net/docs/partials)及其[源码](./packages/docs/routes/docs/partials/[[topic]].tsx)

### Streaming

流式 SSR 是一个可选的进阶能力，考虑到某些情况 `handlers` 可能需要请求慢数据，这代表在数据完成之前将不会返回任何内容，这显然不秒。我们可以通过可选的配置启用流式渲染。

```tsx
import {
  createResource,
  define,
  page,
  Suspense, // 这是对preact的Suspense组件和错误边界的封装
  type Resource,
} from "@humjs/core";

type PageData = { profile: Resource<{ name: string }> };

export const config = define.config({ streaming: true }); // 配置

export const handlers = define.handlers({
  GET: (c) => page({
    profile: createResource(loadProfile(c.req.param("id"))),
  }),
});

export default define.page<PageData>(({ data }) => (
  <Suspense
    resource={data.profile}
    fallback={<p>Loading profile…</p>} // resource 处于挂起状态时显示
    errorFallback={(error) => ( // resource 被 reject 或者组件渲染报错
      <p role="alert">Could not load: {String(error)}</p>
    )}
  >
    {(profile) => <ProfilePanel profile={profile} />}
  </Suspense>
));
```
