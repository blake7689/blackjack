import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ErrorBoundary from "../components/ErrorBoundary/ErrorBoundary";

function Boom() {
  throw new Error("render failed");
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ErrorBoundary", () => {
  it("renders its children when nothing throws", () => {
    render(<ErrorBoundary><p>fine</p></ErrorBoundary>);
    expect(screen.getByText("fine")).toBeTruthy();
    expect(screen.queryByText("Can't reach the table")).toBeNull();
  });

  it("shows the crash screen instead of a blank page when a child throws, and logs the error (L2-13: not the connection wording)", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByRole("heading", { level: 1, name: "Something went wrong" })).toBeTruthy();
    expect(screen.getByText("The table hit an error. Reload to keep playing; your balance is safe on your account.")).toBeTruthy();
    expect(screen.queryByText(/Can't reach the table|connection/)).toBeNull();
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: "render failed" }));
  });

  it("Reload reloads the page and Home goes to / with a full load", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi.fn();
    const assign = vi.fn();
    vi.stubGlobal("location", { reload, assign });
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("link", { name: "Home" }));
    expect(assign).toHaveBeenCalledWith("/");
  });
});
