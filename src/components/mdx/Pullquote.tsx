export default function Pullquote({
  children,
  cite,
}: {
  children: React.ReactNode;
  cite?: string;
}) {
  return (
    <aside className="mdx-pullquote" role="note">
      <span className="mdx-pullquote-mark" aria-hidden="true">
        “
      </span>
      <div>{children}</div>
      {cite && <cite>— {cite}</cite>}
    </aside>
  );
}
