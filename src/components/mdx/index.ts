import type { MDXRemoteProps } from "next-mdx-remote/rsc";
import Dropcap from "./Dropcap";
import Pullquote from "./Pullquote";
import Marginalia from "./Marginalia";
import Footnote from "./Footnote";

export const mdxComponents: MDXRemoteProps["components"] = {
  Dropcap,
  Pullquote,
  Marginalia,
  Footnote,
};
