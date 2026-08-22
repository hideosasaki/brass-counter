import React, { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import "bootstrap/dist/css/bootstrap.min.css";

// The lobby: shown once right after a game is created, and again whenever
// someone joins late. Putting it on the happy path is the point — the app's
// one real trick is that every phone at the table shares a game, and nobody
// discovers that from an icon in a header.
function Invite() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const { state } = useLocation();
  const [copied, setCopied] = useState(false);

  // The game itself, never this screen: a scanned code that lands on the
  // lobby again would leave the joiner one tap short of the game.
  const url = `${window.location.origin}/game/${gameId}`;

  const send = () => {
    if (navigator.share) {
      navigator.share({ title: `Brass Game ${gameId}`, url }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    }
  };

  return (
    <div className="container mt-3" style={{ maxWidth: 480 }}>
      <h4>Invite the other players</h4>
      <p className="text-secondary">
        Everyone points their camera at this code. Each player then counts on
        their own phone, and all of them stay in sync.
      </p>

      {/* Light background and a quiet zone whatever the device theme is: a
          dark-mode page would otherwise render a code no camera can read. */}
      <div className="d-flex justify-content-center bg-white rounded p-3 mb-3">
        <QRCodeSVG
          value={url}
          marginSize={2}
          bgColor="#ffffff"
          fgColor="#000000"
          style={{ width: "100%", height: "auto", maxWidth: 280 }}
        />
      </div>

      <div className="text-secondary small">Or send them this link</div>
      <div className="font-monospace text-break mb-2">{url}</div>

      <div className="d-grid gap-2">
        <button className="btn btn-outline-secondary" onClick={send}>
          {copied ? "Link copied" : "Send the link"}
        </button>
        <button
          className="btn btn-primary btn-lg"
          onClick={() => navigate(`/game/${gameId}`)}
        >
          {state?.fresh ? "Start playing" : "Back to game"}
        </button>
      </div>
    </div>
  );
}

export default Invite;
