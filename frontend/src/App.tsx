import { Route, Routes } from "react-router-dom";
import {
  ActionPlanPage, AssessmentPage, AuthPage, DashboardPage, LandingPage, LessonPage,
  LessonsPage, LossPage, ProtectedRoute, QuizPage, ReportPage, ResultPage,
} from "./pages";
import { PageShell, SectionHeading } from "./components";
import { uk } from "./i18n/uk";

function NotFoundPage() {
  return <PageShell><SectionHeading title={uk.notFound} /><p className="text-muted">{uk.backHome}</p></PageShell>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/assessment" element={<AssessmentPage />} />
        <Route path="/results/:id" element={<ResultPage />} />
        <Route path="/losses/:id" element={<LossPage />} />
        <Route path="/action-plan/:id" element={<ActionPlanPage />} />
        <Route path="/lessons" element={<LessonsPage />} />
        <Route path="/lessons/:slug" element={<LessonPage />} />
        <Route path="/quiz" element={<QuizPage />} />
        <Route path="/report/:id" element={<ReportPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
