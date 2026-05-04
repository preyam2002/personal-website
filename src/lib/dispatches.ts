import fs from "fs";
import path from "path";
import matter from "gray-matter";

const DIR = path.join(process.cwd(), "src", "content", "dispatches");

export type DispatchMeta = {
  slug: string;
  title: string;
  kicker?: string;
  dek: string;
  date: string;
  reading?: string;
  tags?: string[];
};

export type Dispatch = DispatchMeta & {
  content: string;
};

export function getAllDispatches(): DispatchMeta[] {
  if (!fs.existsSync(DIR)) return [];
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".mdx"));
  return files
    .map((f) => {
      const slug = f.replace(/\.mdx$/, "");
      const raw = fs.readFileSync(path.join(DIR, f), "utf8");
      const { data } = matter(raw);
      const meta = data as Omit<DispatchMeta, "slug">;
      return { slug, ...meta };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getDispatch(slug: string): Dispatch | null {
  const file = path.join(DIR, `${slug}.mdx`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  const { data, content } = matter(raw);
  const meta = data as Omit<DispatchMeta, "slug">;
  return { slug, content, ...meta };
}

export function formatDispatchDate(date: string): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
