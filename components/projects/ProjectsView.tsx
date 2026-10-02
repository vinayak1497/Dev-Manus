"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowUpDown,
  ChevronDown,
  FlaskConical,
  LayoutGrid,
  List,
  RefreshCw,
  Search,
  SearchX,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { ProjectCard } from "./ProjectCard";
import { ProjectHealthDot } from "./ProjectHealth";
import { ProjectTable } from "./ProjectTable";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import {
  countByHealth,
  ENVIRONMENT_OPTIONS,
  filterProjects,
  formatRelativeTime,
  HEALTH_LABEL,
  HEALTH_SYMBOL,
  SORT_OPTIONS,
  sortProjects,
  type HealthFilter,
  type ProjectHealth,
  type ProjectSummary,
  type SortKey,
} from "@/lib/projects";

type ViewMode = "grid" | "list";

const HEALTH_FILTER_OPTIONS: HealthFilter[] = [
  "all",
  "critical",
  "warning",
  "unknown",
  "recovering",
  "maintenance",
  "healthy",
];

const SUMMARY_STATES: ProjectHealth[] = [
  "healthy",
  "warning",
  "critical",
  "unknown",
];

const CONTROL_CLASS =
  "inline-flex h-10 items-center gap-1.5 rounded border border-border-hairline bg-surface px-3.5 text-[14px] font-medium text-ink shadow-card transition-colors hover:bg-canvas";

/** Lightweight popover: click-outside + Escape close, focus returns to trigger. */
function Popover({
  label,
  icon,
  badge,
  children,
}: {
  label: ReactNode;
  icon?: ReactNode;
  badge?: number;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="true"
        className={CONTROL_CLASS}
      >
        {icon}
        {label}
        {badge ? (
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-light px-1 font-mono text-[10px] font-bold text-brand">
            {badge}
          </span>
        ) : null}
        <ChevronDown className="h-4 w-4 text-ink-muted" aria-hidden="true" />
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute right-0 z-30 mt-2 rounded-md border border-border-hairline bg-surface p-1.5 shadow-raised"
      >
        {open ? children(close) : null}
      </div>
    </div>
  );
}

function FilterTag({
  label,
  onRemove,
  removeLabel,
}: {
  label: ReactNode;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border-hairline bg-subtle px-2.5 py-1 text-[12px] text-ink">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="flex items-center rounded-sm text-ink-secondary hover:text-critical"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">{removeLabel}</span>
      </button>
    </span>
  );
}

/**
 * Projects Home workspace — search, health/environment filters, sorting and
 * grid/list switching (Screen_Navigation.md §6).
 *
 * `now` is supplied by the server so relative timestamps render identically
 * on the server and the client (no hydration drift).
 */
export function ProjectsView({
  projects,
  now,
  loadedAt,
  onRefresh,
  isRefreshing = false,
  notice,
  emptyStateAction,
}: {
  projects: ProjectSummary[];
  now: number;
  loadedAt: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  notice?: ReactNode;
  emptyStateAction?: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [health, setHealth] = useState<HealthFilter>("all");
  const [environment, setEnvironment] = useState("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [view, setView] = useState<ViewMode>("grid");
  const searchRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => countByHealth(projects), [projects]);

  const visible = useMemo(
    () =>
      sortProjects(
        filterProjects(projects, { search, health, environment }),
        sort,
      ),
    [projects, search, health, environment, sort],
  );

  const activeFilterCount =
    (health !== "all" ? 1 : 0) + (environment !== "all" ? 1 : 0);

  const demoCount = useMemo(
    () => projects.filter((p) => p.isDemo).length,
    [projects],
  );

  const clearFilters = useCallback(() => {
    setSearch("");
    setHealth("all");
    setEnvironment("all");
  }, []);

  // "/" focuses search, matching the reference design shortcut.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey)
        return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      )
        return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {/* Health summary strip — real counts; Unknown is never folded into Healthy */}
      <section
        aria-label="Project health summary"
        className="flex w-full flex-wrap items-center justify-between gap-4 rounded-md border border-border-hairline bg-surface p-4 shadow-card"
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
          <span className="flex items-center gap-2">
            <span className="text-[18px] font-semibold tabular-nums text-ink">
              {projects.length}
            </span>
            <span className="font-medium text-ink-secondary">
              Total {projects.length === 1 ? "Project" : "Projects"}
            </span>
          </span>

          {SUMMARY_STATES.map((state) => {
            const isActive = health === state;
            return (
              <button
                key={state}
                type="button"
                onClick={() => setHealth(isActive ? "all" : state)}
                aria-pressed={isActive}
                className={cn(
                  "flex items-center gap-2 rounded-sm px-1 py-0.5 transition hover:opacity-80",
                  isActive && "bg-brand-light",
                )}
              >
                <ProjectHealthDot health={state} />
                <span className="font-semibold text-ink">
                  <span aria-hidden="true">{HEALTH_SYMBOL[state]} </span>
                  {counts[state]} {HEALTH_LABEL[state]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Honest refresh state — this is a database read, not live telemetry */}
        <p className="flex items-center gap-2 self-end font-mono text-[12px] text-ink-secondary sm:self-auto">
          <RefreshCw
            className={cn(
              "h-3.5 w-3.5 text-ink-muted",
              isRefreshing && "animate-spin",
            )}
            aria-hidden="true"
          />
          <span aria-live="polite">
            {isRefreshing
              ? "Refreshing…"
              : `List loaded ${formatRelativeTime(loadedAt, now)}`}
          </span>
        </p>
      </section>

      {/* Search + filter + sort + view switcher */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col items-stretch justify-between gap-3 md:flex-row md:items-center">
          <div className="relative flex-1 md:max-w-2xl">
            <label htmlFor="project-search" className="sr-only">
              Search projects
            </label>
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted"
              aria-hidden="true"
            />
            <input
              ref={searchRef}
              id="project-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search projects, repositories, or services…"
              className="h-10 w-full rounded border border-border-hairline bg-surface pl-11 pr-12 text-[14px] text-ink shadow-card placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded bg-subtle px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-ink-secondary sm:inline-block">
              /
            </kbd>
          </div>

          <div className="flex items-center justify-between gap-2 md:justify-end">
            <div className="flex items-center gap-2">
              <Popover
                label="Filter"
                icon={
                  <SlidersHorizontal
                    className="h-4 w-4 text-ink-muted"
                    aria-hidden="true"
                  />
                }
                badge={activeFilterCount}
              >
                {(close) => (
                  <div className="flex w-64 flex-col gap-3 p-2">
                    <span className="text-[12px] font-semibold uppercase tracking-wider text-ink-secondary">
                      Filter projects
                    </span>
                    <div className="flex flex-col gap-1.5">
                      <label
                        htmlFor="filter-health"
                        className="text-[13px] font-medium text-ink"
                      >
                        Health state
                      </label>
                      <select
                        id="filter-health"
                        value={health}
                        onChange={(event) =>
                          setHealth(event.target.value as HealthFilter)
                        }
                        className="h-9 rounded border border-border-hairline bg-canvas px-2 text-[13px] text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                      >
                        {HEALTH_FILTER_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option === "all"
                              ? "All states"
                              : HEALTH_LABEL[option]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label
                        htmlFor="filter-environment"
                        className="text-[13px] font-medium text-ink"
                      >
                        Environment
                      </label>
                      <select
                        id="filter-environment"
                        value={environment}
                        onChange={(event) => setEnvironment(event.target.value)}
                        className="h-9 rounded border border-border-hairline bg-canvas px-2 text-[13px] text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                      >
                        <option value="all">All environments</option>
                        {ENVIRONMENT_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center justify-between border-t border-border-hairline pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          clearFilters();
                          close();
                        }}
                        className="text-[13px] text-ink-secondary hover:text-ink"
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        onClick={close}
                        className="rounded bg-brand px-3 py-1 text-[13px] font-medium text-white hover:bg-brand-hover"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                )}
              </Popover>

              <Popover
                label={
                  <span className="flex items-center gap-1.5">
                    <span className="font-normal text-ink-secondary">Sort:</span>
                    {SORT_OPTIONS.find((o) => o.key === sort)?.label}
                  </span>
                }
                icon={
                  <ArrowUpDown
                    className="h-4 w-4 text-ink-muted"
                    aria-hidden="true"
                  />
                }
              >
                {(close) => (
                  <div
                    className="flex w-56 flex-col"
                    role="group"
                    aria-label="Sort projects"
                  >
                    {SORT_OPTIONS.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => {
                          setSort(option.key);
                          close();
                        }}
                        aria-pressed={sort === option.key}
                        className={cn(
                          "rounded-sm px-3 py-2 text-left text-[13px] transition-colors hover:bg-canvas",
                          sort === option.key
                            ? "bg-brand-light font-semibold text-brand"
                            : "text-ink",
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </Popover>
            </div>

            <div
              role="group"
              aria-label="Change project view"
              className="flex items-center rounded border border-border-hairline bg-surface p-1 shadow-card"
            >
              <button
                type="button"
                onClick={() => setView("grid")}
                aria-pressed={view === "grid"}
                title="Grid view"
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-sm transition-colors",
                  view === "grid"
                    ? "bg-brand-light text-brand"
                    : "text-ink-muted hover:text-ink",
                )}
              >
                <LayoutGrid className="h-5 w-5" aria-hidden="true" />
                <span className="sr-only">Grid view</span>
              </button>
              <button
                type="button"
                onClick={() => setView("list")}
                aria-pressed={view === "list"}
                title="List view"
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-sm transition-colors",
                  view === "list"
                    ? "bg-brand-light text-brand"
                    : "text-ink-muted hover:text-ink",
                )}
              >
                <List className="h-5 w-5" aria-hidden="true" />
                <span className="sr-only">List view</span>
              </button>
            </div>
          </div>
        </div>

        {activeFilterCount > 0 || search.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-ink-secondary">
              Active filters:
            </span>
            {search.length > 0 ? (
              <FilterTag
                label={
                  <>
                    Search: <strong className="font-medium">{search}</strong>
                  </>
                }
                onRemove={() => setSearch("")}
                removeLabel="Clear search filter"
              />
            ) : null}
            {health !== "all" ? (
              <FilterTag
                label={
                  <>
                    Health:{" "}
                    <strong className="font-medium">
                      {HEALTH_LABEL[health]}
                    </strong>
                  </>
                }
                onRemove={() => setHealth("all")}
                removeLabel="Clear health filter"
              />
            ) : null}
            {environment !== "all" ? (
              <FilterTag
                label={
                  <>
                    Environment:{" "}
                    <strong className="font-medium">{environment}</strong>
                  </>
                }
                onRemove={() => setEnvironment("all")}
                removeLabel="Clear environment filter"
              />
            ) : null}
            <button
              type="button"
              onClick={clearFilters}
              className="ml-1 text-[13px] font-medium text-brand hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : null}
      </div>

      {demoCount > 0 ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded border border-ai-border bg-ai-tint px-3 py-2.5 text-[13px] leading-5 text-ai">
          <FlaskConical className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <strong className="font-semibold">
              Sample data — not real telemetry.
            </strong>{" "}
            {demoCount} of {projects.length} project
            {projects.length === 1 ? "" : "s"} shown here{" "}
            {demoCount === 1 ? "is" : "are"} seeded examples used for demos
            and UI review. Health, incidents, and deployment values are
            illustrative only.
          </span>
        </p>
      ) : null}

      {notice}

      {projects.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 px-8 py-12 text-center">
          <SearchX className="h-10 w-10 text-ink-muted" aria-hidden="true" />
          <h3 className="text-[18px] font-semibold text-ink">
            No projects are being monitored yet.
          </h3>
          <p className="max-w-md text-[14px] leading-6 text-ink-secondary">
            Connect a project to start collecting health and performance data.
            Until then there is no health, incident, or deployment telemetry to
            display.
          </p>
          {emptyStateAction ? (
            <div className="mt-2">{emptyStateAction}</div>
          ) : null}
        </Card>
      ) : visible.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 px-8 py-12 text-center">
          <SearchX className="h-10 w-10 text-ink-muted" aria-hidden="true" />
          <h3 className="text-[18px] font-semibold text-ink">
            No matching projects found
          </h3>
          <p className="max-w-md text-[14px] leading-6 text-ink-secondary">
            Try a different search term, or clear the health and environment
            filters to see all {projects.length} projects.
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-2 rounded bg-brand px-4 py-2 text-[14px] font-semibold text-white transition-colors hover:bg-brand-hover"
          >
            Reset all filters
          </button>
        </Card>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((project) => (
            <ProjectCard key={project.id} project={project} now={now} />
          ))}
        </div>
      ) : (
        <ProjectTable projects={visible} now={now} />
      )}
    </div>
  );
}
