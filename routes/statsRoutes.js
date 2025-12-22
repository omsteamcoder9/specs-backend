// routes/statsRoutes.js
import express from 'express';
import {
  getComprehensiveStats,
  getDashboardStats,
  getSalesAnalytics,
  getUserAnalytics
} from '../controller/statsController.js';

const router = express.Router();

// 📊 Stats routes
router.get('/', getComprehensiveStats);
router.get('/dashboard', getDashboardStats);
router.get('/sales-analytics', getSalesAnalytics);
router.get('/user-analytics', getUserAnalytics);

export default router;