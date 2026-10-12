import { define, page, type RouteProps } from "@hum/core";

/** `head` as a function so it can use the matched params. */
export function head({ params }: RouteProps) {
  return <title>Blog {params.id}</title>;
}

export const handlers = define.handlers({
  // The route owns both the request handling and the view: import `page` from
  // @hum/core to render this file's page with the data the handler loaded.
  GET: (c) => {
    const id = c.req.param("id");
    return page({ props: { post: { id, title: `Post ${id}` } } });
  },
});

export default function BlogPost(
  props: RouteProps & { post?: { id: string; title: string } },
) {
  return <h1>{props.post?.title ?? "no post"}</h1>;
}
