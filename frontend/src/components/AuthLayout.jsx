import { useEffect, useState } from 'react';
import Logo from './Logo';
import { getPublicEvent } from '../api';
import StallIllustration from './StallIllustration';
import './auth.css';

/**
 * Split login layout used by both sites: a warm illustration panel on the left and the
 * form on the right. On phones only the form is shown. To use a real photo instead of
 * the illustration, pass `image` (a URL) and it fills the left panel.
 */
export default function AuthLayout({ headline, tagline, points = [], image, children }) {
  // The organiser can name the event in Settings; it shows here once set.
  const [event, setEvent] = useState({ name: '', tagline: '' });
  useEffect(() => {
    let cancelled = false;
    getPublicEvent()
      .then((e) => {
        if (!cancelled) setEvent(e);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="auth-split">
      <aside className="auth-art" style={image ? { backgroundImage: `url(${image})` } : undefined}>
        <Logo light size={42} />
        <div className="auth-art-body">
          {!image && <StallIllustration />}
          {event.name && <span className="auth-event">{event.name}</span>}
          <h2 className="auth-headline">{headline}</h2>
          <p className="auth-tagline">{event.tagline || tagline}</p>
          {points.length > 0 && (
            <ul className="auth-points">
              {points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <main className="auth-form-side">
        <div className="auth-form">
          <div className="auth-mobile-logo">
            <Logo size={44} />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
