import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, formatRupee } from '../api';
import { useAuth } from '../AuthContext';

export default function OrdersPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState('all');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }
    (async () => {
      const data = await api(`/orders?status=${encodeURIComponent(status)}`);
      if (!data.success) {
        setError(data.message || 'Could not load orders');
        return;
      }
      setOrders(data.orders || []);
    })();
  }, [user, status]);

  return (
    <main className="page">
      <header className="section-head">
        <p className="kicker">My Orders</p>
        <h1>Order history</h1>
        <p className="lead">Loaded from SQLite via Express `/api/orders`</p>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All orders</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </header>

      {error && <p className="error">{error}</p>}

      {!orders.length ? (
        <section className="card">
          <p>No orders in this filter.</p>
          <Link className="btn" to="/menu">
            Order now
          </Link>
        </section>
      ) : (
        <div className="orders">
          {orders.map((order) => (
            <article key={order.id} className="card order">
              <div className="order-top">
                <h3>Order #{order.id}</h3>
                <span className="pill">{String(order.status || '').replace(/_/g, ' ')}</span>
              </div>
              <p>
                {new Date(order.placedAt).toLocaleString('en-IN')} ·{' '}
                {(order.paymentMethod || 'N/A').toUpperCase()}
              </p>
              <ul>
                {(order.items || []).map((item) => (
                  <li key={`${order.id}-${item.name}`}>
                    {item.name} × {item.quantity}
                    <strong>{formatRupee(item.price * item.quantity)}</strong>
                  </li>
                ))}
              </ul>
              <p className="total-row">
                <span>Total</span>
                <strong>{formatRupee(order.total)}</strong>
              </p>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
