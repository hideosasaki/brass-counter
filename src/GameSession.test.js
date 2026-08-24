import React from "react";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import {
  ref,
  onValue,
  set,
  remove,
  onDisconnect,
  goOffline,
  goOnline,
  serverTimestamp,
} from "firebase/database";
import GameSession from "./GameSession";
import { MAX_SLOTS } from "./gameSlot";

jest.mock("./firebaseConfig", () => ({ database: {} }));
jest.mock("firebase/database", () => ({
  ref: jest.fn((db, path) => ({ path })),
  onValue: jest.fn(() => jest.fn()),
  set: jest.fn(() => Promise.resolve()),
  remove: jest.fn(() => Promise.resolve()),
  onDisconnect: jest.fn(() => ({ remove: jest.fn(), cancel: jest.fn() })),
  goOffline: jest.fn(),
  goOnline: jest.fn(),
  serverTimestamp: jest.fn(() => "server-time"),
}));

const GAME = "/game/abc123";
const seat = (name) => `presence/abc123/${name}`;

const show = (path = GAME) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/game/:gameId" element={<GameSession />}>
          <Route index element={<div>game screen</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

// The socket coming up is what starts the search: the same callback runs again
// after a drop, which is when a seat has to be taken back.
const connect = async (connected = true) =>
  act(async () => {
    onValue.mock.calls[0][1]({ val: () => connected });
  });

// Which seats the app tried to take, in the order it tried them.
const tried = () => set.mock.calls.map((call) => call[0].path);

const rejectSeats = (...names) =>
  set.mockImplementation((slotRef) =>
    names.includes(slotRef.path)
      ? Promise.reject(new Error("PERMISSION_DENIED"))
      : Promise.resolve()
  );

// create-react-app resets mock implementations between tests, so the doubles
// are installed here rather than in the module factory.
beforeEach(() => {
  ref.mockImplementation((db, path) => ({ path }));
  onValue.mockImplementation(() => jest.fn());
  serverTimestamp.mockImplementation(() => "server-time");
  set.mockImplementation(() => Promise.resolve());
  remove.mockImplementation(() => Promise.resolve());
  onDisconnect.mockImplementation(() => ({
    remove: jest.fn(),
    cancel: jest.fn(),
  }));
  // Seat 0 first, so the order a test sees is the order it wrote.
  jest.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => Math.random.mockRestore());

// Waiting for the seat before drawing would put a round trip in front of every
// player's first paint, to spare the rare arrival who finds the table full.
test("draws the game before the seat is settled", () => {
  show();
  expect(screen.getByText("game screen")).toBeInTheDocument();
});

test("takes a seat and arms its release", async () => {
  show();
  await connect();
  expect(tried()).toEqual([seat("slot0")]);
  expect(set.mock.calls[0][1]).toEqual({ id: expect.any(String), at: "server-time" });
  expect(onDisconnect).toHaveBeenCalledWith({ path: seat("slot0") });
  expect(onDisconnect.mock.results[0].value.remove).toHaveBeenCalled();
});

// A taken seat is refused by the rules, not by anything this device can see,
// so losing the race is an ordinary step in the search.
test("moves on to the next seat when one is refused", async () => {
  rejectSeats(seat("slot0"), seat("slot1"));
  show();
  await connect();
  expect(tried()).toEqual([seat("slot0"), seat("slot1"), seat("slot2")]);
  expect(goOffline).not.toHaveBeenCalled();
});

test("gives up the socket and says so when every seat is taken", async () => {
  rejectSeats(...Array.from({ length: MAX_SLOTS }, (_, i) => seat(`slot${i}`)));
  show();
  await connect();
  expect(tried()).toHaveLength(MAX_SLOTS);
  expect(goOffline).toHaveBeenCalled();
  expect(screen.queryByText("game screen")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /full/i })).toBeInTheDocument();
});

// Leaving for the landing page has to hand the seat back at once: onDisconnect
// alone would hold it until the socket itself closes.
test("frees its seat and reconnects the app on the way out", async () => {
  const { unmount } = show();
  await connect();
  await act(async () => unmount());
  const cancelled = onDisconnect.mock.results.at(-1).value;
  expect(cancelled.cancel).toHaveBeenCalled();
  expect(remove).toHaveBeenCalledWith({ path: seat("slot0") });
  expect(goOnline).toHaveBeenCalled();
});

// A phone that was backgrounded long enough loses its socket, and the server
// hands its seat to whoever asks next. Coming back has to ask again.
test("takes a seat again after the socket comes back", async () => {
  show();
  await connect();
  await connect(false);
  await connect();
  expect(tried()).toEqual([seat("slot0"), seat("slot0")]);
});

test("spends no seat until a game is on screen", () => {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<div>landing</div>} />
        <Route path="/game/:gameId" element={<GameSession />} />
      </Routes>
    </MemoryRouter>
  );
  expect(onValue).not.toHaveBeenCalled();
});
