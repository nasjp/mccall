type InstructionTextProps = {
  text: string;
};

export const InstructionText = ({ text }: InstructionTextProps) => (
  <p className="timer-view__instruction">{text}</p>
);
