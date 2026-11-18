import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AssessmentQuestion, restoreDraftState } from "./AssessmentQuestion";
import { Question } from "../api";

const question: Question = {
  id: 5,
  slug: "backup",
  text: "Чи перевіряли ви резервну копію?",
  hint: "Неперевірена копія може не відновитися.",
  position: 5,
  weight: 4,
  category: { slug: "backups", title: "Резервні копії" },
  recommendation: { slug: "restore-test", title: "Перевірити відновлення", description: "Тест" },
};

describe("AssessmentQuestion", () => {
  it("shows category, progress, back and answer controls", () => {
    const onBack = vi.fn();
    render(<AssessmentQuestion question={question} index={4} total={14} selected="unknown" saving={false}
      onAnswer={vi.fn()} onBack={onBack} onNext={vi.fn()} isLast={false} />);
    expect(screen.getByText("Резервні копії")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "5");
    expect(screen.getByRole("button", { name: "Назад" })).toBeEnabled();
    expect(screen.getByText(/прогалина у знаннях/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Далі" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("restores saved answers and clamps resume progress to the last question", () => {
    const state = restoreDraftState(8, { "5": "unknown" }, 14);
    expect(state.index).toBe(8);
    expect(state.answers["5"]).toBe("unknown");
    expect(restoreDraftState(14, {}, 14).index).toBe(13);
  });

  it("disables next until an answer exists and supports back navigation", () => {
    const onBack = vi.fn();
    const onAnswer = vi.fn();
    render(<AssessmentQuestion question={question} index={0} total={14} selected={undefined}
      onAnswer={onAnswer} onBack={onBack} onNext={vi.fn()} isLast={false} canGoBack={false} />);
    expect(screen.getByRole("button", { name: "Далі" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Назад" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Так" }));
    expect(onAnswer).toHaveBeenCalledWith("yes");
  });
});
