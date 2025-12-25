import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { TimerDisplay } from "./TimerDisplay";

describe("TimerDisplay", () => {
  test("formats remaining seconds with mm:ss", () => {
    render(<TimerDisplay remainingSeconds={90} />);

    expect(screen.getByText("1:30")).toBeInTheDocument();
    expect(screen.getByText("残り1分30秒")).toBeInTheDocument();
  });

  test("announces seconds when under a minute", () => {
    render(<TimerDisplay remainingSeconds={45} />);

    expect(screen.getByText("0:45")).toBeInTheDocument();
    expect(screen.getByText("残り45秒")).toBeInTheDocument();
  });
});
