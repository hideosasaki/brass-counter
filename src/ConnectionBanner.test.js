import React from "react";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { onValue } from "firebase/database";
import ConnectionBanner, { GRACE_MS } from "./ConnectionBanner";

jest.mock("./firebaseConfig", () => ({ database: {} }));
jest.mock("firebase/database", () => ({
  ref: jest.fn(),
  onValue: jest.fn(() => jest.fn()),
}));

const GAME = "/game/abc123";

const show = (path = GAME) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ConnectionBanner />
    </MemoryRouter>
  );

// The one argument the component cares about: whether the client currently
// holds a connection to the database.
const report = (connected) =>
  act(() => onValue.mock.calls[0][1]({ val: () => connected }));

const tick = (ms) => act(() => jest.advanceTimersByTime(ms));

const setOnLine = (value) =>
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });

beforeEach(() => {
  jest.useFakeTimers();
  onValue.mockClear();
  setOnLine(true);
});

afterEach(() => jest.useRealTimers());

test("spends no connection on the screens that have no game to report", () => {
  show("/");

  expect(onValue).not.toHaveBeenCalled();
});

test("says nothing about a blip that resolves itself", () => {
  show();
  report(false);
  tick(GRACE_MS - 1);
  report(true);
  tick(GRACE_MS);

  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("blames the network when the device knows it is offline", () => {
  setOnLine(false);
  show();
  report(false);
  tick(GRACE_MS);

  expect(screen.getByRole("status")).toHaveTextContent(/offline/i);
});

test("suggests a busy database when the device has a network", () => {
  show();
  report(false);
  tick(GRACE_MS);

  expect(screen.getByRole("status")).toHaveTextContent(/busy/i);
});

test("clears itself once the game is reachable again", () => {
  show();
  report(false);
  tick(GRACE_MS);
  report(true);

  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
