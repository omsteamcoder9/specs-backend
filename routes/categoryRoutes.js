import express from 'express';
import {
    createCategory,
    getAllCategories,
    getCategoryById,
    updateCategory,
    deleteCategory,
    getCategoriesTree,
    getCategoryProducts,
    getActiveCategories  
} from '../controller/categoryController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// ✅ Public Routes - STATIC ROUTES FIRST
router.get('/', getAllCategories); // GET /api/categories
router.get('/tree', getCategoriesTree); // GET /api/categories/tree
router.get('/active', getActiveCategories); // GET /api/categories/active

// ✅ DYNAMIC ROUTES LAST
router.get('/:id', getCategoryById); // GET /api/categories/:id
router.get('/:id/products', getCategoryProducts); // GET /api/categories/:id/products

// ✅ Admin-only Routes
router.post('/', protect, authorize('admin'), createCategory); // POST /api/categories
router.put('/:id', protect, authorize('admin'), updateCategory); // PUT /api/categories/:id
router.delete('/:id', protect, authorize('admin'), deleteCategory); // DELETE /api/categories/:id

export default router;