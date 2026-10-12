import { define, page } from "@hum/core";

interface BlogPageData {
  post: { id: string; title: string };
}

export const head = define.head(({ params }) => <title>Blog {params.id}</title>);

export const handlers = define.handlers({
  GET: (c) => {
    const id = c.req.param("id");
    return page({ post: { id, title: `Post ${id}` } });
  },
});

export default define.page<BlogPageData>(({ data }) => (
  <h1>{data?.post.title ?? "no post"}</h1>
));
