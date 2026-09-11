export default function ToastContainer({ toasts, onDismiss }) {
  return (
    <div className="toast-container" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div className={`app-toast app-toast--${toast.type}`} key={toast.id} role="status">
          <span className="app-toast-icon" aria-hidden="true">
            {toast.type === "error" ? "!" : toast.type === "info" ? "i" : "✓"}
          </span>
          <div><strong>{toast.title}</strong><p>{toast.message}</p></div>
          <button type="button" onClick={() => onDismiss(toast.id)} aria-label="Zamknij powiadomienie">×</button>
        </div>
      ))}
    </div>
  );
}
