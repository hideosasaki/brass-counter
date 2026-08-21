import React from "react";

const KOFI_URL = "https://ko-fi.com/hideosasaki";

// Ko-fi's brand red; inline colors keep the button identical in both themes
const KOFI_BG = "#ff5e5b";

function DonateLink() {
  return (
    <div className="text-center">
      <p className="text-body-secondary small mb-2">
        Brass Counter is free and always will be. If it made your game night
        easier:
      </p>
      <a
        className="btn rounded-pill px-4"
        style={{ backgroundColor: KOFI_BG, color: "#fff" }}
        href={KOFI_URL}
        target="_blank"
        rel="noreferrer"
      >
        ☕ Buy me a coffee
      </a>
    </div>
  );
}

export default DonateLink;
