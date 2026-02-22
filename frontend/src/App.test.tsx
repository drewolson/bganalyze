import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import App from "./App";

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith("/api/history")) {
      return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("not found", { status: 404 });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("renders upload drop zone in idle state", async () => {
  render(<App />);
  await waitFor(() => {
    expect(screen.getByTestId("drop-zone")).not.toBeNull();
  });
  expect(screen.getByText(/drop a match file/i)).not.toBeNull();
});

test("renders BGAnalyze heading in idle state", async () => {
  render(<App />);
  await waitFor(() => {
    expect(screen.getAllByText("BGAnalyze").length).toBeGreaterThanOrEqual(1);
  });
});
