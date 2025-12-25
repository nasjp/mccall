import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { InstructionText } from "./InstructionText";

afterEach(() => {
  cleanup();
});

describe("InstructionText", () => {
  test("renders instruction text", () => {
    render(<InstructionText text="集中して作業する" />);

    const text = screen.getByText("集中して作業する");
    expect(text).toBeInTheDocument();
    expect(text).toHaveClass("timer-view__instruction");
  });
});
