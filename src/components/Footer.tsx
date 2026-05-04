export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer id="contact" className="frame">
      <div className="colophon">
        <a href="mailto:preyam2002@gmail.com?subject=Hello" className="colophon-mail serif">
          preyam2002@gmail.com
        </a>
        <div className="colophon-meta">
          <div>SET IN FRAUNCES & NEWSREADER</div>
          <div>PRINTED IN BENGALURU</div>
          <div>
            <span className="v">●</span> ALL RIGHTS RESERVED — {year}
          </div>
        </div>
      </div>
    </footer>
  );
}
