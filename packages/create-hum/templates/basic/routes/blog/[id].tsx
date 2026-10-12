import { page, type Handlers, type RouteProps } from "@hum/core";

/** `head` as a function so it can use the matched params. */
export function head({ params }: RouteProps) {
  return <title>Blog {params.id}</title>;
}

// Import `page` from @hum/core to render this file's view with the data the
// handler loaded.
export const handlers: Handlers = {
  GET: (c) => page({ props: { id: c.req.param("id") } }),
};

export default function BlogPost(props: RouteProps & { id?: string }) {
  return <h1>Blog post {props.id}</h1>;
}
