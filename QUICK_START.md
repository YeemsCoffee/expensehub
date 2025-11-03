# ExpenseHub - Quick Start Checklist

Follow this checklist to get your system running quickly!

## ✅ Pre-Setup Checklist

- [ ] Node.js installed (check: `node --version`)
- [ ] npm installed (check: `npm --version`)
- [ ] PostgreSQL installed and running
- [ ] Know your PostgreSQL password

---

## 📦 Installation Steps

### 1️⃣ Extract Files
- [ ] Download and extract `expense-app-fullstack.zip`

### 2️⃣ Database Setup (5 minutes)
- [ ] Open pgAdmin or psql
- [ ] Run: `CREATE DATABASE expensehub;`
- [ ] Execute the SQL file: `backend/database/schema.sql`
- [ ] Verify tables were created

### 3️⃣ Backend Setup (3 minutes)
```bash
cd expense-app-fullstack/backend
npm install
copy .env.example .env
# Edit .env file with your PostgreSQL password
npm start
```
- [ ] Backend dependencies installed
- [ ] .env file configured
- [ ] Backend server running on port 5000
- [ ] Test: Open `http://localhost:5000/api/health`

### 4️⃣ Frontend Setup (3 minutes)
Open NEW terminal:
```bash
cd expense-app-fullstack/frontend
npm install
npm start
```
- [ ] Frontend dependencies installed
- [ ] Frontend running on port 3000
- [ ] Browser opened automatically

---

## 🔐 Create Your First User

### Option 1: Using Postman/Thunder Client
```
POST http://localhost:5000/api/auth/register

Body (JSON):
{
  "email": "admin@company.com",
  "password": "Admin123!",
  "firstName": "Admin",
  "lastName": "User",
  "employeeId": "E00001",
  "department": "Management"
}
```

### Option 2: Using curl
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@company.com\",\"password\":\"Admin123!\",\"firstName\":\"Admin\",\"lastName\":\"User\",\"employeeId\":\"E00001\",\"department\":\"Management\"}"
```

- [ ] First user created
- [ ] Token received
- [ ] Can login

---

## 🧪 Quick Test

Test these endpoints to verify everything works:

### 1. Health Check
```
GET http://localhost:5000/api/health
```
Should return: `{"status": "OK"}`

### 2. Login
```
POST http://localhost:5000/api/auth/login
Body: {"email": "admin@company.com", "password": "Admin123!"}
```
Should return token

### 3. Get Vendors (with token)
```
GET http://localhost:5000/api/vendors
Header: Authorization: Bearer YOUR_TOKEN
```
Should return list of vendors

### 4. Get Cost Centers (with token)
```
GET http://localhost:5000/api/cost-centers
Header: Authorization: Bearer YOUR_TOKEN
```
Should return list of cost centers

- [ ] All tests passing

---

## 🎯 What's Included

### Sample Data Already in Database:
- ✅ 5 Cost Centers (Marketing, Sales, IT, HR, Operations)
- ✅ 3 Vendors (Office Depot, Dell, Staples)
- ✅ 12 Products across all vendors

### You Need to Create:
- ⚠️ User accounts (register via API)
- ⚠️ Expenses (submit through the app)

---

## 🚨 Common Issues

### "Cannot connect to database"
- Check PostgreSQL is running
- Verify password in .env file
- Ensure database 'expensehub' exists

### "Port 5000 already in use"
- Change PORT in backend .env file
- Update frontend API calls to new port

### "Token not valid"
- Register/login again to get new token
- Check token is being sent in headers

### "npm install fails"
- Delete node_modules folder
- Delete package-lock.json
- Run npm install again

---

## 📊 Default Credentials

After running schema.sql, no default users exist.
You MUST create your first user via the register endpoint.

**Recommended first user:**
- Email: admin@company.com
- Password: Admin123! (change after first login)
- Role: Will be 'employee' by default

**To make a user admin:**
Update directly in database:
```sql
UPDATE users SET role = 'admin' WHERE email = 'admin@company.com';
```

---

## ✨ Next Steps

Once everything is running:

1. **Create Admin User** - Register and promote to admin
2. **Create Login Page** - Build React login/register components
3. **Integrate API** - Connect React components to backend
4. **Test Workflows** - Submit expenses, approve, etc.
5. **Customize** - Add your company's branding

---

## 📞 Need Help?

Refer to the complete `SETUP_GUIDE.md` for:
- Detailed troubleshooting
- API endpoint documentation
- Production deployment notes
- Advanced configuration

---

## ⏱️ Estimated Setup Time

- Database: 5 minutes
- Backend: 3 minutes
- Frontend: 3 minutes
- Testing: 5 minutes

**Total: ~15 minutes** ⚡

Good luck! 🚀
