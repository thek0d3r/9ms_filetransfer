import Link from "next/link";

export default function NotFound() {
  return <main className="not-found"><p className="eyebrow"><span>404</span> Link unavailable</p><h1>This one<br /><em>got away.</em></h1><p>The transfer may have expired, been deleted, or never existed.</p><Link className="transfer-button" href="/"><span>SEND SOMETHING NEW</span><i>↗</i></Link></main>;
}
