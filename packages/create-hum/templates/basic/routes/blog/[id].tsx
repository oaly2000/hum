import { define, type Handlers, page, type RouteProps } from "@hum/core";

interface BlogPageData {
  post: { id: string; title: string };
}

export const head = define.head(({ params }) => <title>Blog {params.id}
</title>);

export const handlers: Handlers = {
  GET: (c) => {
    const id = c.req.param("id");
    return page({ post: { id, title: `Post ${id}` } });
  },
};

export default define.page<BlogPageData>(({ data }) => (
  <h1>Blog post {data?.post.title}</h1>
));
