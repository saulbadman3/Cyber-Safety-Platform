import { Check, ChevronLeft, ChevronRight, CircleHelp } from "lucide-react";
import { Answer, Question } from "../api";
import { uk } from "../i18n/uk";

const answerOrder: Answer[] = ["yes", "partial", "no", "unknown"];
const labels: Record<Answer, string> = {
  yes: uk.yes,
  partial: uk.partial,
  no: uk.no,
  unknown: uk.unknown,
};

export function restoreDraftState(
  currentQuestion: number,
  answers: Record<string, Answer>,
  total: number,
) {
  return {
    index: Math.max(0, Math.min(currentQuestion, total - 1)),
    answers,
  };
}

export function AssessmentQuestion({
  question,
  index,
  total,
  selected,
  saving = false,
  error,
  onAnswer,
  onBack,
  onNext,
  isLast,
  canGoBack = true,
}: {
  question: Question;
  index: number;
  total: number;
  selected?: Answer;
  saving?: boolean;
  error?: string;
  onAnswer: (answer: Answer) => void;
  onBack: () => void;
  onNext: () => void;
  isLast: boolean;
  canGoBack?: boolean;
}) {
  const current = index + 1;
  const progress = Math.round((current / total) * 100);
  return (
    <section className="card mx-auto max-w-3xl" aria-labelledby="question-title">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <span className="eyebrow">{question.category.title}</span>
        <span className="text-sm font-semibold text-muted">{uk.questionOf.replace("{current}", String(current)).replace("{total}", String(total))}</span>
      </div>
      <div
        role="progressbar"
        aria-label={uk.progress}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-valuetext={uk.questionOf.replace("{current}", String(current)).replace("{total}", String(total))}
        className="mb-8 h-2 overflow-hidden rounded-full bg-brandSoft"
      >
        <div className="h-full rounded-full bg-brand transition-all" style={{ width: progress + "%" }} />
      </div>
      <h2 id="question-title" className="text-xl font-bold leading-snug text-ink sm:text-2xl">{question.text}</h2>
      <fieldset className="mt-6">
        <legend className="sr-only">{uk.questionOptions}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {answerOrder.map((answer) => (
            <button
              key={answer}
              type="button"
              aria-pressed={selected === answer}
              className={"flex min-h-14 items-center justify-between rounded-2xl border px-4 py-3 text-left font-semibold transition " +
                (selected === answer ? "border-brand bg-brandSoft text-brand" : "border-line bg-white hover:border-brand")}
              onClick={() => onAnswer(answer)}
            >
              <span>{labels[answer]}</span>
              {selected === answer && <Check size={18} aria-hidden="true" />}
            </button>
          ))}
        </div>
      </fieldset>
      {selected === "unknown" && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-warning" aria-live="polite">{uk.knowledgeGap}</p>}
      <details className="mt-5 rounded-2xl border border-line bg-white p-4">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-ink">
          <CircleHelp size={18} aria-hidden="true" />{uk.why}
        </summary>
        <p className="mt-3 text-sm leading-6 text-muted">{question.hint}</p>
      </details>
      {error && <p className="mt-4 text-sm font-semibold text-danger" role="alert">{error}</p>}
      <div className="mt-7 flex flex-wrap justify-between gap-3">
        <button type="button" className="button-secondary" onClick={onBack} disabled={!canGoBack}>
          <ChevronLeft size={18} aria-hidden="true" />{uk.back}
        </button>
        <button type="button" className="button-primary" onClick={onNext} disabled={!selected || saving}>
          {saving ? uk.saving : isLast ? uk.finish : uk.next}
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
      <p className="mt-4 flex items-center gap-2 text-xs text-muted" aria-live="polite">
        <Check size={14} aria-hidden="true" />{saving ? uk.saving : uk.savedAt}
      </p>
    </section>
  );
}
