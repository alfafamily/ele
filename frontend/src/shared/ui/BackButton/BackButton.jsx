import { useNavigate } from 'react-router-dom'
import './BackButton.css'

// Круглая кнопка-иконка «Назад» в шапках вложенных экранов (карточки объектов,
// редактор Типов). По умолчанию — возврат на предыдущий экран истории;
// onClick можно переопределить. На начальных экранах разделов (списки,
// Профиль, Настройки, Руководство) и на формах (там есть «Отмена») не нужна.
export function BackButton({ onClick, className = '', ...rest }) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      aria-label="Назад"
      title="Назад"
      onClick={onClick || (() => navigate(-1))}
      className={['ele-back-btn', className].filter(Boolean).join(' ')}
      {...rest}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
  )
}
