import { useEffect, useState } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Check, CircleAlert, CircleCheck, Printer, ShieldCheck } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import {
  ActionItem, Answer, Assessment, CategoryScore, formatDate, formatMoney, api, ApiError,
  Lesson, LossScenario, Questionnaire, QuizCard, Result,
} from "./api";
import { AssessmentQuestion, restoreDraftState } from "./features/AssessmentQuestion";
import { ResultSummary } from "./features/ResultSummary";
import { uk } from "./i18n/uk";
import { Card, EmptyState, ErrorState, LinkButton, LoadingState, PageShell, RiskBadge, SectionHeading } from "./components";

type User = { id: number; email: string };
type AssessmentSummary = {
  id: number; company_name: string; status: "draft" | "completed"; created_at: string;
  completed_at?: string | null; total_score?: number | null; risk_level?: "high" | "medium" | "low" | null;
  risk_label?: string | null; total_ale: string; action_done: number; action_total: number;
};
type DashboardData = {
  assessments: AssessmentSummary[];
  history_enabled: boolean;
  latest_categories: CategoryScore[];
  total_ale: string;
  action_progress: { done: number; total: number; percent: number };
  comparison: { current: AssessmentSummary | null; previous: AssessmentSummary | null };
};
type LossData = { items: LossScenario[]; total_ale: string };
type ProfileInput = {
  company_name: string; sector: string; employee_range: string;
  stores_customer_data: boolean; uses_cloud: boolean;
};

const EMPLOYEE_VALUES = ["1-5", "6-20", "21-50", "51-100", "101+"] as const;

export function ProtectedRoute() {
  const auth = useQuery<User>({ queryKey: ["me"], queryFn: () => api("/auth/me") });
  const location = useLocation();
  if (auth.isPending) return <LoadingState />;
  if (auth.isError || !auth.data) {
    return <Navigate to={"/login?next=" + encodeURIComponent(location.pathname)} replace />;
  }
  return <Outlet />;
}

export function LandingPage() {
  const auth = useQuery<User>({ queryKey: ["me"], queryFn: () => api("/auth/me") });
  const startLink = auth.data ? "/assessment" : "/register?next=/assessment";
  return (
    <PageShell className="pb-16">
      <section className="grid items-center gap-10 py-8 sm:py-14 md:grid-cols-[1.2fr_.8fr]">
        <div>
          <p className="eyebrow">{uk.heroLabel}</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight tracking-tight text-ink sm:text-6xl">{uk.tagline}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted">{uk.heroText}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link className="button-primary" to={startLink}>{uk.startAudit}<ArrowRight size={18} /></Link>
            {auth.data ? <Link className="button-secondary" to="/dashboard">{uk.openDashboard}</Link> : <Link className="button-secondary" to="/login">{uk.signIn}</Link>}
          </div>
          <p className="mt-4 text-sm text-muted">{uk.heroNote}</p>
        </div>
        <div className="relative mx-auto grid h-72 w-full max-w-md place-items-center rounded-[2.5rem] bg-gradient-to-br from-brand to-[#164e63] p-8 text-white shadow-card sm:h-96">
          <div className="absolute right-8 top-8 h-28 w-28 rounded-full border border-white/25" />
          <div className="absolute bottom-10 left-8 h-16 w-16 rounded-2xl border border-white/20" />
          <div className="relative grid h-40 w-40 place-items-center rounded-[2.25rem] border border-white/30 bg-white/10 shadow-xl backdrop-blur">
            <ShieldCheck size={82} strokeWidth={1.4} aria-hidden="true" />
          </div>
          <div className="absolute bottom-8 right-7 rounded-2xl bg-white px-4 py-3 text-ink shadow-lg">
            <p className="text-xs font-bold uppercase tracking-wide text-brand">{uk.overall}</p>
            <p className="mt-1 text-2xl font-bold">0–100</p>
          </div>
        </div>
      </section>
      <section className="py-10">
        <p className="eyebrow">{uk.howTitle}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {[
            { number: "01", title: uk.stepCheck, body: uk.stepCheckText },
            { number: "02", title: uk.stepScore, body: uk.stepScoreText },
            { number: "03", title: uk.stepProtect, body: uk.stepProtectText },
          ].map((item) => (
            <Card key={item.number}>
              <p className="text-sm font-bold tracking-widest text-brand">{item.number}</p>
              <h2 className="mt-3 text-xl font-bold">{item.title}</h2>
              <p className="mt-2 leading-6 text-muted">{item.body}</p>
            </Card>
          ))}
        </div>
      </section>
      <section className="py-10">
        <div className="max-w-2xl">
          <p className="eyebrow">{uk.featuresTitle}</p>
          <p className="mt-3 text-lg leading-7 text-muted">{uk.featuresText}</p>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {[uk.featureAudit, uk.featureLoss, uk.featurePlan, uk.featureLearning].map((item) => (
            <div key={item} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 font-semibold">
              <CircleCheck className="shrink-0 text-success" size={20} aria-hidden="true" />{item}
            </div>
          ))}
        </div>
      </section>
    </PageShell>
  );
}

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const search = new URLSearchParams(location.search);
  const nextPath = search.get("next") || "/dashboard";
  const schema = z.object({
    email: z.string().trim().email(uk.invalidEmail),
    password: z.string().min(mode === "register" ? 10 : 1, mode === "register" ? uk.passwordTooShort : uk.fieldRequired).max(128),
  });
  type FormValues = z.infer<typeof schema>;
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });
  const [error, setError] = useState("");
  const submit = async (values: FormValues) => {
    setError("");
    try {
      const result = await api<User>("/auth/" + mode, {
        method: "POST",
        body: JSON.stringify(values),
      });
      queryClient.setQueryData(["me"], result);
      navigate(nextPath, { replace: true });
    } catch {
      setError(mode === "login" ? uk.authError : uk.registrationError);
    }
  };
  return (
    <PageShell className="grid min-h-[78vh] place-items-center">
      <Card className="w-full max-w-md">
        <div className="mb-6 grid h-12 w-12 place-items-center rounded-2xl bg-brandSoft text-brand"><ShieldCheck size={25} /></div>
        <p className="eyebrow">{uk.brand}</p>
        <h1 className="mt-2 text-2xl font-bold">{mode === "login" ? uk.loginTitle : uk.registerTitle}</h1>
        <form onSubmit={handleSubmit(submit)} className="mt-6 space-y-4" noValidate>
          <div>
            <label className="label" htmlFor="email">{uk.email}</label>
            <input id="email" type="email" autoComplete="email" className="field" aria-invalid={Boolean(errors.email)} {...register("email")} />
            {errors.email && <p className="mt-1 text-sm text-danger" role="alert">{errors.email.message}</p>}
          </div>
          <div>
            <label className="label" htmlFor="password">{uk.password}</label>
            <input id="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} className="field" aria-invalid={Boolean(errors.password)} {...register("password")} />
            {mode === "register" && <p className="mt-1 text-xs text-muted">{uk.passwordHint}</p>}
            {errors.password && <p className="mt-1 text-sm text-danger" role="alert">{errors.password.message}</p>}
          </div>
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-danger">{error}</p>}
          <button className="button-primary w-full" type="submit" disabled={isSubmitting}>{isSubmitting ? uk.loading : mode === "login" ? uk.submitLogin : uk.submitRegister}</button>
        </form>
        <p className="mt-5 text-center text-sm text-muted">
          {mode === "login" ? uk.switchToRegister : uk.switchToLogin}{" "}
          <Link className="font-semibold text-brand underline underline-offset-2" to={mode === "login" ? "/register" : "/login"}>
            {mode === "login" ? uk.submitRegister : uk.submitLogin}
          </Link>
        </p>
      </Card>
    </PageShell>
  );
}

export function AssessmentPage() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const requestedDraft = searchParams.get("draft");
  const [showProfile, setShowProfile] = useState(false);
  const [started, setStarted] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [error, setError] = useState("");
  const [draftError, setDraftError] = useState("");
  const [draftLoading, setDraftLoading] = useState(false);
  const questionnaireQuery = useQuery<Questionnaire>({ queryKey: ["questionnaire"], queryFn: () => api<Questionnaire>("/questionnaire") });
  const auditsQuery = useQuery<{ items: AssessmentSummary[] }>({ queryKey: ["assessments"], queryFn: () => api<{ items: AssessmentSummary[] }>("/assessments?page=1&page_size=10") });
  const schema = z.object({
    company_name: z.string().trim().min(1, uk.fieldRequired).max(160),
    sector: z.string().trim().min(1, uk.fieldRequired).max(100),
    employee_range: z.enum(EMPLOYEE_VALUES),
    stores_customer_data: z.boolean(),
    uses_cloud: z.boolean(),
  });
  type ProfileValues = z.infer<typeof schema>;
  const { register, handleSubmit, formState: { errors } } = useForm<ProfileValues>({
    resolver: zodResolver(schema),
    defaultValues: { company_name: "", sector: "", employee_range: "1-5", stores_customer_data: false, uses_cloud: false },
  });
  const createAudit = useMutation({
    mutationFn: (profile: ProfileInput) => api<{ id: number }>("/assessments", { method: "POST", body: JSON.stringify(profile) }),
    onSuccess: (created) => {
      setActiveId(created.id);
      setAnswers({});
      setIndex(0);
      setStarted(true);
      setError("");
      queryClient.invalidateQueries({ queryKey: ["assessments"] });
    },
    onError: () => setError(uk.saveFailed),
  });
  const saveAnswer = useMutation({
    mutationFn: (payload: { assessmentId: number; questionId: number; value: Answer; currentQuestion: number }) =>
      api("/assessments/" + payload.assessmentId + "/answers", {
        method: "PUT",
        body: JSON.stringify({
          answers: [{ question_id: payload.questionId, value: payload.value }],
          current_question: payload.currentQuestion,
        }),
      }),
    onError: () => setError(uk.saveFailed),
    onSuccess: () => setError(""),
  });

  useEffect(() => {
    if (!requestedDraft || !questionnaireQuery.data || draftLoading || started) return;
    setDraftLoading(true);
    api<Assessment & ProfileInput>("/assessments/" + requestedDraft)
      .then((assessment) => {
        if (assessment.status === "completed") {
          window.location.assign("/results/" + assessment.id);
          return;
        }
        setActiveId(assessment.id);
        const restored = restoreDraftState(
          assessment.current_question || 0,
          assessment.answers || {},
          questionnaireQuery.data!.questions.length,
        );
        setAnswers(restored.answers);
        setIndex(restored.index);
        resetProfile(assessment);
        setStarted(true);
      })
      .catch(() => setDraftError(uk.draftLoadError))
      .finally(() => setDraftLoading(false));
  }, [requestedDraft, questionnaireQuery.data, draftLoading, started]);

  const resetProfile = (assessment: Partial<ProfileInput>) => {
    // The form is reset after it has mounted; the selected draft remains server-owned.
    profileReset(assessment);
  };
  const profileReset = (assessment: Partial<ProfileInput>) => {
    const keys = Object.keys(assessment);
    if (keys.length) {
      Object.entries(assessment).forEach(([key, value]) => {
        const field = document.getElementById(key) as HTMLInputElement | HTMLSelectElement | null;
        if (field && typeof value === "string") field.value = value;
        if (field && typeof value === "boolean") (field as HTMLInputElement).checked = value;
      });
    }
  };

  if (questionnaireQuery.isLoading || auditsQuery.isLoading || draftLoading) return <PageShell><LoadingState /></PageShell>;
  if (questionnaireQuery.isError || auditsQuery.isError) return <PageShell><ErrorState onRetry={() => { questionnaireQuery.refetch(); auditsQuery.refetch(); }} /></PageShell>;
  const questionnaire = questionnaireQuery.data;
  if (!questionnaire || questionnaire.questions.length !== 14) return <PageShell><ErrorState message={uk.missingQuestionnaire} /></PageShell>;
  const draft = auditsQuery.data?.items.find((item) => item.status === "draft");
  const question = questionnaire.questions[index];
  const selected = question ? answers[String(question.id)] : undefined;

  const answerQuestion = (value: Answer) => {
    if (!activeId || !question) return;
    setAnswers((previous) => ({ ...previous, [String(question.id)]: value }));
    setError("");
    saveAnswer.mutate({
      assessmentId: activeId,
      questionId: question.id,
      value,
      currentQuestion: Math.min(index + 1, questionnaire.questions.length),
    });
  };
  const nextQuestion = async () => {
    if (!activeId || !question) return;
    if (!selected) {
      setError(uk.chooseAnswer);
      return;
    }
    if (saveAnswer.isPending) return;
    if (saveAnswer.isError) {
      try {
        await saveAnswer.mutateAsync({
          assessmentId: activeId,
          questionId: question.id,
          value: selected,
          currentQuestion: Math.min(index + 1, questionnaire.questions.length),
        });
      } catch {
        return;
      }
    }
    if (index < questionnaire.questions.length - 1) {
      setIndex((value) => value + 1);
      setError("");
      return;
    }
    try {
      await api("/assessments/" + activeId + "/complete", { method: "POST" });
      queryClient.invalidateQueries({ queryKey: ["assessments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      window.location.assign("/results/" + activeId);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : uk.saveFailed);
    }
  };

  return (
    <PageShell>
      {draftError && <ErrorState message={draftError} />}
      {!started && draft && !showProfile && !requestedDraft ? (
        <div className="mx-auto max-w-2xl">
          <SectionHeading eyebrow={uk.startAudit} title={uk.businessFormTitle} intro={uk.draftPrompt} />
          <Card>
            <p className="font-semibold">{uk.draftCompany}: {draft.company_name}</p>
            <p className="mt-1 text-sm text-muted">{uk.yourProgress}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button className="button-primary" onClick={() => { window.location.assign("/assessment?draft=" + draft.id); }}>{uk.continueAudit}</button>
              <button className="button-secondary" onClick={() => setShowProfile(true)}>{uk.newAudit}</button>
            </div>
          </Card>
        </div>
      ) : !started ? (
        <div className="mx-auto max-w-2xl">
          <SectionHeading eyebrow={uk.startAudit} title={uk.businessFormTitle} intro={uk.businessFormIntro} />
          <Card>
            <form className="space-y-4" onSubmit={handleSubmit((profile) => createAudit.mutate(profile))} noValidate>
              <div>
                <label className="label" htmlFor="company_name">{uk.companyName}</label>
                <input id="company_name" className="field" autoComplete="organization" aria-invalid={Boolean(errors.company_name)} {...register("company_name")} />
                {errors.company_name && <p className="mt-1 text-sm text-danger">{uk.fieldRequired}</p>}
              </div>
              <div>
                <label className="label" htmlFor="sector">{uk.sector}</label>
                <input id="sector" className="field" placeholder={uk.sectorPlaceholder} {...register("sector")} />
                {errors.sector && <p className="mt-1 text-sm text-danger">{uk.fieldRequired}</p>}
              </div>
              <div>
                <label className="label" htmlFor="employee_range">{uk.employeeRangeLabel}</label>
                <select id="employee_range" className="field" {...register("employee_range")}>
                  <option value="1-5">1–5 {uk.peopleCount}</option>
                  <option value="6-20">6–20 {uk.peopleCount}</option>
                  <option value="21-50">21–50 {uk.peopleCount}</option>
                  <option value="51-100">51–100 {uk.peopleCount}</option>
                  <option value="101+">101+ {uk.peopleCount}</option>
                </select>
              </div>
              <label className="flex items-start gap-3 rounded-xl border border-line p-3">
                <input type="checkbox" className="mt-1 accent-brand" {...register("stores_customer_data")} />
                <span><span className="block font-semibold">{uk.customersData}</span><span className="text-sm text-muted">{uk.customersDataHint}</span></span>
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-line p-3">
                <input type="checkbox" className="mt-1 accent-brand" {...register("uses_cloud")} />
                <span><span className="block font-semibold">{uk.usesCloud}</span><span className="text-sm text-muted">{uk.cloudHint}</span></span>
              </label>
              {error && <p role="alert" className="text-sm text-danger">{error}</p>}
              <button type="submit" className="button-primary w-full" disabled={createAudit.isPending}>
                {createAudit.isPending ? uk.profileSaving : uk.finishProfile}<ArrowRight size={18} />
              </button>
            </form>
          </Card>
        </div>
      ) : question ? (
        <div>
          <SectionHeading eyebrow={uk.company + ": " + (draft?.company_name || uk.companyName)} title={uk.startAudit} />
          <AssessmentQuestion
            question={question}
            index={index}
            total={questionnaire.questions.length}
            selected={selected}
            saving={saveAnswer.isPending}
            error={error}
            onAnswer={answerQuestion}
            onBack={() => { if (index > 0) { setIndex((value) => value - 1); setError(""); } }}
            onNext={() => { void nextQuestion(); }}
            isLast={index === questionnaire.questions.length - 1}
            canGoBack={index > 0}
          />
        </div>
      ) : <LoadingState />}
    </PageShell>
  );
}

export function ResultPage() {
  const { id } = useParams();
  const resultQuery = useQuery<Result>({
    queryKey: ["result", id],
    queryFn: () => api<Result>("/assessments/" + id + "/result"),
    enabled: Boolean(id),
  });
  if (resultQuery.isLoading) return <PageShell><LoadingState /></PageShell>;
  if (resultQuery.isError || !resultQuery.data) return <PageShell><ErrorState message={uk.accessDenied} onRetry={() => resultQuery.refetch()} /></PageShell>;
  return (
    <PageShell>
      <SectionHeading eyebrow={uk.resultTitle} title={uk.resultTitle} intro={uk.pickRisk} />
      <div aria-live="polite"><ResultSummary result={resultQuery.data} /></div>
      <div className="mt-6 flex flex-wrap gap-3">
        <LinkButton to={"/losses/" + id}>{uk.losses}</LinkButton>
        <LinkButton to={"/action-plan/" + id} secondary>{uk.actionPlan}</LinkButton>
        <Link className="button-quiet" to={"/report/" + id}>{uk.report}</Link>
      </div>
    </PageShell>
  );
}

type LossDraft = Record<string, Partial<LossScenario["variants"][number]>>;

export function LossPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<LossDraft>({});
  const [message, setMessage] = useState("");
  const query = useQuery<LossData>({
    queryKey: ["loss", id],
    queryFn: () => api<LossData>("/assessments/" + id + "/loss-estimates"),
    enabled: Boolean(id),
  });
  const save = useMutation({
    mutationFn: async (params: { scenarioId: number; variant: LossScenario["variants"][number]["variant"]; values: LossScenario["variants"][number] }) => {
      const inputs = { av: params.values.av, ef: params.values.ef, aro: params.values.aro };
      await api("/loss/calculate", { method: "POST", body: JSON.stringify(inputs) });
      return api("/assessments/" + id + "/loss-estimates", {
        method: "PUT",
        body: JSON.stringify({ estimates: [{ scenario_id: params.scenarioId, variant: params.variant, ...inputs }] }),
      });
    },
    onSuccess: () => {
      setMessage(uk.savedSuccessfully);
      queryClient.invalidateQueries({ queryKey: ["loss", id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: () => setMessage(uk.saveFailed),
  });
  if (query.isLoading) return <PageShell><LoadingState /></PageShell>;
  if (query.isError || !query.data) return <PageShell><ErrorState onRetry={() => query.refetch()} /></PageShell>;
  const chartData = query.data.items.map((scenario) => ({
    name: scenario.title,
    ale: Number(scenario.variants.find((item) => item.variant === "base")?.ale || 0),
  })).sort((left, right) => right.ale - left.ale);
  const updateDraft = (scenarioId: number, variant: LossScenario["variants"][number]["variant"], field: "av" | "ef" | "aro", value: string) => {
    const key = scenarioId + ":" + variant;
    setDrafts((previous) => ({ ...previous, [key]: { ...previous[key], [field]: value } }));
    setMessage("");
  };
  const valueFor = (scenario: LossScenario, variant: LossScenario["variants"][number]) => ({
    ...variant,
    ...(drafts[scenario.id + ":" + variant.variant] || {}),
  });
  return (
    <PageShell>
      <SectionHeading eyebrow={uk.losses} title={uk.lossTitle} intro={uk.lossIntro} action={<Link className="button-secondary" to={"/report/" + id}>{uk.report}</Link>} />
      <Card className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div><p className="eyebrow">{uk.totalAle}</p><p className="mt-1 text-3xl font-bold">{formatMoney(query.data.total_ale)} <span className="text-base font-medium text-muted">{uk.moneyPerYear}</span></p></div>
        <div className="flex items-center gap-2 text-sm text-muted"><CircleAlert size={18} />{uk.reportDisclaimer}</div>
      </Card>
      <Card className="mb-6">
        <h2 className="text-lg font-bold">{uk.topLosses}</h2>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 12, right: 18 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tickFormatter={(value) => new Intl.NumberFormat("uk-UA").format(value)} />
              <YAxis type="category" dataKey="name" width={145} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value: number) => formatMoney(value)} />
              <Bar dataKey="ale" fill="#0c766e" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <div className="space-y-5">
        {query.data.items.map((scenario) => (
          <Card key={scenario.id}>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div><h2 className="text-xl font-bold">{scenario.title}</h2><p className="mt-1 max-w-3xl text-sm text-muted">{scenario.description}</p></div>
              <details className="max-w-md rounded-xl border border-line px-3 py-2 text-sm">
                <summary className="cursor-pointer font-semibold">{uk.assumptions}</summary>
                <p className="mt-2 leading-6 text-muted">{scenario.assumptions}</p>
                <ul className="mt-2 list-disc pl-5 text-muted">{scenario.sources.map((source) => <li key={source}>{source}</li>)}</ul>
              </details>
            </div>
            <div className="mt-5 grid gap-3 xl:grid-cols-3">
              {scenario.variants.map((variant) => {
                const values = valueFor(scenario, variant);
                return (
                  <div key={variant.variant} className="rounded-2xl border border-line bg-canvas p-4">
                    <h3 className="font-bold">{variant.label}</h3>
                    <div className="mt-3 grid gap-3">
                      <label className="text-xs font-semibold text-muted">{uk.assetValue}
                        <input className="field mt-1" type="number" min="0" step="1000" value={values.av} onChange={(event) => updateDraft(scenario.id, variant.variant, "av", event.target.value)} aria-label={scenario.title + " — " + uk.assetValue} />
                      </label>
                      <label className="text-xs font-semibold text-muted">{uk.exposureFactor}
                        <input className="field mt-1" type="number" min="0" max="1" step="0.01" value={values.ef} onChange={(event) => updateDraft(scenario.id, variant.variant, "ef", event.target.value)} aria-label={scenario.title + " — " + uk.exposureFactor} />
                      </label>
                      <label className="text-xs font-semibold text-muted">{uk.annualRate}
                        <input className="field mt-1" type="number" min="0" step="0.1" value={values.aro} onChange={(event) => updateDraft(scenario.id, variant.variant, "aro", event.target.value)} aria-label={scenario.title + " — " + uk.annualRate} />
                      </label>
                    </div>
                    <div className="mt-4 border-t border-line pt-3 text-sm">
                      <p className="flex justify-between gap-2"><span>{uk.sle}</span><strong>{formatMoney(variant.sle)}</strong></p>
                      <p className="mt-1 flex justify-between gap-2"><span>{uk.ale}</span><strong className="text-brand">{formatMoney(variant.ale)}</strong></p>
                    </div>
                    <button
                      className="button-secondary mt-4 w-full"
                      onClick={() => save.mutate({ scenarioId: scenario.id, variant: variant.variant, values })}
                      disabled={save.isPending}
                    >{save.isPending ? uk.saving : uk.saveEstimate}</button>
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
      {message && <p role="status" aria-live="polite" className={"mt-4 text-sm " + (message === uk.saveFailed ? "text-danger" : "text-success")}>{message}</p>}
      <div className="mt-6"><LinkButton to={"/action-plan/" + id}>{uk.actionPlan}</LinkButton></div>
    </PageShell>
  );
}

export function ActionPlanPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<number, Partial<ActionItem>>>({});
  const [message, setMessage] = useState("");
  const query = useQuery<{ items: ActionItem[] }>({
    queryKey: ["actions", id],
    queryFn: () => api<{ items: ActionItem[] }>("/assessments/" + id + "/action-plan"),
    enabled: Boolean(id),
  });
  const update = useMutation({
    mutationFn: (params: { itemId: number; values: Partial<ActionItem> }) =>
      api("/assessments/" + id + "/action-items/" + params.itemId, { method: "PATCH", body: JSON.stringify(params.values) }),
    onSuccess: () => {
      setMessage(uk.savedSuccessfully);
      queryClient.invalidateQueries({ queryKey: ["actions", id] });
    },
    onError: () => setMessage(uk.saveFailed),
  });
  if (query.isLoading) return <PageShell><LoadingState /></PageShell>;
  if (query.isError || !query.data) return <PageShell><ErrorState onRetry={() => query.refetch()} /></PageShell>;
  if (!query.data.items.length) return <PageShell><SectionHeading title={uk.actionPlan} /><EmptyState text={uk.noActions} /></PageShell>;
  const statusLabel: Record<ActionItem["status"], string> = { todo: uk.statusTodo, in_progress: uk.statusDoing, done: uk.statusDone };
  return (
    <PageShell>
      <SectionHeading eyebrow={uk.resultTitle} title={uk.actionPlan} intro={uk.bestNextStep} action={<Link className="button-secondary" to={"/report/" + id}>{uk.report}</Link>} />
      <div className="space-y-4">
        {query.data.items.map((item) => {
          const values = { ...item, ...(drafts[item.id] || {}) };
          return (
            <Card key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className={"badge " + (item.priority_label === uk.priorityHigh ? "bg-red-50 text-danger" : item.priority_label === uk.priorityMedium ? "bg-amber-50 text-warning" : "bg-emerald-50 text-success")}>{item.priority_label} · {uk.recommendation}</span>
                  <h2 className="mt-3 text-lg font-bold">{item.title}</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{item.description}</p>
                </div>
                <p className="text-sm font-semibold text-brand">{uk.riskReduction}: {item.risk_reduction}%</p>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-xs font-semibold text-muted">{uk.status}
                  <select className="field mt-1" value={values.status} onChange={(event) => setDrafts((previous) => ({ ...previous, [item.id]: { ...previous[item.id], status: event.target.value as ActionItem["status"] } }))}>
                    <option value="todo">{statusLabel.todo}</option>
                    <option value="in_progress">{statusLabel.in_progress}</option>
                    <option value="done">{statusLabel.done}</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-muted">{uk.assignee}
                  <input className="field mt-1" maxLength={120} value={values.assignee} onChange={(event) => setDrafts((previous) => ({ ...previous, [item.id]: { ...previous[item.id], assignee: event.target.value } }))} />
                </label>
                <label className="text-xs font-semibold text-muted">{uk.dueDate}
                  <input className="field mt-1" type="date" value={values.due_date || ""} onChange={(event) => setDrafts((previous) => ({ ...previous, [item.id]: { ...previous[item.id], due_date: event.target.value || null } }))} />
                </label>
                <div className="text-xs font-semibold text-muted">{uk.actionCost}<p className="mt-2 text-sm font-bold text-ink">{formatMoney(item.cost_min)} – {formatMoney(item.cost_max)}</p><p className="mt-1 font-normal">{uk.complexity}: {item.complexity}</p></div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button className="button-primary" onClick={() => update.mutate({ itemId: item.id, values: drafts[item.id] || {} })} disabled={update.isPending}>{update.isPending ? uk.saving : uk.saveChanges}</button>
                <Link className="button-secondary" to={"/lessons/" + item.lesson_slug}>{uk.learnMore}</Link>
              </div>
            </Card>
          );
        })}
      </div>
      {message && <p role="status" aria-live="polite" className="mt-4 text-sm text-muted">{message}</p>}
    </PageShell>
  );
}

export function LessonsPage() {
  const query = useQuery<Lesson[]>({ queryKey: ["lessons"], queryFn: () => api<Lesson[]>("/microlessons") });
  if (query.isLoading) return <PageShell><LoadingState /></PageShell>;
  if (query.isError || !query.data) return <PageShell><ErrorState onRetry={() => query.refetch()} /></PageShell>;
  return (
    <PageShell>
      <SectionHeading eyebrow={uk.navLessons} title={uk.lessonsTitle} intro={uk.learningBlurb} action={<Link className="button-primary" to="/quiz">{uk.startQuiz}</Link>} />
      <div className="grid gap-4 md:grid-cols-2">
        {query.data.map((lesson) => (
          <Card key={lesson.slug} className="flex flex-col">
            <p className="eyebrow">{lesson.category.title}</p>
            <h2 className="mt-2 text-xl font-bold">{lesson.title}</h2>
            <p className="mt-3 flex-1 leading-7 text-muted">{lesson.body}</p>
            <ul className="mt-4 space-y-2 text-sm">{lesson.takeaways.map((takeaway) => <li key={takeaway} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-success" />{takeaway}</li>)}</ul>
            <Link className="button-secondary mt-5 self-start" to={"/lessons/" + lesson.slug}>{uk.learnMore}<ArrowRight size={16} /></Link>
          </Card>
        ))}
      </div>
      <div className="mt-6"><LinkButton to="/quiz">{uk.quizLink}</LinkButton></div>
    </PageShell>
  );
}

export function LessonPage() {
  const { slug } = useParams();
  const query = useQuery<Lesson>({ queryKey: ["lesson", slug], queryFn: () => api<Lesson>("/microlessons/" + slug), enabled: Boolean(slug) });
  if (query.isLoading) return <PageShell><LoadingState /></PageShell>;
  if (query.isError || !query.data) return <PageShell><ErrorState /></PageShell>;
  return (
    <PageShell>
      <SectionHeading eyebrow={query.data.category.title} title={query.data.title} />
      <div className="grid gap-5 md:grid-cols-[1fr_.8fr]">
        <Card><p className="text-lg leading-8">{query.data.body}</p><h2 className="mt-6 font-bold">{uk.lessonTakeaways}</h2><ul className="mt-3 space-y-3">{query.data.takeaways.map((item) => <li className="flex gap-3" key={item}><Check className="mt-0.5 shrink-0 text-success" />{item}</li>)}</ul></Card>
        <Card><h2 className="font-bold">{uk.lessonRecommendations}</h2><ul className="mt-3 space-y-3">{query.data.recommendation_slugs.map((slugItem) => <li key={slugItem}><Link className="font-semibold text-brand underline underline-offset-2" to="/assessment">{slugItem}</Link></li>)}</ul><Link className="button-secondary mt-6" to="/lessons">{uk.back}</Link></Card>
      </div>
    </PageShell>
  );
}

type QuizFeedback = { question_id: number; correct: boolean; is_phishing: boolean; explanation: string };
type QuizResult = { score: number; total: number; completed: boolean; details: QuizFeedback[] };

export function QuizPage() {
  const query = useQuery<QuizCard[]>({ queryKey: ["quiz"], queryFn: () => api<QuizCard[]>("/quiz") });
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, boolean>>({});
  const [feedback, setFeedback] = useState<QuizFeedback | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [error, setError] = useState("");
  const answer = useMutation({
    mutationFn: (payload: { question_id: number; is_phishing: boolean }) =>
      api<QuizResult>("/quiz/submit", { method: "POST", body: JSON.stringify({ answers: [payload] }) }),
    onSuccess: (response) => setFeedback(response.details[0]),
    onError: () => setError(uk.saveFailed),
  });
  const finish = async () => {
    if (!query.data || Object.keys(answers).length !== query.data.length) return;
    try {
      const final = await api<QuizResult>("/quiz/submit", {
        method: "POST",
        body: JSON.stringify({
          answers: query.data.map((item) => ({ question_id: item.id, is_phishing: answers[item.id] })),
        }),
      });
      setResult(final);
    } catch {
      setError(uk.saveFailed);
    }
  };
  if (query.isLoading) return <PageShell><LoadingState /></PageShell>;
  if (query.isError || !query.data || query.data.length !== 12) return <PageShell><ErrorState onRetry={() => query.refetch()} /></PageShell>;
  if (result) return (
    <PageShell>
      <Card className="mx-auto max-w-2xl text-center">
        <CircleCheck size={42} className="mx-auto text-success" />
        <p className="eyebrow mt-4">{uk.quizComplete}</p>
        <h1 className="mt-2 text-3xl font-bold">{uk.quizResult}</h1>
        <p className="mt-4 text-5xl font-bold text-brand">{result.score} / {result.total}</p>
        <div className="mt-6 space-y-3 text-left">{result.details.map((detail) => <div className="rounded-xl border border-line p-3" key={detail.question_id}><p className="font-semibold">{detail.correct ? uk.feedbackCorrect : uk.feedbackIncorrect}</p><p className="mt-1 text-sm text-muted">{detail.explanation}</p></div>)}</div>
        <Link className="button-primary mt-6" to="/dashboard">{uk.openDashboard}</Link>
      </Card>
    </PageShell>
  );
  const current = query.data[index];
  const selectAnswer = (isPhishing: boolean) => {
    if (!current || feedback || answer.isPending) return;
    setAnswers((previous) => ({ ...previous, [current.id]: isPhishing }));
    setError("");
    answer.mutate({ question_id: current.id, is_phishing: isPhishing });
  };
  const next = () => {
    if (index === query.data!.length - 1) {
      void finish();
      return;
    }
    setIndex((value) => value + 1);
    setFeedback(null);
    answer.reset();
  };
  return (
    <PageShell>
      <SectionHeading eyebrow={uk.navQuiz} title={uk.quizTitle} intro={uk.quizIntro} />
      <Card className="mx-auto max-w-3xl">
        <div className="flex justify-between gap-3 text-sm text-muted"><span>{uk.emailCard}</span><span>{uk.quizQuestion.replace("{current}", String(index + 1)).replace("{total}", "12")}</span></div>
        <div role="progressbar" aria-label={uk.progress} aria-valuemin={0} aria-valuemax={12} aria-valuenow={index + 1} className="mt-3 h-2 rounded-full bg-brandSoft"><div className="h-full rounded-full bg-brand" style={{ width: ((index + 1) / 12 * 100) + "%" }} /></div>
        <article className="mt-6 rounded-2xl border border-line bg-canvas p-5" aria-label={uk.emailCard}>
          <p className="text-sm text-muted">{current.sender}</p>
          <h2 className="mt-2 text-lg font-bold">{current.subject}</h2>
          <p className="mt-4 leading-7">{current.body}</p>
        </article>
        {!feedback ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button className="button-secondary" onClick={() => selectAnswer(true)} disabled={answer.isPending}>{uk.answerPhishing}</button>
            <button className="button-primary" onClick={() => selectAnswer(false)} disabled={answer.isPending}>{uk.answerLegitimate}</button>
          </div>
        ) : (
          <div className={"mt-5 rounded-2xl p-4 " + (feedback.correct ? "bg-emerald-50 text-success" : "bg-amber-50 text-warning")} aria-live="polite">
            <p className="font-bold">{feedback.correct ? uk.feedbackCorrect : uk.feedbackIncorrect}</p>
            <p className="mt-2 text-sm leading-6">{feedback.explanation}</p>
            <button className="button-secondary mt-4" onClick={next}>{index === query.data.length - 1 ? uk.showResult : uk.nextQuestion}<ArrowRight size={16} /></button>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
      </Card>
    </PageShell>
  );
}

type ReportData = {
  business: { company_name: string; sector: string; employee_range: string; stores_customer_data: boolean; uses_cloud: boolean };
  date: string;
  result: Result;
  losses: LossData;
  action_plan: { items: ActionItem[] };
};

export function ReportPage() {
  const { id } = useParams();
  const query = useQuery<ReportData>({ queryKey: ["report", id], queryFn: () => api<ReportData>("/assessments/" + id + "/report"), enabled: Boolean(id) });
  if (query.isLoading) return <PageShell><LoadingState /></PageShell>;
  if (query.isError || !query.data) return <PageShell><ErrorState message={uk.emptyReport} /></PageShell>;
  const report = query.data;
  return (
    <PageShell className="print-sheet">
      <div className="no-print mb-5 flex justify-end"><button className="button-primary" onClick={() => window.print()}><Printer size={18} />{uk.printPdf}</button></div>
      <SectionHeading eyebrow={uk.brand} title={uk.reportTitle} intro={uk.reportDisclaimer} />
      <div className="grid gap-4 md:grid-cols-3">
        <Card><p className="eyebrow">{uk.business}</p><h2 className="mt-2 text-xl font-bold">{report.business.company_name}</h2><p className="mt-2 text-muted">{uk.businessSector}: {report.business.sector}</p><p className="mt-1 text-sm text-muted">{report.business.employee_range} {uk.peopleCount}</p></Card>
        <Card><p className="eyebrow">{uk.auditDate}</p><p className="mt-2 text-xl font-bold">{formatDate(report.date)}</p><p className="mt-2 text-muted">{report.business.stores_customer_data ? uk.customersData : ""}{report.business.uses_cloud ? " · " + uk.cloudShort : ""}</p></Card>
        <Card><p className="eyebrow">{uk.rating}</p><p className="mt-2 text-4xl font-bold">{report.result.total_score} / 100</p><div className="mt-2"><RiskBadge level={report.result.risk_level} label={report.result.risk_label} /></div></Card>
      </div>
      <div className="mt-5"><ResultSummary result={report.result} /></div>
      <Card className="mt-5">
        <h2 className="text-xl font-bold">{uk.losses}</h2>
        <p className="mt-2 text-2xl font-bold">{formatMoney(report.losses.total_ale)} <span className="text-sm font-normal text-muted">{uk.moneyPerYear}</span></p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">{report.losses.items.map((item) => <div className="rounded-xl border border-line p-3" key={item.slug}><p className="font-semibold">{item.title}</p><dl className="mt-2 space-y-1 text-sm">{item.variants.map((variant) => <div className="flex justify-between gap-3" key={variant.variant}><dt className="text-muted">{variant.label}</dt><dd className="font-semibold">{formatMoney(variant.ale)}</dd></div>)}</dl></div>)}</div>
      </Card>
      <Card className="mt-5">
        <h2 className="text-xl font-bold">{uk.actionPlan}</h2>
        <ol className="mt-4 space-y-3">{report.action_plan.items.map((item, index) => <li key={item.id} className="flex gap-3 border-b border-line pb-3 last:border-0"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brandSoft text-sm font-bold text-brand">{index + 1}</span><div><h3 className="font-bold">{item.title}</h3><p className="mt-1 text-sm text-muted">{item.description}</p><p className="mt-1 text-xs text-muted">{item.priority_label} · {statusText(item.status)} · {item.assignee || uk.assignee} · {formatDate(item.due_date)}</p></div></li>)}</ol>
      </Card>
    </PageShell>
  );
}

function statusText(status: ActionItem["status"]) {
  if (status === "done") return uk.statusDone;
  if (status === "in_progress") return uk.statusDoing;
  return uk.statusTodo;
}

export function DashboardPage() {
  const query = useQuery<DashboardData>({ queryKey: ["dashboard"], queryFn: () => api<DashboardData>("/dashboard") });
  if (query.isLoading) return <PageShell><LoadingState /></PageShell>;
  if (query.isError || !query.data) return <PageShell><ErrorState onRetry={() => query.refetch()} /></PageShell>;
  const data = query.data;
  const completed = data.assessments.filter((item) => item.status === "completed");
  const chartData = completed.slice().reverse().map((item, index) => ({
    name: formatDate(item.completed_at || item.created_at),
    score: item.total_score || 0,
    index: index + 1,
  }));
  const latest = data.comparison.current;
  const previous = data.comparison.previous;
  const difference = latest?.total_score != null && previous?.total_score != null ? latest.total_score - previous.total_score : null;
  return (
    <PageShell>
      <SectionHeading eyebrow={uk.brand} title={uk.dashboardTitle} intro={uk.featuresText} action={<Link className="button-primary" to="/assessment">{uk.newAssessment}</Link>} />
      {data.assessments.length === 0 ? (
        <EmptyState text={uk.noAssessments} action={<div className="mt-5"><LinkButton to="/assessment">{uk.startAudit}</LinkButton></div>} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card><p className="eyebrow">{uk.averageScore}</p><p className="mt-2 text-3xl font-bold">{latest?.total_score ?? "—"}<span className="ml-1 text-base font-normal text-muted">/ 100</span></p>{latest?.risk_level && <div className="mt-3"><RiskBadge level={latest.risk_level} label={latest.risk_label || undefined} /></div>}</Card>
            <Card><p className="eyebrow">{uk.auditCount}</p><p className="mt-2 text-3xl font-bold">{completed.length}</p><p className="mt-2 text-sm text-muted">{uk.completed}</p></Card>
            <Card><p className="eyebrow">{uk.totalAle}</p><p className="mt-2 text-2xl font-bold">{formatMoney(data.total_ale)}</p><p className="mt-1 text-sm text-muted">{uk.moneyPerYear}</p></Card>
            <Card><p className="eyebrow">{uk.actionProgress}</p><p className="mt-2 text-3xl font-bold">{data.action_progress.percent}%</p><p className="mt-2 text-sm text-muted">{data.action_progress.done} / {data.action_progress.total} {uk.actionItems}</p><div className="mt-3 h-2 rounded-full bg-brandSoft"><div className="h-full rounded-full bg-brand" style={{ width: data.action_progress.percent + "%" }} /></div></Card>
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <Card>
              <h2 className="text-lg font-bold">{uk.scoreTrend}</h2>
              {chartData.length ? <div className="mt-4 h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} /><Tooltip /><Line type="monotone" dataKey="score" stroke="#0c766e" strokeWidth={3} dot={{ r: 4 }} /></LineChart></ResponsiveContainer></div> : <EmptyState text={uk.noDataYet} />}
            </Card>
            <Card>
              <h2 className="text-lg font-bold">{uk.categoryScores}</h2>
              {data.latest_categories.length ? <div className="mt-4 h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.latest_categories} layout="vertical" margin={{ left: 10, right: 14 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" domain={[0, 100]} /><YAxis type="category" dataKey="title" width={145} tick={{ fontSize: 11 }} /><Tooltip formatter={(value: number) => Math.round(value) + " / 100"} /><Bar dataKey="score" fill="#0c766e" radius={[0, 8, 8, 0]} /></BarChart></ResponsiveContainer></div> : <EmptyState text={uk.noDataYet} />}
            </Card>
          </div>
          <Card className="mt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-lg font-bold">{uk.comparison}</h2>{difference === null ? <p className="mt-1 text-sm text-muted">{uk.notCompared}</p> : <p className="mt-1 flex items-center gap-1 text-sm font-semibold">{difference > 0 ? <ArrowUpRight className="text-success" size={17} /> : difference < 0 ? <ArrowDownRight className="text-danger" size={17} /> : null}{difference > 0 ? "+" : ""}{difference} {uk.scoreLabel}</p>}</div>
              {!data.history_enabled && <span className="badge bg-brandSoft text-brand">{uk.premium}</span>}
            </div>
            <div className="mt-4 divide-y divide-line">
              {data.assessments.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div><p className="font-bold">{item.company_name}</p><p className="mt-1 text-sm text-muted">{formatDate(item.completed_at || item.created_at)} · {item.status === "completed" ? uk.completed : uk.started}</p></div>
                  <div className="flex items-center gap-3">
                    {item.total_score != null && <strong className="text-xl">{item.total_score}</strong>}
                    {item.status === "completed" ? <Link className="button-secondary" to={"/results/" + item.id}>{uk.viewResults}</Link> : <Link className="button-primary" to={"/assessment?draft=" + item.id}>{uk.continueAudit}</Link>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </PageShell>
  );
}
