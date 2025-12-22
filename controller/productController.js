import Product from '../models/productModel.js';
import Category from '../models/CategoryModel.js';
import slugify from 'slugify';
import path from 'path';
import mongoose from 'mongoose';

export const createProduct = async (req, res) => {
  try {
    const {
      name,
      price,
      description,
      category,
      rating,
      seller,
      stock,
      numberOfReviews,
      colors,
      specifications
    } = req.body;

    // ✅ Debug log
    console.log('📥 Received product data:', req.body);

    // ✅ Required field validation
    const missingFields = [];
    if (!name) missingFields.push('name');
    if (!price) missingFields.push('price');
    if (!description) missingFields.push('description');
    if (!seller) missingFields.push('seller');

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`,
        missingFields
      });
    }

    /* ===============================
       ✅ HANDLE COLOURS (SEPARATE)
    =============================== */
    let parsedColors = [];
    let stockFromColors = 0;

    if (colors) {
      parsedColors = typeof colors === 'string' ? JSON.parse(colors) : colors;

      parsedColors = parsedColors
        .map(item => {
          if (!item?.name) return null;

          const qty = parseInt(item.stock) || 0;
          stockFromColors += qty;

          return {
            name: item.name,
            code: item.code || '',
            stock: qty
          };
        })
        .filter(Boolean);
    }

    /* ===============================
       ✅ HANDLE SPECIFICATIONS
    =============================== */
    let parsedSpecs = [];
    if (specifications) {
      parsedSpecs =
        typeof specifications === 'string'
          ? JSON.parse(specifications)
          : specifications;
    }

    /* ===============================
       ✅ HANDLE IMAGES
    =============================== */
    const images = req.files
      ? req.files.map(file => ({
          image: `/uploads/${file.filename}`
        }))
      : [];

    /* ===============================
       ✅ FINAL STOCK LOGIC
       Priority: colors > stock
    =============================== */
    const finalStock = stockFromColors > 0
      ? stockFromColors
      : parseInt(stock) || 0;

    if (finalStock <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Stock must be greater than 0 (colors or stock)'
      });
    }

    /* ===============================
       ✅ CREATE PRODUCT
    =============================== */
    const product = new Product({
      name,
      slug: slugify(name, { lower: true, strict: true }),
      price: parseFloat(price),
      description,
      category: category || null,
      rating: rating || 0,
      seller,
      stock: finalStock,
      numberOfReviews: numberOfReviews || 0,
      colors: parsedColors,
      specifications: parsedSpecs,
      images,
      ogImage: images.length > 0 ? images[0].image : null,
      status: 'active',
      featured: false
    });

    const savedProduct = await product.save();

    console.log('✅ Product created:', savedProduct._id);

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: savedProduct
    });

  } catch (error) {
    console.error('❌ Create Product Error:', error);

    let errorMessage = error.message;
    if (error.name === 'ValidationError') {
      errorMessage = Object.values(error.errors)
        .map(err => err.message)
        .join(', ');
    }

    res.status(400).json({
      success: false,
      message: errorMessage,
      errorType: error.name
    });
  }
};

// ✅ Update Product
export const updateProduct = async (req, res) => {
  try {
    // ✅ Clean and validate ID
    const id = req.params.id?.trim();
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or missing product ID.',
      });
    }

    // ✅ Find existing product
    const existingProduct = await Product.findById(id);
    if (!existingProduct) {
      return res.status(404).json({
        success: false,
        message: 'Product not found.',
      });
    }

    // ✅ Update provided fields only
    for (const [key, value] of Object.entries(req.body)) {
      if (value !== undefined && value !== null && value !== '') {
        // ✅ Handle colors parsing
        if (key === 'colors') {
          let parsedColors = typeof value === 'string' ? JSON.parse(value) : value;
          
          // Validate and format colors
          parsedColors = parsedColors.map(colorItem => {
            if (colorItem && colorItem.name) {
              return {
                name: colorItem.name,
                code: colorItem.code || '',
                stock: parseInt(colorItem.stock) || 0
              };
            }
            return colorItem;
          }).filter(colorItem => colorItem && colorItem.name);
          
          existingProduct[key] = parsedColors;
        } else {
          existingProduct[key] = value;
        }
      }
    }

    // ✅ Handle multiple uploaded images
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(file => ({
        image: `/uploads/${file.filename}`
      }));
      existingProduct.images = newImages;
      existingProduct.ogImage = newImages[0].image;
    }

    // ✅ Update slug if name changes
    if (req.body.name) {
      existingProduct.slug = slugify(req.body.name, { lower: true, strict: true });
    }

    // ✅ Save updates
    const updatedProduct = await existingProduct.save();

    res.status(200).json({
      success: true,
      message: 'Product updated successfully.',
      data: updatedProduct,
    });
  } catch (error) {
    console.error('❌ Update Product Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update product.',
    });
  }
};

export const getAllProducts = async (req, res) => {
  try {
    const { category, categorySlug, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    
    // Build filter object
    let filter = {};
    
    // ✅ FIXED: Handle category filtering by slug
    const categoryFilter = categorySlug || category;
    
    if (categoryFilter && categoryFilter !== 'undefined') {
      // Check if it's a valid ObjectId (for backward compatibility)
      if (mongoose.Types.ObjectId.isValid(categoryFilter)) {
        filter.category = categoryFilter;
      } else {
        // If it's a slug, find the category first
        const categoryDoc = await Category.findOne({ 
          slug: categoryFilter,
          status: 'active' 
        });
        
        if (categoryDoc) {
          filter.category = categoryDoc._id;
        } else {
          // If category not found, return empty results
          return res.status(200).json({
            success: true,
            data: [],
            count: 0,
            message: 'No products found for this category'
          });
        }
      }
    }

    // Build sort configuration
    const sortConfig = {};
    
    // Handle different sort fields
    switch (sortBy) {
      case 'price':
      case 'rating':
      case 'createdAt':
      case 'name':
        sortConfig[sortBy] = sortOrder === 'desc' ? -1 : 1;
        break;
      default:
        sortConfig.createdAt = -1; // Default sort
    }

    console.log('🔍 Product filter:', filter);
    console.log('🔄 Sort config:', sortConfig);

    const products = await Product.find(filter)
      .populate('category', 'name slug')
      .sort(sortConfig);

    res.status(200).json({
      success: true,
      count: products.length,
      data: products,
    });
  } catch (error) {
    console.error('❌ Get all products error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Get Product by ID
export const getProductById = async (req, res) => {
  try {
    const id = req.params.id?.trim();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID.',
      });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found.',
      });
    }

    res.status(200).json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Delete Product
export const deleteProduct = async (req, res) => {
  try {
    const id = req.params.id?.trim();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID.',
      });
    }

    const product = await Product.findByIdAndDelete(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found.',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Product deleted successfully.',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Get Product by Slug
export const getProductBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    const product = await Product.findOne({ slug })
      .populate('category', 'name slug')

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found.',
      });
    }

    res.status(200).json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Get featured products with price range filtering
export const getFeaturedProducts = async (req, res) => {
    try {
        const { priceRange, category, colors, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        
        // Build filter object
        let filter = { featured: true, status: 'active' };
        
        // Add category filter if provided
        if (category && category !== 'all') {
            filter.category = category;
        }
        
        // Handle price range filtering
        let priceFilter = {};
        if (priceRange && priceRange !== 'all') {
            switch (priceRange) {
                case '100-200':
                    priceFilter = { price: { $gte: 100, $lte: 200 } };
                    break;
                case '200-300':
                    priceFilter = { price: { $gte: 200, $lte: 300 } };
                    break;
                case '300-400':
                    priceFilter = { price: { $gte: 300, $lte: 400 } };
                    break;
                case '400-500':
                    priceFilter = { price: { $gte: 400, $lte: 500 } };
                    break;
                case '500-600':
                    priceFilter = { price: { $gte: 500, $lte: 600 } };
                    break;
                case 'above-600':
                    priceFilter = { price: { $gt: 600 } };
                    break;
                default:
                    priceFilter = {};
            }
        }
        
        // Handle color filtering
        let colorFilter = {};
        if (colors && colors !== 'all') {
            const colorArray = Array.isArray(colors) ? colors : [colors];
            colorFilter = {
                'colors.name': { $in: colorArray }
            };
        }
        
        // Combine filters
        const finalFilter = { ...filter, ...priceFilter, ...colorFilter };
        
        // Sort configuration
        const sortConfig = {};
        sortConfig[sortBy] = sortOrder === 'desc' ? -1 : 1;
        
        // Execute query
        const products = await Product.find(finalFilter)
            .populate('category', 'name slug')
            .sort(sortConfig)
            .lean();
            
        res.status(200).json({
            success: true,
            count: products.length,
            data: products
        });
        
    } catch (error) {
        console.error('Featured products error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching featured products',
            error: error.message
        });
    }
};

// ✅ Get all available price ranges for featured products (for filter options)
export const getFeaturedPriceRanges = async (req, res) => {
    try {
        const priceRanges = await Product.aggregate([
            {
                $match: {
                    featured: true,
                    status: 'active',
                    price: { $exists: true, $ne: null }
                }
            },
            {
                $bucket: {
                    groupBy: "$price",
                    boundaries: [0, 100, 200, 300, 400, 500, 600, Number.MAX_SAFE_INTEGER],
                    default: "above-600",
                    output: {
                        count: { $sum: 1 },
                        minPrice: { $min: "$price" },
                        maxPrice: { $max: "$price" }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    range: {
                        $switch: {
                            branches: [
                                { case: { $eq: ["$_id", 0] }, then: "under-100" },
                                { case: { $eq: ["$_id", 100] }, then: "100-200" },
                                { case: { $eq: ["$_id", 200] }, then: "200-300" },
                                { case: { $eq: ["$_id", 300] }, then: "300-400" },
                                { case: { $eq: ["$_id", 400] }, then: "400-500" },
                                { case: { $eq: ["$_id", 500] }, then: "500-600" },
                                { case: { $eq: ["$_id", 600] }, then: "above-600" }
                            ],
                            default: "above-600"
                        }
                    },
                    count: 1,
                    minPrice: 1,
                    maxPrice: 1
                }
            },
            {
                $match: {
                    count: { $gt: 0 }
                }
            }
        ]);

        res.status(200).json({
            success: true,
            data: priceRanges
        });
        
    } catch (error) {
        console.error('Price ranges error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching price ranges',
            error: error.message
        });
    }
};

// ✅ Get featured products with multiple filters
export const getFilteredFeaturedProducts = async (req, res) => {
    try {
        const { 
            priceRanges, 
            categories, 
            colors,
            minPrice, 
            maxPrice, 
            page = 1, 
            limit = 12,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        // Build base filter
        let filter = { featured: true, status: 'active' };

        // Category filter
        if (categories && categories !== 'all') {
            const categoryArray = Array.isArray(categories) ? categories : [categories];
            filter.category = { $in: categoryArray };
        }

        // Color filter
        if (colors && colors !== 'all') {
            const colorArray = Array.isArray(colors) ? colors : [colors];
            filter['colors.name'] = { $in: colorArray };
        }

        // Price filter - multiple approaches
        let priceFilter = {};
        
        // Approach 1: Specific price ranges
        if (priceRanges && priceRanges !== 'all') {
            const rangeArray = Array.isArray(priceRanges) ? priceRanges : [priceRanges];
            const rangeConditions = [];
            
            rangeArray.forEach(range => {
                switch (range) {
                    case '100-200':
                        rangeConditions.push({ price: { $gte: 100, $lte: 200 } });
                        break;
                    case '200-300':
                        rangeConditions.push({ price: { $gte: 200, $lte: 300 } });
                        break;
                    case '300-400':
                        rangeConditions.push({ price: { $gte: 300, $lte: 400 } });
                        break;
                    case '400-500':
                        rangeConditions.push({ price: { $gte: 400, $lte: 500 } });
                        break;
                    case '500-600':
                        rangeConditions.push({ price: { $gte: 500, $lte: 600 } });
                        break;
                    case 'above-600':
                        rangeConditions.push({ price: { $gt: 600 } });
                        break;
                }
            });
            
            if (rangeConditions.length > 0) {
                priceFilter = { $or: rangeConditions };
            }
        }
        
        // Approach 2: Min/Max price range
        if (minPrice || maxPrice) {
            priceFilter = {};
            if (minPrice) priceFilter.$gte = parseInt(minPrice);
            if (maxPrice) priceFilter.$lte = parseInt(maxPrice);
            priceFilter = { price: priceFilter };
        }

        // Combine filters
        const finalFilter = priceFilter ? { ...filter, ...priceFilter } : filter;

        // Sort configuration
        const sortConfig = {};
        sortConfig[sortBy] = sortOrder === 'desc' ? -1 : 1;

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Execute query with pagination
        const [products, totalCount] = await Promise.all([
            Product.find(finalFilter)
                .populate('category', 'name slug')
                .sort(sortConfig)
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Product.countDocuments(finalFilter)
        ]);

        res.status(200).json({
            success: true,
            data: products,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / parseInt(limit)),
                totalProducts: totalCount,
                hasNext: skip + products.length < totalCount,
                hasPrev: parseInt(page) > 1
            }
        });

    } catch (error) {
        console.error('Filtered featured products error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching filtered featured products',
            error: error.message
        });
    }
};

// ✅ Search Products with multiple filters
export const searchProducts = async (req, res) => {
  try {
    const { 
      search, 
      category, 
      categorySlug, // ✅ Add categorySlug parameter
      minPrice, 
      maxPrice, 
      colors,
      sortBy = 'createdAt', 
      sortOrder = 'desc',
      page = 1,
      limit = 12
    } = req.query;

    // Build filter object
    let filter = { status: 'active' };

    // Search by name or description
    if (search && search.trim() !== '') {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // ✅ FIXED: Handle category filtering by slug
    const categoryFilter = categorySlug || category;
    
    if (categoryFilter && categoryFilter !== 'all' && categoryFilter !== 'undefined') {
      // Check if it's a valid ObjectId
      if (mongoose.Types.ObjectId.isValid(categoryFilter)) {
        filter.category = categoryFilter;
      } else {
        // If it's a slug, find the category first
        const categoryDoc = await Category.findOne({ 
          slug: categoryFilter,
          status: 'active' 
        });
        
        if (categoryDoc) {
          filter.category = categoryDoc._id;
        }
        // If category not found, no filter will be applied (show all products)
      }
    }

    // Color filter
    if (colors && colors !== 'all') {
      const colorArray = Array.isArray(colors) ? colors : [colors];
      filter['colors.name'] = { $in: colorArray };
    }

    // Price range filter
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseFloat(minPrice);
      if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
    }

    // Sort configuration
    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query
    const [products, totalCount] = await Promise.all([
      Product.find(filter)
        .populate('category', 'name slug')
        .sort(sortConfig)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Product.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      data: products,
      count: products.length,
      totalCount,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalProducts: totalCount,
        hasNext: skip + products.length < totalCount,
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('❌ Search Products Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching products',
      error: error.message
    });
  }
};

// ✅ Quick Search for Real-time Suggestions (for dropdown)
export const quickSearchProducts = async (req, res) => {
  try {
    const { q: searchQuery, limit = 5 } = req.query;

    console.log('🔍 Quick search query:', searchQuery);

    if (!searchQuery || searchQuery.trim() === '') {
      return res.status(200).json({
        success: true,
        data: [],
        message: 'Please enter a search term'
      });
    }

    // Search products by name (case-insensitive)
    const products = await Product.find({
      name: { 
        $regex: searchQuery.trim(), 
        $options: 'i'
      },
      status: 'active'
    })
    .select('name slug price images ogImage category featured')
    .populate('category', 'name slug')
    .limit(parseInt(limit))
    .lean();

    console.log('📦 Found products:', products.length);

    // Format the response for frontend
    const formattedProducts = products.map(product => {
      // Handle image URL
      let imageUrl = null;
      if (product.images && product.images.length > 0 && product.images[0].image) {
        imageUrl = product.images[0].image;
      } else if (product.ogImage) {
        imageUrl = product.ogImage;
      }

      return {
        _id: product._id,
        name: product.name,
        slug: product.slug,
        price: product.price,
        image: imageUrl,
        category: product.category?.name || 'Uncategorized',
        featured: product.featured || false
      };
    });

    res.status(200).json({
      success: true,
      data: formattedProducts,
      count: formattedProducts.length
    });

  } catch (error) {
    console.error('❌ Quick Search Products Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching products',
      error: error.message
    });
  }
};