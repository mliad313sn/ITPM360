const modules = [
  {
    title: 'Portfolio & Projects',
    phase: 'Phase 2',
    description: 'Countries, branches, users and projects with RAG status and GRC checkpoints.',
  },
  {
    title: 'Tasks & Blockers',
    phase: 'Phase 3',
    description: 'Task timelines, blocker explanations and next steps that feed meeting agendas.',
  },
  {
    title: 'Meeting Hub',
    phase: 'Phase 3',
    description: 'Project meetings with auto-generated agendas: RAG, blocked tasks, next steps.',
  },
  {
    title: 'Dashboards & Reports',
    phase: 'Phase 4',
    description: 'Gantt, Kanban, status distributions and monthly slide-deck generation.',
  },
  {
    title: 'Notifications & Integrations',
    phase: 'Phase 5',
    description: 'Alerts for blockers, RAG downgrades and deadlines; CSV/JSON export and webhooks.',
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-10 px-6 py-16">
      <header className="space-y-4">
        <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
          <span className="h-2 w-2 rounded-full bg-indigo-500" />
          Phase 1 — Foundation
        </span>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          ITPM<span className="text-indigo-600">360</span>
        </h1>
        <p className="max-w-2xl text-lg text-slate-600">
          Enterprise IT project management across countries and branches — with role-based access,
          GRC governance, meeting alignment and executive reporting.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => (
          <div
            key={m.title}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
          >
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-indigo-500">
              {m.phase}
            </div>
            <h2 className="mb-1 font-semibold text-slate-900">{m.title}</h2>
            <p className="text-sm text-slate-600">{m.description}</p>
          </div>
        ))}
      </section>

      <footer className="text-sm text-slate-400">
        Backend: Node.js + Express + PostgreSQL · Frontend: Next.js (SSR) + Tailwind CSS
      </footer>
    </main>
  );
}
