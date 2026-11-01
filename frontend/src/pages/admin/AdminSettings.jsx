import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { adminGetSettings, adminSaveSettings } from '../../api';
import { Card } from './AdminUi';
import AdminDateField from './AdminDateField';

export default function AdminSettings() {
  const [form, setForm] = useState({ name: '', tagline: '', day1: '' });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminGetSettings()
      .then((s) => setForm(s))
      .catch((err) => setError(err.message))
      .finally(() => setLoaded(true));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    try {
      await adminSaveSettings(form);
      setNotice('Saved. The name now appears on the login screens, the leaderboard and printed scorecards.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div>
      <div className="a-page-head">
        <div>
          <h1 className="a-title">Settings</h1>
          <p className="a-subtitle">Tell DailyLedger about your event</p>
        </div>
      </div>

      {error && <div className="a-error">{error}</div>}
      {notice && <div className="a-success">{notice}</div>}

      <form onSubmit={save}>
        <Card title="Event" sub="Shown on the login screens, the live leaderboard and every printed scorecard" className="a-settings">
          <div className="a-modal-fields">
            <div className="a-field">
              <label className="a-label">Event name</label>
              <input className="a-input" value={form.name} maxLength={60} placeholder="e.g. MBA Fest 2026" onChange={(e) => set({ name: e.target.value })} disabled={!loaded} />
            </div>
            <div className="a-field">
              <label className="a-label">Tagline (optional)</label>
              <input className="a-input" value={form.tagline} maxLength={120} placeholder="e.g. Taste. Trade. Win." onChange={(e) => set({ tagline: e.target.value })} disabled={!loaded} />
            </div>
            <div className="a-field">
              <label className="a-label">Date of Day 1 (optional)</label>
              <AdminDateField value={form.day1} onChange={(day1) => set({ day1 })} placeholder="Select Day 1" />
              <p className="a-modal-note" style={{ margin: '6px 0 0' }}>With this set, the Compare tool offers a one-click "Day 1 vs Day 2".</p>
            </div>
          </div>
          <div className="a-modal-actions">
            <button type="submit" className="a-btn a-btn-primary" disabled={saving || !loaded}>
              <Save size={16} /> {saving ? 'Saving...' : 'Save settings'}
            </button>
          </div>
        </Card>
      </form>
    </div>
  );
}
