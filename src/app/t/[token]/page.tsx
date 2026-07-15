import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Recipient } from "@/components/recipient";
import { canAccess } from "@/lib/share-auth";
import { filesForTransfer, isAvailable, transferByShareToken } from "@/lib/transfers";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const transfer = await transferByShareToken(token);
  return { title: transfer?.title || "A transfer for you", robots: { index: false, follow: false } };
}

export default async function TransferPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const transfer = await transferByShareToken(token);
  if (!transfer || !isAvailable(transfer.status, transfer.expiresAt)) notFound();
  const accessible = await canAccess(transfer);
  const files = accessible ? (await filesForTransfer(transfer.id)).filter((file) => file.status === "clean").map((file) => ({ id: file.id, name: file.originalName, size: file.size })) : [];
  return <Recipient token={token} title={transfer.title} message={transfer.message} totalSize={transfer.totalSize} fileCount={transfer.fileCount} expiresAt={transfer.expiresAt!.toISOString()} locked={!accessible} initialFiles={files} />;
}
