import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../AuthContext';

export default function NavBar() {
  const { user, cartCount, isAdmin, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function onDocClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [menuOpen]);

  async function onLogout() {
    setMenuOpen(false);
    await logout();
  }

  return (
    <header className="nav">
      <Link to="/" className="logo">
        Delight Cafe
      </Link>
      <nav>
        <NavLink to="/" end>
          Home
        </NavLink>
        <NavLink to="/menu">Menu</NavLink>
        {user && (
          <NavLink to="/cart" className="nav-cart">
            Cart {cartCount > 0 && <span className="badge">{cartCount}</span>}
          </NavLink>
        )}
        {user && <NavLink to="/orders">My Orders</NavLink>}
        {isAdmin && (
          <a href="/admin.html" className="external">
            Dashboard
          </a>
        )}
        {user ? (
          <div
            className={`nav-account-menu${isAdmin ? ' is-admin' : ''}${menuOpen ? ' is-open' : ''}`}
            ref={menuRef}
          >
            <button
              type="button"
              className="nav-account-trigger"
              aria-expanded={menuOpen}
              aria-haspopup="true"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className="nav-account-label">APP</span>
            </button>
            {menuOpen && (
              <div className="nav-account-dropdown">
                <button type="button" className="nav-account-logout" onClick={onLogout}>
                  Logout
                </button>
              </div>
            )}
          </div>
        ) : (
          <NavLink to="/">Sign in</NavLink>
        )}
      </nav>
    </header>
  );
}
