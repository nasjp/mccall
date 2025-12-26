import { memo } from "react";

type InstructionTextProps = {
  text: string;
};

export const InstructionText = memo(({ text }: InstructionTextProps) => (
  <p className="timer-view__instruction">{text}</p>
));

InstructionText.displayName = "InstructionText";
