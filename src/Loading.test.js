import React from "react";
import { render, screen, act } from "@testing-library/react";
import Loading, { DELAY_MS } from "./Loading";

const tick = (ms) => act(() => jest.advanceTimersByTime(ms));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("shows nothing while the load is still quick enough to feel instant", () => {
  render(<Loading />);
  tick(DELAY_MS - 1);

  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("owns up to a wait the player can feel", () => {
  render(<Loading />);
  tick(DELAY_MS);

  expect(screen.getByRole("status")).toBeInTheDocument();
});
