export function Footer() {
  return (
    <footer className="py-8 border-t border-neutral-800/50">
      <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
        <span className="font-[family-name:var(--font-mono)] text-[10px] text-neutral-600 tracking-wider">
          © {new Date().getFullYear()}
        </span>
        <span className="font-[family-name:var(--font-mono)] text-[10px] text-neutral-600 tracking-wider">
          pr
        </span>
      </div>
    </footer>
  );
}
