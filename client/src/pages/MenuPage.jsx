import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, formatRupee } from '../api';
import { useAuth } from '../AuthContext';

export default function MenuPage() {
  const { user, refreshAuth } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [active, setActive] = useState('all');
  const [qty, setQty] = useState({});
  const [message, setMessage] = useState('');

  useEffect(() => {
    (async () => {
      const [menu, cats] = await Promise.all([api('/menu'), api('/menu/categories')]);
      setItems(menu.items || []);
      setCategories(cats.categories || []);
    })();
  }, []);

  const visible = useMemo(() => {
    if (active === 'all') return items;
    return items.filter((item) => item.category === active);
  }, [items, active]);

  async function addItem(item) {
    if (!user) {
      navigate('/');
      return;
    }
    const quantity = qty[item.name] || 1;
    const data = await api('/cart/add', {
      method: 'POST',
      body: JSON.stringify({ name: item.name, quantity })
    });
    if (!data.success) {
      setMessage(data.message || 'Could not add item');
      return;
    }
    setMessage(`Added ${item.name}`);
    await refreshAuth();
  }

  return (
    <main className="page">
      <header className="section-head">
        <p className="kicker">Menu</p>
        <h1>Order from Delight Cafe</h1>
        <p className="lead">Live catalog from Express `/api/menu` · cart saved in SQLite</p>
        {message && <p className="ok">{message}</p>}
        <Link className="btn ghost" to="/cart">
          Open cart
        </Link>
      </header>

      <div className="chips">
        <button type="button" className={active === 'all' ? 'chip on' : 'chip'} onClick={() => setActive('all')}>
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            className={active === cat ? 'chip on' : 'chip'}
            onClick={() => setActive(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid">
        {visible.map((item) => (
          <article key={item.name} className="dish">
            {item.image && <img src={`/${item.image.replace(/^\//, '')}`} alt={item.name} />}
            <h3>{item.name}</h3>
            <p>{formatRupee(item.price)}</p>
            <div className="qty">
              <button
                type="button"
                onClick={() =>
                  setQty((prev) => ({ ...prev, [item.name]: Math.max(1, (prev[item.name] || 1) - 1) }))
                }
              >
                −
              </button>
              <span>{qty[item.name] || 1}</span>
              <button
                type="button"
                onClick={() =>
                  setQty((prev) => ({ ...prev, [item.name]: Math.min(100, (prev[item.name] || 1) + 1) }))
                }
              >
                +
              </button>
            </div>
            <button type="button" className="btn" onClick={() => addItem(item)}>
              Add to cart
            </button>
          </article>
        ))}
      </div>
    </main>
  );
}
