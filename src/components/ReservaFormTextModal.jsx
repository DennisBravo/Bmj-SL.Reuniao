/**
 * Modal simples (overlay + diálogo) para texto longo no formulário de reserva.
 */
export default function ReservaFormTextModal({
  open,
  title,
  titleId = 'reserva-form-text-modal-title',
  error,
  children,
  onConfirm,
  onCancel,
}) {
  if (!open) return null

  return (
    <div
      className="app__modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        className="app__modal app__modal--form-text"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="app__modal-title">
          {title}
        </h2>
        {error ? (
          <p className="form__error app__modal-inline-error" role="alert">
            {error}
          </p>
        ) : null}
        {children}
        <div className="app__modal-actions app__modal-actions--form">
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="btn" onClick={onConfirm}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}
