import React, { useEffect, useRef, useState } from "react";

const KOFI_URL = "https://ko-fi.com/hideosasaki";

// The same page stripped to the tip form: no feed, no gallery, no profile
// header. Ko-fi publishes this URL for embedding, and it is what their own
// widget script loads, so we point an iframe at it and skip the script, which
// would run on every page load for a button pressed once in a hundred games.
const KOFI_WIDGET_URL = `${KOFI_URL}/?hidefeed=true&widget=true&embed=true&preview=true`;

// Ko-fi's cup mark, served from public/ rather than their CDN so the page
// makes no third-party request until the reader asks for one. Their own
// button script squeezes it to 22x15; this is its true ratio, which their
// brand terms ask for. The button around it is theirs too, rebuilt here:
// the script that draws it calls document.writeln, which would blank an
// already-loaded page, and it navigates away instead of opening the dialog.
const KOFI_CUP = `${process.env.PUBLIC_URL}/kofi-cup.png`;
// The orange of Ko-fi's own button artwork, read out of that PNG's palette.
const KOFI_ORANGE = "#ff6433";

function DonateLink() {
  const [open, setOpen] = useState(false);
  const dialog = useRef(null);
  const close = () => dialog.current.close();

  useEffect(() => {
    if (!open) return;
    // showModal is the whole reason this is a dialog: the top layer, the
    // backdrop, Escape, and keeping Tab inside the panel all come with it.
    dialog.current.showModal();
    // Scroll containment does not, and the board scrolls behind the panel
    // on touch devices without this.
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open]);

  return (
    <div className="text-center">
      <p className="text-body-secondary small mb-2">
        Brass Counter is free and always will be. Next time you're getting
        drinks for the table:
      </p>
      <button
        type="button"
        className="btn fw-bold text-white d-inline-flex align-items-center gap-2"
        style={{ backgroundColor: KOFI_ORANGE }}
        onClick={() => setOpen(true)}
      >
        <img src={KOFI_CUP} width="22" height="18" alt="" />
        Add a coffee for me
      </button>

      {open && (
        <dialog
          ref={dialog}
          className="kofi-dialog"
          aria-label="Support Brass Counter on Ko-fi"
          onClose={() => setOpen(false)}
          onClick={(event) => {
            if (event.target === dialog.current) close();
          }}
        >
          {/* Ko-fi is a third party inside an iframe, so a blocker or a cookie
              policy can leave the frame empty. The way out shares the close
              button's row, because a line of its own is a line the tip form
              loses and it starts scrolling. */}
          <div className="d-flex align-items-center gap-3 mb-1">
            <a
              className="link-light small text-truncate"
              href={KOFI_URL}
              target="_blank"
              rel="noreferrer"
            >
              Not loading? Open in a new tab
            </a>
            <button
              type="button"
              className="btn-close btn-close-white ms-auto flex-shrink-0"
              aria-label="Close"
              onClick={close}
            ></button>
          </div>
          <iframe
            className="rounded-4 bg-white border-0 flex-fill"
            style={{ minHeight: 0 }}
            src={KOFI_WIDGET_URL}
            title="Ko-fi tip form"
          ></iframe>
        </dialog>
      )}
    </div>
  );
}

export default DonateLink;
