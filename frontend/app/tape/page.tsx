import { Icon } from "@/components/glyphs";

export default function Tape() {
  return (
    <main className="page">
      <div className="page-head">
        <h1>The Master Tape</h1>
        <div className="sub">Scrubbable replay of the whole session — built in the next pass.</div>
      </div>
      <div className="empty">
        <Icon name="tape" />
        <p>The replay timeline lands here: scrub the session, re-light the Stage,<br />expand any decision&apos;s provenance chain.</p>
      </div>
    </main>
  );
}
