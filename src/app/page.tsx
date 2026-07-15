import { Uploader } from "@/components/uploader";

export default function HomePage() {
  return (
    <main className="home-shell">
      <section className="hero-copy" aria-labelledby="hero-title">
        <p className="eyebrow"><span>01</span> Temporary file transfer</p>
        <h1 id="hero-title">SEND IT<br /><em>NOW.</em></h1>
        <p className="hero-lede">No account. No inbox archaeology.<br />Just files, a link, and seven days.</p>
        <div className="speed-note" aria-hidden="true">
          <span>9ms</span>
          <svg viewBox="0 0 180 28"><path d="M2 21C38 3 78 2 112 15c23 9 43 8 66-7" /></svg>
          <small>is a feeling,<br />not a benchmark.</small>
        </div>
      </section>
      <Uploader />
      <footer className="home-footer">
        <span>UP TO 2 GB</span><span>7 DAY EXPIRY</span><span>OPTIONAL PASSWORD</span>
      </footer>
    </main>
  );
}
