// productRoutes.js - UPDATED WITH MULTER AND OPTIMIZATION
import express from 'express';
import path from 'path';
import multer from 'multer';
import fs from 'fs';

const router = express.Router();

// Import controllers
import { 
  getAllProducts, 
  getProductById, 
  getProductBySlug,
  createProduct,
  updateProduct,
  deleteProduct,
  getFeaturedProducts,
  getFeaturedPriceRanges,
  getFilteredFeaturedProducts,
  searchProducts,
  quickSearchProducts
} from '../controller/productController.js';

// ✅ IMPORT THE CORRECT OPTIMIZATION FUNCTION
import { extremeOptimization, ultraTinyOptimization, smartSizeOptimization } from '../middleware/uploadMiddleware.js';

// ✅ Create multer instance WITH temporary storage
const tempDir = 'temp-uploads/';
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const upload = multer({ 
  dest: tempDir, // Temporary folder for original files
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB limit for originals
    files: 5 // Max 5 files
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/gif', 'image/avif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Only images are allowed.`), false);
    }
  }
});

// ✅ Clean temp folder periodically
const cleanTempFolder = () => {
  fs.readdir(tempDir, (err, files) => {
    if (err) return;
    
    const now = Date.now();
    files.forEach(file => {
      const filePath = path.join(tempDir, file);
      fs.stat(filePath, (err, stat) => {
        if (err) return;
        // Delete files older than 1 hour
        if (now - stat.mtimeMs > 60 * 60 * 1000) {
          fs.unlink(filePath, err => {
            if (err) console.warn('Failed to delete temp file:', filePath);
          });
        }
      });
    });
  });
};

// Run cleanup every hour
setInterval(cleanTempFolder, 60 * 60 * 1000);

// ✅ CORRECT ORDER: Specific routes FIRST, parameter routes LAST
router.get('/', getAllProducts);
router.get('/featured', getFeaturedProducts);
router.get('/featured/price-ranges', getFeaturedPriceRanges);
router.get('/featured/filter', getFilteredFeaturedProducts);
router.get('/search', searchProducts);
router.get('/quick-search', quickSearchProducts);

// ✅ OPTION 1: Extreme optimization (8-15KB files)
router.post('/', 
  upload.array('images', 5),      // 1. Accept files
  extremeOptimization,            // 2. Optimize them (8-15KB)
  createProduct                   // 3. Then create product
);

router.put('/:id', 
  upload.array('images', 5),      // 1. Accept files
  extremeOptimization,            // 2. Optimize them (8-15KB)
  updateProduct                   // 3. Then update product
);

// ✅ OPTION 2: Ultra tiny optimization (<10KB guaranteed)
router.post('/thumbnails', 
  upload.array('images', 10),
  ultraTinyOptimization,          // <10KB files
  (req, res) => {
    res.json({ 
      success: true, 
      thumbnails: req.files.map(f => ({
        name: f.filename,
        size: `${(f.size / 1024).toFixed(2)}KB`
      }))
    });
  }
);

// ✅ OPTION 3: Smart optimization with specific size target
router.post('/small-images', 
  upload.array('images', 5),
  smartSizeOptimization(8),       // Target max 8KB
  (req, res) => {
    res.json({ 
      success: true, 
      images: req.files.map(f => ({
        name: f.filename,
        size: `${(f.size / 1024).toFixed(2)}KB`
      }))
    });
  }
);

// ✅ TEST ENDPOINT: Check if optimization works
router.post('/test-upload', 
  upload.single('image'),
  extremeOptimization,
  (req, res) => {
    if (req.file) {
      res.json({
        success: true,
        message: '✅ Image uploaded and optimized!',
        file: {
          name: req.file.filename,
          size: `${(req.file.size / 1024).toFixed(2)}KB`,
          path: req.file.path,
          mimetype: req.file.mimetype
        },
        optimization: {
          status: req.file.size < 15 * 1024 ? '✅ Good (under 15KB)' : '⚠️ Large (over 15KB)'
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }
  }
);

// Parameter routes should come LAST
router.get('/:id', getProductById);
router.get('/slug/:slug', getProductBySlug);
router.delete('/:id', deleteProduct);

export default router;