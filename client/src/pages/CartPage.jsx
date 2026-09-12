import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, formatRupee } from '../api';
import { useAuth } from '../AuthContext';

export default function CartPage() {
  const { user, refreshAuth } = useAuth();
  const navigate = useNavigate();
  const [cart, setCart] = useState([]);
  const [error, setError] = useState('');

  async function load() {
    const data = await api('/cart');
    if (!data.success) {
      setError(data.message || 'Could not load cart');
      return;
    }
    setCart(data.cart || []);
    await refreshAuth();
  }

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }
    load();
  }, [user]);

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  async function updateQty(name, quantity) {
    if (quantity < 1) return remove(name);
    const data = await api('/cart/update', {
      method: 'PATCH',
      body: JSON.stringify({ name, quantity })
    });
    if (data.success) {
      setCart(data.cart || []);
      await refreshAuth();
    }
  }

  async function remove(name) {
    const data = await api(`/cart/item/${encodeURIComponent(name)}`, { method: 'DELETE' });
    if (data.success) {
      setCart(data.cart || []);
      await refreshAuth();
    }
  }

  async function clear() {
    await api('/cart/clear', { method: 'DELETE' });
    setCart([]);
    await refreshAuth();
  }

  return (
    <main className="page">
      <header className="section-head">
        <p className="kicker">Cart</p>
        <h1>Your cart</h1>
        <p className="lead">Synced with Express session + `user_carts` database table</p>
      </header>

      {error && <p className="error">{error}</p>}

      {!cart.length ? (
        <section className="card">
          <p>Your cart is empty.</p>
          <Link className="btn" to="/menu">
            Browse menu
          </Link>
        </section>
      ) : (
        <section className="card">
          <ul className="cart-list">
            {cart.map((item) => (
              <li key={item.name}>
                <div>
                  <strong>{item.name}</strong>
                  <p>{formatRupee(item.price)} each</p>
                </div>
                <div className="qty">
                  <button type="button" onClick={() => updateQty(item.name, item.quantity - 1)}>
                    −
                  </button>
                  <span>{item.quantity}</span>
                  <button type="button" onClick={() => updateQty(item.name, item.quantity + 1)}>
                    +
                  </button>
                </div>
                <strong>{formatRupee(item.price * item.quantity)}</strong>
                <button type="button" className="linkish" onClick={() => remove(item.name)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div className="total-row">
            <span>Total</span>
            <strong>{formatRupee(total)}</strong>
          </div>
          <div className="cta">
            <a
              className="btn"
              href={import.meta.env.DEV ? 'http://localhost:8080/checkout.html' : '/checkout.html'}
            >
              Continue to checkout
            </a>
            <button type="button" className="btn ghost" onClick={clear}>
              Clear cart
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
