import { renderHook, act } from "@testing-library/react";
import { useLeavingBanner, BANNER_SLIDE_MS } from "./banners";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const showing = (value) =>
  renderHook(({ v }) => useLeavingBanner(v), { initialProps: { v: value } });

test("holds the bar for the length of the slide once its reason is gone", () => {
  const { result, rerender } = showing("news");
  rerender({ v: null });

  expect(result.current[0]).toBe("news");
  expect(result.current[1]).toMatch(/banner-leaving/);

  act(() => jest.advanceTimersByTime(BANNER_SLIDE_MS));

  expect(result.current[0]).toBe(null);
});

// The button on the bar is the player answering it. Sliding away afterwards
// would leave the answer on screen after it was given.
test("drops the bar at once when its own button dismisses it", () => {
  const { result } = showing("news");

  act(() => result.current[2]());

  expect(result.current[0]).toBe(null);
});

// The write clearing the bar takes a round trip through the database, and any
// snapshot arriving meanwhile still carries it.
test("keeps a dismissed bar off screen while its reason lingers", () => {
  const { result, rerender } = showing("news");

  act(() => result.current[2]());
  rerender({ v: "news" });

  expect(result.current[0]).toBe(null);
});
