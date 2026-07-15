import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { currentUser } from "@/lib/auth";

export const metadata = { title: "Create account" };

export default async function RegisterPage() {
  if (await currentUser()) redirect("/account");
  return <main className="auth-shell"><section className="auth-poster"><p className="eyebrow"><span>04</span> Claim your lane</p><h1>SEND<br /><em>MORE.</em></h1><p>Start free. Upgrade when<br />two gigabytes feels small.</p><b aria-hidden="true">10×</b></section><AuthForm mode="register" /></main>;
}
