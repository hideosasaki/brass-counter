import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import ScrollToTop from "./ScrollToTop";

function Nav() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate("/game")}>forward</button>
      <button onClick={() => navigate(-1)}>back</button>
    </>
  );
}

let scrollTo;

beforeEach(() => {
  scrollTo = jest.spyOn(window, "scrollTo").mockImplementation(() => {});
  render(
    <MemoryRouter initialEntries={["/score"]}>
      <ScrollToTop />
      <Nav />
    </MemoryRouter>
  );
  scrollTo.mockClear();
});

afterEach(() => scrollTo.mockRestore());

test("scrolls to the top of a screen navigated to", () => {
  fireEvent.click(screen.getByText("forward"));
  expect(scrollTo).toHaveBeenCalledWith(0, 0);
});

test("leaves the scroll offset alone when going back", () => {
  fireEvent.click(screen.getByText("forward"));
  scrollTo.mockClear();

  fireEvent.click(screen.getByText("back"));

  expect(scrollTo).not.toHaveBeenCalled();
});
