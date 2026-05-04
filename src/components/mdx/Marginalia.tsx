export default function Marginalia({ children }: { children: React.ReactNode }) {
  return (
    <span className="mdx-marginalia-wrap">
      <span className="mdx-marginalia-mark" aria-hidden="true">
        ✦
      </span>
      <span className="mdx-marginalia">{children}</span>
    </span>
  );
}
