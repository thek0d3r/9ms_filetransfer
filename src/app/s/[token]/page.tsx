import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SecretReveal } from "@/components/secret-reveal";
import { secretByToken, secretIsAvailable } from "@/lib/one-time-secrets";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "A one-time secret", robots: { index: false, follow: false } };

export default async function SecretPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const secret = await secretByToken(token);
  if (!secretIsAvailable(secret)) notFound();
  return <SecretReveal token={token} label={secret.label} expiresAt={secret.expiresAt.toISOString()} />;
}
