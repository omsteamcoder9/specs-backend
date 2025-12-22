// controllers/categoryController.js
import Category from '../models/CategoryModel.js';
import Product from '../models/productModel.js';
import slugify from 'slugify';
import mongoose from 'mongoose';
import asyncHandler from 'express-async-handler';
// ✅ Create Category
export const createCategory = async (req, res) => {
    try {
        const { name, description, parent, status, featured, metaTitle, metaDescription, metaKeywords, displayOrder } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'Category name is required'
            });
        }

        // Check if category already exists
        const existingCategory = await Category.findOne({ 
            $or: [
                { name: name.trim() },
                { slug: slugify(name, { lower: true, strict: true }) }
            ]
        });

        if (existingCategory) {
            return res.status(400).json({
                success: false,
                message: 'Category with this name already exists'
            });
        }

        const category = new Category({
            name: name.trim(),
            description,
            parent: parent || null,
            status: status || 'active',
            featured: featured || false,
            metaTitle,
            metaDescription,
            metaKeywords: metaKeywords ? metaKeywords.split(',').map(kw => kw.trim()) : [],
            displayOrder: displayOrder || 0,
            createdBy: req.user?._id
        });

        const savedCategory = await category.save();
        await savedCategory.populate('parent', 'name slug');

        res.status(201).json({
            success: true,
            message: 'Category created successfully',
            data: savedCategory
        });
    } catch (error) {
        console.error('❌ Create Category Error:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// ✅ Get All Categories
export const getAllCategories = async (req, res) => {
    try {
        const { includeInactive, includeProductsCount } = req.query;
        
        let query = {};
        if (includeInactive !== 'true') {
            query.status = 'active';
        }

        const categories = await Category.find(query)
            .populate('parent', 'name slug')
            .populate(includeProductsCount === 'true' ? 'productsCount' : '')
            .sort({ displayOrder: 1, name: 1 });

        res.status(200).json({
            success: true,
            count: categories.length,
            data: categories
        });
    } catch (error) {
        console.error('❌ Get Categories Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// ✅ Get Category by ID or Slug
export const getCategoryById = async (req, res) => {
    try {
        const { id } = req.params;
        
        let category;
        if (mongoose.Types.ObjectId.isValid(id)) {
            category = await Category.findById(id)
                .populate('parent', 'name slug')
                .populate('subcategories', 'name slug description image status')
                .populate('productsCount');
        } else {
            category = await Category.findOne({ slug: id })
                .populate('parent', 'name slug')
                .populate('subcategories', 'name slug description image status')
                .populate('productsCount');
        }

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }

        res.status(200).json({
            success: true,
            data: category
        });
    } catch (error) {
        console.error('❌ Get Category Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// ✅ Update Category
export const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }

        // If name is being updated, check for duplicates
        if (updates.name && updates.name !== category.name) {
            const existingCategory = await Category.findOne({
                $and: [
                    { _id: { $ne: id } },
                    { 
                        $or: [
                            { name: updates.name.trim() },
                            { slug: slugify(updates.name, { lower: true, strict: true }) }
                        ]
                    }
                ]
            });

            if (existingCategory) {
                return res.status(400).json({
                    success: false,
                    message: 'Category with this name already exists'
                });
            }
        }

        // Update fields
        Object.keys(updates).forEach(key => {
            if (updates[key] !== undefined && updates[key] !== null) {
                category[key] = updates[key];
            }
        });

        // Handle metaKeywords as array
        if (updates.metaKeywords) {
            category.metaKeywords = typeof updates.metaKeywords === 'string' 
                ? updates.metaKeywords.split(',').map(kw => kw.trim())
                : updates.metaKeywords;
        }

        const updatedCategory = await category.save();
        await updatedCategory.populate('parent', 'name slug');
        await updatedCategory.populate('subcategories', 'name slug');

        res.status(200).json({
            success: true,
            message: 'Category updated successfully',
            data: updatedCategory
        });
    } catch (error) {
        console.error('❌ Update Category Error:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// ✅ Delete Category
export const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;

        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }

        // Check if category has subcategories
        const subcategories = await Category.find({ parent: id });
        if (subcategories.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete category with subcategories. Please delete subcategories first.'
            });
        }

        // Check if category has products
        const productsCount = await Product.countDocuments({ category: id });
        if (productsCount > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete category with associated products. Please reassign or delete products first.'
            });
        }

        await Category.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: 'Category deleted successfully'
        });
    } catch (error) {
        console.error('❌ Delete Category Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// ✅ Get Categories Tree
export const getCategoriesTree = async (req, res) => {
    try {
        const categories = await Category.find({ status: 'active' })
            .populate('parent', 'name slug')
            .sort({ displayOrder: 1, name: 1 });

        // Build tree structure
        const buildTree = (parentId = null) => {
            return categories
                .filter(cat => 
                    (parentId === null && !cat.parent) || 
                    (cat.parent && cat.parent._id.toString() === parentId)
                )
                .map(cat => ({
                    ...cat.toObject(),
                    subcategories: buildTree(cat._id.toString())
                }));
        };

        const tree = buildTree();

        res.status(200).json({
            success: true,
            data: tree
        });
    } catch (error) {
        console.error('❌ Get Categories Tree Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// ✅ Get Category Products
export const getCategoryProducts = async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 12, sort = '-createdAt' } = req.query;

        let category;
        if (mongoose.Types.ObjectId.isValid(id)) {
            category = await Category.findById(id);
        } else {
            category = await Category.findOne({ slug: id });
        }

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }

        // Get all subcategory IDs including the main category
        const getSubcategoryIds = async (categoryId) => {
            const subcategories = await Category.find({ parent: categoryId }, '_id');
            let ids = [categoryId];
            for (const subcat of subcategories) {
                const subIds = await getSubcategoryIds(subcat._id);
                ids = [...ids, ...subIds];
            }
            return ids;
        };

        const categoryIds = await getSubcategoryIds(category._id);

        const products = await Product.find({ 
            category: { $in: categoryIds },
            status: 'active'
        })
        .populate('category', 'name slug')
        .populate('subcategory', 'name slug')
        .sort(sort)
        .limit(limit * 1)
        .skip((page - 1) * limit);

        const total = await Product.countDocuments({ 
            category: { $in: categoryIds },
            status: 'active'
        });

        res.status(200).json({
            success: true,
            data: {
                category,
                products,
                pagination: {
                    current: parseInt(page),
                    pages: Math.ceil(total / limit),
                    total
                }
            }
        });
    } catch (error) {
        console.error('❌ Get Category Products Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
// ✅ Get Active Categories Only
// ✅ Get Active Categories Only
export const getActiveCategories = asyncHandler(async (req, res) => {
    const categories = await Category.find({ status: 'active' })
        .sort({ createdAt: 1 })  // ✅ FIX: Sort by creation date (oldest first)
        .select('name description slug')  // ✅ Also fixed: include slug
        .populate('parent', 'name slug');  // ✅ Fixed populate syntax

    res.status(200).json({
        success: true,
        count: categories.length,
        data: categories
    });
});