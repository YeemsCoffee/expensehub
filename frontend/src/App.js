import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Navigation from './components/Navigation';
import Dashboard from './pages/Dashboard';
import EmployeeHome from './pages/EmployeeHome';
import Marketplace from './pages/Marketplace';
import ExpenseSubmit from './pages/ExpenseSubmit';
import ExpenseHistory from './pages/ExpenseHistory';
import Cart from './pages/Cart';
import CostCenters from './pages/CostCenters';
import Locations from './pages/Locations';
import Projects from './pages/Projects';
import Users from './pages/Users';
import ApprovalRules from './pages/ApprovalRules';
import Approvals from './pages/Approvals';
import XeroSettings from './pages/XeroSettings';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import { calculateCartTotal } from './utils/helpers';
import './styles/App.css';
import './styles/navigation.css';
import './styles/cards.css';
import './styles/forms.css';
import './styles/tables.css';
import './styles/components.css';
import './styles/auth.css';
import './styles/dashboard.css';
import './styles/modals.css';
import './styles/utilities.css';
import './styles/employeehome.css';

const App = () => {
  const [activeTab, setActiveTab] = useState('');
  const [cart, setCart] = useState([]);
  const [user, setUser] = useState(null);
  const [currentView, setCurrentView] = useState('login');

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    
    if (token && savedUser) {
      const userData = JSON.parse(savedUser);
      setUser(userData);
      setCurrentView('app');
      
      // Set default tab based on role
      if (userData.role === 'employee') {
        setActiveTab('home');
      } else if (userData.role === 'developer') {
        setActiveTab('home'); // Developers start at employee view
      } else {
        setActiveTab('dashboard');
      }
    } else {
      const initialHash = window.location.hash.slice(1).split('?')[0].replace(/^\//, '');
      if (initialHash === 'register') {
        setCurrentView('register');
      } else if (initialHash === 'login') {
        setCurrentView('login');
      } else if (initialHash === 'forgot-password') {
        setCurrentView('forgot-password');
      } else if (initialHash === 'reset-password') {
        setCurrentView('reset-password');
      }
    }

    const handleHashChange = () => {
      const hash = window.location.hash.slice(1).split('?')[0].replace(/^\//, '');
      if (hash === 'register') {
        setCurrentView('register');
      } else if (hash === 'login') {
        setCurrentView('login');
      } else if (hash === 'forgot-password') {
        setCurrentView('forgot-password');
      } else if (hash === 'reset-password') {
        setCurrentView('reset-password');
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    setCurrentView('app');
    window.location.hash = '';
    
    // Set initial tab based on role
    if (userData.role === 'employee') {
      setActiveTab('home');
    } else if (userData.role === 'developer') {
      setActiveTab('home'); // Developers start at employee view
    } else {
      setActiveTab('dashboard');
    }
  };

  const handleRegisterSuccess = (userData) => {
    setUser(userData);
    setCurrentView('app');
    window.location.hash = '';
    
    // Set initial tab based on role
    if (userData.role === 'employee') {
      setActiveTab('home');
    } else if (userData.role === 'developer') {
      setActiveTab('home'); // Developers start at employee view
    } else {
      setActiveTab('dashboard');
    }
  };

  const handleNavigateToRegister = () => {
    setCurrentView('register');
    window.location.hash = 'register';
  };

  const handleNavigateToLogin = () => {
    setCurrentView('login');
    window.location.hash = 'login';
  };

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setUser(null);
      setCart([]);
      setActiveTab('');
      setCurrentView('login');
      window.location.hash = '';
    }
  };

  const handleAddToCart = (vendor, product) => {
    const existingItem = cart.find(item => item.productId === product.id);
    if (existingItem) {
      setCart(cart.map(item =>
        item.productId === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, {
        productId: product.id,
        vendorId: vendor.id,
        vendorName: vendor.name,
        productName: product.name,
        price: product.price,
        quantity: 1
      }]);
    }
  };

  const handleUpdateCartQuantity = (productId, delta) => {
    setCart(cart.map(item =>
      item.productId === productId
        ? { ...item, quantity: Math.max(0, item.quantity + delta) }
        : item
    ).filter(item => item.quantity > 0));
  };

  const handleRemoveFromCart = (productId) => {
    setCart(cart.filter(item => item.productId !== productId));
  };

  const handleCheckout = () => {
    if (cart.length === 0) return;
    
    const totalAmount = calculateCartTotal(cart);
    alert(`Order submitted for approval!\nTotal: $${totalAmount.toFixed(2)}\nItems will be ordered upon approval.`);
    setCart([]);
  };

  const handleCartClick = () => {
    setActiveTab('cart');
  };

  if (currentView === 'login') {
    return <Login onLoginSuccess={handleLoginSuccess} onNavigateToRegister={handleNavigateToRegister} />;
  }

  if (currentView === 'register') {
    return <Register onRegisterSuccess={handleRegisterSuccess} onNavigateToLogin={handleNavigateToLogin} />;
  }

  if (currentView === 'forgot-password') {
    return <ForgotPassword onNavigateToLogin={handleNavigateToLogin} />;
  }

  if (currentView === 'reset-password') {
    return <ResetPassword onNavigateToLogin={handleNavigateToLogin} />;
  }

  const renderPage = () => {
    switch(activeTab) {
      case 'home':
        return <EmployeeHome onNavigate={setActiveTab} />;
      case 'dashboard':
        return <Dashboard />;
      case 'marketplace':
        return <Marketplace onAddToCart={handleAddToCart} />;
      case 'expenses-submit':
        return <ExpenseSubmit />;
      case 'expenses-history':
        return <ExpenseHistory />;
      case 'costcenters':
        return <CostCenters />;
      case 'locations':
        return <Locations />;
      case 'projects':
        return <Projects />;
      case 'users':
        return <Users />;
      case 'approval-rules':
        return <ApprovalRules />;
      case 'approvals':
        return <Approvals />;
      case 'xero-settings':
        return <XeroSettings />;
      case 'cart':
        return (
          <Cart
            cart={cart}
            onUpdateQuantity={handleUpdateCartQuantity}
            onRemoveItem={handleRemoveFromCart}
            onCheckout={handleCheckout}
            onNavigate={setActiveTab}
          />
        );
      default:
        // Default based on role
        if (user?.role === 'employee' || user?.role === 'developer') {
          return <EmployeeHome onNavigate={setActiveTab} />;
        }
        return <Dashboard />;
    }
  };

  return (
    <div className="app">
      <Header 
        cartItemCount={cart.length} 
        onCartClick={handleCartClick} 
        user={user}
        onLogout={handleLogout}
      />
      <Navigation 
        activeTab={activeTab} 
        onTabChange={setActiveTab}
        userRole={user?.role || 'employee'}
      />
      <div className="container main-content">
        {renderPage()}
      </div>
    </div>
  );
};

export default App;