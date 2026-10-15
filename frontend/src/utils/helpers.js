export const calculateCartTotal = (cart) => {
  return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
};

export const calculateTax = (amount, taxRate = 0.08) => {
  return amount * taxRate;
};

export const formatCurrency = (amount) => {
  const value = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(value);
};

// "Supplies › Milk" for an expense with a sub-category, else just "Supplies"
export const formatCategory = (expense) => {
  if (!expense) return '';
  return expense.subcategory_name
    ? `${expense.category} › ${expense.subcategory_name}`
    : expense.category;
};

export const getStatusColor = (status) => {
  switch(status) {
    case 'approved': return 'approved';
    case 'rejected': return 'rejected';
    case 'pending': return 'pending';
    default: return '';
  }
};

export const calculateTotalSpending = (expenses) => {
  return expenses.reduce((sum, exp) => sum + exp.amount, 0);
};

export const filterExpensesByStatus = (expenses, status) => {
  return expenses.filter(exp => exp.status === status);
};

export const sortExpensesByDate = (expenses, descending = true) => {
  return [...expenses].sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    return descending ? dateB - dateA : dateA - dateB;
  });
};
