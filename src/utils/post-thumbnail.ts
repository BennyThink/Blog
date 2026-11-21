import type { InferCollectionData } from "emdash";

export function getPostThumbnail(post: InferCollectionData<"posts">) {
  if (post.featured_image) return post.featured_image;

  const firstImage = post.content?.find(block => block._type === "image") as
    | { asset?: { url?: string; _ref?: string }; alt?: string }
    | undefined;
  const src = firstImage?.asset?.url || firstImage?.asset?._ref;
  if (src && /^(https?:\/\/|\/)/.test(src)) {
    return { id: firstImage?.asset?._ref || "", src, alt: firstImage?.alt || "" };
  }

  return {
    id: "wordpress-random-fallback",
    src: `/images/fallback/${Math.floor(Math.random() * 10) + 1}.jpg`,
    alt: "",
  };
}
