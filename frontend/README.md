# ExpenseHub - Expense & Procurement Management System

A comprehensive expense and procurement management system similar to SAP Concur, built with React.

## Features

- **Dashboard**: Real-time overview of expenses, spending, and approvals
- **Vendor Marketplace**: Browse and purchase from multiple approved vendors
- **Expense Reporting**: Submit expense reports with categories and cost centers
- **Shopping Cart**: Multi-vendor cart with approval workflow
- **Cost Center Management**: Track expenses by department

## Project Structure

```
expense-app/
├── public/
│   └── index.html              # HTML template
├── src/
│   ├── components/             # Reusable components
│   │   ├── Header.js           # Application header
│   │   ├── Navigation.js       # Tab navigation
│   │   └── StatusBadge.js      # Status indicator component
│   ├── pages/                  # Page components
│   │   ├── Dashboard.js        # Dashboard page
│   │   ├── Marketplace.js      # Vendor marketplace page
│   │   ├── Expenses.js         # Expense submission page
│   │   └── Cart.js             # Shopping cart page
│   ├── styles/                 # CSS files
│   │   └── App.css             # Main stylesheet
│   ├── utils/                  # Helper functions and constants
│   │   ├── constants.js        # Application constants
│   │   └── helpers.js          # Utility functions
│   ├── App.js                  # Main application component
│   └── index.js                # Application entry point
├── package.json                # Dependencies and scripts
└── README.md                   # This file
```

## Installation

1. Navigate to the project directory:
```bash
cd expense-app
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

4. Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

## Available Scripts

- `npm start` - Runs the app in development mode
- `npm build` - Builds the app for production
- `npm test` - Runs the test suite
- `npm eject` - Ejects from Create React App (one-way operation)

## Architecture

### Components
- **Header**: Displays app branding and user info
- **Navigation**: Tab-based navigation system
- **StatusBadge**: Reusable status indicator with icons

### Pages
- **Dashboard**: Statistics and recent activity overview
- **Marketplace**: Vendor and product browsing
- **Expenses**: Expense submission and history
- **Cart**: Shopping cart with checkout

### Utils
- **constants.js**: Cost centers, categories, vendors, sample data
- **helpers.js**: Calculation and formatting functions

### State Management
All state is managed in the main `App.js` component using React hooks:
- `activeTab`: Current navigation tab
- `cart`: Shopping cart items
- `expenses`: List of expense reports

## Customization

### Adding Vendors
Edit `src/utils/constants.js` and add to the `VENDORS` array:

```javascript
{
  id: 4,
  name: 'New Vendor',
  category: 'Category',
  rating: 4.5,
  products: [...]
}
```

### Adding Cost Centers
Edit `src/utils/constants.js` and add to the `COST_CENTERS` array:

```javascript
{ 
  code: 'CC-006', 
  name: 'New Department', 
  budget: 50000 
}
```

### Adding Expense Categories
Edit `src/utils/constants.js` and add to the `EXPENSE_CATEGORIES` array.

## Future Enhancements

- Backend API integration
- User authentication
- Approval workflow management
- Receipt OCR processing
- Budget tracking and alerts
- Reporting and analytics
- Mobile responsive improvements
- PDF export functionality

## License

MIT
