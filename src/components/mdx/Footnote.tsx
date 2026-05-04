export default function Footnote({
  n,
  children,
}: {
  n: string | number;
  children: React.ReactNode;
}) {
  return (
    <span className="mdx-footnote-wrap">
      <sup id={`fnref-${n}`} className="mdx-footnote-mark">
        <a href={`#fn-${n}`}>{n}</a>
      </sup>{" "}
      <span id={`fn-${n}`} className="mdx-footnote-body">
        {children}
      </span>
    </span>
  );
}
