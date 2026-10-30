import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server.node";
import { getWaterQuality } from "@/lib/waterQuality";
import type { PondSurfaceStatus } from "./PondSurface";
import OceanExperience from "./OceanExperience";

jest.mock("@/lib/waterQuality", () => ({ getWaterQuality: jest.fn(() => "low") }));
jest.mock("./PondSurface", () => () => null);
jest.mock("next/dynamic", () => () => function MockSurface({ dateMs, onStatusChange }: {
  dateMs: number;
  onStatusChange: (status: PondSurfaceStatus) => void;
}) {
  return <div data-testid="surface" data-date={dateMs}>
    <button onClick={() => onStatusChange("active")}>First live frame</button>
    <button onClick={() => onStatusChange("fallback")}>Graphics unavailable</button>
  </div>;
});

const props = {
  stageId: "water-page",
  surfaceClassName: "surface",
  fallback: <div data-testid="poster">Still water</div>,
};

describe("ocean startup", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-22T14:30:00Z"));
    jest.mocked(getWaterQuality).mockReturnValue("low");
    jest.spyOn(window, "requestAnimationFrame").mockImplementation(callback =>
      window.setTimeout(() => callback(performance.now()), 16));
    jest.spyOn(window, "cancelAnimationFrame").mockImplementation(id => window.clearTimeout(id));
  });
  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("does not include a daytime poster or default clock in the initial HTML", () => {
    const markup = renderToStaticMarkup(<OceanExperience {...props} />);
    expect(markup).not.toContain("Still water");
    expect(markup).not.toContain("Time of day");
    expect(markup).not.toContain("20:00");
  });

  it("starts the live scene at the current time and reveals its clock after the first frame", async () => {
    render(<OceanExperience {...props} />);
    expect(screen.queryByTestId("poster")).not.toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    await act(async () => { await jest.advanceTimersByTimeAsync(40); });
    expect(screen.getByTestId("surface")).toHaveAttribute("data-date", String(Date.parse("2026-10-22T14:30:00Z")));
    fireEvent.click(screen.getByText("First live frame"));
    expect(screen.getByRole("slider")).toBeInTheDocument();
    expect(screen.queryByTestId("poster")).not.toBeInTheDocument();
  });

  it("shows the still image only when graphics fail and removes it on recovery", async () => {
    render(<OceanExperience {...props} />);
    await act(async () => { await jest.advanceTimersByTimeAsync(40); });
    fireEvent.click(screen.getByText("Graphics unavailable"));
    expect(screen.getByTestId("poster")).toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("First live frame"));
    expect(screen.queryByTestId("poster")).not.toBeInTheDocument();
  });

  it("keeps static devices on the still image without a live clock or renderer", async () => {
    jest.mocked(getWaterQuality).mockReturnValue("static");
    render(<OceanExperience {...props} />);
    await act(async () => { await jest.advanceTimersByTimeAsync(40); });
    expect(screen.getByTestId("poster")).toBeInTheDocument();
    expect(screen.queryByTestId("surface")).not.toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });
});
