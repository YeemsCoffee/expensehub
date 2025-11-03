# ExpenseHub Full-Stack Setup Guide

Complete setup instructions for the ExpenseHub expense management system with PostgreSQL database and authentication.

---

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- ✅ **Node.js** (v14 or higher) - [Download](https://nodejs.org)
- ✅ **PostgreSQL** (v12 or higher) - Already installed
- ✅ **npm** (comes with Node.js)
- ✅ **pgAdmin** or **psql** (for database management)

---

## 🗄️ Database Setup

### Step 1: Create Database

Open **pgAdmin** or **psql command line** and run:

```sql
CREATE DATABASE expensehub;
```

Or using psql command line:
```bash
psql -U postgres
CREATE DATABASE expensehub;
\q
```

### Step 2: Run Database Schema

Navigate to the backend folder and run the schema file:

#### Option A: Using psql command line
```bash
cd expense-app-fullstack/backend
psql -U postgres -d expensehub -f database/schema.sql
```

#### Option B: Using pgAdmin
1. Open pgAdmin
2. Connect to your PostgreSQL server
3. Right-click on the `expensehub` database
4. Select **Query Tool**
5. Open the file: `backend/database/schema.sql`
6. Click **Execute (F5)**

### Step 3: Verify Tables Created

Run this query to verify:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public';
```

You should see these tables:
- users
- cost_centers
- vendors
- products
- cart_items
- expenses
- expense_receipts

---

## 🔧 Backend Setup

### Step 1: Navigate to Backend Directory
```bash
cd expense-app-fullstack/backend
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Configure Environment Variables

1. Copy the example environment file:
```bash
copy .env.example .env
```

2. Open `.env` file and update with your PostgreSQL credentials:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=expensehub
DB_USER=postgres
DB_PASSWORD=YOUR_POSTGRES_PASSWORD_HERE

# Server Configuration
PORT=5000
NODE_ENV=development

# JWT Secret (IMPORTANT: Change this to a random string!)
JWT_SECRET=your_super_secret_jwt_key_change_this_now_random_string_12345

# JWT Expiration
JWT_EXPIRES_IN=7d

# File Upload Configuration
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./uploads
```

**⚠️ IMPORTANT:** 
- Replace `YOUR_POSTGRES_PASSWORD_HERE` with your actual PostgreSQL password
- Change `JWT_SECRET` to a random, secure string (at least 32 characters)

### Step 4: Start Backend Server
```bash
npm start
```

Or for development with auto-restart:
```bash
npm run dev
```

You should see:
```
🚀 ExpenseHub API Server
📍 Running on: http://localhost:5000
🌍 Environment: development
```

### Step 5: Test Backend API

Open browser or use Postman to test:
```
http://localhost:5000/api/health
```

You should see:
```json
{
  "status": "OK",
  "message": "ExpenseHub API is running"
}
```

---

## 💻 Frontend Setup (React)

### Step 1: Navigate to Frontend Directory

Open a **NEW terminal window** (keep backend running) and navigate to the React app:

```bash
cd expense-app-fullstack/frontend
```

### Step 2: Copy Your React App

Copy all the files from your original `expense-app` folder to this `frontend` folder:
- src/
- public/
- package.json
- All other files

### Step 3: Install Dependencies
```bash
npm install
```

### Step 4: Install Additional Packages for API Integration
```bash
npm install axios
```

### Step 5: Create API Configuration File

Create `src/services/api.js`:

```javascript
import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
```

### Step 6: Start Frontend
```bash
npm start
```

The app will open at: `http://localhost:3000`

---

## 🔐 Creating Your First User

### Option 1: Using API Directly (Postman/Thunder Client)

**POST** `http://localhost:5000/api/auth/register`

**Body (JSON):**
```json
{
  "email": "your.email@company.com",
  "password": "YourPassword123!",
  "firstName": "Your",
  "lastName": "Name",
  "employeeId": "E00002",
  "department": "Your Department"
}
```

**Response:**
```json
{
  "message": "User registered successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "your.email@company.com",
    "firstName": "Your",
    "lastName": "Name",
    "employeeId": "E00002",
    "department": "Your Department",
    "role": "employee"
  }
}
```

Save the `token` - you'll need it to make authenticated requests!

### Option 2: Create Login/Register Page (Frontend)

You'll need to create login and registration pages in your React app that call these endpoints.

---

## 📊 Testing the System

### 1. Test Authentication
```bash
# Login
POST http://localhost:5000/api/auth/login
Body: {"email": "your.email@company.com", "password": "YourPassword123!"}
```

### 2. Test Get Cost Centers
```bash
# Get all cost centers
GET http://localhost:5000/api/cost-centers
Header: Authorization: Bearer YOUR_TOKEN_HERE
```

### 3. Test Get Vendors
```bash
# Get all vendors
GET http://localhost:5000/api/vendors
Header: Authorization: Bearer YOUR_TOKEN_HERE
```

### 4. Test Create Expense
```bash
# Create expense
POST http://localhost:5000/api/expenses
Header: Authorization: Bearer YOUR_TOKEN_HERE
Body: {
  "date": "2025-10-27",
  "description": "Test expense",
  "category": "Travel",
  "amount": 100.50,
  "costCenterId": 1
}
```

---

## 🔑 API Endpoints Reference

### Authentication
- **POST** `/api/auth/register` - Register new user
- **POST** `/api/auth/login` - Login
- **GET** `/api/auth/profile` - Get current user (requires auth)
- **PUT** `/api/auth/profile` - Update profile (requires auth)
- **POST** `/api/auth/change-password` - Change password (requires auth)

### Expenses
- **GET** `/api/expenses` - Get user's expenses
- **GET** `/api/expenses/:id` - Get single expense
- **POST** `/api/expenses` - Create expense
- **PUT** `/api/expenses/:id` - Update expense
- **DELETE** `/api/expenses/:id` - Delete expense
- **GET** `/api/expenses/pending/all` - Get all pending (manager/admin)
- **POST** `/api/expenses/:id/approve` - Approve expense (manager/admin)
- **POST** `/api/expenses/:id/reject` - Reject expense (manager/admin)

### Vendors & Products
- **GET** `/api/vendors` - Get all vendors with products
- **GET** `/api/vendors/:id` - Get single vendor
- **GET** `/api/vendors/products/search?q=laptop` - Search products

### Shopping Cart
- **GET** `/api/cart` - Get user's cart
- **POST** `/api/cart` - Add to cart
- **PUT** `/api/cart/:id` - Update cart item
- **DELETE** `/api/cart/:id` - Remove from cart
- **DELETE** `/api/cart` - Clear cart
- **POST** `/api/cart/checkout` - Checkout

### Cost Centers
- **GET** `/api/cost-centers` - Get all cost centers
- **GET** `/api/cost-centers/:id` - Get single cost center

---

## 🛠️ Troubleshooting

### Backend won't start
1. Check PostgreSQL is running
2. Verify .env file has correct credentials
3. Check if port 5000 is available
4. Run: `npm install` again

### Database connection error
1. Verify PostgreSQL service is running
2. Check username/password in .env
3. Ensure database 'expensehub' exists
4. Test connection with pgAdmin

### Frontend won't connect to backend
1. Ensure backend is running on port 5000
2. Check CORS is enabled (already configured)
3. Verify API_BASE_URL in api.js

### Authentication issues
1. Ensure JWT_SECRET is set in .env
2. Check token is being sent in headers
3. Verify user exists in database

---

## 📝 Next Steps

1. ✅ Set up database
2. ✅ Configure backend
3. ✅ Start backend server
4. ✅ Set up frontend
5. ✅ Create first user
6. 🔲 Create Login/Register pages in React
7. 🔲 Integrate API calls in React components
8. 🔲 Test full workflow

---

## 🎯 Production Deployment Notes

When deploying to production:

1. **Change JWT_SECRET** to a strong random string
2. **Use environment variables** for all sensitive data
3. **Enable HTTPS** for API and frontend
4. **Use production database** (not localhost)
5. **Enable rate limiting** on API endpoints
6. **Set up proper logging**
7. **Configure CORS** for your domain only
8. **Use a process manager** (PM2) for the backend

---

## 📞 Support

If you encounter issues:
1. Check error messages in terminal
2. Review PostgreSQL logs
3. Check browser console for frontend errors
4. Verify all environment variables are set

---

## 🎉 Success!

Once everything is running, you should have:
- ✅ PostgreSQL database with sample data
- ✅ Backend API running on http://localhost:5000
- ✅ Frontend React app running on http://localhost:3000
- ✅ User authentication working
- ✅ Full expense management system operational

Happy coding! 🚀
