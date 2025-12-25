import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { CheckInDialog } from "./CheckInDialog";

afterEach(() => {
  cleanup();
});

describe("CheckInDialog", () => {
  test("renders title and body when open", () => {
    render(
      <CheckInDialog
        open
        title="メモした？"
        body="外部のメモに1行でOK"
        onDone={() => {}}
        onSkip={() => {}}
      />,
    );

    expect(screen.getByText("メモした？")).toBeInTheDocument();
    expect(screen.getByText("外部のメモに1行でOK")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
  });

  test("supports keyboard shortcuts for done/skip", async () => {
    const onDone = vi.fn();
    const onSkip = vi.fn();
    const user = userEvent.setup();

    render(<CheckInDialog open title="確認" onDone={onDone} onSkip={onSkip} />);

    await user.keyboard("{Enter}");
    await user.keyboard("s");

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
