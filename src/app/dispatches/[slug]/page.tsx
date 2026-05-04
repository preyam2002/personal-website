import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import ReadingProgress from "@/components/ReadingProgress";
import { mdxComponents } from "@/components/mdx";
import {
  getAllDispatches,
  getDispatch,
  formatDispatchDate,
} from "@/lib/dispatches";

export function generateStaticParams() {
  return getAllDispatches().map((d) => ({ slug: d.slug }));
}

type Params = { slug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const d = getDispatch(slug);
  if (!d) return {};
  return {
    title: `${d.title} — The Preyam Broadsheet`,
    description: d.dek,
  };
}

export default async function DispatchPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const dispatch = getDispatch(slug);
  if (!dispatch) notFound();

  const all = getAllDispatches();
  const idx = all.findIndex((d) => d.slug === slug);
  const next = idx > 0 ? all[idx - 1] : null;
  const prev = idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null;

  return (
    <main>
      <ReadingProgress />
      <Navigation />

      <article className="frame article">
        <header className="article-head">
          <div className="page-ornament">
            <span>Section II</span>
            <span className="dot">●</span>
            <span>{dispatch.kicker ?? "Dispatch"}</span>
          </div>
          <p className="kicker kicker-vermillion">
            Filed {formatDispatchDate(dispatch.date)}
            {dispatch.reading && <> · {dispatch.reading}</>}
          </p>
          <h1 className="article-title">{dispatch.title}</h1>
          <p className="article-dek">{dispatch.dek}</p>
          {dispatch.tags && (
            <div className="article-tags">
              {dispatch.tags.map((t) => (
                <span key={t} className="article-tag">
                  #{t}
                </span>
              ))}
            </div>
          )}
        </header>

        <hr className="rule-double" />

        <div className="article-body">
          <MDXRemote source={dispatch.content} components={mdxComponents} />
        </div>

        <hr className="rule-double" />

        <footer className="article-foot">
          <p className="kicker kicker-vermillion">— end of dispatch —</p>
          <nav className="article-nav">
            {prev ? (
              <Link href={`/dispatches/${prev.slug}`} className="nav-prev">
                <span className="kicker">Previous</span>
                <span className="title">{prev.title}</span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link href={`/dispatches/${next.slug}`} className="nav-next">
                <span className="kicker">Next</span>
                <span className="title">{next.title}</span>
              </Link>
            ) : (
              <span />
            )}
          </nav>
          <div className="reply-by-post">
            <span>
              Reply by post — letters to the editor are read and answered.
            </span>
            <a
              href={`mailto:preyam2002@gmail.com?subject=${encodeURIComponent(
                `Re: ${dispatch.title}`,
              )}`}
            >
              preyam2002@gmail.com →
            </a>
          </div>

          <Link href="/dispatches" className="back-link">
            ← Back to all dispatches
          </Link>
        </footer>
      </article>

      <Footer />
    </main>
  );
}
