import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { ErrorNoticeToast } from "./ErrorNoticeToast";

describe("ErrorNoticeToast", () => {
  test("renders title and body when open", () => {
    render(
      <ErrorNoticeToast
        open
        title="エラーが発生しました"
        body="再読み込みしてください"
      />,
    );

    expect(screen.getByText("エラーが発生しました")).toBeInTheDocument();
    expect(screen.getByText("再読み込みしてください")).toBeInTheDocument();
  });

  test("does not render when closed", () => {
    render(<ErrorNoticeToast open={false} title="hidden" />);

    expect(screen.queryByText("hidden")).not.toBeInTheDocument();
  });

  test("fires action callback", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <ErrorNoticeToast
        open
        title="再試行"
        actionLabel="再読み込み"
        onAction={onAction}
      />,
    );

    await user.click(screen.getByRole("button", { name: "再読み込み" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
