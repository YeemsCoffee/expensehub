# ExpenseHub - System Architecture

## 📐 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT SIDE                           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │           React Frontend (Port 3000)                   │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐ │  │
│  │  │  Dashboard  │  │  Marketplace │  │   Expenses   │ │  │
│  │  └─────────────┘  └──────────────┘  └──────────────┘ │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐ │  │
│  │  │    Cart     │  │    Login     │  │   Register   │ │  │
│  │  └─────────────┘  └──────────────┘  └──────────────┘ │  │
│  └───────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP/REST API (axios)
                         │ JWT Authentication
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                        SERVER SIDE                           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │      Express.js Backend API (Port 5000)               │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │              Middleware Layer                    │  │  │
│  │  │  • CORS    • Auth (JWT)   • Validation          │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │                 Routes/Controllers               │  │  │
│  │  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │  │  │
│  │  │  │   Auth   │  │ Expenses │  │   Vendors    │  │  │  │
│  │  │  └──────────┘  └──────────┘  └──────────────┘  │  │  │
│  │  │  ┌──────────┐  ┌──────────┐                    │  │  │
│  │  │  │   Cart   │  │Cost Ctrs │                    │  │  │
│  │  │  └──────────┘  └──────────┘                    │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │ SQL Queries (pg driver)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                       DATABASE                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │         PostgreSQL Database (Port 5432)               │  │
│  │  ┌──────────┐  ┌───────────┐  ┌───────────────────┐ │  │
│  │  │  users   │  │ expenses  │  │  cost_centers     │ │  │
│  │  └──────────┘  └───────────┘  └───────────────────┘ │  │
│  │  ┌──────────┐  ┌───────────┐  ┌───────────────────┐ │  │
│  │  │ vendors  │  │ products  │  │   cart_items      │ │  │
│  │  └──────────┘  └───────────┘  └───────────────────┘ │  │
│  │  ┌──────────────────────────┐                        │  │
│  │  │  expense_receipts        │                        │  │
│  │  └──────────────────────────┘                        │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 🗂️ Database Schema

### Users Table
- Stores user accounts with authentication
- Fields: email, password_hash, name, employee_id, role
- Roles: employee, manager, admin

### Expenses Table
- Tracks all expense submissions
- Links to: users, cost_centers
- Statuses: pending, approved, rejected

### Vendors & Products Tables
- Vendor marketplace catalog
- One-to-many relationship (1 vendor → many products)

### Cart Items Table
- Temporary shopping cart storage
- Links to: users, products, cost_centers

### Cost Centers Table
- Department budget tracking
- Used for expense categorization

## 🔐 Authentication Flow

```
1. User Registration/Login
   ├─→ Frontend sends credentials
   ├─→ Backend validates
   ├─→ Password hashed (bcrypt)
   ├─→ JWT token generated
   └─→ Token sent to frontend

2. Authenticated Requests
   ├─→ Frontend includes token in header
   ├─→ Backend middleware verifies JWT
   ├─→ User info extracted from token
   └─→ Request processed with user context

3. Token Storage
   └─→ Stored in localStorage (frontend)
```

## 📡 API Request Flow

### Example: Create Expense

```
1. User fills expense form → React Component
   ↓
2. Form data validated → Frontend
   ↓
3. POST /api/expenses + JWT token → API Call
   ↓
4. Token verified → Auth Middleware
   ↓
5. Request validated → express-validator
   ↓
6. INSERT query → PostgreSQL
   ↓
7. Response with new expense → Backend
   ↓
8. UI updated → React State Update
```

## 🔄 Data Flow: Shopping Cart to Expense

```
1. Browse Vendors → GET /api/vendors
2. Add to Cart → POST /api/cart
3. Cart persists in DB → cart_items table
4. Checkout → POST /api/cart/checkout
5. Creates expenses → expenses table
6. Clears cart → DELETE cart_items
7. Awaits approval → status: 'pending'
```

## 🛡️ Security Features

### Authentication
- ✅ JWT tokens with expiration
- ✅ Password hashing (bcrypt)
- ✅ Protected routes (middleware)
- ✅ Role-based access control

### Data Protection
- ✅ SQL injection prevention (parameterized queries)
- ✅ Input validation (express-validator)
- ✅ CORS configuration
- ✅ Environment variables for secrets

### Authorization Levels
- **Employee**: Create expenses, manage own cart
- **Manager**: Approve/reject expenses
- **Admin**: Full system access

## 📊 Tech Stack

### Frontend
- **React** 18.x - UI framework
- **Lucide React** - Icons
- **Axios** - HTTP client
- **CSS** - Styling (no framework)

### Backend
- **Node.js** - Runtime
- **Express.js** - Web framework
- **PostgreSQL** - Database
- **pg** - PostgreSQL driver
- **jsonwebtoken** - JWT auth
- **bcryptjs** - Password hashing
- **express-validator** - Input validation
- **cors** - Cross-origin requests
- **dotenv** - Environment config

### Development Tools
- **nodemon** - Auto-restart server
- **pgAdmin** - Database management

## 🔌 API Endpoints Summary

### Public Endpoints (No Auth)
- POST `/api/auth/register` - Create account
- POST `/api/auth/login` - Login

### Protected Endpoints (Auth Required)
- GET `/api/auth/profile` - Get user info
- GET `/api/expenses` - List expenses
- POST `/api/expenses` - Create expense
- GET `/api/vendors` - List vendors
- POST `/api/cart` - Add to cart
- POST `/api/cart/checkout` - Complete purchase
- GET `/api/cost-centers` - List cost centers

### Admin/Manager Only
- POST `/api/expenses/:id/approve` - Approve
- POST `/api/expenses/:id/reject` - Reject
- GET `/api/expenses/pending/all` - View all pending

## 📈 Scalability Considerations

### Current Architecture
- Monolithic backend (easy to start)
- Direct database connections
- Session stored in JWT

### Future Enhancements
- Add Redis for caching
- Implement message queue (RabbitMQ)
- Separate microservices
- Add CDN for static assets
- Implement full-text search (Elasticsearch)
- Add WebSocket for real-time updates

## 🔄 Deployment Architecture

### Development (Current)
```
localhost:3000 (Frontend)
    ↓
localhost:5000 (Backend)
    ↓
localhost:5432 (PostgreSQL)
```

### Production (Recommended)
```
domain.com (Frontend - Vercel/Netlify)
    ↓ HTTPS
api.domain.com (Backend - Heroku/AWS)
    ↓ SSL
PostgreSQL (AWS RDS/Heroku Postgres)
```

## 📝 File Structure

```
expense-app-fullstack/
├── backend/
│   ├── config/
│   │   └── database.js       # DB connection
│   ├── middleware/
│   │   └── auth.js           # JWT verification
│   ├── routes/
│   │   ├── auth.js           # Auth endpoints
│   │   ├── expenses.js       # Expense CRUD
│   │   ├── vendors.js        # Vendor/product listing
│   │   ├── cart.js           # Shopping cart
│   │   └── costCenters.js    # Cost centers
│   ├── database/
│   │   └── schema.sql        # Database setup
│   ├── server.js             # Entry point
│   ├── package.json          # Dependencies
│   └── .env                  # Configuration
│
└── frontend/
    ├── src/
    │   ├── components/       # Reusable UI components
    │   ├── pages/            # Page components
    │   ├── services/         # API calls
    │   ├── styles/           # CSS files
    │   └── utils/            # Helper functions
    ├── public/
    └── package.json
```

## 🎯 Key Design Decisions

1. **JWT vs Sessions**: JWT chosen for stateless API
2. **Monolithic vs Microservices**: Monolithic for simplicity
3. **REST vs GraphQL**: REST for standard CRUD operations
4. **SQL vs NoSQL**: PostgreSQL for relational data integrity
5. **Component Structure**: Separated pages and components for maintainability

---

This architecture provides a solid foundation for a production-ready expense management system with room for growth and scaling.
