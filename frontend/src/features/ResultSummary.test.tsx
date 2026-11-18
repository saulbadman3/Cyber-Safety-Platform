import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResultSummary } from "./ResultSummary";
import { Result } from "../api";

const result: Result = {
  assessment_id: 7,
  total_score: 70,
  risk_level: "low",
  risk_label: "Низький",
  risk_color: "#18794e",
  categories: [
    { slug: "access", title: "Паролі й доступи", score: 60 },
    { slug: "backups", title: "Резервні копії", score: 80 },
  ],
  weakest_categories: [{ slug: "access", title: "Паролі й доступи", score: 60 }],
};

describe("ResultSummary", () => {
  it("shows the rating, a textual risk badge and weakest category", () => {
    render(<ResultSummary result={result} />);
    expect(screen.getByText("70")).toBeInTheDocument();
    expect(screen.getByText("Низький")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Паролі й доступи" })).toBeInTheDocument();
  });
});
