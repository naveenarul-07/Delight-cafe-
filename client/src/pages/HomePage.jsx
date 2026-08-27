import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

export default function HomePage() {
  const { user, login, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const data = await login(username, password);
    setBusy(false);
    if (!data.success) {
      setError(data.message || 'Login failed');
      return;
    }
    navigate('/menu');
  }

  if (loading) return <main className="page"><p>Loading…</p></main>;

  return (
    <main className="page home">
      <section className="hero">
        <p className="kicker">Delight Cafe</p>
        <h1>Fresh plates & warm hospitality</h1>
        <p className="lead">
          {user
            ? `Welcome back, ${user.username}. Your orders are saved in the database.`
            : 'Sign in to order from the menu. Backend powered by Express + SQLite.'}
        </p>
        <div className="cta">
          <Link className="btn" to="/menu">
            Explore menu
          </Link>
          {user && (
            <Link className="btn ghost" to="/orders">
              My orders
            </Link>
          )}
          {isAdmin && (
            <a className="btn ghost" href="/admin.html">
              Admin dashboard
            </a>
          )}
        </div>
      </section>

      {!user ? (
        <form className="card" onSubmit={onSubmit}>
          <p className="kicker">Welcome back</p>
          <h2>Sign in</h2>
          {error && <p className="error">{error}</p>}
          <label>
            Mobile or email
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button className="btn" disabled={busy} type="submit">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="hint">Mobile number or email · session stored in SQLite</p>
        </form>
      ) : (
        <section className="card">
          <p className="kicker">{isAdmin ? 'Admin account' : 'Signed in'}</p>
          <h2>App</h2>
          <p className="hint">React UI connected to your existing Express backend APIs.</p>
          <div className="cta">
            <Link className="btn" to="/menu">
              Menu
            </Link>
            <Link className="btn ghost" to="/cart">
              Cart
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
