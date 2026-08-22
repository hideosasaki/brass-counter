// A screen starts at the top of its own content: without this, leaving a long
// screen carries its scroll offset into the next one, which then opens below
// everything it has to show. Going back is left to the browser's own scroll
// restoration, so a back gesture returns to the spot it left.
//
// Keyed on pathname, not the whole location: the scanner walks its review cards
// by pushing history entries on the same path, and those must not jump.
import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

function ScrollToTop() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  useEffect(() => {
    if (navigationType !== "POP") window.scrollTo(0, 0);
  }, [pathname, navigationType]);
  return null;
}

export default ScrollToTop;
