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
import api from './services/api';
import './styles/design-tokens.css';
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

  // Fetch cart from backend
  const fetchCart = async () => {
    try {
      const response = await api.get('/cart');
      const cartItems = response.data.map(item => ({
        id: item.id,
        productId: item.product_id,
        vendorId: item.vendor_id,
        vendorName: item.vendor_name,
        productName: item.product_name,
        price: parseFloat(item.price),
        quantity: parseInt(item.quantity),
        costCenterId: item.cost_center_id
      }));
      setCart(cartItems);
    } catch (error) {
      console.error('Failed to fetch cart:', error);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');

    if (token && savedUser) {
      const userData = JSON.parse(savedUser);
      setUser(userData);
      setCurrentView('app');

      // Fetch cart items from backend
      fetchCart();

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

    // Fetch cart items from backend
    fetchCart();

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

    // Fetch cart items from backend
    fetchCart();

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

  const handleAddToCart = async (vendor, product) => {
    try {
      await api.post('/cart', {
        productId: product.id,
        quantity: 1,
        costCenterId: 1 // Default cost center
      });
      // Refresh cart from backend
      await fetchCart();
    } catch (error) {
      console.error('Failed to add to cart:', error);
      alert('Failed to add item to cart');
    }
  };

  const handleUpdateCartQuantity = async (productId, delta) => {
    try {
      const item = cart.find(i => i.productId === productId);
      if (!item) return;

      const newQuantity = item.quantity + delta;

      if (newQuantity <= 0) {
        // Remove item
        await api.delete(`/cart/${item.id}`);
      } else {
        // Update quantity
        await api.put(`/cart/${item.id}`, { quantity: newQuantity });
      }

      // Refresh cart from backend
      await fetchCart();
    } catch (error) {
      console.error('Failed to update cart:', error);
      alert('Failed to update cart');
    }
  };

  const handleRemoveFromCart = async (productId) => {
    try {
      const item = cart.find(i => i.productId === productId);
      if (!item) return;

      await api.delete(`/cart/${item.id}`);
      // Refresh cart from backend
      await fetchCart();
    } catch (error) {
      console.error('Failed to remove from cart:', error);
      alert('Failed to remove item from cart');
    }
  };

  const handleCheckout = async (costCenterId, locationId) => {
    if (cart.length === 0) return;

    if (!costCenterId) {
      alert('Please select a cost center');
      return;
    }

    if (!locationId) {
      alert('Please select a shipping location');
      return;
    }

    try {
      const response = await api.post('/cart/checkout', {
        costCenterId: parseInt(costCenterId),
        locationId: parseInt(locationId)
      });

      const totalAmount = calculateCartTotal(cart);
      const expenseCount = response.data.count || response.data.expenses?.length;
      const autoApproved = response.data.autoApproved;

      if (autoApproved) {
        alert(
          `Expenses automatically approved!\n\n` +
          `${expenseCount} expense${expenseCount > 1 ? 's' : ''} created and approved\n` +
          `Total: $${totalAmount.toFixed(2)}\n\n` +
          `Your expenses are ready for processing.`
        );
      } else {
        alert(
          `Expense report submitted successfully!\n\n` +
          `${expenseCount} expense${expenseCount > 1 ? 's' : ''} created\n` +
          `Total: $${totalAmount.toFixed(2)}\n\n` +
          `Your expenses have been submitted for manager approval.`
        );
      }

      // Refresh cart from backend (should be empty now)
      await fetchCart();

      // Store success info in sessionStorage for expense history page
      sessionStorage.setItem('expenseSubmitSuccess', JSON.stringify({
        count: expenseCount,
        total: totalAmount.toFixed(2),
        autoApproved: autoApproved,
        timestamp: Date.now()
      }));

      // Navigate to expense history to see submitted expenses
      setActiveTab('expenses-history');
    } catch (error) {
      console.error('Checkout failed:', error);
      alert(error.response?.data?.error || 'Failed to submit expenses for approval');
    }
  };

  const handleCartClick = () => {
    setActiveTab('cart');
    // Refresh cart when navigating to cart page
    fetchCart();
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
        return <Marketplace onAddToCart={handleAddToCart} onRefreshCart={fetchCart} />;
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