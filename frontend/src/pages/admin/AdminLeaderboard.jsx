import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Trophy, Wallet, Percent, Leaf, Receipt, Maximize2, Minimize2, FileDown, Tv, X } from 'lucide-react';
import { adminGetLeaderboard, adminGetScorecard } from '../../api';
import { formatCurrency } from '../../format';
import { Card, ScopeBar, useScope, useInterval, avatarColor, PERIODS } from './AdminUi';
import useAdminData from './useAdminData';
import { downloadScorecard, downloadEventSummary } from './scorecardPdf';

const ICONS = { net_profit: Trophy, revenue: Wallet, margin_pct: Percent, waste_pct: Leaf, orders: Receipt };
const fmt = (unit, v) => (unit === 'money' ? formatCurrency(v) : unit === 'percent' ? `${v}%` : v);
const PERIOD_NAMES = { all: 'Whole event', day: 'Today', week: 'Last 7 days', month: 'Last 30 days' };

function Clock() {
  const [now, setNow] = useState(new Date());
  useInterval(() => setNow(new Date()), 1000);
  return <span>{now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>;
}

export default function AdminLeaderboard() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const tv = params.get('tv') === '1';
  const scope = useScope('all');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [full, setFull] = useState(Boolean(document.fullscreenElement));

  // Live: refresh by itself, quicker on the big screen.
  useInterval(scope.reload, tv ? 10000 : 20000);

  const query = { period: scope.period };
  const { data, error, loading } = useAdminData(() => adminGetLeaderboard(query), [scope.period, scope.tick]);

  useEffect(() => {
    const onChange = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };

  const stalls = data?.stalls || [];
  const podium = stalls.filter((s) => s.overall_rank && s.overall_rank <= 3);
  const order = [podium[1], podium[0], podium[2]].filter(Boolean);
  const eventName = data?.event?.name;

  const scorecard = async (stall) => {
    setBusy(String(stall.id));
    setNotice('');
    try {
      await downloadScorecard(await adminGetScorecard(stall.id, query));
    } catch (err) {
      setNotice(`Could not create the scorecard: ${err.message}`);
    } finally {
      setBusy('');
    }
  };

  const summary = async () => {
    setBusy('summary');
    setNotice('');
    try {
      await downloadEventSummary({ board: data, event: data.event, period: PERIOD_NAMES[scope.period] });
    } catch (err) {
      setNotice(`Could not create the summary: ${err.message}`);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className={tv ? 'a-lb a-tvmode' : 'a-lb'}>
      <div className="a-page-head">
        <div>
          {tv && eventName && <div className="a-tv-event">{eventName}</div>}
          <h1 className="a-title">
            {tv ? 'Live leaderboard' : 'Leaderboard'}
            <span className="a-live"><span /> Live</span>
          </h1>
          <p className="a-subtitle">
            {tv ? <><Clock /> · {PERIOD_NAMES[scope.period]}</> : 'Who is winning, and in what. Updates by itself.'}
          </p>
        </div>
        <div className="a-actions">
          {tv ? (
            <div className="a-seg">
              {PERIODS.map((p) => (
                <button key={p.key} className={scope.period === p.key ? 'active' : ''} onClick={() => scope.setPeriod(p.key)}>
                  {p.label}
                </button>
              ))}
            </div>
          ) : (
            <ScopeBar scope={scope} hideStalls />
          )}
          {!tv && (
            <>
              <button className="a-btn" onClick={summary} disabled={!data || busy === 'summary'}>
                <FileDown size={15} /> {busy === 'summary' ? 'Creating...' : 'Event summary PDF'}
              </button>
              <button className="a-btn a-btn-primary" onClick={() => navigate('/leaderboard?tv=1')}>
                <Tv size={15} /> TV mode
              </button>
            </>
          )}
          {tv && (
            <>
              <button className="a-btn" onClick={toggleFullscreen}>
                {full ? <Minimize2 size={15} /> : <Maximize2 size={15} />} {full ? 'Exit full screen' : 'Full screen'}
              </button>
              <button className="a-btn" onClick={() => navigate('/leaderboard')}>
                <X size={15} /> Close TV mode
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div className="a-error">{error}</div>}
      {notice && <div className="a-error">{notice}</div>}

      <div className="a-awards">
        {(data?.awards || []).map((a) => {
          const Icon = ICONS[a.key];
          return (
            <div className="a-award" key={a.key}>
              <span className="a-award-icon"><Icon size={tv ? 26 : 20} /></span>
              <div className="a-award-title">{a.title}</div>
              <div className="a-award-winner">{a.winner ? a.winner.name : 'No winner yet'}</div>
              <div className="a-award-value">{a.winner ? fmt(a.unit, a.winner.value) : ''}</div>
            </div>
          );
        })}
      </div>

      {order.length > 0 && (
        <div className="a-podium">
          {order.map((s) => (
            <div key={s.id} className={`a-podium-col place-${s.overall_rank}`}>
              <span className="a-podium-avatar" style={{ background: avatarColor(s.name) }}>{s.name.charAt(0).toUpperCase()}</span>
              <div className="a-podium-name">{s.name}</div>
              <div className="a-podium-profit">{formatCurrency(s.net_profit)} profit</div>
              <div className="a-podium-step"><span>{s.overall_rank}</span></div>
            </div>
          ))}
        </div>
      )}

      <Card flush title="Full ranking" sub="Points add up each stall's position in the five categories. Fewer points is better.">
        <div className="a-table-wrap">
          <table className="a-table a-lbtable">
            <thead>
              <tr>
                <th>#</th>
                <th>Stall</th>
                <th className="num">Profit</th>
                <th className="num">Revenue</th>
                <th className="num">Margin</th>
                <th className="num">Waste</th>
                <th className="num">Orders</th>
                <th className="num">Points</th>
                {!tv && <th />}
              </tr>
            </thead>
            <tbody>
              {stalls.map((s) => (
                <tr key={s.id} className={s.overall_rank === 1 ? 'champ' : ''}>
                  <td>{s.overall_rank ? <span className={`a-rank-pos pos-${s.overall_rank}`}>{s.overall_rank}</span> : <span className="muted">-</span>}</td>
                  <td>
                    <span className="a-lb-stall">
                      <span className="a-feed-avatar sm" style={{ background: avatarColor(s.name) }}>{s.name.charAt(0).toUpperCase()}</span>
                      {s.name}
                      {!s.overall_rank && <span className="a-pill">No sales yet</span>}
                    </span>
                  </td>
                  <td className={`num${s.net_profit < 0 ? ' neg' : ''}`}>{formatCurrency(s.net_profit)}</td>
                  <td className="num">{formatCurrency(s.revenue)}</td>
                  <td className="num">{s.margin_pct}%</td>
                  <td className="num">{s.waste_pct}%</td>
                  <td className="num">{s.orders}</td>
                  <td className="num"><strong>{s.score ?? '-'}</strong></td>
                  {!tv && (
                    <td className="num">
                      <button className="a-btn a-btn-sm" onClick={() => scorecard(s)} disabled={busy === String(s.id)}>
                        <FileDown size={14} /> {busy === String(s.id) ? '...' : 'Scorecard'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {!stalls.length && <tr><td colSpan={9} className="a-empty">{loading ? 'Loading...' : 'No stalls yet.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
