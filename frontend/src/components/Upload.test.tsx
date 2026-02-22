import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { expect, test, vi, afterEach, beforeEach } from "vitest";
import Upload from "./Upload";

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
});

test("renders drop zone text", () => {
  render(<Upload onUpload={() => {}} />);
  expect(screen.getByText(/drop a match file/i)).not.toBeNull();
});

test("uploading .mat file calls onUpload with match ID", async () => {
  const onUpload = vi.fn();

  vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    new Response(JSON.stringify({ matchID: "abc123", status: "analyzing" }), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    }),
  );

  const { container } = render(<Upload onUpload={onUpload} />);

  const file = new File(["; mat data"], "game.mat", {
    type: "application/octet-stream",
  });

  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });

  await waitFor(() => expect(onUpload).toHaveBeenCalledWith("abc123", 2));
});

test("shows error for server failure", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    new Response("something went wrong", { status: 500 }),
  );

  const { container } = render(<Upload onUpload={() => {}} />);

  const file = new File(["; mat data"], "game.mat", {
    type: "application/octet-stream",
  });

  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });

  await waitFor(() =>
    expect(screen.getByTestId("upload-error").textContent).toBe(
      "something went wrong",
    ),
  );
});

test("shows error for unsupported files", async () => {
  const { container } = render(<Upload onUpload={() => {}} />);

  const file = new File(["data"], "game.pdf", {
    type: "application/pdf",
  });

  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });

  await waitFor(() =>
    expect(screen.getByTestId("upload-error").textContent).toBe(
      "Unsupported file type",
    ),
  );
});
