import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES } from '../../i18n'
import './LanguageSwitcher.css'

export default function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef()

  const currentLang = SUPPORTED_LANGUAGES.find(l => l.code === i18n.language) || SUPPORTED_LANGUAGES[0]

  useEffect(() => {
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const changeLang = (code) => {
    i18n.changeLanguage(code)
    setOpen(false)
  }

  return (
    <div className="lang-switcher" ref={ref}>
      <button className="lang-switcher__trigger" onClick={() => setOpen(o => !o)} aria-label="Change language">
        <span>{currentLang.flag}</span>
        <span className="lang-switcher__code">{currentLang.code.toUpperCase()}</span>
        <span className={`lang-switcher__chevron ${open ? 'open' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="lang-switcher__dropdown animate-fade-in">
          {SUPPORTED_LANGUAGES.map(lang => (
            <button
              key={lang.code}
              className={`lang-switcher__option ${lang.code === i18n.language ? 'active' : ''}`}
              onClick={() => changeLang(lang.code)}
            >
              <span>{lang.flag}</span>
              <span className="lang-switcher__native">{lang.nativeName}</span>
              {lang.code === i18n.language && <span className="lang-switcher__check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
