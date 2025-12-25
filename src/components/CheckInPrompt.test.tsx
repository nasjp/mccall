import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { CheckInPrompt } from "./CheckInPrompt";

afterEach(() => {
  cleanup();
});

describe("CheckInPrompt", () => {
  test("renders and triggers actions", async () => {
    const onDone = vi.fn();
    const onSkip = vi.fn();
    const user = userEvent.setup();

    render(
      <CheckInPrompt
        open
        title="チェックイン"
        body="続けてもOK"
        onDone={onDone}
        onSkip={onSkip}
      />,
    );

    expect(screen.getByText("チェックイン")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Done" }));
    await user.click(screen.getByRole("button", { name: "Skip" }));

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
