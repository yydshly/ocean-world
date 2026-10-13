import React, { useEffect, useId, useRef, useState } from 'react';
import { EXPERIENCE_GROUPS, currentExperience, experienceHref } from './experienceNavigation.js';
import './experienceNavigation.css';

export function ExperienceNavigation({ research = false, disabled = false }) {
  const [open, setOpen] = useState(false);
  const shell = useRef(null), toggle = useRef(null), menuId = useId();
  const seed = new URLSearchParams(window.location.search).get('seed') || '55';
  const current = currentExperience(window.location.search);
  const href = id => experienceHref(id, { base: import.meta.env.BASE_URL, seed });
  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!shell.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const guardNavigation = event => { if (disabled) event.preventDefault(); };
  return <div ref={shell} className={`experience-navigation${research ? ' experience-navigation--research' : ''}`}
    onKeyDown={event => {
      if (event.key === 'Escape' && open) {
        event.stopPropagation(); setOpen(false); toggle.current?.focus();
      }
    }}>
    {research && <a className="experience-main-link" href={href('journey')} aria-disabled={disabled || undefined}
      onClick={guardNavigation}>返回4分钟浅海主线</a>}
    <button ref={toggle} className="experience-navigation-toggle" type="button" disabled={disabled}
      aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(value => !value)}>
      更多体验 <span aria-hidden="true">{open ? '−' : '+'}</span>
    </button>
    <nav id={menuId} className="experience-navigation-menu" aria-label="海底体验入口" hidden={!open}>
      <div className="experience-navigation-heading"><strong>选择海底体验</strong><button type="button"
        onClick={() => { setOpen(false); toggle.current?.focus(); }} aria-label="关闭更多体验">×</button></div>
      {EXPERIENCE_GROUPS.map(group => <section key={group.id} aria-labelledby={`${menuId}-${group.id}`}>
        <h2 id={`${menuId}-${group.id}`}>{group.title}</h2><p>{group.detail}</p>
        <div className="experience-navigation-links">{group.entries.map(entry => <a key={entry.id} href={href(entry.id)}
          aria-current={entry.id === current ? 'page' : undefined} aria-disabled={disabled || undefined} onClick={guardNavigation}>
          <strong>{entry.title}{entry.id === current && <small>当前</small>}</strong><span>{entry.detail}</span>
        </a>)}</div>
      </section>)}
      <a className="experience-guide-link" href={`${import.meta.env.BASE_URL}overview/`} onClick={guardNavigation}
        aria-disabled={disabled || undefined}>产品导览 · 目标、能力与阶段记录 →</a>
    </nav>
  </div>;
}
