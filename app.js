import express from 'express';
import mongoose from 'mongoose';
import bodyParser from 'body-parser';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/user.js';
import adminRoutes from './routes/admin.js';
import productRoutes from './routes/productRoutes.js';
import cartRoutes from './routes/cartRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import emailRoutes from './routes/emailRoutes.js';
import shippingRoutes from './routes/shippingRoutes.js';
import statsRoutes from './routes/statsRoutes.js';
import contactRoutes from './routes/contactRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';

// -------------------------------
// 🔧 Load .env correctly
// -------------------------------
import dotenv from "dotenv";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env relative to this file so it always works
dotenv.config({ path: path.join(__dirname, ".env") });

console.log("Loaded MONGO_URI:", process.env.MONGO_URI);  // Debug

// -------------------------------
const app = express();

// CORS
// CORS Configuration - Improved
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim())
  : [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173'
    ]; // Default fallback

console.log("✅ Allowed Origins:", allowedOrigins);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) {
      console.log("⚠️  No origin header - allowing request");
      return callback(null, true);
    }

    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      console.log(`✅ Allowed CORS for: ${origin}`);
      return callback(null, true);
    } 
    // Check for subdomain variations
    else if (origin.endsWith('localhost:3001')) {
      console.log(`✅ Allowed CORS for localhost variation: ${origin}`);
      return callback(null, true);
    }
    else {
      console.log(`❌ BLOCKED CORS: ${origin}`);
      console.log(`   Allowed origins: ${allowedOrigins.join(', ')}`);
      return callback(new Error(`CORS NOT ALLOWED: ${origin}`), false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'X-Total-Count'],
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));


console.log("Allowed Origins:", allowedOrigins); // debug

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      console.log("❌ BLOCKED CORS:", origin);
      return callback(new Error("CORS NOT ALLOWED: " + origin));
    }
  },
  credentials: true,
}));

// Body parsing
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/categories', categoryRoutes);

app.get('/', (req, res) => res.json({ message: 'E-commerce backend running' }));

// -------------------------------
// 🟢 MongoDB Setup
// -------------------------------
const MONGO_URI = process.env.MONGO_URI;
global.JWT_SECRET = process.env.JWT_SECRET;

// Validate Mongo URI early
if (!MONGO_URI) {
  console.error("❌ ERROR: MONGO_URI is missing. Check your .env file!");
  process.exit(1);
}

if (!/^mongodb(\+srv)?:\/\//.test(MONGO_URI)) {
  console.error("❌ ERROR: Invalid MONGO_URI format. Must start with mongodb:// or mongodb+srv://");
  console.error("Received:", MONGO_URI);
  process.exit(1);
}

// DB Connect function
export const initDB = async () => {
  try {
    if (mongoose.connection.readyState === 1) return mongoose;

    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB connected to", MONGO_URI);
    return mongoose;
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  }
};

// -------------------------------
// 🚀 Start Server
// -------------------------------
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await initDB();

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
};


  startServer();


export default app;
