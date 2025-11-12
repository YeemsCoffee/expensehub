import React, { useState, useEffect } from 'react';
import { ShoppingCart, LogOut, User as UserIcon, Moon, Sun } from 'lucide-react';

const Header = ({ cartItemCount, onCartClick, user, onLogout }) => {
  const [theme, setTheme] = useState(() => {
    // Check localStorage first, then system preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) return savedTheme;

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    // Apply theme to document
    document.documentElement.setAttribute('data-theme', theme);
    // Save to localStorage
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
  };

  return (
    <div className="header">
      <div className="container">
        <div className="header-content">
          <div className="header-left">
            <h1 className="header-title">ExpenseHub</h1>
            <p className="header-subtitle">Expense Management System</p>
          </div>
          <div className="header-right">
            {user && (
              <>
                <div className="user-info">
                  <UserIcon size={20} />
                  <div className="user-details">
                    <span className="user-name">{user.firstName} {user.lastName}</span>
                    <span className="user-role">{user.role}</span>
                  </div>
                </div>
                <button
                  onClick={toggleTheme}
                  className="theme-toggle"
                  title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                  aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                >
                  {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                </button>
                <button onClick={onCartClick} className="header-cart">
                  <ShoppingCart size={24} />
                  {cartItemCount > 0 && (
                    <span className="cart-badge">{cartItemCount}</span>
                  )}
                </button>
                <button onClick={onLogout} className="btn btn-secondary" title="Logout">
                  <LogOut size={20} />
                  Logout
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Header;