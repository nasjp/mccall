import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { StepNotificationToast } from "./StepNotificationToast";

describe("StepNotificationToast", () => {
  test("does not render when closed", () => {
    render(<StepNotificationToast open={false} title="通知" />);
    expect(screen.queryByText("通知")).not.toBeInTheDocument();
  });

  test("renders title and body when open", () => {
    render(
      <StepNotificationToast open title="次のステップ" body="深呼吸して開始" />,
    );
    expect(screen.getByText("次のステップ")).toBeInTheDocument();
    expect(screen.getByText("深呼吸して開始")).toBeInTheDocument();
  });
});
