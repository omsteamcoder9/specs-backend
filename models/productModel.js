// models/Product.js
import mongoose from 'mongoose';
import slugify from 'slugify';

const productSchema = new mongoose.Schema({
    // ✅ Auto Increment Serial No
    sNo: {
        type: Number,
        unique: true,
        index: true
    },

    // ✅ Basic Info
    name: {
        type: String,
        required: [true, 'Please enter product name'],
        trim: true
    },
    slug: {
        type: String,
        unique: true,
        sparse: true // ✅ Add sparse index for better handling
    },
    price: {
        type: Number,
        required: [true, 'Please enter product price']
    },
    description: {
        type: String,
        required: [true, 'Please enter product description']
    },

    // ✅ Category
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: [true, 'Please select a category']
    },

    // ✅ Specifications
    specifications: [
        {
            key: {
                type: String,
                required: true
            },
            value: {
                type: String,
                required: true
            }
        }
    ],

    // ✅ Ratings & Reviews
    rating: {
        type: Number,
        default: 0
    },
    numberOfReviews: {
        type: Number,
        default: 0
    },

    // ✅ Images
    images: [
        {
            image: {
                type: String,
                required: true
            }
        }
    ],

    // ✅ Seller Info
    seller: {
        type: String,
        required: [true, 'Please enter seller name']
    },

    // ✅ Total Stock
    stock: {
        type: Number,
        required: [true, 'Please enter stock quantity']
    },

    // ✅ SEO Fields
    metaTitle: { type: String, maxlength: 60 },
    metaDescription: { type: String, maxlength: 160 },
    metaKeywords: { type: [String] },
    canonicalUrl: { type: String },
    ogTitle: { type: String },
    ogDescription: { type: String },
    ogImage: { type: String },

    // ✅ Product Status
    status: {
        type: String,
        enum: ['active', 'inactive', 'out-of-stock'],
        default: 'active'
    },

    // ✅ Featured Product
    featured: {
        type: Boolean,
        default: false
    },

    createdAt: {
        type: Date,
        default: Date.now
    }
});

// ✅ Generate unique slug with counter for duplicates
productSchema.pre('save', async function (next) {
    if (this.isModified('name')) {
        // Generate base slug
        const baseSlug = slugify(this.name, { lower: true, strict: true });
        
        // Check if slug already exists
        let slug = baseSlug;
        let counter = 1;
        let slugExists = true;
        
        while (slugExists) {
            const existingProduct = await this.constructor.findOne({ slug });
            
            // If no product found with this slug, or it's the current product being updated
            if (!existingProduct || existingProduct._id.equals(this._id)) {
                slugExists = false;
            } else {
                // If slug exists, append counter
                slug = `${baseSlug}-${counter}`;
                counter++;
            }
        }
        
        this.slug = slug;
    }
    next();
});

// ✅ Auto Increment S.No
productSchema.pre('save', async function (next) {
    if (this.isNew) {
        try {
            const lastProduct = await this.constructor
                .findOne({}, {}, { sort: { sNo: -1 } });
            this.sNo = lastProduct ? lastProduct.sNo + 1 : 1;
        } catch (err) {
            this.sNo = Date.now();
        }
    }
    next();
});

// ✅ Indexes
productSchema.index({ category: 1, status: 1 });
productSchema.index({ featured: 1 });
productSchema.index({ slug: 1, sparse: true }); // ✅ Make sparse

export default mongoose.model('Product', productSchema);