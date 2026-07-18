// scripts/createAdmin.js
require('dotenv').config();
const mongoose = require('mongoose');
const AdminUser = require('../models/adminUser');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await AdminUser.create({ email: 'you@example.com', password: 'ChangeMe123!' });
  console.log('Admin created');
  process.exit(0);
})();