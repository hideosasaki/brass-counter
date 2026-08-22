import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

// Hosting rewrites every unknown path to index.html, so a truncated shared
// link arrives here rather than at a 404 page. Without a catch-all route the
// app matches nothing and renders a blank screen.
test("a path no route matches lands on the home screen", async () => {
  render(
    <MemoryRouter initialEntries={["/game/abc123/nonsense"]}>
      <App />
    </MemoryRouter>
  );
  expect(await screen.findByText("Brass Counter")).toBeInTheDocument();
});
