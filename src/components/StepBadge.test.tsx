import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { StepBadge } from "./StepBadge";

describe("StepBadge", () => {
  test("renders label text", () => {
    render(<StepBadge label="集中" />);

    expect(screen.getByText("集中")).toBeInTheDocument();
  });

  test("applies note tone class", () => {
    render(<StepBadge label="メモ" tone="note" />);

    expect(screen.getByText("メモ")).toHaveClass("timer-view__badge--note");
  });
});
