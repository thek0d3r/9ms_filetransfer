import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { currentUser } from "@/lib/auth";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/account");
  return <main className="auth-shell"><section className="auth-poster"><p className="eyebrow"><span>04</span> Member access</p><h1>YOUR<br /><em>LANE.</em></h1><p>Transfers, usage, billing.<br />All moving at one speed.</p><b aria-hidden="true">09</b></section><AuthForm mode="login" /></main>;
}
