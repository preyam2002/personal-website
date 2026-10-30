import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CompositionPreview from "../CompositionPreview";
import { compositions } from "../compositions";

export const dynamicParams = false;

export function generateStaticParams() {
  return compositions.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const composition = compositions.find((entry) => entry.slug === slug);
  return { title: `${composition?.name ?? "Composition"} | Preyam Rao`, robots: { index: false, follow: false } };
}

export default async function CompositionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const composition = compositions.find((entry) => entry.slug === slug);
  if (!composition) notFound();
  return <CompositionPreview composition={composition} />;
}
