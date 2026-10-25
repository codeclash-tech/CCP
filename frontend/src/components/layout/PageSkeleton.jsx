export default function PageSkeleton({
  className = "",
  compact = false,
  label = "Loading page content",
  rows = 3,
}) {
  return (
    <div
      className={`page-loading-skeleton${compact ? " page-loading-skeleton-compact" : ""}${className ? ` ${className}` : ""}`}
      role="status"
      aria-label={label}
      aria-busy="true"
    >
      <div className="loading-skeleton page-loading-skeleton-heading" />
      <div className="page-loading-skeleton-cards">
        {Array.from({ length: rows }, (_, index) => (
          <div
            className="loading-skeleton page-loading-skeleton-card"
            key={index}
          />
        ))}
      </div>
    </div>
  );
}
