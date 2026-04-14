export default function RecepcaoPlaceholder({ title, children }) {
  return (
    <div className="recepcao-page">
      <header className="recepcao-page__header">
        <h2 className="recepcao-page__heading">{title}</h2>
        <div className="recepcao-page__intro recepcao-page__body">{children}</div>
      </header>
    </div>
  )
}
