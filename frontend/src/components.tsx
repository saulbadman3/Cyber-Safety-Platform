import { ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CircleAlert, CircleCheck, LogOut, Shield, ShieldAlert, TriangleAlert } from "lucide-react";
import { api } from "./api";
import { uk } from "./i18n/uk";

type User = { id: number; email: string };

export function Header() {
  const query = useQuery<User>({ queryKey: ["me"], queryFn: () => api("/auth/me") });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const logout = useMutation({
    mutationFn: () => api("/auth/logout", { method: "POST" }),
    onSuccess: () => {
      queryClient.clear();
      navigate("/");
    },
  });
  return (
    <header className="no-print sticky top-0 z-20 border-b border-line/80 bg-white/90 backdrop-blur">
      <div className="container-app flex min-h-16 flex-wrap items-center justify-between gap-3 py-2">
        <Link to="/" className="flex items-center gap-2 font-bold text-ink" aria-label={uk.brand}>
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-white"><Shield size={20} /></span>
          <span>{uk.brand}</span>
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto text-sm" aria-label={uk.mainNavigation}>
          <NavLink className={({ isActive }) => "rounded-lg px-3 py-2 " + (isActive ? "bg-brandSoft font-semibold text-brand" : "text-muted hover:text-ink")} to="/">{uk.navHome}</NavLink>
          {query.data && <>
            <NavLink className={({ isActive }) => "rounded-lg px-3 py-2 " + (isActive ? "bg-brandSoft font-semibold text-brand" : "text-muted hover:text-ink")} to="/dashboard">{uk.navDashboard}</NavLink>
            <NavLink className={({ isActive }) => "rounded-lg px-3 py-2 " + (isActive ? "bg-brandSoft font-semibold text-brand" : "text-muted hover:text-ink")} to="/lessons">{uk.navLessons}</NavLink>
          </>}
        </nav>
        <div className="flex items-center gap-2">
          {query.data ? (
            <>
              <span className="hidden max-w-40 truncate text-sm text-muted sm:block">{query.data.email}</span>
              <button type="button" className="button-quiet" onClick={() => logout.mutate()} disabled={logout.isPending} aria-label={uk.signOut}>
                <LogOut size={17} /><span className="hidden sm:inline">{uk.signOut}</span>
              </button>
            </>
          ) : (
            <>
              <Link className="button-quiet" to="/login">{uk.signIn}</Link>
              <Link className="button-primary hidden sm:inline-flex" to="/register">{uk.signUp}</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function PageShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <><Header /><main className={"container-app py-8 sm:py-12 " + className}>{children}</main></>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={"card " + className}>{children}</section>;
}

export function LoadingState() {
  return <div className="grid min-h-48 place-items-center text-muted" role="status" aria-live="polite">{uk.loading}</div>;
}

export function ErrorState({ onRetry, message = uk.errorTitle }: { onRetry?: () => void; message?: string }) {
  return (
    <div role="alert" className="rounded-2xl border border-danger/30 bg-white p-6 text-center">
      <CircleAlert className="mx-auto mb-2 text-danger" />
      <p className="font-semibold text-ink">{message}</p>
      {onRetry && <button className="button-secondary mt-4" onClick={onRetry}>{uk.retry}</button>}
    </div>
  );
}

export function EmptyState({ text = uk.empty, action }: { text?: string; action?: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-line bg-white/70 px-6 py-10 text-center text-muted">{text}{action}</div>;
}

export function RiskBadge({ level, label }: { level: "high" | "medium" | "low"; label?: string }) {
  const styles = {
    high: "bg-red-50 text-danger",
    medium: "bg-amber-50 text-warning",
    low: "bg-emerald-50 text-success",
  };
  const Icon = level === "high" ? ShieldAlert : level === "medium" ? TriangleAlert : CircleCheck;
  const caption = label || (level === "high" ? uk.riskHigh : level === "medium" ? uk.riskMedium : uk.riskLow);
  return <span className={"badge " + styles[level]}><Icon size={16} aria-hidden="true" />{caption}</span>;
}

export function SectionHeading({ eyebrow, title, intro, action }: { eyebrow?: string; title: string; intro?: string; action?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>{eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}<h1 className="section-title">{title}</h1>{intro && <p className="mt-2 max-w-2xl text-muted">{intro}</p>}</div>
      {action}
    </div>
  );
}

export function LinkButton({ to, children, secondary = false }: { to: string; children: ReactNode; secondary?: boolean }) {
  return <Link className={secondary ? "button-secondary" : "button-primary"} to={to}>{children}<ArrowRight size={17} aria-hidden="true" /></Link>;
}
