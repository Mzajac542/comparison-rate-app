export default function LoadingSkeleton() {
  return (
    <div className="loading-screen" aria-live="polite" aria-label="Ładowanie danych">
      <div className="loading-header-skeleton skeleton-pulse" />
      <div className="loading-layout">
        <aside className="loading-sidebar-skeleton skeleton-pulse" />
        <main className="loading-content-skeleton">
          <div className="loading-toolbar-skeleton skeleton-pulse" />
          <div className="loading-card-grid">
            {Array.from({ length: 9 }, (_, index) => (
              <div className="loading-card-skeleton skeleton-pulse" key={index} />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
